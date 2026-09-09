"""
Configurable thresholds + confidence-level calculation for medicine
matching. Per the spec: DO NOT invent arbitrary thresholds and treat them
as tuned. These are explicit placeholders — replace with values derived
from document_ai/benchmark/ once you have real labeled samples, the same
way ocr/router.py's DEFAULT_FALLBACK_CONFIDENCE_THRESHOLD is flagged.
"""

from __future__ import annotations

from dataclasses import dataclass

from .schemas import ConfidenceLevel


@dataclass(frozen=True)
class MedicineMatchThresholds:
    # PLACEHOLDER values — not benchmark-derived. See module docstring.
    normalize_min_score: float = 0.85   # >= this: safe to set vocabulary_normalized
    review_min_score: float = 0.55      # >= this (but below normalize): candidate kept, verification required
    # below review_min_score: no usable candidate at all

    high_confidence_min: float = 0.90
    medium_confidence_min: float = 0.70
    low_confidence_min: float = 0.55
    # below low_confidence_min: UNKNOWN


DEFAULT_THRESHOLDS = MedicineMatchThresholds()


def confidence_level_for_score(score: float | None, thresholds: MedicineMatchThresholds = DEFAULT_THRESHOLDS) -> ConfidenceLevel:
    if score is None:
        return ConfidenceLevel.UNKNOWN
    if score >= thresholds.high_confidence_min:
        return ConfidenceLevel.HIGH
    if score >= thresholds.medium_confidence_min:
        return ConfidenceLevel.MEDIUM
    if score >= thresholds.low_confidence_min:
        return ConfidenceLevel.LOW
    return ConfidenceLevel.UNKNOWN
