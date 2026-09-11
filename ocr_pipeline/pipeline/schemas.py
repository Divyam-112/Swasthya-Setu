"""
Step 9 output contract: the unified Module B pipeline and its final JSON.

This is purely a wiring/aggregation layer. It doesn't add any new
inference of its own — everything here is a pass-through of what Steps
1-8 already produced, kept traceable back to its source document.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class PipelineStatus(str, Enum):
    SUCCESS = "success"            # every document processed cleanly end to end
    PARTIAL = "partial"            # at least one document had an error but others succeeded
    FAILED = "failed"              # nothing could be processed


class ModuleBDocumentResult(BaseModel):
    document_id: str
    file_name: Optional[str] = None
    document_type: str  # "prescription" | "lab_report" | "discharge_summary" | "unknown"
    ocr_status: str
    ocr_provider: Optional[str] = None
    ocr_average_confidence: Optional[float] = None
    extraction: dict = Field(default_factory=dict)   # Step 3 model, dumped
    medicines: list[dict] = Field(default_factory=list)  # Step 4 NormalizedMedicine, dumped (prescriptions/discharge only)
    lab_validation: Optional[dict] = None  # Step 6 ValidatedLabReport, dumped (lab_reports only)
    validation: dict = Field(default_factory=dict)  # Step 5 DocumentValidationReport, dumped
    errors: list[str] = Field(default_factory=list)


class VerificationSummary(BaseModel):
    requires_verification: bool = True
    uncertain_fields: list[dict] = Field(default_factory=list)  # {document_id, field_path, reasons, ...}


class PipelineMeta(BaseModel):
    ocr_provider: Optional[str] = None
    extraction_provider: Optional[str] = None
    medicine_provider: Optional[str] = None
    interaction_provider: Optional[str] = None
    status: PipelineStatus = PipelineStatus.SUCCESS


class ModuleBResult(BaseModel):
    document_id: str  # identifies this processing run/batch
    patient_reference: Optional[str] = None  # never invented — only set if the caller explicitly supplies one

    documents: list[ModuleBDocumentResult] = Field(default_factory=list)
    prescriptions: list[dict] = Field(default_factory=list)
    lab_reports: list[dict] = Field(default_factory=list)
    discharge_summaries: list[dict] = Field(default_factory=list)
    procedures: list[dict] = Field(default_factory=list)

    timeline: dict = Field(default_factory=dict)  # TimelineResult, dumped
    drug_interactions: list[dict] = Field(default_factory=list)

    verification: VerificationSummary = Field(default_factory=VerificationSummary)
    pipeline: PipelineMeta = Field(default_factory=PipelineMeta)
