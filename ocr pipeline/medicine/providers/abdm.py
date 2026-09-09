"""
ABDM Drug Registry provider.

IMPORTANT PROVENANCE NOTE: this integrates against an endpoint captured by
observing the public ABDM Drug Registry website's own network traffic
(browser DevTools), not against a published third-party developer API in
ABDM's official sandbox documentation. That distinction matters:

  - It is very likely real and currently working (the URL/parameter/response
    shape below is exactly what was captured from a live 200 response, and
    the "sbx" subdomain convention matches other confirmed ABDM sandbox
    subdomains, e.g. healthidsbx.abdm.gov.in for the ABHA sandbox).
  - It has NEVER been confirmed reachable from this development environment
    (drugregistrysbx.abdm.gov.in is outside every network allowlist used
    throughout this project) — implemented against the captured contract,
    covered only by mocked tests, unverified live.
  - Being a public website's internal API rather than a documented
    developer API, it can change shape or add bot/CORS protection without
    any deprecation notice. Treat it as considerably less stable than a
    documented API, and keep LocalBenchmarkProvider as a real fallback,
    not a formality.

No authentication, OAuth flow, or additional headers are used here beyond
what was actually observed — none of that is invented.
"""

from __future__ import annotations

import time
from typing import Optional

from .base import VocabularyCandidate, VocabularyProviderError

ABDM_DRUG_REGISTRY_SEARCH_URL = "https://drugregistrysbx.abdm.gov.in/drug-registry/v1/search"
DEFAULT_TIMEOUT_SECONDS = 5
DEFAULT_LIMIT = 10
DEFAULT_CACHE_TTL_SECONDS = 300  # 5 minutes — simple in-memory cache, no Redis/DB


def _sim(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    from difflib import SequenceMatcher
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _as_list(value) -> list:
    """ABDM's response has fields that are sometimes singular, sometimes
    arrays (substanceName vs substanceIdentifier[] in the captured sample).
    Never invent structure — just coerce whatever's present into a list."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def normalize_abdm_record(raw: dict) -> dict:
    """Maps one ABDM drugDetails record into this project's internal shape.
    Exact mapping as confirmed from the captured response — no invented
    fields, no guessed ones. Anything ABDM didn't return stays absent."""
    return {
        "drug_code": raw.get("brandIdentifier"),
        "brand_name": raw.get("brandName"),
        "generic_identifier": raw.get("genericIdentifier"),
        "generic_name": raw.get("genericName"),
        "manufacturer": raw.get("supplierName"),
        "substance_names": _as_list(raw.get("substanceName")),
        "dosage_form": raw.get("doseForm"),
        "route": raw.get("routeOfAdministrationName"),
        "indication": raw.get("indication"),
        "contra_indication": raw.get("contraIndication"),
        "matched_fields": _as_list(raw.get("matchedFields")),
        "alternative_drugs": _as_list(raw.get("alternativeDrugs")),
        # Preserve the untouched raw record too — nothing ABDM sent is lost,
        # even fields not in the mapping table above.
        "raw_abdm_record": raw,
    }


class ABDMDrugRegistryProvider:
    """MedicineVocabularyProvider backed by the ABDM Drug Registry search
    endpoint. See module docstring for the provenance caveat.
    """

    name = "ABDMDrugRegistryProvider"

    def __init__(
        self,
        base_url: str = ABDM_DRUG_REGISTRY_SEARCH_URL,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        limit: int = DEFAULT_LIMIT,
        cache_ttl_seconds: int = DEFAULT_CACHE_TTL_SECONDS,
    ):
        self.base_url = base_url
        self.timeout_seconds = timeout_seconds
        self.limit = limit
        self.cache_ttl_seconds = cache_ttl_seconds
        self._cache: dict[tuple, tuple[float, list[dict]]] = {}

    def _search(self, query: str, page: int = 0) -> list[dict]:
        """Returns the raw drugDetails list for `query`. Cached by
        (normalized query, page, limit) for cache_ttl_seconds."""
        cache_key = (query.strip().lower(), page, self.limit)
        cached = self._cache.get(cache_key)
        if cached is not None:
            cached_at, cached_value = cached
            if time.time() - cached_at < self.cache_ttl_seconds:
                return cached_value

        try:
            import requests
        except ImportError as e:
            raise VocabularyProviderError("requests package not installed. Run: pip install requests") from e

        params = {"q": query, "page": page, "limit": self.limit}
        try:
            response = requests.get(self.base_url, params=params, timeout=self.timeout_seconds)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            raise VocabularyProviderError(f"ABDM Drug Registry request failed: {e}") from e

        results = data.get("drugDetails")
        if results is None:
            raise VocabularyProviderError(
                "ABDM Drug Registry response missing expected 'drugDetails' field — "
                "the API contract may have changed."
            )

        self._cache[cache_key] = (time.time(), results)
        return results

    def _score(self, query: str, normalized: dict, context_hint: Optional[str] = None) -> float:
        """Primary signal is name similarity (brand or generic) — never the
        indication text. `context_hint` (e.g. a prescription's diagnosis
        text) can only ever nudge a genuinely plausible name match, never
        substitute for one — see module docstring / README for why."""
        name_score = max(
            _sim(query, normalized.get("brand_name") or ""),
            _sim(query, normalized.get("generic_name") or ""),
        )
        score = name_score

        matched_fields = {f.lower() for f in normalized.get("matched_fields", []) if isinstance(f, str)}
        # Same floor as the context_hint boost below: any boost mechanism
        # here is only allowed to nudge an already-plausible name match,
        # never rescue a genuinely unrelated one.
        if name_score >= 0.3 and ({"brandname", "genericname"} & matched_fields):
            score = min(score + 0.05, 1.0)

        if context_hint and name_score >= 0.3:
            indication = (normalized.get("indication") or "").lower()
            hint_terms = {t for t in context_hint.lower().split() if len(t) > 3}
            if hint_terms and any(term in indication for term in hint_terms):
                score = min(score + 0.05, 1.0)  # small, capped — supporting evidence only

        return score

    def exact_lookup(self, cleaned_name: str) -> Optional[VocabularyCandidate]:
        if not cleaned_name.strip():
            return None
        results = self._search(cleaned_name)
        for raw in results:
            normalized = normalize_abdm_record(raw)
            for field in (normalized.get("brand_name"), normalized.get("generic_name")):
                if field and field.strip().lower() == cleaned_name.strip().lower():
                    return VocabularyCandidate(
                        name=normalized.get("brand_name") or normalized.get("generic_name"),
                        code=normalized.get("drug_code"),
                        score=1.0,
                        match_type="exact",
                        record=normalized,
                    )
        return None

    def approximate_lookup(
        self, cleaned_name: str, max_candidates: int = 5, context_hint: Optional[str] = None
    ) -> list[VocabularyCandidate]:
        if not cleaned_name.strip():
            return []
        results = self._search(cleaned_name)

        candidates = []
        for raw in results:
            normalized = normalize_abdm_record(raw)
            score = self._score(cleaned_name, normalized, context_hint=context_hint)
            if score <= 0.0:
                continue
            candidates.append(
                VocabularyCandidate(
                    name=normalized.get("brand_name") or normalized.get("generic_name") or "unknown",
                    code=normalized.get("drug_code"),
                    score=score,
                    match_type="approximate",
                    record=normalized,
                )
            )

        candidates.sort(key=lambda c: c.score, reverse=True)
        return candidates[:max_candidates]
