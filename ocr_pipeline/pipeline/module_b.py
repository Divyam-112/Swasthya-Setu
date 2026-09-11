"""
Step 9: connects Steps 1-8 into one canonical Module B pipeline.

UPLOAD -> INGESTION -> PREPROCESSING -> OCR ROUTER -> RAW TRANSCRIPTION ->
DOCUMENT TYPE DETECTION -> STRUCTURED EXTRACTION -> MEDICINE NORMALIZATION
-> CONFIDENCE/UNCERTAINTY VALIDATION -> LAB VALIDATION -> CHRONOLOGICAL
ORGANIZATION -> DRUG INTERACTION CHECK -> FINAL MODULE B JSON

Images are sent to the OCR provider exactly once per document. Everything
downstream of OCR — extraction, normalization, validation — is text-only,
per the spec's "don't re-send images to the extraction model" rule.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Union

from document_ai.extraction.discharge_summary_extractor import extract_discharge_summary
from document_ai.extraction.lab_report_extractor import extract_lab_report
from document_ai.extraction.prescription_extractor import extract_prescription
from document_ai.extraction.schemas import DischargeSummaryExtraction, LabReportExtraction, PrescriptionExtraction
from document_ai.ingestion.file_validator import validate_file
from document_ai.labs.validator import validate_lab_report
from document_ai.medicine.normalizer import normalize_medications
from document_ai.medicine.schemas import ConfidenceLevel, NormalizedMedicine, PacketVerification, PacketVerificationStatus
from document_ai.medicine.verification import resolve_needs_verification
from document_ai.storage.schemas import StoredDocument, StoredMedicine
from document_ai.ocr.schemas import OCRResult, OCRStatus
from document_ai.timeline.builder import build_timeline
from document_ai.validation.validator import validate_document
from document_ai.interactions.checker import check_interactions
from document_ai.observability.logging import get_logger

from .orchestration import PipelineConfig
from .schemas import (
    ModuleBDocumentResult,
    ModuleBResult,
    PipelineMeta,
    PipelineStatus,
    VerificationSummary,
)

logger = get_logger(__name__)

ExtractionModel = Union[PrescriptionExtraction, LabReportExtraction, DischargeSummaryExtraction]

# Heuristic keyword sets for document-type detection. This is a hint, same
# spirit as OCRResult.document_type_hint — NOT a clinical classification,
# just enough to route text to the right Step 3 extractor. An explicit
# document_type_hint passed in always wins over this guess.
_DISCHARGE_KEYWORDS = ("discharge summary", "admission date", "discharged on", "date of discharge")
_LAB_KEYWORDS = ("reference range", "reference interval", "test name", "specimen", "lab report", "laboratory report")


def detect_document_type(raw_text: str) -> str:
    text = raw_text.lower()
    if any(k in text for k in _DISCHARGE_KEYWORDS):
        return "discharge_summary"
    if any(k in text for k in _LAB_KEYWORDS):
        return "lab_report"
    return "prescription"  # default assumption for a medical document that is neither of the above


@dataclass
class ProcessedDocument:
    document_id: str
    file_name: Optional[str]
    document_type: str
    ocr_result: Optional[OCRResult]
    extraction_model: Optional[ExtractionModel]
    normalized_medicines: list[NormalizedMedicine] = field(default_factory=list)
    lab_validation: Optional[dict] = None
    validation_report: Optional[dict] = None
    errors: list[str] = field(default_factory=list)

    def to_result(self) -> ModuleBDocumentResult:
        return ModuleBDocumentResult(
            document_id=self.document_id,
            file_name=self.file_name,
            document_type=self.document_type,
            ocr_status=self.ocr_result.ocr_status.value if self.ocr_result else "failed",
            ocr_provider=self.ocr_result.provider if self.ocr_result else None,
            ocr_average_confidence=self.ocr_result.average_confidence() if self.ocr_result else None,
            extraction=self.extraction_model.model_dump(mode="json") if self.extraction_model else {},
            medicines=[m.model_dump(mode="json") for m in self.normalized_medicines],
            lab_validation=self.lab_validation,
            validation=self.validation_report or {},
            errors=self.errors,
        )


def process_document(
    file_path: Path,
    config: PipelineConfig,
    document_id: Optional[str] = None,
    document_type_hint: Optional[str] = None,
) -> ProcessedDocument:
    document_id = document_id or str(uuid.uuid4())
    file_path = Path(file_path)
    logger.info("document_processing_started", extra={"document_id": document_id})

    doc = ProcessedDocument(
        document_id=document_id,
        file_name=file_path.name,
        document_type=document_type_hint or "unknown",
        ocr_result=None,
        extraction_model=None,
    )

    # INGESTION
    validation = validate_file(file_path)
    if not validation.valid:
        doc.errors.append(f"ingestion_rejected:{validation.reason}")
        return doc

    # PREPROCESSING + OCR ROUTER
    if config.ocr_router is None:
        doc.errors.append("ocr_unavailable:no_ocr_router_configured")
        return doc

    try:
        ocr_result = config.ocr_router.transcribe(file_path, document_id=document_id)
    except Exception as e:  # infra failure the router itself didn't catch
        doc.errors.append(f"ocr_failed:{e}")
        return doc

    doc.ocr_result = ocr_result
    if ocr_result.ocr_status == OCRStatus.FAILED or not ocr_result.full_text().strip():
        doc.errors.append(f"ocr_failed:{ocr_result.error or 'empty_transcription'}")
        return doc

    # DOCUMENT TYPE DETECTION (hint always wins over the heuristic)
    doc_type = document_type_hint or detect_document_type(ocr_result.full_text())
    doc.document_type = doc_type

    # STRUCTURED EXTRACTION
    if config.extraction_client is None:
        doc.errors.append("extraction_unavailable:no_extraction_client_configured")
        return doc

    try:
        if doc_type == "lab_report":
            extraction_model: ExtractionModel = extract_lab_report(ocr_result, config.extraction_client)
        elif doc_type == "discharge_summary":
            extraction_model = extract_discharge_summary(ocr_result, config.extraction_client)
        else:
            extraction_model = extract_prescription(ocr_result, config.extraction_client)
    except Exception as e:
        doc.errors.append(f"extraction_failed:{e}")
        return doc

    doc.extraction_model = extraction_model

    # MEDICINE NORMALIZATION (prescriptions and discharge summaries only)
    medications = getattr(extraction_model, "medications", None)
    if medications and config.medicine_provider is not None:
        # Pass extracted diagnoses as context for the ABDM provider's
        # existing indication-boost mechanism (capped +0.05, gated behind
        # name_score >= 0.3 — supporting evidence only, never identifies).
        diagnoses = getattr(extraction_model, "diagnoses", None)
        doc.normalized_medicines = normalize_medications(
            medications, config.medicine_provider, diagnoses=diagnoses
        )
    elif medications:
        doc.errors.append("medicine_normalization_skipped:no_provider_configured")

    # PACKET VERIFICATION: flag low-confidence medicines for patient verification
    for med in doc.normalized_medicines:
        if (med.confidence_level in (ConfidenceLevel.LOW, ConfidenceLevel.UNKNOWN)
                and med.packet_verification is None):
            med.packet_verification = PacketVerification(
                status=PacketVerificationStatus.PATIENT_VERIFICATION_REQUIRED
            )
            med.needs_verification = resolve_needs_verification(med)

    # LAB VALIDATION
    if doc_type == "lab_report":
        lab_result = validate_lab_report(extraction_model)
        doc.lab_validation = lab_result.model_dump(mode="json")

    # CONFIDENCE / UNCERTAINTY VALIDATION (combines extraction + medicine uncertainty)
    validation_report = validate_document(extraction_model, doc_type, doc.normalized_medicines)
    doc.validation_report = validation_report.model_dump(mode="json")

    logger.info("document_processing_completed", extra={"document_id": document_id, "document_type": doc_type})
    return doc


def run_module_b_pipeline(
    file_paths: list[Path],
    config: PipelineConfig,
    patient_reference: Optional[str] = None,
    document_type_hints: Optional[dict[str, str]] = None,
) -> ModuleBResult:
    """document_type_hints maps file name -> explicit type override."""
    document_type_hints = document_type_hints or {}
    processed: list[ProcessedDocument] = []

    for file_path in file_paths:
        file_path = Path(file_path)
        hint = document_type_hints.get(file_path.name)
        processed.append(process_document(file_path, config, document_type_hint=hint))

    batch_id = str(uuid.uuid4())
    logger.info("pipeline_batch_started", extra={"document_id": batch_id, "file_count": len(file_paths)})

    prescriptions_for_timeline = []
    lab_reports_for_timeline = []
    discharge_for_timeline = []

    prescriptions_out, lab_reports_out, discharge_out, procedures_out = [], [], [], []
    all_medicines: list[NormalizedMedicine] = []
    uncertain_fields: list[dict] = []
    any_success = False
    any_failure = False

    for doc in processed:
        if doc.extraction_model is None:
            any_failure = True
            continue
        any_success = True

        if doc.document_type == "prescription":
            prescriptions_for_timeline.append((doc.document_id, doc.extraction_model))
            prescriptions_out.append(doc.extraction_model.model_dump(mode="json"))
        elif doc.document_type == "lab_report":
            lab_reports_for_timeline.append((doc.document_id, doc.extraction_model))
            lab_reports_out.append(doc.lab_validation)
        elif doc.document_type == "discharge_summary":
            discharge_for_timeline.append((doc.document_id, doc.extraction_model))
            discharge_out.append(doc.extraction_model.model_dump(mode="json"))
            for proc in doc.extraction_model.procedures:
                if proc.value:
                    procedures_out.append({
                        "value": proc.value, "source_document_id": doc.document_id,
                        "needs_verification": proc.needs_verification,
                    })

        all_medicines.extend(doc.normalized_medicines)

        for item in (doc.validation_report or {}).get("uncertain_fields", []):
            uncertain_fields.append({"document_id": doc.document_id, **item})

    # PERSIST STATE (if state_store is configured)
    if config.state_store is not None:
        medicine_ids: list[str] = []
        for doc in processed:
            for med in doc.normalized_medicines:
                med_id = str(uuid.uuid4())
                medicine_ids.append(med_id)
                config.state_store.save_medicine(StoredMedicine(
                    medicine_id=med_id,
                    document_id=doc.document_id,
                    normalized_medicine=med,
                ))
            config.state_store.save_document(StoredDocument(
                document_id=doc.document_id,
                file_name=doc.file_name,
                document_type=doc.document_type,
                medicine_ids=medicine_ids,
            ))

    if any_failure and any_success:
        status = PipelineStatus.PARTIAL
    elif any_failure and not any_success:
        status = PipelineStatus.FAILED
    else:
        status = PipelineStatus.SUCCESS

    # CHRONOLOGICAL ORGANIZATION
    timeline = build_timeline(
        prescriptions=prescriptions_for_timeline,
        lab_reports=lab_reports_for_timeline,
        discharge_summaries=discharge_for_timeline,
    )

    # DRUG INTERACTION CHECK — across every medicine from every document in the batch
    interaction_report = check_interactions(all_medicines, config.interaction_provider)

    logger.info("pipeline_batch_completed", extra={"document_id": batch_id, "status": status.value})

    return ModuleBResult(
        document_id=batch_id,
        patient_reference=patient_reference,
        documents=[doc.to_result() for doc in processed],
        prescriptions=prescriptions_out,
        lab_reports=lab_reports_out,
        discharge_summaries=discharge_out,
        procedures=procedures_out,
        timeline=timeline.model_dump(mode="json"),
        drug_interactions=[i.model_dump(mode="json") for i in interaction_report.interactions],
        verification=VerificationSummary(
            requires_verification=len(uncertain_fields) > 0,
            uncertain_fields=uncertain_fields,
        ),
        pipeline=PipelineMeta(
            ocr_provider=config.ocr_router.primary.name if config.ocr_router else None,
            extraction_provider=type(config.extraction_client).__name__ if config.extraction_client else None,
            medicine_provider=config.medicine_provider.name if config.medicine_provider else None,
            interaction_provider=config.interaction_provider.name if config.interaction_provider else None,
            status=status,
        ),
    )
