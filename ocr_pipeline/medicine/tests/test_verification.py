"""Tests for packet-based medicine verification.

Uses the same FakeVocabProvider / in-memory testing patterns as
test_medicine.py. No external API calls.
"""

import pytest
from difflib import SequenceMatcher
from pathlib import Path

from document_ai.medicine.schemas import (
    ConfidenceLevel,
    MatchCandidate,
    NormalizedMedicine,
    PacketVerification,
    PacketVerificationStatus,
)
from document_ai.medicine.verification import (
    apply_verification,
    compare_evidence,
    extract_packet_text,
    resolve_needs_verification,
)


# ----- extract_packet_text -----


def test_extract_packet_text_strips_noise():
    text = """Paracetamol 500mg
MFG: 01/2025
EXP: 01/2027
123456789012
LOT: AB1234
MRP: Rs. 50.00
01/2025
AB"""
    result = extract_packet_text(text)
    assert "Paracetamol 500mg" in result
    # Noise lines should be filtered
    assert not any("MFG" in line for line in result)
    assert not any("EXP" in line for line in result)
    assert not any("LOT" in line for line in result)
    assert not any("MRP" in line for line in result)
    assert "123456789012" not in result
    assert "AB" not in result  # too short


def test_extract_packet_text_keeps_medicine_names():
    text = """Ranitidine Hydrochloride
Tablets IP 150mg
For Oral Use Only"""
    result = extract_packet_text(text)
    assert "Ranitidine Hydrochloride" in result
    assert "Tablets IP 150mg" in result
    assert "For Oral Use Only" in result


def test_extract_packet_text_empty_input():
    assert extract_packet_text("") == []
    assert extract_packet_text("   ") == []
    assert extract_packet_text(None) == []


# ----- compare_evidence -----


def test_compare_evidence_agree_by_code():
    medicine = NormalizedMedicine(
        raw_name="Paracetamol",
        vocabulary_normalized="Paracetamol",
        vocabulary_code="RX1",
    )
    packet = PacketVerification(
        status=PacketVerificationStatus.PATIENT_VERIFICATION_REQUIRED,
        packet_candidates=[
            MatchCandidate(name="Paracetamol 500mg", source="RxNorm", code="RX1", score=0.9),
        ],
    )
    result = compare_evidence(medicine, packet)
    assert result.status == PacketVerificationStatus.PATIENT_VERIFIED
    assert result.verified_name == "Paracetamol 500mg"


def test_compare_evidence_agree_by_name_case_insensitive():
    medicine = NormalizedMedicine(
        raw_name="paracetamol",
        vocabulary_normalized="Paracetamol",
    )
    packet = PacketVerification(
        status=PacketVerificationStatus.PATIENT_VERIFICATION_REQUIRED,
        packet_candidates=[
            MatchCandidate(name="paracetamol", source="RxNorm", score=0.95),
        ],
    )
    result = compare_evidence(medicine, packet)
    assert result.status == PacketVerificationStatus.PATIENT_VERIFIED


def test_compare_evidence_disagree():
    medicine = NormalizedMedicine(
        raw_name="Paracetamol",
        vocabulary_normalized="Paracetamol",
        vocabulary_code="RX1",
    )
    packet = PacketVerification(
        status=PacketVerificationStatus.PATIENT_VERIFICATION_REQUIRED,
        packet_candidates=[
            MatchCandidate(name="Ibuprofen", source="RxNorm", code="RX4", score=0.9),
        ],
    )
    result = compare_evidence(medicine, packet)
    assert result.status == PacketVerificationStatus.CONFLICT
    assert result.reason == "prescription_packet_mismatch"


def test_compare_evidence_no_packet_candidates():
    medicine = NormalizedMedicine(
        raw_name="Paracetamol",
        vocabulary_normalized="Paracetamol",
    )
    packet = PacketVerification(
        status=PacketVerificationStatus.PATIENT_VERIFICATION_REQUIRED,
        packet_candidates=[],
    )
    result = compare_evidence(medicine, packet)
    assert result.status == PacketVerificationStatus.UNKNOWN
    assert result.reason == "no_packet_candidates"


def test_compare_evidence_no_prescription_evidence():
    medicine = NormalizedMedicine(raw_name="unknown")
    packet = PacketVerification(
        status=PacketVerificationStatus.PATIENT_VERIFICATION_REQUIRED,
        packet_candidates=[
            MatchCandidate(name="Paracetamol", source="RxNorm", score=0.9),
        ],
    )
    result = compare_evidence(medicine, packet)
    assert result.status == PacketVerificationStatus.UNKNOWN
    assert result.reason == "no_prescription_evidence"


# ----- resolve_needs_verification -----


@pytest.mark.parametrize(
    "status,verified_name,expected",
    [
        (PacketVerificationStatus.UNREQUESTED, None, True),  # unchanged from medicine default
        (PacketVerificationStatus.PATIENT_VERIFICATION_REQUIRED, None, True),
        (PacketVerificationStatus.PATIENT_VERIFIED, "Paracetamol", False),
        (PacketVerificationStatus.PATIENT_VERIFIED, None, True),  # verified without name — stay safe
        (PacketVerificationStatus.CONFLICT, None, True),
        (PacketVerificationStatus.PROVIDER_UNAVAILABLE, None, True),
        (PacketVerificationStatus.UNKNOWN, None, True),
    ],
)
def test_resolve_needs_verification_table(status, verified_name, expected):
    medicine = NormalizedMedicine(
        raw_name="test",
        needs_verification=True,
        packet_verification=PacketVerification(
            status=status,
            verified_name=verified_name,
        ),
    )
    assert resolve_needs_verification(medicine) == expected


def test_resolve_needs_verification_none_packet_unchanged():
    medicine = NormalizedMedicine(raw_name="test", needs_verification=False)
    assert resolve_needs_verification(medicine) is False

    medicine2 = NormalizedMedicine(raw_name="test", needs_verification=True)
    assert resolve_needs_verification(medicine2) is True


# ----- apply_verification -----


def test_apply_verification_updates_vocabulary_on_verified():
    medicine = NormalizedMedicine(
        raw_name="Parcetmol",  # OCR typo
        vocabulary_normalized=None,
        needs_verification=True,
    )
    packet = PacketVerification(
        status=PacketVerificationStatus.PATIENT_VERIFIED,
        verified_name="Paracetamol",
        packet_candidates=[
            MatchCandidate(name="Paracetamol", source="RxNorm", code="RX1", score=0.95),
        ],
    )
    result = apply_verification(medicine, packet)
    assert result.vocabulary_normalized == "Paracetamol"
    assert result.vocabulary_code == "RX1"
    assert result.needs_verification is False


def test_apply_verification_preserves_raw_name():
    medicine = NormalizedMedicine(
        raw_name="Parcetmol",
        needs_verification=True,
    )
    packet = PacketVerification(
        status=PacketVerificationStatus.PATIENT_VERIFIED,
        verified_name="Paracetamol",
        packet_candidates=[
            MatchCandidate(name="Paracetamol", source="RxNorm", code="RX1", score=0.95),
        ],
    )
    result = apply_verification(medicine, packet)
    assert result.raw_name == "Parcetmol"  # NEVER mutated


def test_apply_verification_conflict_keeps_needs_verification_true():
    medicine = NormalizedMedicine(
        raw_name="Paracetamol",
        vocabulary_normalized="Paracetamol",
        needs_verification=False,
    )
    packet = PacketVerification(
        status=PacketVerificationStatus.CONFLICT,
        reason="prescription_packet_mismatch",
    )
    result = apply_verification(medicine, packet)
    assert result.needs_verification is True
    assert result.packet_verification.status == PacketVerificationStatus.CONFLICT


def test_apply_verification_provider_unavailable():
    medicine = NormalizedMedicine(raw_name="test", needs_verification=True)
    packet = PacketVerification(
        status=PacketVerificationStatus.PROVIDER_UNAVAILABLE,
        reason="medicine_provider_unavailable",
    )
    result = apply_verification(medicine, packet)
    assert result.needs_verification is True
