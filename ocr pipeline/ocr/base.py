"""
Provider abstraction. Downstream code (router, Step 3 extraction) depends
only on this interface — never on a concrete provider — so providers can
be swapped without touching anything else.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from .schemas import OCRResult


class OCRProviderError(Exception):
    """Raised when a provider cannot complete a transcription request.

    Callers (the router) catch this and decide whether to fall back to
    another provider — the provider itself never silently returns a
    fabricated/empty success result.
    """


class OCRProvider(ABC):
    """Every OCR/VLM backend implements this. One job: SEE -> READ -> TRANSCRIBE.

    Implementations must NOT normalize medicines, structure clinical fields,
    diagnose, or recommend anything. That's Step 3+, not this layer.
    """

    name: str = "unnamed_provider"

    @abstractmethod
    def transcribe(self, file_path: Path, document_id: str | None = None) -> OCRResult:
        """Transcribe a single (already-preprocessed) document image or PDF.

        Must not raise for ordinary low-quality input — return an OCRResult
        with ocr_status=PARTIAL/FAILED and populate `warnings`/`error` instead.
        Only raise OCRProviderError for infrastructure failures (missing
        credentials, network/API failure, unsupported file type) so the
        router can decide whether to fall back.
        """
        raise NotImplementedError
