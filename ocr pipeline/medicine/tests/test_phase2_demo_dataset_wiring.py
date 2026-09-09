"""Phase 2 Integration Tests: Wiring DemoIndianMedicineDatasetProvider into Module B pipeline.

Tests verify:
1. Router wiring: get_medicine_provider("demo_dataset") returns DemoIndianMedicineDatasetProvider.
2. Pipeline config wiring: _build_medicine_provider() respects MEDICINE_PROVIDER=demo_dataset.
3. Normalizer integration: normalize_medicine() with DemoIndianMedicineDatasetProvider (exact match).
4. Normalizer integration: fuzzy/typo matching via demo provider.
5. Unknown/garbage medicine: normalize_medicine() returns no candidate, zero confidence, needs_verification=True.
6. Metadata preservation: manufacturer, composition, is_discontinued propagate to MatchCandidate.
7. Candidate != confirmed safety invariant: unconfirmed candidate remains needs_verification=True.
8. Interaction checker safety gate: unconfirmed candidates are NOT treated as confirmed drugs.
9. Packet verification integration: PacketVerification correctly flags unconfirmed demo candidates.
10. Batch normalization: normalize_medications() works end-to-end with demo provider.
11. Module B process_document() integration with demo provider.
12. Router ABDM fallback safety: no silent fallback from ABDM to demo_dataset.
13. Discontinued medication flag is preserved in candidate metadata.
14. Composition search integration through matcher.
15. PipelineConfig respects explicitly injected demo provider.
"""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

from document_ai.extraction.schemas import ExtractedField, Medication
from document_ai.interactions.checker import check_interactions
from document_ai.interactions.schemas import InteractionStatus
from document_ai.medicine.matcher import generate_candidates
from document_ai.medicine.normalizer import normalize_medicine, normalize_medications
from document_ai.medicine.providers.abdm import ABDMDrugRegistryProvider
from document_ai.medicine.providers.base import MedicineVocabularyProvider
from document_ai.medicine.providers.demo_indian_dataset import DemoIndianMedicineDatasetProvider
from document_ai.medicine.providers.router import get_medicine_provider
from document_ai.medicine.schemas import (
    MatchCandidate,
    NormalizedMedicine,
    PacketVerification,
    PacketVerificationStatus,
)
from document_ai.medicine.tests.test_demo_indian_dataset_provider import _fixture_provider
from document_ai.medicine.verification import (
    apply_verification,
    compare_evidence,
)
from document_ai.ocr.schemas import OCRResult, OCRStatus, Page
from document_ai.pipeline.module_b import process_document
from document_ai.pipeline.orchestration import PipelineConfig, _build_medicine_provider


@pytest.fixture
def fixture_provider():
    return _fixture_provider()


# ---------------------------------------------------------------------------
# Test 1: Router returns DemoIndianMedicineDatasetProvider for "demo_dataset"
# ---------------------------------------------------------------------------
def test_router_returns_demo_provider(fixture_provider):
    with patch(
        "document_ai.medicine.providers.demo_indian_dataset.DemoIndianMedicineDatasetProvider",
        return_value=fixture_provider,
    ):
        provider = get_medicine_provider("demo_dataset")
        assert isinstance(provider, DemoIndianMedicineDatasetProvider)
        assert callable(getattr(provider, "exact_lookup", None))
        assert callable(getattr(provider, "approximate_lookup", None))


# ---------------------------------------------------------------------------
# Test 2: PipelineConfig wiring through _build_medicine_provider()
# ---------------------------------------------------------------------------
def test_pipeline_config_builds_demo_provider(fixture_provider):
    with patch.dict(os.environ, {"MEDICINE_PROVIDER": "demo_dataset"}):
        with patch(
            "document_ai.medicine.providers.demo_indian_dataset.DemoIndianMedicineDatasetProvider",
            return_value=fixture_provider,
        ):
            provider = _build_medicine_provider()
            assert isinstance(provider, DemoIndianMedicineDatasetProvider)


# ---------------------------------------------------------------------------
# Test 3: Normalizer exact match with DemoIndianMedicineDatasetProvider
# ---------------------------------------------------------------------------
def test_normalizer_exact_match(fixture_provider):
    result = normalize_medicine(
        "Paracetamol 500mg Tablet",
        provider=fixture_provider,
    )

    assert isinstance(result, NormalizedMedicine)
    assert len(result.candidates) > 0
    top = result.candidates[0]
    assert top.name == "Paracetamol 500mg Tablet"
    assert top.source == fixture_provider.name
    assert top.score >= 0.85
    assert result.confidence is not None and result.confidence >= 0.85
    assert result.vocabulary_normalized == "Paracetamol 500mg Tablet"


# ---------------------------------------------------------------------------
# Test 4: Normalizer fuzzy / OCR typo match
# ---------------------------------------------------------------------------
def test_normalizer_fuzzy_typo_match(fixture_provider):
    result = normalize_medicine(
        "Paracetmol 500mg",
        provider=fixture_provider,
    )

    assert len(result.candidates) > 0
    top = result.candidates[0]
    assert "Paracetamol" in top.name
    assert top.source == fixture_provider.name
    assert top.score > 0.6


# ---------------------------------------------------------------------------
# Test 5: Garbage input returns no hallucinated candidate
# ---------------------------------------------------------------------------
def test_normalizer_garbage_input_no_candidates(fixture_provider):
    result = normalize_medicine(
        "zzzzunknowndrugxyz",
        provider=fixture_provider,
    )

    assert len(result.candidates) == 0
    assert result.confidence is None or result.confidence == 0.0
    assert result.needs_verification is True
    assert result.vocabulary_normalized is None


# ---------------------------------------------------------------------------
# Test 6: Metadata preservation (manufacturer, composition, discontinued)
# ---------------------------------------------------------------------------
def test_metadata_preservation_in_candidates(fixture_provider):
    result = normalize_medicine(
        "Augmentin 625 Duo Tablet",
        provider=fixture_provider,
    )

    assert len(result.candidates) > 0
    top = result.candidates[0]
    assert top.manufacturer == "GlaxoSmithKline Pharmaceuticals Ltd"
    assert "Amoxycillin (500mg)" in (top.composition or "")
    assert top.is_discontinued is False


# ---------------------------------------------------------------------------
# Test 7: Candidate != Confirmed safety invariant
# ---------------------------------------------------------------------------
def test_candidate_not_confirmed_safety(fixture_provider):
    # Typo / partial match should require verification
    result = normalize_medicine(
        "Paracetmol",
        provider=fixture_provider,
    )

    assert result.needs_verification is True
    # If below normalize_min threshold (0.85), vocabulary_normalized stays None
    assert result.vocabulary_normalized is None or result.needs_verification is True


# ---------------------------------------------------------------------------
# Test 8: Interaction checker safety gate: unconfirmed candidates NOT confirmed
# ---------------------------------------------------------------------------
def test_interaction_checker_gates_unconfirmed():
    confirmed_med = NormalizedMedicine(
        raw_name="Aspirin 75mg",
        vocabulary_normalized="Aspirin 75mg Tablet",
        confidence=0.95,
        needs_verification=False,
    )
    unconfirmed_med = NormalizedMedicine(
        raw_name="Warfarin 5mg",
        vocabulary_normalized="Warfarin 5mg Tablet",
        confidence=0.60,
        needs_verification=True,
        candidates=[
            MatchCandidate(
                name="Warfarin 5mg Tablet",
                score=0.70,
                source="DemoIndianMedicineDatasetProvider",
            )
        ],
    )
    # When one medicine is unconfirmed, check_interactions marks it NOT_CHECKED
    report = check_interactions([confirmed_med, unconfirmed_med], provider=None)
    assert len(report.interactions) > 0
    for interaction in report.interactions:
        assert interaction.status == InteractionStatus.NOT_CHECKED
        assert interaction.reason == "unconfirmed_identity"


# ---------------------------------------------------------------------------
# Test 9: Packet verification flags unconfirmed demo candidates
# ---------------------------------------------------------------------------
def test_packet_verification_flags_unconfirmed_demo_candidate(fixture_provider):
    norm_med = normalize_medicine(
        "Paracetmol",
        provider=fixture_provider,
    )
    assert norm_med.needs_verification is True

    # Check evidence comparison with packet candidate
    packet_pv = PacketVerification(
        status=PacketVerificationStatus.PATIENT_VERIFICATION_REQUIRED,
        packet_ocr_text="Paracetamol Tablets",
        packet_candidates=[
            MatchCandidate(
                name="Paracetamol 500mg Tablet",
                score=0.88,
                source="DemoIndianMedicineDatasetProvider",
            )
        ],
    )
    comparison = compare_evidence(norm_med, packet_pv)
    assert comparison.status == PacketVerificationStatus.PATIENT_VERIFIED

    # Apply verification resolves needs_verification to False once verified
    verified_med = apply_verification(norm_med, comparison)
    assert verified_med.needs_verification is False
    assert verified_med.vocabulary_normalized == "Paracetamol 500mg Tablet"


# ---------------------------------------------------------------------------
# Test 10: Batch medication normalization works end-to-end
# ---------------------------------------------------------------------------
def test_batch_medication_normalization(fixture_provider):
    meds = [
        Medication(raw_name=ExtractedField(value="Paracetamol 500mg Tablet", confidence=0.9)),
        Medication(raw_name=ExtractedField(value="Augmentin 625 Duo Tablet", confidence=0.9)),
        Medication(raw_name=ExtractedField(value="zzzzunknowndrugxyz", confidence=0.5)),
    ]
    results = normalize_medications(meds, provider=fixture_provider)

    assert len(results) == 3
    assert results[0].vocabulary_normalized is not None
    assert results[0].candidates[0].source == fixture_provider.name
    assert results[1].vocabulary_normalized is not None
    assert results[1].candidates[0].source == fixture_provider.name
    assert len(results[2].candidates) == 0
    assert results[2].needs_verification is True


# ---------------------------------------------------------------------------
# Test 11: Module B process_document() integration
# ---------------------------------------------------------------------------
def test_module_b_process_document_with_demo_provider(tmp_path, fixture_provider):
    # Setup dummy test image file (.png is allowed by file validator)
    test_file = tmp_path / "rx.png"
    test_file.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 50)

    # Mock OCR Router
    mock_ocr = MagicMock()
    ocr_res = OCRResult(
        document_id="doc1",
        provider="test",
        ocr_status=OCRStatus.SUCCESS,
        pages=[
            Page(
                page_number=1,
                raw_text="Prescription text",
                confidence=0.95,
            )
        ],
    )
    mock_ocr.transcribe.return_value = ocr_res

    # Mock Extraction Client
    mock_extractor = MagicMock()
    mock_extractor.extract.return_value = {
        "document_type": "prescription",
        "medications": [
            {"raw_name": {"value": "Augmentin 625 Duo Tablet", "confidence": 0.92}},
            {"raw_name": {"value": "Metformin 500 MG Tablet", "confidence": 0.88}},
        ],
    }

    config = PipelineConfig(
        ocr_router=mock_ocr,
        extraction_client=mock_extractor,
        medicine_provider=fixture_provider,
    )

    doc = process_document(test_file, config=config, document_type_hint="prescription")

    assert doc.errors == []
    assert len(doc.normalized_medicines) == 2
    for med in doc.normalized_medicines:
        assert len(med.candidates) > 0
        assert med.candidates[0].source == fixture_provider.name


# ---------------------------------------------------------------------------
# Test 12: Router safety - ABDM never silently falls back to demo_dataset
# ---------------------------------------------------------------------------
def test_router_abdm_never_falls_back_to_demo_dataset():
    provider = get_medicine_provider("abdm")
    assert isinstance(provider, ABDMDrugRegistryProvider)
    assert not isinstance(provider, DemoIndianMedicineDatasetProvider)


# ---------------------------------------------------------------------------
# Test 13: Discontinued medication flag is preserved in candidate
# ---------------------------------------------------------------------------
def test_discontinued_flag_preserved(fixture_provider):
    result = normalize_medicine(
        "Discontinex 100mg Tablet",
        provider=fixture_provider,
    )

    assert len(result.candidates) > 0
    top = result.candidates[0]
    assert top.is_discontinued is True


# ---------------------------------------------------------------------------
# Test 14: Composition search integration through matcher
# ---------------------------------------------------------------------------
def test_composition_search_integration(fixture_provider):
    candidates, _ = generate_candidates("Amoxycillin", provider=fixture_provider)

    assert len(candidates) > 0
    # Should match Augmentin or Amoxicillin because compositions include Amoxycillin
    matched_names = [c.name for c in candidates]
    assert any("Augmentin" in name or "Amoxicillin" in name for name in matched_names)


# ---------------------------------------------------------------------------
# Test 15: PipelineConfig respects explicitly injected demo provider
# ---------------------------------------------------------------------------
def test_pipeline_config_explicit_provider(fixture_provider):
    config = PipelineConfig(
        ocr_router=None,
        extraction_client=None,
        medicine_provider=fixture_provider,
    )
    assert config.medicine_provider is fixture_provider
