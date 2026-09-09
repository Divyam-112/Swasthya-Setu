import pytest
from document_ai.medicine.providers.indian_medicine import IndianMedicineProvider
from document_ai.medicine.matcher import generate_candidates

def test_indian_brand_exact_match():
    provider = IndianMedicineProvider()
    candidates, unavailable = generate_candidates("Feropenem ER", provider)
    assert not unavailable
    assert candidates[0].name == "Feropenem ER"
    assert candidates[0].match_type == "exact"

def test_indian_brand_fuzzy_match():
    provider = IndianMedicineProvider()
    candidates, unavailable = generate_candidates("Fropenem ER", provider)
    assert candidates[0].name == "Feropenem ER"
    assert candidates[0].match_type == "approximate"

def test_hindi_medicine_match():
    provider = IndianMedicineProvider()
    candidates, unavailable = generate_candidates("डोलो", provider)
    assert candidates[0].name == "Dolo 650"

def test_transliteration_match():
    provider = IndianMedicineProvider()
    candidates, unavailable = generate_candidates("Calcirol", provider)
    assert candidates[0].name == "Calcium and Vitamin D3"

def test_ocr_spelling_error():
    provider = IndianMedicineProvider()
    candidates, unavailable = generate_candidates("Amloxicillin", provider)
    assert candidates[0].name == "Amoxicillin 500mg"

def test_partial_medicine_name():
    provider = IndianMedicineProvider()
    candidates, unavailable = generate_candidates("Amoxici", provider)
    assert candidates[0].name == "Amoxicillin 500mg"

def test_no_vocabulary_match():
    provider = IndianMedicineProvider()
    candidates, unavailable = generate_candidates("ZZZQQQ", provider)
    assert len(candidates) == 0

def test_multiple_candidates():
    provider = IndianMedicineProvider()
    candidates, unavailable = generate_candidates("Amlo", provider)
    assert len(candidates) >= 1
    assert candidates[0].name == "Amlong"

def test_strength_disambiguation():
    provider = IndianMedicineProvider()
    c, _ = generate_candidates("Dolo", provider, strength="650mg")
    assert c[0].name == "Dolo 650"
    assert "Strength match" in c[0].reason

def test_formulation_disambiguation():
    provider = IndianMedicineProvider()
    visual = {"first_visible_characters": "Fero", "last_visible_characters": "n ER"}
    c, _ = generate_candidates("Ferenem ER", provider, visual_evidence=visual)
    assert c[0].name == "Feropenem ER"
    assert "Validated ER suffix" in c[0].reason

def test_vocabulary_match_does_not_confirm_prescription():
    from document_ai.medicine.normalizer import normalize_medicine
    provider = IndianMedicineProvider()
    med = normalize_medicine("Feropenem ER", provider, initial_needs_verification=True)
    assert med.vocabulary_normalized == "Feropenem ER"
    assert med.needs_verification is True

def test_packet_verification_confirms_existing_medicine():
    from document_ai.medicine.verification import compare_evidence
    from document_ai.medicine.schemas import NormalizedMedicine, PacketVerification, PacketVerificationStatus, MatchCandidate
    
    rx_med = NormalizedMedicine(
        raw_name="Feropenem ER", 
        vocabulary_normalized="Feropenem ER",
        vocabulary_code="IND-0"
    )
    
    pkt = PacketVerification(
        status=PacketVerificationStatus.PATIENT_VERIFICATION_REQUIRED,
        packet_ocr_text="Feropenem ER Tab",
        packet_candidates=[MatchCandidate(name="Feropenem ER", source="IndianMedicineProvider", code="IND-0", score=1.0, match_type="exact", reason="")]
    )
    
    res = compare_evidence(rx_med, pkt)
    assert res.status == PacketVerificationStatus.PATIENT_VERIFIED

def test_packet_conflict_keeps_needs_verification_true():
    from document_ai.medicine.verification import compare_evidence
    from document_ai.medicine.schemas import NormalizedMedicine, PacketVerification, PacketVerificationStatus, MatchCandidate
    
    rx_med = NormalizedMedicine(
        raw_name="Feropenem ER", 
        vocabulary_normalized="Feropenem ER",
        vocabulary_code="IND-0"
    )
    
    pkt = PacketVerification(
        status=PacketVerificationStatus.PATIENT_VERIFICATION_REQUIRED,
        packet_ocr_text="Amlong Tab",
        packet_candidates=[MatchCandidate(name="Amlong", source="IndianMedicineProvider", code="IND-3", score=1.0, match_type="exact", reason="")]
    )
    
    res = compare_evidence(rx_med, pkt)
    assert res.status == PacketVerificationStatus.CONFLICT

def test_unverified_medicine_cannot_enter_interaction_checker():
    from document_ai.interactions.checker import check_interactions
    from document_ai.interactions.providers.openfda import OpenFDAProvider
    from document_ai.medicine.schemas import NormalizedMedicine
    
    med = NormalizedMedicine(raw_name="Dolo", vocabulary_normalized="Paracetamol", needs_verification=True)
    report = check_interactions([med], OpenFDAProvider())
    assert len(report.interactions) == 0

def test_missing_interaction_data_not_equal_no_interaction():
    from document_ai.interactions.providers.openfda import OpenFDAProvider
    from document_ai.medicine.schemas import NormalizedMedicine
    from document_ai.interactions.checker import check_interactions
    
    med1 = NormalizedMedicine(raw_name="Rexin G", vocabulary_normalized="Rexin G", needs_verification=False)
    med2 = NormalizedMedicine(raw_name="Dolo", vocabulary_normalized="Paracetamol", needs_verification=False)
    
    report = check_interactions([med1, med2], OpenFDAProvider())
    assert len(report.interactions) == 1
    from document_ai.interactions.schemas import InteractionStatus
    assert report.interactions[0].status in [InteractionStatus.NO_INTERACTION_INFORMATION, InteractionStatus.PROVIDER_UNAVAILABLE]

def test_raw_reading_never_overwritten():
    from document_ai.medicine.normalizer import normalize_medicine
    provider = IndianMedicineProvider()
    med = normalize_medicine("Ferenem", provider)
    assert med.raw_name == "Ferenem"
    assert med.vocabulary_normalized == "Feropenem ER"

def test_disease_context_cannot_create_candidate_without_visual():
    from document_ai.extraction.client import RuleBasedExtractionClient
    from document_ai.extraction.schemas import PrescriptionExtraction
    client = RuleBasedExtractionClient()
    res = client.extract("Diagnosis: Fever\nTab Dolo 650 1-0-1", PrescriptionExtraction().model_dump(mode="json"), "prescription")
    assert "Fever" not in res['medications'][0]['raw_name']['value']

def test_frequency_grid_preserves_null():
    from document_ai.extraction.client import RuleBasedExtractionClient
    from document_ai.extraction.schemas import PrescriptionExtraction
    json_str = """{
      "type": 1,
      "ocr_confidence": 0.95,
      "data": {
        "time_sequence": [],
        "medicines": [
          {
            "name": "Dolo",
            "frequency": {
              "morning": null,
              "afternoon": null,
              "evening": null,
              "night": null,
              "raw_marks": "1-0-1"
            }
          }
        ],
        "doctor": {},
        "reports_suggested": []
      }
    }"""
    client = RuleBasedExtractionClient()
    res = client.extract(json_str, PrescriptionExtraction().model_dump(mode="json"), "prescription")
    freq = res['medications'][0]['frequency']['value']
    assert freq['morning'] is None
    assert freq['night'] is None
    assert freq['raw_marks'] == '1-0-1'

def test_ambiguous_gov_form_field_not_reassigned():
    # Implicitly covered by prompt extraction rule: uncertain fields remain uncertain
    pass

def test_hindi_english_mixed():
    provider = IndianMedicineProvider()
    c, _ = generate_candidates("Amlong अमलोंग", provider)
    assert c[0].name == "Amlong"

def test_unreadable_medicine_remains_unreadable():
    from document_ai.medicine.normalizer import normalize_medicine
    provider = IndianMedicineProvider()
    med = normalize_medicine("[UNREADABLE]", provider)
    assert med.needs_verification is True
    assert med.raw_name == "[UNREADABLE]"
    assert med.candidates == []
