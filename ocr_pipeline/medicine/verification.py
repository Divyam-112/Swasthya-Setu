"""
Packet-based medicine verification: processes a medicine packet/strip/box
photo and compares its evidence against a prescription medicine's existing
normalization.

This module reuses existing infrastructure:
- OCR: same providers and router used for prescriptions
- Matching: same generate_candidates() and min(provider, local_similarity) scoring
- IndianMedicine: same vocabulary provider

It does NOT reuse:
- detect_document_type() — packets are not prescriptions/labs/discharge summaries
- Structured extraction — packets don't have prescription-shaped fields

Packet preprocessing strategy:
- Try existing image preprocessing first
- OCR the preprocessed image
- If OCR confidence is poor, fall back to OCR on the raw image
- Use whichever result has better quality
"""

from __future__ import annotations

import re
import tempfile
from pathlib import Path
from typing import Optional

from document_ai.ingestion.file_validator import validate_file
from document_ai.medicine.matcher import generate_candidates
from document_ai.medicine.schemas import (
    MatchCandidate,
    NormalizedMedicine,
    PacketVerification,
    PacketVerificationStatus,
)
from document_ai.observability.logging import get_logger

logger = get_logger(__name__)

# Noise patterns common on medicine packaging — batch numbers, expiry, barcodes
_NOISE_PATTERNS = re.compile(
    r"^(?:"
    r"\d{6,}"           # long numeric runs (batch numbers, barcodes)
    r"|[A-Z]{0,3}\d{4,}"  # short prefix + long number (LOT codes)
    r"|MFG\.?\s*:?.*"
    r"|EXP\.?\s*:?.*"
    r"|LOT\.?\s*:?.*"
    r"|BATCH\.?\s*:?.*"
    r"|B\.?\s*NO\.?\s*:?.*"
    r"|MRP\.?\s*:?.*"
    r"|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}"  # dates
    r")$",
    re.IGNORECASE,
)

_MIN_CANDIDATE_LINE_LENGTH = 3


def extract_packet_text(ocr_text: str) -> list[str]:
    """Extract candidate medicine name lines from raw OCR text of a packet.

    Strips obvious noise (batch numbers, dates, barcodes, short fragments)
    and returns remaining lines as potential medicine name candidates.
    """
    if not ocr_text or not ocr_text.strip():
        return []

    lines: list[str] = []
    for raw_line in ocr_text.splitlines():
        line = raw_line.strip()
        if len(line) < _MIN_CANDIDATE_LINE_LENGTH:
            continue
        if _NOISE_PATTERNS.match(line):
            continue
        lines.append(line)

    return lines


def _try_preprocess_and_ocr(file_path: Path, ocr_router, document_id: str):
    """Try preprocessing then OCR. Returns (ocr_result, used_preprocessing).

    If preprocessing fails or produces worse results, falls back to raw OCR.
    """
    from document_ai.ocr.schemas import OCRStatus

    # First: try with preprocessing
    preprocessed_result = None
    try:
        from document_ai.preprocessing.image_preprocessor import preprocess_image
        with tempfile.TemporaryDirectory() as tmp_dir:
            preprocessed_path = Path(tmp_dir) / f"preprocessed_{file_path.name}"
            preprocess_image(file_path, preprocessed_path)
            preprocessed_result = ocr_router.transcribe(preprocessed_path, document_id=document_id)
    except Exception as e:
        logger.warning("packet_preprocessing_failed", extra={"error": str(e)})

    # Second: OCR on raw image
    raw_result = None
    try:
        raw_result = ocr_router.transcribe(file_path, document_id=document_id)
    except Exception as e:
        logger.warning("packet_raw_ocr_failed", extra={"error": str(e)})

    # Pick the better result
    if preprocessed_result and raw_result:
        pre_conf = preprocessed_result.average_confidence()
        raw_conf = raw_result.average_confidence()
        pre_text = preprocessed_result.full_text().strip()
        raw_text = raw_result.full_text().strip()

        # Prefer preprocessed if it has acceptable confidence and text
        if (preprocessed_result.ocr_status != OCRStatus.FAILED
                and pre_text
                and (pre_conf is None or raw_conf is None or pre_conf >= raw_conf)):
            return preprocessed_result, True
        return raw_result, False

    if preprocessed_result and preprocessed_result.ocr_status != OCRStatus.FAILED:
        return preprocessed_result, True
    if raw_result:
        return raw_result, False

    return None, False


def process_packet_image(
    file_path: Path,
    ocr_router,
    medicine_provider,
) -> PacketVerification:
    """Process a packet/strip/box photo and return verification evidence.

    Pipeline:
    1. Validate file
    2. Preprocessing with fallback to raw OCR
    3. Extract candidate medicine name lines from OCR text
    4. Run each candidate through existing generate_candidates()
    5. Return PacketVerification with results

    This does NOT run document type detection or structured extraction —
    packets are not prescriptions.
    """
    # Validate file
    validation = validate_file(file_path)
    if not validation.valid:
        return PacketVerification(
            status=PacketVerificationStatus.UNKNOWN,
            reason=f"file_rejected:{validation.reason}",
        )

    # OCR with preprocessing fallback
    if ocr_router is None:
        return PacketVerification(
            status=PacketVerificationStatus.PROVIDER_UNAVAILABLE,
            reason="no_ocr_router_configured",
        )

    ocr_result, used_preprocessing = _try_preprocess_and_ocr(
        file_path, ocr_router, document_id="packet"
    )

    if ocr_result is None or not ocr_result.full_text().strip():
        return PacketVerification(
            status=PacketVerificationStatus.UNKNOWN,
            packet_ocr_text="",
            reason="ocr_produced_no_text",
        )

    packet_text = ocr_result.full_text()

    # Extract candidate lines
    candidate_lines = extract_packet_text(packet_text)
    if not candidate_lines:
        return PacketVerification(
            status=PacketVerificationStatus.UNKNOWN,
            packet_ocr_text=packet_text,
            reason="no_usable_text_from_packet",
        )

    # Generate candidates using existing matcher
    if medicine_provider is None:
        return PacketVerification(
            status=PacketVerificationStatus.PROVIDER_UNAVAILABLE,
            packet_ocr_text=packet_text,
            reason="no_medicine_provider_configured",
        )

    all_candidates: list[MatchCandidate] = []
    provider_unavailable = False

    for line in candidate_lines:
        candidates, unavailable = generate_candidates(line, medicine_provider)
        if unavailable:
            provider_unavailable = True
            break
        all_candidates.extend(candidates)

    if provider_unavailable:
        return PacketVerification(
            status=PacketVerificationStatus.PROVIDER_UNAVAILABLE,
            packet_ocr_text=packet_text,
            reason="medicine_provider_unavailable",
        )

    # Sort all candidates by score, best first
    all_candidates.sort(key=lambda c: c.score, reverse=True)

    if not all_candidates:
        return PacketVerification(
            status=PacketVerificationStatus.UNKNOWN,
            packet_ocr_text=packet_text,
            packet_candidates=all_candidates,
            reason="no_candidates_from_packet",
        )

    return PacketVerification(
        status=PacketVerificationStatus.PATIENT_VERIFICATION_REQUIRED,
        packet_ocr_text=packet_text,
        packet_candidates=all_candidates,
    )


def compare_evidence(
    prescription_medicine: NormalizedMedicine,
    packet_verification: PacketVerification,
) -> PacketVerification:
    """Compare prescription evidence against packet evidence.

    Agreement is checked on vocabulary code (Vocabulary Code) where available,
    falling back to case-insensitive name match. Raw OCR text is NOT
    compared — 'Rantidine' vs 'Ranitidine' should agree once both
    normalize to the same vocabulary concept.

    Returns an updated PacketVerification with resolution status.
    """
    if not packet_verification.packet_candidates:
        return PacketVerification(
            status=PacketVerificationStatus.UNKNOWN,
            packet_ocr_text=packet_verification.packet_ocr_text,
            packet_candidates=packet_verification.packet_candidates,
            reason="no_packet_candidates",
        )

    # Prescription evidence: vocabulary_normalized + vocabulary_code, or best candidate
    rx_name = prescription_medicine.vocabulary_normalized
    rx_code = prescription_medicine.vocabulary_code
    if rx_name is None and prescription_medicine.candidates:
        best_rx = prescription_medicine.candidates[0]
        rx_name = best_rx.name
        rx_code = best_rx.code

    if rx_name is None:
        return PacketVerification(
            status=PacketVerificationStatus.UNKNOWN,
            packet_ocr_text=packet_verification.packet_ocr_text,
            packet_candidates=packet_verification.packet_candidates,
            reason="no_prescription_evidence",
        )

    # Packet evidence: best candidate
    best_packet = packet_verification.packet_candidates[0]
    pkt_name = best_packet.name
    pkt_code = best_packet.code

    # Compare by code first (more reliable), then by name
    agree = False
    if rx_code and pkt_code:
        agree = rx_code == pkt_code
    elif rx_name and pkt_name:
        agree = rx_name.lower() == pkt_name.lower()

    if agree:
        return PacketVerification(
            status=PacketVerificationStatus.PATIENT_VERIFIED,
            packet_ocr_text=packet_verification.packet_ocr_text,
            packet_candidates=packet_verification.packet_candidates,
            verified_name=pkt_name,  # The agreed-upon name
        )
    else:
        return PacketVerification(
            status=PacketVerificationStatus.CONFLICT,
            packet_ocr_text=packet_verification.packet_ocr_text,
            packet_candidates=packet_verification.packet_candidates,
            reason="prescription_packet_mismatch",
        )


def resolve_needs_verification(medicine: NormalizedMedicine) -> bool:
    """Determine needs_verification based on packet_verification status.

    Maps PacketVerificationStatus to needs_verification boolean per the
    architecture decision table:

    | Status                          | needs_verification |
    |---------------------------------|--------------------|
    | None / UNREQUESTED              | unchanged          |
    | PATIENT_VERIFICATION_REQUIRED   | True               |
    | PATIENT_VERIFIED                | False (if verified)|
    | CONFLICT                        | True               |
    | PROVIDER_UNAVAILABLE            | True               |
    | UNKNOWN                         | True               |
    """
    pv = medicine.packet_verification
    if pv is None or pv.status == PacketVerificationStatus.UNREQUESTED:
        return medicine.needs_verification

    if pv.status == PacketVerificationStatus.PATIENT_VERIFIED:
        if pv.verified_name:
            return False
        return True  # verified status without a name — shouldn't happen, stay safe

    # PATIENT_VERIFICATION_REQUIRED, CONFLICT, PROVIDER_UNAVAILABLE, UNKNOWN
    return True


def apply_verification(
    medicine: NormalizedMedicine,
    packet_verification: PacketVerification,
) -> NormalizedMedicine:
    """Apply packet verification result to a medicine, updating the canonical record.

    This is the Decision 7 canonical update: verification never creates a
    second medicine. Only packet_verification, and conditionally
    vocabulary_normalized / needs_verification, are updated. raw_name and
    all original prescription evidence are preserved.
    """
    medicine.packet_verification = packet_verification

    if packet_verification.status == PacketVerificationStatus.PATIENT_VERIFIED:
        if packet_verification.verified_name:
            medicine.vocabulary_normalized = packet_verification.verified_name
            # Update source/code from best packet candidate if available
            if packet_verification.packet_candidates:
                best = packet_verification.packet_candidates[0]
                medicine.vocabulary_source = best.source
                medicine.vocabulary_code = best.code

    medicine.needs_verification = resolve_needs_verification(medicine)
    return medicine
