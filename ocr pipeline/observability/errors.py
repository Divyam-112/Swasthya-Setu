"""
Step 12: a safe error model. Exceptions raised anywhere in the pipeline
must never leak API keys, internal file paths, or raw stack traces to an
HTTP response. This module is the single place that turns "something
went wrong" into "here's a caller-safe description of what went wrong".
"""

from __future__ import annotations

from pydantic import BaseModel

from document_ai.interactions.providers.base import InteractionProviderError
from document_ai.medicine.providers.base import VocabularyProviderError
from document_ai.ocr.base import OCRProviderError
from document_ai.extraction.client import ExtractionError


class PipelineError(Exception):
    """Raised for pipeline-level infrastructure failures that should
    surface as an HTTP error rather than being swallowed into a per-document
    `errors` list (e.g. a config/wiring problem affecting the whole batch)."""


class SafeErrorResponse(BaseModel):
    error: str
    detail: str | None = None


_KNOWN_ERROR_CATEGORIES: dict[type, str] = {
    OCRProviderError: "ocr_provider_error",
    ExtractionError: "extraction_provider_error",
    VocabularyProviderError: "medicine_provider_error",
    InteractionProviderError: "interaction_provider_error",
    PipelineError: "pipeline_error",
}


def to_safe_error_response(exc: Exception) -> SafeErrorResponse:
    """Never includes exc's raw message verbatim for unrecognized exception
    types (which might contain a URL with an embedded key, a local file
    path, etc). Known, already-sanitized provider error types (whose
    __str__ methods are written by us, not by an arbitrary dependency) are
    the only ones passed through."""
    for exc_type, category in _KNOWN_ERROR_CATEGORIES.items():
        if isinstance(exc, exc_type):
            return SafeErrorResponse(error=category, detail=_scrub(str(exc)))

    return SafeErrorResponse(error="internal_error", detail=None)


_SECRET_MARKERS = ("key=", "token=", "authorization", "bearer ", "api_key")


def _scrub(message: str) -> str:
    lowered = message.lower()
    if any(marker in lowered for marker in _SECRET_MARKERS):
        return "internal provider error (details withheld)"
    return message
