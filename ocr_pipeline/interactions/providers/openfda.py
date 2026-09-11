"""
openFDA drug labeling provider (https://api.fda.gov/drug/label.json).

No API key required for low-volume use, but it IS a live network
dependency. api.fda.gov was NOT reachable from the sandbox this code was
written in (not on the sandbox's network allowlist), so — like
medicine/providers/rxnorm.py — this is implemented against openFDA's
documented API contract but is UNVERIFIED against the live service.
Mocked tests cover the parsing/decision logic only.

Approach (deliberately conservative): search the label of drug_a for a
`drug_interactions` section, and treat it as evidence of a potential
interaction only if drug_b's name literally appears in that section's
text. This is a simple substring check, not a clinical judgement — it can
both miss interactions (different naming) and over-flag (incidental
mentions). That's exactly why every hit is surfaced as "needs clinician
review", never as a confirmed interaction.

Checked BIDIRECTIONALLY: drug labels aren't symmetric — drug A's label
may not mention drug B even when drug B's own label documents the
interaction with drug A (and vice versa) — so `check_pair` queries both
labels and reports a potential interaction if either direction mentions
the other drug. This roughly doubles the API calls per pair but is the
difference between "labels don't cross-reference every interacting drug"
being a silent miss versus a caught case.
"""

from __future__ import annotations

from .base import InteractionProviderError, PairInteractionResult

OPENFDA_BASE_URL = "https://api.fda.gov/drug/label.json"
DEFAULT_TIMEOUT_SECONDS = 5


class OpenFDAProvider:
    name = "openFDA"

    def __init__(self, base_url: str = OPENFDA_BASE_URL, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS):
        self.base_url = base_url
        self.timeout_seconds = timeout_seconds

    def _search_label(self, generic_name: str) -> dict:
        try:
            import requests
        except ImportError as e:
            raise InteractionProviderError("requests package not installed. Run: pip install requests") from e

        params = {
            "search": f'openfda.generic_name:"{generic_name}"',
            "limit": 1,
        }
        try:
            response = requests.get(self.base_url, params=params, timeout=self.timeout_seconds)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            raise InteractionProviderError(f"openFDA request failed: {e}") from e

    def _check_one_direction(self, label_drug: str, mentioned_drug: str) -> PairInteractionResult:
        """Searches `label_drug`'s own label for a mention of `mentioned_drug`."""
        data = self._search_label(label_drug)
        results = data.get("results", [])
        if not results:
            return PairInteractionResult(found=False)

        sections = results[0].get("drug_interactions", [])
        text = " ".join(sections).lower()
        if mentioned_drug.lower() in text:
            # Grab a short window around the mention as evidence, never the
            # full label text.
            idx = text.find(mentioned_drug.lower())
            start = max(0, idx - 60)
            end = min(len(text), idx + len(mentioned_drug) + 60)
            snippet = text[start:end].strip()
            return PairInteractionResult(
                found=True, evidence=f"[{label_drug}'s label] ...{snippet}..."
            )
        return PairInteractionResult(found=False)

    def check_pair(self, drug_a: str, drug_b: str) -> PairInteractionResult:
        a_mentions_b = self._check_one_direction(drug_a, drug_b)
        if a_mentions_b.found:
            return a_mentions_b

        b_mentions_a = self._check_one_direction(drug_b, drug_a)
        return b_mentions_a
