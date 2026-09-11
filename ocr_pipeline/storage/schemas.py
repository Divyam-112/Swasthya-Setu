"""
Storage schemas for document and medicine persistence.

These are storage-layer wrappers around the domain models. They add
persistence metadata (IDs, timestamps) without altering the domain
schemas themselves.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field

from document_ai.medicine.schemas import NormalizedMedicine


class StoredMedicine(BaseModel):
    """A medicine record with persistence metadata."""
    medicine_id: str
    document_id: str
    normalized_medicine: NormalizedMedicine
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StoredDocument(BaseModel):
    """A document record with persistence metadata."""
    document_id: str
    file_name: Optional[str] = None
    document_type: str = "unknown"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    medicine_ids: list[str] = Field(default_factory=list)
    result: Optional[dict] = None  # serialized ModuleBResult
