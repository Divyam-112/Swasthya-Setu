"""
In-memory StateStore implementation — dict-backed, thread-safe.

Explicit limitations (see also storage/base.py docstring):
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

import threading
from typing import Optional

from .base import StateStore
from .schemas import StoredDocument, StoredMedicine


class InMemoryStateStore(StateStore):
    """Dict-backed state store. Suitable for single-process hackathon demos only."""

    def __init__(self) -> None:
        self._documents: dict[str, StoredDocument] = {}
        self._medicines: dict[str, StoredMedicine] = {}
        self._lock = threading.Lock()

    def save_document(self, document: StoredDocument) -> None:
        with self._lock:
            self._documents[document.document_id] = document

    def get_document(self, document_id: str) -> Optional[StoredDocument]:
        with self._lock:
            return self._documents.get(document_id)

    def save_medicine(self, medicine: StoredMedicine) -> None:
        with self._lock:
            self._medicines[medicine.medicine_id] = medicine

    def get_medicine(self, medicine_id: str) -> Optional[StoredMedicine]:
        with self._lock:
            return self._medicines.get(medicine_id)

    def update_medicine(self, medicine_id: str, updated: StoredMedicine) -> None:
        with self._lock:
            if medicine_id not in self._medicines:
                raise KeyError(f"Medicine {medicine_id!r} not found in store")
            self._medicines[medicine_id] = updated
