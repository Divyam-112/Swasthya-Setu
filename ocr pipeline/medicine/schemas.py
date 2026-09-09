"""
Step 4 output contract: medicine vocabulary normalization.

Design rule carried over from Step 3: normalization NEVER overwrites the
raw/extracted name. `vocabulary_normalized` is an additional, separate
field. If normalization is uncertain or absent, `vocabulary_normalized`
stays None and `needs_verification` stays True — a null result is a valid,
honest result, not a failure to hide.
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


class MatchCandidate(BaseModel):
    """One candidate vocabulary entry considered for a raw medicine name."""

    name: str
    source: str  # e.g. "IndianMedicineProvider" (active), "RxNorm" (interface is provider-agnostic)
    code: Optional[str] = None
    score: float = Field(ge=0.0, le=1.0)
    match_type: str = "approximate"
    reason: Optional[str] = None
    manufacturer: Optional[str] = None
    composition: Optional[str] = None
    is_discontinued: Optional[bool] = None
    record: Optional[dict] = None


class NormalizedMedicine(BaseModel):
    raw_name: str
    vlm_normalized: Optional[str] = None

    vocabulary_normalized: Optional[str] = None
    vocabulary_source: Optional[str] = None
    vocabulary_code: Optional[str] = None
    manufacturer: Optional[str] = None
    composition: Optional[str] = None
    is_discontinued: Optional[bool] = None

    match_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    confidence_level: ConfidenceLevel = ConfidenceLevel.UNKNOWN

    agreement: Optional[bool] = None
    candidates: list[MatchCandidate] = Field(default_factory=list)

    needs_verification: bool = True
    reasons: list[str] = Field(default_factory=list)

    # passthrough dosage fields carried from Step 3, unmodified
    strength: Optional[str] = None
    dosage_form: Optional[str] = None
    dose: Optional[str] = None
    frequency: Optional[dict] = None
    duration: Optional[str] = None
    
    # advanced fields carried from Step 3
    visual_evidence: Optional[dict] = None
    evidence_status: Optional[str] = None
    medicine_identification_confidence: Optional[float] = None
    vocabulary_verified: Optional[bool] = None

    packet_verification: Optional["PacketVerification"] = None


class NormalizationBatchResult(BaseModel):
    medicines: list[NormalizedMedicine] = Field(default_factory=list)


class PacketVerificationStatus(str, Enum):
    """Lifecycle states for packet-based medicine verification."""
    UNREQUESTED = "UNREQUESTED"
    PATIENT_VERIFICATION_REQUIRED = "PATIENT_VERIFICATION_REQUIRED"
    PATIENT_VERIFIED = "PATIENT_VERIFIED"
    CONFLICT = "CONFLICT"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    UNKNOWN = "UNKNOWN"


class PacketVerification(BaseModel):
    """Evidence from a medicine packet/strip/box photo."""
    status: PacketVerificationStatus = PacketVerificationStatus.UNREQUESTED
    packet_ocr_text: Optional[str] = None
    packet_candidates: list[MatchCandidate] = Field(default_factory=list)
    verified_name: Optional[str] = None
    reason: Optional[str] = None
