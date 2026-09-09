from document_ai.extraction.schemas import ExtractedField, Medication, PrescriptionExtraction
from document_ai.medicine.schemas import ConfidenceLevel as MedConfidenceLevel
from document_ai.medicine.schemas import NormalizedMedicine
from document_ai.validation.confidence import EvidenceSignals, ValidationThresholds, evaluate
from document_ai.validation.schemas import ConfidenceLevel, VerificationReason
from document_ai.validation.validator import validate_document


def _fully_confident_prescription() -> PrescriptionExtraction:
    p = PrescriptionExtraction()
    p.doctor.name = ExtractedField(value="Dr. Sharma", confidence=0.95, source_text="Dr. Sharma", needs_verification=False)
    p.hospital_clinic = ExtractedField(value="City Hospital", confidence=0.95, source_text="City Hospital")
    p.patient.name = ExtractedField(value="Ramesh", confidence=0.9, source_text="Ramesh")
    p.patient.age = ExtractedField(value="45", confidence=0.9, source_text="45")
    p.patient.sex = ExtractedField(value="M", confidence=0.9, source_text="M")
    p.prescription_date = ExtractedField(value="2025-05-12", confidence=0.9, source_text="2025-05-12")
    return p


# ------------------------------------------------------------ confidence.evaluate


def test_evaluate_missing_value():
    level, reasons = evaluate(EvidenceSignals(is_missing=True))
    assert level == ConfidenceLevel.UNKNOWN
    assert VerificationReason.MISSING_VALUE in reasons


def test_evaluate_malformed_field():
    level, reasons = evaluate(EvidenceSignals(malformed=True, ocr_confidence=0.99))
    assert level == ConfidenceLevel.UNKNOWN
    assert VerificationReason.MALFORMED_FIELD in reasons


def test_evaluate_high_confidence_no_reasons():
    level, reasons = evaluate(EvidenceSignals(ocr_confidence=0.95, extraction_confidence=0.9, has_source_text=True))
    assert level == ConfidenceLevel.HIGH
    assert reasons == []


def test_evaluate_takes_minimum_of_available_signals():
    level, _ = evaluate(EvidenceSignals(ocr_confidence=0.95, extraction_confidence=0.3))
    assert level in (ConfidenceLevel.UNKNOWN, ConfidenceLevel.LOW)


def test_evaluate_disagreement_downgrades_high_to_medium():
    level, reasons = evaluate(EvidenceSignals(ocr_confidence=0.95, extraction_confidence=0.95, agreement=False))
    assert level == ConfidenceLevel.MEDIUM
    assert VerificationReason.VLM_VOCABULARY_DISAGREEMENT in reasons


def test_evaluate_no_signals_at_all_is_unknown():
    level, reasons = evaluate(EvidenceSignals())
    assert level == ConfidenceLevel.UNKNOWN


def test_thresholds_are_configurable():
    strict = ValidationThresholds(high_min=0.99, medium_min=0.9, low_min=0.5)
    level, _ = evaluate(EvidenceSignals(ocr_confidence=0.9, extraction_confidence=0.9), thresholds=strict)
    assert level == ConfidenceLevel.MEDIUM


# ------------------------------------------------------------ validate_document


def test_fully_confident_document_has_no_uncertain_fields_from_named_fields():
    p = _fully_confident_prescription()
    report = validate_document(p, "prescription")
    named_paths = {i.field_path for i in report.uncertain_fields}
    assert "doctor.name" not in named_paths
    assert "hospital_clinic" not in named_paths


def test_missing_fields_are_flagged():
    p = PrescriptionExtraction()  # everything default/missing
    report = validate_document(p, "prescription")
    assert report.requires_verification is True
    assert any(i.field_path == "doctor.name" for i in report.uncertain_fields)
    assert all(VerificationReason.MISSING_VALUE in i.reasons for i in report.uncertain_fields if i.field_path == "doctor.name")


def test_overall_confidence_reflects_worst_item():
    p = PrescriptionExtraction()
    report = validate_document(p, "prescription")
    assert report.overall_confidence_level == ConfidenceLevel.UNKNOWN


def test_medicine_uncertainty_is_included():
    p = PrescriptionExtraction()
    med = NormalizedMedicine(
        raw_name="gr snne",
        needs_verification=True,
        reasons=["no_candidate"],
        confidence_level=MedConfidenceLevel.UNKNOWN,
    )
    report = validate_document(p, "prescription", normalized_medicines=[med])
    assert any(i.field_path == "medications.0.vocabulary_normalized" for i in report.uncertain_fields)
    flagged = [i for i in report.uncertain_fields if i.field_path == "medications.0.vocabulary_normalized"][0]
    assert VerificationReason.MEDICINE_NO_MATCH in flagged.reasons
    assert flagged.source_text == "gr snne"


def test_confident_medicine_not_flagged():
    p = PrescriptionExtraction()
    med = NormalizedMedicine(
        raw_name="Paracetamol", vocabulary_normalized="Paracetamol", needs_verification=False,
        confidence_level=MedConfidenceLevel.HIGH,
    )
    report = validate_document(p, "prescription", normalized_medicines=[med])
    assert not any(i.field_path == "medications.0.vocabulary_normalized" for i in report.uncertain_fields)


def test_report_document_type_preserved():
    p = PrescriptionExtraction()
    report = validate_document(p, "prescription")
    assert report.document_type == "prescription"
