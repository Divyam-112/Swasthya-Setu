from document_ai.extraction.discharge_summary_extractor import extract_discharge_summary
from document_ai.extraction.lab_report_extractor import extract_lab_report
from document_ai.extraction.prescription_extractor import extract_prescription
from document_ai.ocr.schemas import OCRResult, OCRStatus, Page


class FakeExtractionClient:
    def __init__(self, response: dict):
        self.response = response
        self.last_ocr_text = None
        self.last_document_type = None

    def extract(self, ocr_text, schema_json, document_type):
        self.last_ocr_text = ocr_text
        self.last_document_type = document_type
        return self.response


def _ocr_result(text: str) -> OCRResult:
    return OCRResult(
        document_id="doc1",
        provider="test",
        ocr_status=OCRStatus.SUCCESS,
        pages=[Page(page_number=1, raw_text=text)],
    )


def _field(value=None, confidence=None, source_text=None, needs_verification=False):
    return {
        "value": value,
        "confidence": confidence,
        "source_text": source_text,
        "needs_verification": needs_verification,
    }


# ------------------------------------------------------------ prescription

def test_clean_prescription_extraction():
    response = {
        "document_type": "prescription",
        "doctor": {"name": _field("Dr. Sharma"), "qualification": _field("MBBS"), "registration_number": _field()},
        "hospital_clinic": _field("City Hospital"),
        "patient": {"name": _field("Ramesh"), "age": _field("45"), "sex": _field("M"), "patient_id": _field()},
        "prescription_date": _field("2025-05-12"),
        "diagnoses": [_field("Fever")],
        "medications": [
            {
                "raw_name": _field("Dolo 650"),
                "strength": _field("650mg"),
                "dosage_form": _field("tablet"),
                "dose": _field("1"),
                "route": _field("oral"),
                "frequency": _field({"raw_marks": "1-0-1"}),
                "duration": _field("5 days"),
                "timing": _field(),
                "instructions": _field(),
            }
        ],
        "additional_notes": _field(),
        "uncertain_fields": [],
    }
    client = FakeExtractionClient(response)
    result = extract_prescription(_ocr_result("Dolo 650 1-0-1 x 5 days"), client)

    assert result.doctor.name.value == "Dr. Sharma"
    assert result.medications[0].raw_name.value == "Dolo 650"
    assert client.last_document_type == "prescription"


def test_multiple_medicines_preserved_in_order():
    response = {
        "document_type": "prescription",
        "doctor": {"name": _field(), "qualification": _field(), "registration_number": _field()},
        "hospital_clinic": _field(),
        "patient": {"name": _field(), "age": _field(), "sex": _field(), "patient_id": _field()},
        "prescription_date": _field(),
        "diagnoses": [],
        "medications": [
            {"raw_name": _field("Dolo 650"), "strength": _field(), "dosage_form": _field(), "dose": _field(),
             "route": _field(), "frequency": _field(), "duration": _field(), "timing": _field(), "instructions": _field()},
            {"raw_name": _field("Azithral 500"), "strength": _field(), "dosage_form": _field(), "dose": _field(),
             "route": _field(), "frequency": _field(), "duration": _field(), "timing": _field(), "instructions": _field()},
        ],
        "additional_notes": _field(),
        "uncertain_fields": [],
    }
    client = FakeExtractionClient(response)
    result = extract_prescription(_ocr_result("Dolo 650\nAzithral 500"), client)

    assert [m.raw_name.value for m in result.medications] == ["Dolo 650", "Azithral 500"]


def test_uncertain_prescription_never_normalizes_medicine_name():
    """The extraction layer must preserve OCR spelling verbatim — 'Rantidine'
    stays 'Rantidine', never silently becomes 'Ranitidine'."""
    response = {
        "document_type": "prescription",
        "doctor": {"name": _field(), "qualification": _field(), "registration_number": _field()},
        "hospital_clinic": _field(),
        "patient": {"name": _field(), "age": _field(), "sex": _field(), "patient_id": _field()},
        "prescription_date": _field(),
        "diagnoses": [],
        "medications": [
            {"raw_name": _field("Rantidine", needs_verification=True), "strength": _field(), "dosage_form": _field(),
             "dose": _field(), "route": _field(), "frequency": _field(), "duration": _field(), "timing": _field(),
             "instructions": _field()}
        ],
        "additional_notes": _field(),
        "uncertain_fields": [],
    }
    client = FakeExtractionClient(response)
    result = extract_prescription(_ocr_result("Rantidine tab"), client)

    assert result.medications[0].raw_name.value == "Rantidine"
    assert "Ranitidine" not in [result.medications[0].raw_name.value]
    assert "medications.0.raw_name" in result.uncertain_fields


def test_missing_and_unreadable_fields_marked_needs_verification():
    response = {
        "document_type": "prescription",
        "doctor": {"name": _field(needs_verification=True), "qualification": _field(), "registration_number": _field()},
        "hospital_clinic": _field(),
        "patient": {"name": _field(), "age": _field(), "sex": _field(), "patient_id": _field()},
        "prescription_date": _field(),
        "diagnoses": [],
        "medications": [],
        "additional_notes": _field(),
        "uncertain_fields": [],
    }
    client = FakeExtractionClient(response)
    result = extract_prescription(_ocr_result("[UNREADABLE]"), client)

    assert result.doctor.name.value is None
    assert "doctor.name" in result.uncertain_fields


# ------------------------------------------------------------ lab report

def test_lab_report_with_multiple_tests():
    response = {
        "document_type": "lab_report",
        "patient": {"name": _field("Ramesh"), "age": _field(), "sex": _field(), "patient_id": _field()},
        "hospital_laboratory": _field("City Lab"),
        "report_date": _field("2025-05-10"),
        "tests": [
            {"test_name": _field("Hemoglobin"), "value": _field("13.5"), "unit": _field("g/dL"), "reference_range": _field("12-16")},
            {"test_name": _field("WBC"), "value": _field("11000"), "unit": _field("/uL"), "reference_range": _field("4000-11000")},
        ],
        "uncertain_fields": [],
    }
    client = FakeExtractionClient(response)
    result = extract_lab_report(_ocr_result("Hemoglobin 13.5 g/dL (12-16)\nWBC 11000 /uL"), client)

    assert len(result.tests) == 2
    assert result.tests[0].test_name.value == "Hemoglobin"
    assert client.last_document_type == "lab_report"


# ------------------------------------------------------------ discharge summary

def test_discharge_summary_extraction():
    response = {
        "document_type": "discharge_summary",
        "patient": {"name": _field("Ramesh"), "age": _field(), "sex": _field(), "patient_id": _field()},
        "hospital": _field("City Hospital"),
        "admission_date": _field("2025-04-01"),
        "discharge_date": _field("2025-04-05"),
        "diagnoses": [_field("Appendicitis")],
        "procedures": [_field("Appendectomy")],
        "surgery_history": [_field("Appendectomy 2025-04-02")],
        "investigations": [_field("CBC")],
        "medications": [],
        "follow_up_instructions": _field("Review in 1 week"),
        "uncertain_fields": [],
    }
    client = FakeExtractionClient(response)
    result = extract_discharge_summary(_ocr_result("Discharge summary text"), client)

    assert result.diagnoses[0].value == "Appendicitis"
    assert result.procedures[0].value == "Appendectomy"
    assert client.last_document_type == "discharge_summary"


# ------------------------------------------------------------ robustness

def test_response_with_no_matching_fields_marks_everything_uncertain():
    """Extra/unrecognized keys in the LLM response don't crash extraction —
    pydantic ignores them and every real field stays unfilled/uncertain."""
    client = FakeExtractionClient({"garbage": "not matching schema at all"})
    result = extract_prescription(_ocr_result("some text"), client)

    assert result.medications == []
    assert "doctor.name" in result.uncertain_fields
    assert len(result.uncertain_fields) > 0


def test_invalid_field_type_falls_back_to_parse_failed_marker():
    """A response that actively conflicts with the schema (wrong type, not
    just extra/missing keys) must not crash extraction either."""
    client = FakeExtractionClient({
        "document_type": "prescription",
        "medications": "this should be a list, not a string",
    })
    result = extract_prescription(_ocr_result("some text"), client)

    assert result.uncertain_fields == ["extraction_parse_failed"]
    assert result.medications == []


def test_multilingual_text_passed_through_unmodified_to_client():
    client = FakeExtractionClient({
        "document_type": "prescription",
        "doctor": {"name": _field(), "qualification": _field(), "registration_number": _field()},
        "hospital_clinic": _field(),
        "patient": {"name": _field(), "age": _field(), "sex": _field(), "patient_id": _field()},
        "prescription_date": _field(),
        "diagnoses": [],
        "medications": [],
        "additional_notes": _field(),
        "uncertain_fields": [],
    })
    hindi_text = "डोलो 650 - दिन में दो बार"
    extract_prescription(_ocr_result(hindi_text), client)

    assert client.last_ocr_text == hindi_text
