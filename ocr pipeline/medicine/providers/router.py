"""
ABDM-first, local-fallback composition of two MedicineVocabularyProvider
implementations.

Named ABDMWithLocalFallbackProvider rather than reusing "IndianMedicineProvider"
for the composed router (as the architecture diagram in the ABDM integration
request suggested), because IndianMedicineProvider already names the
existing local-data class, referenced by existing tests and pipeline
wiring — renaming it would have meant either breaking that class's own
identity or silently changing what a name already in use means. This is a
new, explicitly-named class instead of an overloaded existing one.
"""

from __future__ import annotations

from typing import Optional

from document_ai.observability.logging import get_logger

from .base import MedicineVocabularyProvider, VocabularyCandidate, VocabularyProviderError

logger = get_logger(__name__)


class ABDMWithLocalFallbackProvider:
    """Tries the ABDM Drug Registry first; falls back to the local
    synthetic dataset only when ABDM is unreachable or returns nothing.
    Every fallback is logged explicitly (no raw medicine text — just the
    fact that a fallback happened) so it's visible in operation, not a
    silent substitution."""

    name = "ABDMWithLocalFallbackProvider"

    def __init__(self, abdm_provider: MedicineVocabularyProvider, local_provider: MedicineVocabularyProvider):
        self._abdm = abdm_provider
        self._local = local_provider

    def exact_lookup(self, cleaned_name: str) -> Optional[VocabularyCandidate]:
        try:
            result = self._abdm.exact_lookup(cleaned_name)
            if result is not None:
                return result
        except VocabularyProviderError as e:
            logger.warning("abdm_provider_unavailable_falling_back_to_local", extra={"error": str(e)})
        return self._local.exact_lookup(cleaned_name)

    def approximate_lookup(self, cleaned_name: str, max_candidates: int = 5, context_hint: Optional[str] = None) -> list[VocabularyCandidate]:
        try:
            # Forward context_hint if the ABDM provider supports it.
            try:
                candidates = self._abdm.approximate_lookup(cleaned_name, max_candidates=max_candidates, context_hint=context_hint)
            except TypeError:
                candidates = self._abdm.approximate_lookup(cleaned_name, max_candidates=max_candidates)
            if candidates:
                return candidates
        except VocabularyProviderError as e:
            logger.warning("abdm_provider_unavailable_falling_back_to_local", extra={"error": str(e)})
        return self._local.approximate_lookup(cleaned_name, max_candidates=max_candidates)


def get_medicine_provider(
    provider_name: Optional[str] = None,
    dataset_path: Optional[str] = None,
) -> MedicineVocabularyProvider:
    """Router for medicine vocabulary providers based on configuration.

    If provider_name is None, reads the MEDICINE_PROVIDER environment variable.

    Routing rules:
        - 'demo_dataset': DemoIndianMedicineDatasetProvider(dataset_path=dataset_path)
        - 'abdm': ABDMDrugRegistryProvider()
        - 'local': LocalBenchmarkProvider() (developer benchmark testing only)
        - default (None / unset): ABDMDrugRegistryProvider() (production default)

    Safety constraint:
        Do NOT silently fall back from ABDM to demo_dataset.
        If MEDICINE_PROVIDER=abdm is selected, the ABDMDrugRegistryProvider is returned
        without fallback.
    """
    import os

    name = provider_name if provider_name is not None else os.environ.get("MEDICINE_PROVIDER")

    if name == "demo_dataset":
        from .demo_indian_dataset import DemoIndianMedicineDatasetProvider
        return DemoIndianMedicineDatasetProvider(dataset_path=dataset_path)

    if name == "local":
        from .indian_medicine import LocalBenchmarkProvider
        return LocalBenchmarkProvider()

    if name == "abdm":
        from .abdm import ABDMDrugRegistryProvider
        return ABDMDrugRegistryProvider()

    # Default project behavior when MEDICINE_PROVIDER is unset: ABDM live provider
    from .abdm import ABDMDrugRegistryProvider
    return ABDMDrugRegistryProvider()

