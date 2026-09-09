"""
Provider abstraction for medicine vocabularies, mirroring ocr/base.py and
extraction/client.py: the matcher/normalizer never talks to a specific
vocabulary API directly, only to this Protocol. This is the extension
point for future Indian/AYUSH vocabulary providers mentioned in the spec —
add a new module under providers/ implementing the same Protocol.
"""

from __future__ import annotations

from typing import Protocol


class VocabularyProviderError(Exception):
    """Infrastructure failure: network unreachable, API error, no credentials.

    Callers must treat this as 'provider unavailable', never as 'no match
    found' — those are different facts and must not be conflated.
    """


class VocabularyCandidate:
    __slots__ = ("name", "code", "score", "match_type", "record")

    def __init__(self, name: str, code: str | None, score: float, match_type: str, record: dict | None = None):
        self.name = name
        self.code = code
        self.score = score
        self.match_type = match_type
        self.record = record or {}


class MedicineVocabularyProvider(Protocol):
    name: str  # e.g. "IndianMedicineProvider" (active), "RxNorm" (interface is provider-agnostic)

    def exact_lookup(self, cleaned_name: str) -> VocabularyCandidate | None:
        """Case/whitespace-normalized exact match against the vocabulary."""
        ...

    def approximate_lookup(self, cleaned_name: str, max_candidates: int = 5) -> list[VocabularyCandidate]:
        """Fuzzy/approximate candidates, best first. Empty list = no candidates
        found (not the same as provider unavailable)."""
        ...
