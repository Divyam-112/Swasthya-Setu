"""
Confidence-level calculation from raw evidence signals.

IMPORTANT: none of the "confidence" scores flowing into this layer (OCR
confidence, extraction-model confidence, medicine match score) are
mathematically calibrated probabilities. An LLM or OCR engine reporting
"0.92" does not mean "92% likely correct" in any rigorous sense. This
module only uses those numbers to produce a coarse, conservative bucket
(HIGH/MEDIUM/LOW/UNKNOWN) for triage purposes — deciding what a human
should look at first — never as a claim of statistical accuracy.

Thresholds are configurable and are explicit placeholders, same caveat as
medicine/confidence.py and ocr/router.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .schemas import ConfidenceLevel, VerificationReason


@dataclass(frozen=True)
class ValidationThresholds:
    # PLACEHOLDER values — not benchmark-derived.
    high_min: float = 0.85
    medium_min: float = 0.65
    low_min: float = 0.40
    # below low_min (or no signal at all) -> UNKNOWN


DEFAULT_VALIDATION_THRESHOLDS = ValidationThresholds()


@dataclass
class EvidenceSignals:
    """The raw signals available for one field, gathered by the caller from
    whichever upstream layers apply (not every field has every signal)."""

    ocr_confidence: Optional[float] = None
    extraction_confidence: Optional[float] = None
    medicine_match_confidence: Optional[float] = None
    has_source_text: Optional[bool] = None
    is_missing: bool = False
    agreement: Optional[bool] = None  # VLM vs vocabulary, or any other cross-check
    malformed: bool = False


def evaluate(signals: EvidenceSignals, thresholds: ValidationThresholds = DEFAULT_VALIDATION_THRESHOLDS
             ) -> tuple[ConfidenceLevel, list[VerificationReason]]:
    reasons: list[VerificationReason] = []

    if signals.malformed:
        reasons.append(VerificationReason.MALFORMED_FIELD)
        return ConfidenceLevel.UNKNOWN, reasons

    if signals.is_missing:
        reasons.append(VerificationReason.MISSING_VALUE)
        return ConfidenceLevel.UNKNOWN, reasons

    if signals.has_source_text is False:
        reasons.append(VerificationReason.NO_SOURCE_TEXT)

    if signals.agreement is False:
        reasons.append(VerificationReason.VLM_VOCABULARY_DISAGREEMENT)

    # Combine whichever numeric confidence signals are actually present.
    # Conservative combination: take the MINIMUM of available signals — a
    # field is only as trustworthy as its weakest link (bad OCR still
    # taints a confident extraction reading garbled text).
    numeric_signals = [
        s for s in (signals.ocr_confidence, signals.extraction_confidence, signals.medicine_match_confidence)
        if s is not None
    ]

    if signals.ocr_confidence is not None and signals.ocr_confidence < thresholds.low_min:
        reasons.append(VerificationReason.LOW_OCR_CONFIDENCE)
    if signals.extraction_confidence is not None and signals.extraction_confidence < thresholds.low_min:
        reasons.append(VerificationReason.LOW_EXTRACTION_CONFIDENCE)

    if not numeric_signals:
        level = ConfidenceLevel.UNKNOWN
    else:
        combined = min(numeric_signals)
        if combined >= thresholds.high_min:
            level = ConfidenceLevel.HIGH
        elif combined >= thresholds.medium_min:
            level = ConfidenceLevel.MEDIUM
        elif combined >= thresholds.low_min:
            level = ConfidenceLevel.LOW
        else:
            level = ConfidenceLevel.UNKNOWN

    if reasons and level == ConfidenceLevel.HIGH:
        # A disagreement or missing-source-text flag downgrades HIGH to
        # MEDIUM even if the raw numbers were strong — those are structural
        # problems, not just low scores.
        level = ConfidenceLevel.MEDIUM

    return level, reasons
