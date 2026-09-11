"""
Step 10 request/response contracts. Deliberately thin: these wrap the
existing document_ai.pipeline / document_ai.ocr / document_ai.extraction
schemas rather than redefining business data — the API layer's only job
is HTTP plumbing.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    """Structured error body. Never includes stack traces, file paths on
    the server, or provider credentials — see observability/errors.py."""

    error: str
    detail: Optional[str] = None
    document_id: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    ocr_provider_configured: bool
    extraction_provider_configured: bool
    medicine_provider_configured: bool
    interaction_provider_configured: bool


class OCROnlyResponse(BaseModel):
    document_id: str
    ocr_status: str
    provider: Optional[str] = None
    average_confidence: Optional[float] = None
    full_text: str
    warnings: list[str] = Field(default_factory=list)


class ExtractOnlyRequest(BaseModel):
    ocr_text: str
    document_type: str  # "prescription" | "lab_report" | "discharge_summary"


class MedicineVerificationRequest(BaseModel):
    medicine_id: str
    packet_image_base64: str  # base64-encoded packet/strip/box photo


class MedicineVerificationResponse(BaseModel):
    medicine_id: str
    status: str  # PacketVerificationStatus value
    verified_name: Optional[str] = None
    needs_verification: bool
    reason: Optional[str] = None
