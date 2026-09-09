"""
Walks the outputs of Steps 3 (extraction) and 4 (medicine normalization)
and collects every uncertain item into a single, consistent
list[VerificationItem] — so downstream (Step 9's final JSON) has one place
to look instead of re-deriving uncertainty from each layer's own shape.
"""

from __future__ import annotations

from pydantic import BaseModel

from document_ai.extraction.schemas import ExtractedField
from document_ai.medicine.schemas import ConfidenceLevel as MedConfidenceLevel
from document_ai.medicine.schemas import NormalizedMedicine

from .schemas import ConfidenceLevel, VerificationItem, VerificationReason

_MED_LEVEL_MAP = {
    MedConfidenceLevel.HIGH: ConfidenceLevel.HIGH,
    MedConfidenceLevel.MEDIUM: ConfidenceLevel.MEDIUM,
    MedConfidenceLevel.LOW: ConfidenceLevel.LOW,
    MedConfidenceLevel.UNKNOWN: ConfidenceLevel.UNKNOWN,
}

_MED_REASON_MAP = {
    "no_candidate": VerificationReason.MEDICINE_NO_MATCH,
    "provider_unavailable": VerificationReason.MEDICINE_PROVIDER_UNAVAILABLE,
    "vlm_vocabulary_disagreement": VerificationReason.VLM_VOCABULARY_DISAGREEMENT,
    "weak_match_requires_review": VerificationReason.AMBIGUOUS_MEDICINE_MATCH,
    "empty_or_unreadable_name": VerificationReason.MISSING_VALUE,
}


def find_uncertain_extracted_fields(model: BaseModel, prefix: str = "") -> list[VerificationItem]:
    """Mirrors extraction/common.py's find_uncertain_fields but returns
    VerificationItem objects (with reasons + source_text) instead of bare
    dotted-path strings."""
    items: list[VerificationItem] = []

    def walk(obj, path: str):
        if isinstance(obj, ExtractedField):
            if obj.value is None or obj.needs_verification:
                reasons = []
                if obj.value is None:
                    reasons.append(VerificationReason.MISSING_VALUE)
                if obj.source_text is None:
                    reasons.append(VerificationReason.NO_SOURCE_TEXT)
                level = ConfidenceLevel.HIGH if (obj.confidence or 0) >= 0.85 and not reasons else ConfidenceLevel.UNKNOWN
                if obj.confidence is None and obj.value is not None and not obj.needs_verification:
                    level = ConfidenceLevel.UNKNOWN  # no confidence signal reported at all
                items.append(VerificationItem(
                    field_path=path,
                    confidence_level=level,
                    reasons=reasons or [VerificationReason.LOW_EXTRACTION_CONFIDENCE],
                    source_text=obj.source_text,
                ))
        elif isinstance(obj, BaseModel):
            for field_name in obj.__class__.model_fields:
                if field_name == "uncertain_fields":
                    continue
                child_path = f"{path}.{field_name}" if path else field_name
                walk(getattr(obj, field_name), child_path)
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                walk(item, f"{path}.{i}")

    walk(model, prefix)
    return items


def find_uncertain_medicines(medicines: list[NormalizedMedicine], prefix: str = "medications") -> list[VerificationItem]:
    items: list[VerificationItem] = []
    for i, med in enumerate(medicines):
        if not med.needs_verification:
            continue
        reasons = [_MED_REASON_MAP.get(r, VerificationReason.MALFORMED_FIELD) for r in med.reasons]
        if not reasons:
            reasons = [VerificationReason.AMBIGUOUS_MEDICINE_MATCH]
        items.append(VerificationItem(
            field_path=f"{prefix}.{i}.vocabulary_normalized",
            confidence_level=_MED_LEVEL_MAP.get(med.confidence_level, ConfidenceLevel.UNKNOWN),
            reasons=reasons,
            source_text=med.raw_name,
        ))
    return items
