"""
Step 5 output contract: a dedicated confidence/uncertainty validation
layer that sits over Steps 3 (extraction) and 4 (medicine normalization).

This layer does not re-decide facts — it only reads confidence signals
that already exist (OCR confidence, extraction confidence, medicine match
confidence, agreement flags, presence/absence of source text) and turns
them into one consistent, traceable verification report. It deliberately
does NOT claim that any of this is a calibrated probability of
correctness — see confidence.py's docstring.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ConfidenceLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    UNKNOWN = "UNKNOWN"


class VerificationReason(str, Enum):
    MISSING_VALUE = "missing_value"
    LOW_OCR_CONFIDENCE = "low_ocr_confidence"
    LOW_EXTRACTION_CONFIDENCE = "low_extraction_confidence"
    NO_SOURCE_TEXT = "no_source_text"
    AMBIGUOUS_MEDICINE_MATCH = "ambiguous_medicine_match"
    MEDICINE_NO_MATCH = "medicine_no_match"
    MEDICINE_PROVIDER_UNAVAILABLE = "medicine_provider_unavailable"
    VLM_VOCABULARY_DISAGREEMENT = "vlm_vocabulary_disagreement"
    MALFORMED_FIELD = "malformed_field"
    EXTRACTION_PARSE_FAILED = "extraction_parse_failed"


class VerificationItem(BaseModel):
    """One uncertain item, traceable back to where it came from."""

    field_path: str  # dotted path, e.g. "medications.0.raw_name" — same convention as Step 3
    confidence_level: ConfidenceLevel = ConfidenceLevel.UNKNOWN
    reasons: list[VerificationReason] = Field(default_factory=list)
    source_text: Optional[str] = None


class DocumentValidationReport(BaseModel):
    document_type: str
    overall_confidence_level: ConfidenceLevel = ConfidenceLevel.UNKNOWN
    requires_verification: bool = True
    uncertain_fields: list[VerificationItem] = Field(default_factory=list)
