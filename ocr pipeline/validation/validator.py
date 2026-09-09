from __future__ import annotations

from pydantic import BaseModel

from document_ai.medicine.schemas import NormalizedMedicine

from .schemas import ConfidenceLevel, DocumentValidationReport, VerificationItem
from .uncertainty import find_uncertain_extracted_fields, find_uncertain_medicines

_LEVEL_RANK = {ConfidenceLevel.UNKNOWN: 0, ConfidenceLevel.LOW: 1, ConfidenceLevel.MEDIUM: 2, ConfidenceLevel.HIGH: 3}


def validate_document(
    extraction_model: BaseModel,
    document_type: str,
    normalized_medicines: list[NormalizedMedicine] | None = None,
) -> DocumentValidationReport:
    """Combines Step 3 extraction uncertainty with Step 4 medicine-matching
    uncertainty into one report. Never invents confidence where no signal
    exists — an item with nothing to go on is UNKNOWN, not a guess."""
    items: list[VerificationItem] = find_uncertain_extracted_fields(extraction_model)

    if normalized_medicines:
        items.extend(find_uncertain_medicines(normalized_medicines))

    if not items:
        overall = ConfidenceLevel.HIGH
    else:
        overall = min(items, key=lambda i: _LEVEL_RANK[i.confidence_level]).confidence_level

    return DocumentValidationReport(
        document_type=document_type,
        overall_confidence_level=overall,
        requires_verification=len(items) > 0,
        uncertain_fields=items,
    )
