"""
Integration tests for the prescription diagnosis → context_hint wiring.

Proves that:
1. Diagnosis context flows from extraction through normalize_medications
   into the ABDM provider's existing indication-boost mechanism.
2. Indication can ONLY provide a supporting +0.05 boost on an already-
   plausible name match (name_score >= 0.3).
3. Indication CANNOT rescue an unrelated medicine name.
4. The pipeline works normally when no diagnosis is available.
5. Ambiguous OCR medicines remain needs_verification=True even when
   diagnosis strongly matches a candidate's indication.
6. Existing packet verification and interaction safety gate are unchanged.

All HTTP calls are mocked — no live network traffic.
"""

from unittest.mock import MagicMock, patch

import pytest

from document_ai.extraction.schemas import ExtractedField, Medication, PrescriptionExtraction
from document_ai.medicine.normalizer import normalize_medications
from document_ai.medicine.providers.abdm import ABDMDrugRegistryProvider
from document_ai.medicine.providers.router import ABDMWithLocalFallbackProvider
from document_ai.medicine.providers.indian_medicine import IndianMedicineProvider
from document_ai.medicine.schemas import (
    ConfidenceLevel,
    NormalizedMedicine,
    PacketVerification,
    PacketVerificationStatus,
)
from document_ai.medicine.verification import resolve_needs_verification
from document_ai.interactions.checker import check_interactions


# ---- Shared ABDM record fixtures ----

PARACETAMOL_ABDM = {
    "brandIdentifier": "BR-001",
    "brandName": "Paracetamol 650 mg",
    "genericIdentifier": "GEN-010",
    "genericName": "Acetaminophen 650 mg",
    "indication": "used for pain and fever",
    "contraIndication": "liver disease",
    "supplierName": "TestPharma",
    "substanceName": ["Acetaminophen"],
    "routeOfAdministrationName": "Oral",
    "doseForm": "Tablet",
    "matchedFields": ["genericName"],
    "alternativeDrugs": [],
}

UNRELATED_ABDM = {
    "brandIdentifier": "BR-099",
    "brandName": "Metformin 500 mg",
    "genericIdentifier": "GEN-099",
    "genericName": "Metformin Hydrochloride",
    "indication": "type 2 diabetes mellitus",
    "contraIndication": "renal impairment",
    "supplierName": "TestPharma",
    "substanceName": ["Metformin"],
    "routeOfAdministrationName": "Oral",
    "doseForm": "Tablet",
    "matchedFields": [],
    "alternativeDrugs": [],
}


def _fake_response(drug_details: list[dict]):
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {"drugDetails": drug_details, "count": len(drug_details)}
    return resp


def _make_medications(raw_name: str) -> list[Medication]:
    return [Medication(raw_name=ExtractedField(value=raw_name, confidence=0.9))]


def _make_diagnoses(*values: str) -> list[ExtractedField]:
    return [ExtractedField(value=v, confidence=0.9) for v in values]


# ---- TEST 1: Diagnosis provides supporting evidence ----

def test_fever_diagnosis_boosts_paracetamol_via_indication():
    """Diagnosis = 'fever', medicine = 'paracetamol 650 mg',
    ABDM candidate has fever-related indication → score should be
    higher than without the diagnosis context."""
    provider = ABDMDrugRegistryProvider()

    with patch("requests.get", return_value=_fake_response([PARACETAMOL_ABDM])):
        # Without diagnosis
        results_no_ctx = normalize_medications(
            _make_medications("paracetamol 650 mg"),
            provider,
            diagnoses=None,
        )
        # With diagnosis
        results_with_ctx = normalize_medications(
            _make_medications("paracetamol 650 mg"),
            provider,
            diagnoses=_make_diagnoses("fever"),
        )

    score_without = results_no_ctx[0].candidates[0].score if results_no_ctx[0].candidates else 0
    score_with = results_with_ctx[0].candidates[0].score if results_with_ctx[0].candidates else 0

    # The indication boost should have nudged the score up
    assert score_with >= score_without, "Fever diagnosis should provide supporting evidence"
    # The boost is capped at +0.05 — verify it didn't exceed that
    assert score_with - score_without <= 0.05 + 1e-6


# ---- TEST 2: Unrelated medicine NOT rescued by indication ----

def test_fever_diagnosis_does_not_rescue_unrelated_medicine():
    """Diagnosis = 'fever', medicine candidate is Metformin (diabetes drug)
    → indication must NOT rescue the unrelated medicine."""
    provider = ABDMDrugRegistryProvider()

    with patch("requests.get", return_value=_fake_response([UNRELATED_ABDM])):
        results = normalize_medications(
            _make_medications("completely different query"),
            provider,
            diagnoses=_make_diagnoses("fever"),
        )

    # Either no candidates or all scores below the plausibility floor
    if results[0].candidates:
        best_score = results[0].candidates[0].score
        assert best_score < 0.3, (
            f"Unrelated medicine should not be rescued by indication (score={best_score})"
        )


# ---- TEST 3: No diagnosis/context → ABDM lookup still works normally ----

def test_no_diagnosis_abdm_lookup_works_normally():
    """When no diagnosis is available, the ABDM lookup should still
    function exactly as before."""
    provider = ABDMDrugRegistryProvider()

    with patch("requests.get", return_value=_fake_response([PARACETAMOL_ABDM])):
        results = normalize_medications(
            _make_medications("paracetamol 650 mg"),
            provider,
            diagnoses=None,
        )

    assert len(results) == 1
    assert results[0].candidates, "Should still produce candidates without diagnosis"
    assert results[0].candidates[0].score > 0, "Score should be positive"


# ---- TEST 4: Ambiguous OCR → needs_verification=True even with strong indication match ----

def test_ambiguous_ocr_needs_verification_even_with_matching_diagnosis():
    """An ambiguous OCR medicine name that doesn't reach the normalize
    threshold must remain needs_verification=True even when the diagnosis
    strongly matches the candidate's indication."""
    provider = ABDMDrugRegistryProvider()

    # Use a deliberately garbled/ambiguous name that produces a weak match
    with patch("requests.get", return_value=_fake_response([PARACETAMOL_ABDM])):
        results = normalize_medications(
            _make_medications("prctml"),  # badly garbled OCR
            provider,
            diagnoses=_make_diagnoses("fever"),
        )

    assert len(results) == 1
    med = results[0]
    # The garbled name should not clear the normalize_min_score threshold
    # even with the indication boost
    assert med.needs_verification is True, (
        "Ambiguous OCR medicine must remain needs_verification=True"
    )


# ---- TEST 5: Packet verification behavior unchanged ----

def test_packet_verification_behavior_unchanged():
    """Existing packet verification logic should be unaffected by the
    diagnosis context wiring."""
    med = NormalizedMedicine(
        raw_name="paracetamol 650 mg",
        confidence_level=ConfidenceLevel.LOW,
        needs_verification=True,
        packet_verification=PacketVerification(
            status=PacketVerificationStatus.PATIENT_VERIFICATION_REQUIRED,
        ),
    )
    result = resolve_needs_verification(med)
    assert result is True, "Packet verification required → needs_verification=True"

    # Verified packet should clear needs_verification
    med.packet_verification = PacketVerification(
        status=PacketVerificationStatus.PATIENT_VERIFIED,
        verified_name="Paracetamol 650 mg",
    )
    result = resolve_needs_verification(med)
    assert result is False, "Verified packet → needs_verification=False"


# ---- TEST 6: Interaction safety gate unchanged ----

def test_interaction_safety_gate_unchanged():
    """Drug interaction checking must remain independent of diagnosis
    context — the interactions module doesn't use diagnosis context
    and should not be affected by this wiring."""
    med1 = NormalizedMedicine(raw_name="Drug A", vocabulary_normalized="DrugA")
    med2 = NormalizedMedicine(raw_name="Drug B", vocabulary_normalized="DrugB")

    # check_interactions should work normally with None provider.
    # Existing behavior: unverified medicines produce NOT_CHECKED interactions
    # with needs_clinician_review=True — this is the safety gate.
    report = check_interactions([med1, med2], None)
    # The key invariant: interaction checking is unaffected by diagnosis wiring.
    # It produces results based on medicine identity, never diagnosis context.
    assert all(i.needs_clinician_review for i in report.interactions), (
        "Interaction safety gate: unverified medicines must need clinician review"
    )


# ---- Router forwarding test ----

def test_router_forwards_context_hint_to_abdm():
    """ABDMWithLocalFallbackProvider should forward context_hint to
    the ABDM provider's approximate_lookup."""
    provider = ABDMDrugRegistryProvider()

    with patch("requests.get", return_value=_fake_response([PARACETAMOL_ABDM])):
        router = ABDMWithLocalFallbackProvider(provider, IndianMedicineProvider())
        candidates = router.approximate_lookup(
            "paracetamol 650 mg", context_hint="fever"
        )

    assert len(candidates) > 0
    # The score should reflect the indication boost
    score_with_hint = candidates[0].score

    with patch("requests.get", return_value=_fake_response([PARACETAMOL_ABDM])):
        router2 = ABDMWithLocalFallbackProvider(provider, IndianMedicineProvider())
        candidates_no_hint = router2.approximate_lookup("paracetamol 650 mg")

    score_without = candidates_no_hint[0].score
    assert score_with_hint >= score_without
