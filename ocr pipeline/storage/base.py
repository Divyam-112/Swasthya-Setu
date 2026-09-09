"""
Abstract state store interface for medicine verification persistence.

Every other provider in this codebase (OCR, extraction, medicine vocabulary,
interactions) is an abstract base class with a concrete implementation
swapped in via PipelineConfig. StateStore follows the same pattern.

Explicit limitations of the current InMemoryStateStore implementation:
- State lives only in process memory. A server restart loses everything.
- Not safe across multiple workers/instances — each process has its own
  store, so a verification request can land on a worker that never saw
  the original document.
- No TTL/eviction — fine for a hackathon demo run, not fine left running.
- Production replacement: swap InMemoryStateStore for a real implementation
  of the same StateStore interface (Postgres/Redis/etc.) — nothing above
  the storage layer should need to change.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from .schemas import StoredDocument, StoredMedicine


class StateStore(ABC):
    """Abstract persistence interface for document/medicine state."""

    @abstractmethod
    def save_document(self, document: StoredDocument) -> None:
        """Persist a new document record. document.document_id must be unique."""
        ...

    @abstractmethod
    def get_document(self, document_id: str) -> Optional[StoredDocument]:
        """Retrieve a document by ID, or None if not found."""
        ...

    @abstractmethod
    def save_medicine(self, medicine: StoredMedicine) -> None:
        """Persist a new medicine record. medicine.medicine_id must be unique."""
        ...

    @abstractmethod
    def get_medicine(self, medicine_id: str) -> Optional[StoredMedicine]:
        """Retrieve a medicine by ID, or None if not found."""
        ...

    @abstractmethod
    def update_medicine(self, medicine_id: str, updated: StoredMedicine) -> None:
        """Update an existing medicine record. Raises KeyError if medicine_id not found."""
        ...
