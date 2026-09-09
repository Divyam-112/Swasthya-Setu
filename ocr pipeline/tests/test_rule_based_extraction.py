import pytest
from document_ai.extraction.client import RuleBasedExtractionClient
from document_ai.extraction.schemas import PrescriptionExtraction


def _skeleton():
    """Same skeleton the real pipeline uses — model_dump of a blank instance."""
    return PrescriptionExtraction().model_dump(mode="json")


def test_rule_based_extractor_extracts_patient_and_medications():
    ocr_text = 'Dr. Sanjay Nema\nPatient Name: Mrs. Varghese Sam\nDate: 27/04/2025\n\nTab Dolo 650 1-0-1\nCap Amox 500 (2)'
    client = RuleBasedExtractionClient()
    result = client.extract(ocr_text, _skeleton(), 'prescription')
    assert result['document_type'] == 'prescription'
    assert result['patient']['name']['value'] == 'Mrs. Varghese Sam'
    assert result['prescription_date']['value'] == '27/04/2025'
    meds = result.get('medications', [])
    assert len(meds) == 2
    dolo = meds[0]
    assert 'Dolo' in dolo['raw_name']['value']


def test_rule_based_extractor_handles_unreadable():
    ocr_text = 'Patient: [UNREADABLE]\nTab [UNREADABLE]'
    client = RuleBasedExtractionClient()
    result = client.extract(ocr_text, _skeleton(), 'prescription')
    assert result['patient']['name']['needs_verification'] is True
    meds = result.get('medications', [])
    assert len(meds) == 1
    assert meds[0]['raw_name']['needs_verification'] is True



def test_new_medivault_json_prescription():
    json_str = """{
      "type": 1,
      "ocr_confidence": 0.95,
      "data": {
        "time_sequence": [],
        "medicines": [
            {"name": "Amoxicillin 500", "dosage": "500", "frequency": "1-0-1", "duration": "5 days"}
        ],
        "doctor": {"name": "Dr. Smith", "clinic/hospital": "City Hospital"},
        "reports_suggested": []
      }
    }"""
    from document_ai.extraction.client import RuleBasedExtractionClient
    client = RuleBasedExtractionClient()
    from document_ai.extraction.schemas import PrescriptionExtraction
    result = client.extract(json_str, PrescriptionExtraction().model_dump(), 'prescription')
    
    assert result['document_type']['value'] == 'prescription'
    assert result['doctor_name']['value'] == 'Dr. Smith'
    assert result['clinic_name']['value'] == 'City Hospital'
    assert len(result['medications']) == 1
    assert result['medications'][0]['raw_name']['value'] == 'Amoxicillin 500'
    assert result['medications'][0]['dose']['value'] == '500'

def test_new_medivault_json_lab_report():
    json_str = """{
      "type": 2,
      "ocr_confidence": 0.95,
      "data": {
        "report_type": "lab",
        "values": [
            {"parameter": "Hemoglobin", "value": "12.5", "unit": "g/dL", "reference_range": "13-17"}
        ],
        "image_preserved": false
      }
    }"""
    from document_ai.extraction.client import RuleBasedExtractionClient
    client = RuleBasedExtractionClient()
    
    result = client.extract(json_str, {}, 'lab_report')
    assert result['document_type']['value'] == 'lab_report'
    assert len(result['tests']) == 1
    assert result['tests'][0]['test_name']['value'] == 'Hemoglobin'
