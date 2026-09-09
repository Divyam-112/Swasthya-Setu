"""
Provider wiring for the Module B pipeline. This is the one place that
knows about concrete provider implementations (Gemini,
ABDM Drug Registry / local fallback, openFDA) — module_b.py itself only depends on the Protocols, so
swapping any provider never touches pipeline logic.

Default OCR provider priority (development):
  1. Gemini  — if GEMINI_API_KEY is set (default for development)
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from document_ai.extraction.client import AnthropicExtractionClient, ExtractionClient
from document_ai.interactions.providers.base import InteractionProvider
from document_ai.medicine.providers.base import MedicineVocabularyProvider
from document_ai.ocr.base import OCRProvider
from document_ai.ocr.router import DEFAULT_FALLBACK_CONFIDENCE_THRESHOLD, OCRRouter
from document_ai.storage.base import StateStore


@dataclass
class PipelineConfig:
    ocr_router: OCRRouter | None
    extraction_client: ExtractionClient | None
    medicine_provider: MedicineVocabularyProvider | None = None
    interaction_provider: InteractionProvider | None = None
    state_store: StateStore | None = None


def build_default_config() -> PipelineConfig:
    """Wires up real providers from environment variables. Never raises for
    a missing provider at build time — providers that can't be configured
    (missing credentials) are set to None here and surfaced as
    PROVIDER_UNAVAILABLE / needs_verification at the point they're actually
    used, matching every upstream layer's "don't crash, mark uncertain"
    convention.
    """
    ocr_router = _build_ocr_router()
    extraction_client = _build_extraction_client()
    medicine_provider = _build_medicine_provider()
    interaction_provider = _build_interaction_provider()
    state_store = _build_state_store()

    return PipelineConfig(
        ocr_router=ocr_router,
        extraction_client=extraction_client,
        medicine_provider=medicine_provider,
        interaction_provider=interaction_provider,
        state_store=state_store,
    )


def _build_ocr_router() -> OCRRouter | None:
    providers = []

    # Priority 1: Gemini (default/primary OCR provider)
    if os.environ.get("GEMINI_API_KEY"):
        from document_ai.ocr.gemini import GeminiOCRProvider
        providers.append(GeminiOCRProvider())

    if not providers:
        return None

    return OCRRouter(providers, fallback_confidence_threshold=DEFAULT_FALLBACK_CONFIDENCE_THRESHOLD)


def _build_extraction_client() -> ExtractionClient | None:
    provider_env = os.environ.get("EXTRACTION_PROVIDER")
    
    if provider_env == "anthropic":
        from document_ai.extraction.client import AnthropicExtractionClient
        return AnthropicExtractionClient()
    elif provider_env == "rule_based":
        from document_ai.extraction.client import RuleBasedExtractionClient
        return RuleBasedExtractionClient()
        
    # Default to RuleBased if no API key is available
    if not os.environ.get("ANTHROPIC_API_KEY"):
        from document_ai.extraction.client import RuleBasedExtractionClient
        return RuleBasedExtractionClient()
        
    # If key is available, we still default to anthropic to preserve existing behavior unless specified
    from document_ai.extraction.client import AnthropicExtractionClient
    return AnthropicExtractionClient()


def _build_medicine_provider() -> MedicineVocabularyProvider | None:
    """ABDM Drug Registry or configured provider.
    
    Returns the real ABDM live provider by default. Does NOT fall back to synthetic
    data if the provider is unavailable or fails. It's critical that
    production uses only real medical data.
    """
    from document_ai.medicine.providers.router import get_medicine_provider
    return get_medicine_provider()


def _build_interaction_provider() -> InteractionProvider | None:
    from document_ai.interactions.providers.openfda import OpenFDAProvider
    # Live network dependency, but no key needed.
    return OpenFDAProvider()


def _build_state_store() -> StateStore:
    from document_ai.storage.memory import InMemoryStateStore
    return InMemoryStateStore()
