"""
Routes a document to a primary provider, falling back to a secondary
provider when the primary result is missing, failed, or below a
confidence threshold.

The threshold has NO built-in default beyond a clearly-labeled
placeholder — see `DEFAULT_FALLBACK_CONFIDENCE_THRESHOLD` below. It
must be replaced with a value derived from your own benchmark
(see benchmark/run_benchmark.py), not treated as tuned.
"""

from __future__ import annotations

from pathlib import Path

from .base import OCRProvider, OCRProviderError
from .schemas import OCRResult, OCRStatus

# PLACEHOLDER — not benchmark-derived. Replace after running
# benchmark/run_benchmark.py against your own sample set.
DEFAULT_FALLBACK_CONFIDENCE_THRESHOLD = 0.5


class OCRRouter:
    def __init__(
        self,
        primary_or_providers: OCRProvider | list[OCRProvider] | None = None,
        fallback: OCRProvider | None = None,
        fallback_confidence_threshold: float = DEFAULT_FALLBACK_CONFIDENCE_THRESHOLD,
        providers: list[OCRProvider] | None = None,
    ):
        if isinstance(primary_or_providers, list):
            self.providers = primary_or_providers
        elif providers is not None:
            self.providers = providers
        else:
            self.providers = [primary_or_providers]
            if fallback is not None:
                self.providers.append(fallback)

        if not self.providers:
            raise ValueError("OCRRouter requires at least one provider")

        # Backwards compatibility for tests
        self.primary = self.providers[0]
        self.fallback = self.providers[1] if len(self.providers) > 1 else None
        self.fallback_confidence_threshold = fallback_confidence_threshold

    def transcribe(self, file_path: Path, document_id: str | None = None) -> OCRResult:
        document_id = document_id or OCRResult.new_id()

        best_fallback_result = None
        first_result = None

        for provider in self.providers:
            result = self._try_provider(provider, file_path, document_id)
            
            if first_result is None:
                first_result = result

            if self._is_acceptable(result):
                return result

            # Keep track of the last result that didn't outright fail, so we can
            # return it if we run out of options. A low-confidence transcription
            # is better than an outright failure.
            if result is not None and result.ocr_status != OCRStatus.FAILED:
                best_fallback_result = result

        # If we got no acceptable results, return the best fallback we have.
        # If everything failed, return the first result to surface the primary error.
        if best_fallback_result is not None:
            return best_fallback_result

        return first_result

    def _try_provider(self, provider: OCRProvider, file_path: Path, document_id: str) -> OCRResult | None:
        try:
            return provider.transcribe(file_path, document_id=document_id)
        except OCRProviderError as e:
            return OCRResult(
                document_id=document_id,
                provider=getattr(provider, "name", "unknown"),
                ocr_status=OCRStatus.FAILED,
                pages=[],
                error=str(e),
            )

    def _is_acceptable(self, result: OCRResult | None) -> bool:
        if result is None:
            return False
        if result.ocr_status == OCRStatus.FAILED:
            return False
        if not result.full_text().strip():
            return False
        avg_conf = result.average_confidence()
        if avg_conf is not None and avg_conf < self.fallback_confidence_threshold:
            return False
        return True
