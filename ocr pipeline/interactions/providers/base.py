from __future__ import annotations

from typing import Protocol


class InteractionProviderError(Exception):
    """Infrastructure failure — network, credentials, malformed response.
    Callers must map this to PROVIDER_UNAVAILABLE, never to
    NO_INTERACTION_INFORMATION; those mean different things."""


class PairInteractionResult:
    __slots__ = ("found", "evidence")

    def __init__(self, found: bool, evidence: str | None = None):
        self.found = found            # True = some interaction language was found for this pair
        self.evidence = evidence      # short excerpt/snippet, when found


class InteractionProvider(Protocol):
    name: str  # e.g. "openFDA"

    def check_pair(self, drug_a: str, drug_b: str) -> PairInteractionResult:
        """Raises InteractionProviderError if the provider itself couldn't
        be reached/queried. Returns PairInteractionResult(found=False) when
        the provider WAS reachable but had nothing on this pair."""
        ...
