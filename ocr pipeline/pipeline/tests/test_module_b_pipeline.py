from pathlib import Path

from document_ai.medicine.providers.base import VocabularyCandidate
from document_ai.ocr.base import OCRProvider
from document_ai.ocr.router import OCRRouter
from document_ai.ocr.schemas import OCRResult, OCRStatus, Page
from document_ai.pipeline.module_b import detect_document_type, process_document, run_module_b_pipeline
from document_ai.pipeline.orchestration import PipelineConfig
from document_ai.pipeline.schemas import PipelineStatus

FIXTURES = Path(__file__).parent / "fixtures"


class FakeOCRProvider(OCRProvider):
    name = "fake_ocr"

    def __init__(self, text_by_filename: dict[str, str]):
        self.text_by_filename = text_by_filename

    def transcribe(self, file_path: Path, document_id: str | None = None) -> OCRResult:
        text = self.text_by_filename.get(Path(file_path).name, "")
        return OCRResult(
            document_id=document_id or "doc",
            provider=self.name,
            ocr_status=OCRStatus.SUCCESS,
            pages=[Page(page_number=1, raw_text=text, confidence=0.9)],
        )


class FakeExtractionClient:
    def __init__(self, responses_by_type: dict[str, dict]):
        self.responses_by_type = responses_by_type

    def extract(self, ocr_text, schema_json, document_type):
        return self.responses_by_type.get(document_type, {})


class FakeMedicineProvider:
    name = "FakeVocab"

    def exact_lookup(self, cleaned_name: str):
        if cleaned_name.lower() == "paracetamol":
            return VocabularyCandidate(name="Paracetamol", code="RX1", score=1.0, match_type="exact")
        return None

    def approximate_lookup(self, cleaned_name: str, max_candidates: int = 5):
        return []


class FakeInteractionProvider:
    name = "FakeInteractionDB"

    def check_pair(self, drug_a, drug_b):
        from document_ai.interactions.providers.base import PairInteractionResult
        return PairInteractionResult(found=False)


def _field(value=None, confidence=0.9):
    return {"value": value, "confidence": confidence, "source_text": value, "needs_verification": value is None}


PRESCRIPTION_RESPONSE = {
    "document_type": "prescription",
    "doctor": {"name": _field("Dr. Sharma"), "qualification": _field(), "registration_number": _field()},
    "hospital_clinic": _field("City Hospital"),
    "patient": {"name": _field("Ramesh"), "age": _field("45"), "sex": _field("M"), "patient_id": _field()},
    "prescription_date": _field("2025-05-12"),
    "diagnoses": [_field("Fever")],
    "medications": [
        {"raw_name": _field("Paracetamol"), "strength": _field("650mg"), "dosage_form": _field("tablet"),
         "dose": _field("1"), "route": _field(), 
         "frequency": {"value": {"raw_marks": "1-0-1"}, "confidence": 0.9, "source_text": "1-0-1", "needs_verification": False}, 
         "duration": _field("5 days"),
         "timing": _field(), "instructions": _field()},
    ],
    "additional_notes": _field(),
    "uncertain_fields": [],
}

LAB_RESPONSE = {
    "document_type": "lab_report",
    "patient": {"name": _field("Ramesh"), "age": _field(), "sex": _field(), "patient_id": _field()},
    "hospital_laboratory": _field("City Lab"),
    "report_date": _field("2025-04-01"),
    "tests": [
        {"test_name": _field("Hemoglobin"), "value": _field("13.5"), "unit": _field("g/dL"),
         "reference_range": _field("12-16")},
    ],
    "uncertain_fields": [],
}

DISCHARGE_RESPONSE = {
    "document_type": "discharge_summary",
    "patient": {"name": _field("Ramesh"), "age": _field(), "sex": _field(), "patient_id": _field()},
    "hospital": _field("City Hospital"),
    "admission_date": _field("2025-03-01"),
    "discharge_date": _field("2025-03-10"),
    "diagnoses": [_field("Appendicitis")],
    "procedures": [_field("Appendectomy")],
    "surgery_history": [],
    "investigations": [],
    "medications": [],
    "follow_up_instructions": _field(),
    "uncertain_fields": [],
}


def _config(ocr_text_map, responses_by_type, medicine_provider=None, interaction_provider=None):
    ocr_provider = FakeOCRProvider(ocr_text_map)
    router = OCRRouter(ocr_provider, None, fallback_confidence_threshold=0.0)
    return PipelineConfig(
        ocr_router=router,
        extraction_client=FakeExtractionClient(responses_by_type),
        medicine_provider=medicine_provider,
        interaction_provider=interaction_provider,
    )


# ------------------------------------------------------------ document type detection


def test_detect_lab_report():
    assert detect_document_type("Hemoglobin 13.5 Reference Range: 12-16") == "lab_report"


def test_detect_discharge_summary():
    assert detect_document_type("DISCHARGE SUMMARY\nAdmission Date: 1/3/2025") == "discharge_summary"


def test_detect_prescription_default():
    assert detect_document_type("Dolo 650 1-0-1 x 5 days") == "prescription"


# ------------------------------------------------------------ process_document


def test_process_prescription_document_end_to_end():
    config = _config(
        {"prescription.png": "Paracetamol 650mg 1-0-1 x 5 days"},
        {"prescription": PRESCRIPTION_RESPONSE},
        medicine_provider=FakeMedicineProvider(),
    )
    doc = process_document(FIXTURES / "prescription.png", config, document_type_hint="prescription")
    assert doc.errors == []
    assert doc.document_type == "prescription"
    assert doc.extraction_model.medications[0].raw_name.value == "Paracetamol"
    assert doc.normalized_medicines[0].vocabulary_normalized == "Paracetamol"
    assert doc.validation_report is not None


def test_process_document_rejected_by_ingestion():
    config = _config({}, {})
    doc = process_document(FIXTURES / "does_not_exist.png", config)
    assert any("ingestion_rejected" in e for e in doc.errors)
    assert doc.extraction_model is None


def test_process_document_ocr_unavailable():
    config = PipelineConfig(ocr_router=None, extraction_client=None)
    doc = process_document(FIXTURES / "prescription.png", config)
    assert any("ocr_unavailable" in e for e in doc.errors)


def test_process_lab_report_runs_lab_validation():
    config = _config({"lab_report.png": "Hemoglobin 13.5 g/dL Reference Range: 12-16"},
                      {"lab_report": LAB_RESPONSE})
    doc = process_document(FIXTURES / "lab_report.png", config, document_type_hint="lab_report")
    assert doc.lab_validation is not None
    assert doc.lab_validation["tests"][0]["abnormal_status"] == "NORMAL"


def test_process_document_auto_detects_type_without_hint():
    config = _config({"lab_report.png": "Reference Range panel test"}, {"lab_report": LAB_RESPONSE})
    doc = process_document(FIXTURES / "lab_report.png", config)  # no hint
    assert doc.document_type == "lab_report"


# ------------------------------------------------------------ run_module_b_pipeline


def test_full_pipeline_multiple_documents():
    config = _config(
        {
            "prescription.png": "Paracetamol 650mg 1-0-1 x 5 days",
            "lab_report.png": "Hemoglobin 13.5 g/dL Reference Range: 12-16",
            "discharge.png": "DISCHARGE SUMMARY Admission Date: 2025-03-01",
        },
        {"prescription": PRESCRIPTION_RESPONSE, "lab_report": LAB_RESPONSE, "discharge_summary": DISCHARGE_RESPONSE},
        medicine_provider=FakeMedicineProvider(),
        interaction_provider=FakeInteractionProvider(),
    )
    result = run_module_b_pipeline(
        [FIXTURES / "prescription.png", FIXTURES / "lab_report.png", FIXTURES / "discharge.png"],
        config,
        document_type_hints={
            "prescription.png": "prescription",
            "lab_report.png": "lab_report",
            "discharge.png": "discharge_summary",
        },
    )
    assert len(result.documents) == 3
    assert len(result.prescriptions) == 1
    assert len(result.lab_reports) == 1
    assert len(result.discharge_summaries) == 1
    assert result.pipeline.status == PipelineStatus.SUCCESS
    assert result.timeline["dated_events"]
    assert result.pipeline.ocr_provider == "fake_ocr"


def test_pipeline_partial_status_when_one_document_fails():
    config = _config(
        {"prescription.png": "Paracetamol 650mg"},
        {"prescription": PRESCRIPTION_RESPONSE},
        medicine_provider=FakeMedicineProvider(),
    )
    result = run_module_b_pipeline(
        [FIXTURES / "prescription.png", FIXTURES / "does_not_exist.png"],
        config,
        document_type_hints={"prescription.png": "prescription"},
    )
    assert result.pipeline.status == PipelineStatus.PARTIAL
    assert len(result.documents) == 2


def test_pipeline_failed_status_when_all_documents_fail():
    config = _config({}, {})
    result = run_module_b_pipeline([FIXTURES / "does_not_exist.png"], config)
    assert result.pipeline.status == PipelineStatus.FAILED


def test_pipeline_never_invents_patient_reference():
    config = _config({"prescription.png": "Paracetamol"}, {"prescription": PRESCRIPTION_RESPONSE})
    result = run_module_b_pipeline([FIXTURES / "prescription.png"], config,
                                    document_type_hints={"prescription.png": "prescription"})
    assert result.patient_reference is None


def test_pipeline_verification_aggregates_document_ids():
    config = _config({"prescription.png": "Paracetamol"}, {"prescription": PRESCRIPTION_RESPONSE})
    result = run_module_b_pipeline([FIXTURES / "prescription.png"], config,
                                    document_type_hints={"prescription.png": "prescription"})
    if result.verification.uncertain_fields:
        assert "document_id" in result.verification.uncertain_fields[0]
