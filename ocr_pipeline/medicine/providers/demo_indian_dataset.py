"""
DemoIndianMedicineDatasetProvider
==================================

Temporary DEMO provider backed by the publicly available Indian Medicine
Dataset (junioralive/Indian-Medicine-Dataset on GitHub/Kaggle).

DATA PROVENANCE
---------------
    Source  : junioralive/Indian-Medicine-Dataset
    Purpose : Temporary development / SIH26047 demo medicine vocabulary.

    This is NOT the official ABDM Drug Registry.
    This is NOT a government-verified medicine registry.
    This is NOT suitable for clinical or production use.

    The future authoritative integration is:  ABDM Drug Registry (abdm.py)

CONFIGURATION
-------------
    MEDICINE_PROVIDER=demo_dataset
    MEDICINE_DATASET_PATH=./data/indian_medicine_data.json

LOADING STRATEGY
----------------
    The 92 MB JSON is loaded ONCE at provider initialization.
    Four normalized indexes are built from the single parsed object:
        - name_index   : exact normalized name  -> list[int] (record indices)
        - token_index  : single word tokens     -> set[int]  (record indices)
        - comp_index   : composition tokens     -> set[int]  (record indices)
        - manuf_index  : manufacturer tokens    -> set[int]  (record indices)

    Original dataset records are stored once in self._records.
    Indexes hold integer positions into _records -- no second full copy.

SEARCH
------
    Implements the existing MedicineVocabularyProvider Protocol:
        exact_lookup(cleaned_name)         -> VocabularyCandidate | None
        approximate_lookup(cleaned_name)   -> list[VocabularyCandidate]

FUZZY MATCHING
--------------
    Uses difflib.SequenceMatcher (no external dependencies).
    Threshold: 0.72 -- high enough to catch OCR typos, low enough to
    reject genuinely unrelated names. The downstream confidence/verification
    system remains authoritative; this provider returns *candidates*, not
    verdicts.
"""

from __future__ import annotations

import json
import os
import re
import time
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

from .base import VocabularyCandidate, VocabularyProviderError

# ---------------------------------------------------------------------------
# Configuration defaults
# ---------------------------------------------------------------------------
_DEFAULT_DATASET_PATH = "./data/indian_medicine_data.json"
_ENV_DATASET_PATH = "MEDICINE_DATASET_PATH"

# Fuzzy match threshold.  Candidates below this are silently dropped before
# returning to the matcher -- the matcher's own confidence gating applies on
# top of this.
_FUZZY_THRESHOLD = 0.72

# ---------------------------------------------------------------------------
# Internal normalization helper
# ---------------------------------------------------------------------------
_WHITESPACE_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[,;:()\[\]{}\'\"]+")


def _normalize(text: "str | None") -> str:
    """
    Deterministic, safe normalization for searchable strings.

    Rules (in order):
        1. Return '' for None / blank.
        2. NFC Unicode normalization (preserves meaningful characters).
        3. Lowercase.
        4. Strip leading/trailing whitespace.
        5. Collapse repeated internal whitespace.
        6. Normalize common punctuation (commas, colons, parens).
           Replaces matched punctuation with a space so 'A,B' -> 'a b'.

    The ORIGINAL dataset value is NEVER modified; this function produces
    a separate search key only.

    Examples::

        _normalize("  Augmentin 625 Duo Tablet  ") == 'augmentin 625 duo tablet'
        _normalize(None) == ''
        _normalize("Paracetamol, IP 500mg") == 'paracetamol  ip 500mg'
    """
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    text = text.lower().strip()
    text = _PUNCT_RE.sub(" ", text)
    text = _WHITESPACE_RE.sub(" ", text).strip()
    return text


def _tokenize(normalized: str) -> list:
    """Split normalized string into individual word tokens (>= 2 chars)."""
    return [t for t in normalized.split() if len(t) >= 2]


# ---------------------------------------------------------------------------
# Similarity helper
# ---------------------------------------------------------------------------

def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------

class DemoIndianMedicineDatasetProvider:
    """
    In-memory medicine vocabulary provider backed by the downloaded
    Indian Medicine Dataset JSON (~92 MB, ~253k records).

    The dataset is loaded ONCE at __init__ time; all subsequent lookups
    operate against in-memory indexes.  The provider does not re-read the
    file on every query.

    This is a DEMO provider for SIH26047.  Do not use in production.
    See module docstring for full provenance and configuration details.
    """

    name = "DemoIndianMedicineDatasetProvider"

    def __init__(self, dataset_path: "str | None" = None) -> None:
        """
        Parameters
        ----------
        dataset_path:
            Path to indian_medicine_data.json.  If None, the value of the
            MEDICINE_DATASET_PATH environment variable is used; if that is
            also unset, defaults to './data/indian_medicine_data.json'.
            A relative path is resolved relative to the current working
            directory at init time.

        Raises
        ------
        VocabularyProviderError
            If the file does not exist or cannot be parsed.
        """
        resolved_path = self._resolve_path(dataset_path)
        t0 = time.perf_counter()
        self._records: list = self._load(resolved_path)
        self._dataset_path = str(resolved_path)
        self._init_time_seconds: float = 0.0  # filled after indexing

        # Build indexes from the single loaded list -- no second deep copy.
        (
            self._name_index,   # normalized name  -> [record_index, ...]
            self._token_index,  # word token        -> {record_index, ...}
            self._comp_index,   # composition token -> {record_index, ...}
            self._manuf_index,  # manufacturer tok  -> {record_index, ...}
        ) = self._build_indexes(self._records)

        self._init_time_seconds = time.perf_counter() - t0

    # ------------------------------------------------------------------
    # Protocol-required public methods
    # ------------------------------------------------------------------

    def exact_lookup(self, cleaned_name: str) -> Optional[VocabularyCandidate]:
        """
        Case-and-whitespace normalised exact match against indexed names.

        Returns the last record on collision (last occurrence wins for
        duplicates -- consistent and deterministic, not arbitrary).
        """
        if not cleaned_name or not cleaned_name.strip():
            return None
        key = _normalize(cleaned_name)
        indices = self._name_index.get(key)
        if not indices:
            return None
        idx = indices[-1]  # last occurrence wins for duplicates
        return self._make_candidate(idx, score=1.0, match_type="exact")

    def approximate_lookup(
        self, cleaned_name: str, max_candidates: int = 5
    ) -> list:
        """
        Fuzzy/approximate lookup.  Returns ranked candidates, best first.
        Empty list means no candidates found (not the same as provider
        unavailable -- that raises VocabularyProviderError).

        Strategy
        --------
        1. Token pre-filter: collect record indices that share >= 1 token
           with the query (name or composition tokens).
        2. Score each candidate using SequenceMatcher against the record's
           normalized name.  Also score against composition fields; take max.
        3. Drop candidates below _FUZZY_THRESHOLD.
        4. Sort descending by score, return top max_candidates.
        """
        if not cleaned_name or not cleaned_name.strip():
            return []

        normalized_query = _normalize(cleaned_name)
        query_tokens = _tokenize(normalized_query)

        # --- token pre-filter: union of matching record indices ---
        candidate_indices: set = set()
        for token in query_tokens:
            candidate_indices.update(self._token_index.get(token, set()))
            candidate_indices.update(self._comp_index.get(token, set()))

        # If token pre-filter is empty (very short or unusual query),
        # fall back to all exact-index keys that start with the query prefix.
        if not candidate_indices and normalized_query:
            prefix = normalized_query[:4]
            for key, indices in self._name_index.items():
                if key.startswith(prefix):
                    candidate_indices.update(indices)

        if not candidate_indices:
            return []

        # --- score and filter ---
        scored = []
        for idx in candidate_indices:
            rec = self._records[idx]
            score = self._score_record(normalized_query, rec)
            if score >= _FUZZY_THRESHOLD:
                scored.append((score, idx))

        if not scored:
            return []

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:max_candidates]

        return [
            self._make_candidate(idx, score=round(score, 4), match_type="approximate")
            for score, idx in top
        ]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_path(dataset_path: "str | None") -> Path:
        """Resolve dataset path: explicit arg -> env var -> default."""
        raw = (
            dataset_path
            or os.environ.get(_ENV_DATASET_PATH)
        )
        if raw:
            p = Path(raw)
            if not p.is_absolute():
                p = Path.cwd() / p
            return p

        # Default path check: first try ./data/indian_medicine_data.json,
        # then check ./indian_medicine_data.json at workspace root if present.
        default_p = Path.cwd() / _DEFAULT_DATASET_PATH
        if not default_p.exists():
            root_p = Path.cwd() / "indian_medicine_data.json"
            if root_p.exists():
                return root_p
        return default_p

    @staticmethod
    def _load(path: Path) -> list:
        """Load the JSON file once.  Raises VocabularyProviderError on
        any filesystem or parse failure."""
        if not path.exists():
            raise VocabularyProviderError(
                "Indian Medicine Dataset not found at: {}\n"
                "Set the MEDICINE_DATASET_PATH environment variable to the "
                "correct path, e.g.:\n"
                "  MEDICINE_DATASET_PATH=./data/indian_medicine_data.json".format(path)
            )
        try:
            with path.open(encoding="utf-8") as fh:
                data = json.load(fh)
        except json.JSONDecodeError as exc:
            raise VocabularyProviderError(
                "Failed to parse Indian Medicine Dataset at {}: {}".format(path, exc)
            ) from exc
        except OSError as exc:
            raise VocabularyProviderError(
                "Could not read Indian Medicine Dataset at {}: {}".format(path, exc)
            ) from exc

        if not isinstance(data, list):
            raise VocabularyProviderError(
                "Expected a JSON array at the top level of {}, "
                "got {}.".format(path, type(data).__name__)
            )
        return data

    @staticmethod
    def _build_indexes(records: list) -> tuple:
        """
        Build four in-memory indexes from the record list.

        Indexes store integer positions into `records` -- not copies of
        the records themselves -- to avoid duplicating the dataset in RAM.

        name_index   : normalized_name  -> [record_index, ...]
        token_index  : word_token       -> {record_index, ...}
        comp_index   : composition_tok  -> {record_index, ...}
        manuf_index  : manuf_token      -> {record_index, ...}
        """
        name_index: dict = defaultdict(list)
        token_index: dict = defaultdict(set)
        comp_index: dict = defaultdict(set)
        manuf_index: dict = defaultdict(set)

        for i, rec in enumerate(records):
            # -- name --
            norm_name = _normalize(rec.get("name"))
            if norm_name:
                name_index[norm_name].append(i)
                for tok in _tokenize(norm_name):
                    token_index[tok].add(i)

            # -- compositions --
            for comp_field in ("short_composition1", "short_composition2"):
                norm_comp = _normalize(rec.get(comp_field))
                if norm_comp:
                    for tok in _tokenize(norm_comp):
                        comp_index[tok].add(i)
                        # also add to token_index so name + comp share the
                        # same pre-filter bucket
                        token_index[tok].add(i)

            # -- manufacturer --
            norm_manuf = _normalize(rec.get("manufacturer_name"))
            if norm_manuf:
                for tok in _tokenize(norm_manuf):
                    manuf_index[tok].add(i)

        # Convert defaultdicts to plain dicts for slightly faster lookup
        return (
            dict(name_index),
            dict(token_index),
            dict(comp_index),
            dict(manuf_index),
        )

    def _score_record(self, normalized_query: str, rec: dict) -> float:
        """
        Score a record against a normalized query string.

        Primary signal: name similarity (SequenceMatcher ratio).
        Token bonus: when the query is a single token that appears as the
        leading or only token in the medicine name, we add a large bonus.
        This handles short queries like "augmentin" that should rank
        "Augmentin 625 Duo Tablet" highly even though the full-name
        SequenceMatcher ratio is diluted by the dosage suffix.

        Secondary signal: composition similarity, capped below name score
        to prevent composition fields from outranking actual name matches.

        Context hints (diagnosis text) are intentionally NOT used here --
        this provider's scoring is name/composition evidence only, matching
        the ABDM provider's own design principle.
        """
        norm_name = _normalize(rec.get("name"))
        name_score = _similarity(normalized_query, norm_name)

        # Token-leading bonus: if the query is a short (1-3 token) phrase
        # and the medicine name starts with those tokens, boost the score.
        # Example: query="augmentin", name="augmentin 625 duo tablet"
        #   -> name starts with query token -> high confidence it is the right class.
        query_tokens = _tokenize(normalized_query)
        if query_tokens and norm_name:
            name_tokens = _tokenize(norm_name)
            # How many of the query tokens appear as a leading prefix of name tokens?
            match_count = 0
            for i, qt in enumerate(query_tokens):
                if i < len(name_tokens) and name_tokens[i] == qt:
                    match_count += 1
                else:
                    break
            if match_count > 0 and match_count == len(query_tokens):
                # All query tokens are a leading prefix of the name tokens.
                # Score: proportion of name explained, biased toward 1.0.
                token_score = 0.85 + 0.10 * (match_count / max(len(name_tokens), 1))
                name_score = max(name_score, min(token_score, 0.95))
            elif match_count > 0:
                # Partial prefix match
                token_score = 0.80 + 0.05 * (match_count / max(len(name_tokens), 1))
                name_score = max(name_score, min(token_score, 0.90))

        best = name_score

        # Composition match -- useful for generic/INN lookups.
        # Cap composition score below name score so composition
        # substring matches don't outrank real name matches.
        for comp_field in ("short_composition1", "short_composition2"):
            norm_comp = _normalize(rec.get(comp_field))
            if norm_comp:
                s = _similarity(normalized_query, norm_comp)
                # Composition score is capped at 0.80 to stay below a
                # genuine name match; only helps when name score is low.
                s = min(s, 0.80)
                if s > best:
                    best = s

        return best

    def _make_candidate(
        self, idx: int, score: float, match_type: str
    ) -> VocabularyCandidate:
        """
        Build a VocabularyCandidate from a record index.

        The `record` dict exposed to the matcher contains all dataset
        fields with their ORIGINAL values (not the normalized search keys).
        This lets the matcher access manufacturer_name, pack_size_label,
        Is_discontinued, etc.
        """
        rec = self._records[idx]
        return VocabularyCandidate(
            name=rec.get("name") or "",
            code=str(rec.get("id")) if rec.get("id") is not None else None,
            score=score,
            match_type=match_type,
            record={
                "id": rec.get("id"),
                "name": rec.get("name"),
                "price": rec.get("price(\u20b9)"),
                "Is_discontinued": rec.get("Is_discontinued"),
                "manufacturer_name": rec.get("manufacturer_name"),
                "type": rec.get("type"),
                "pack_size_label": rec.get("pack_size_label"),
                "short_composition1": rec.get("short_composition1"),
                "short_composition2": rec.get("short_composition2"),
                # source provenance
                "_provider": self.name,
                "_dataset": "junioralive/Indian-Medicine-Dataset",
            },
        )

    # ------------------------------------------------------------------
    # Diagnostic / introspection
    # ------------------------------------------------------------------

    @property
    def record_count(self) -> int:
        """Total number of records loaded from the dataset."""
        return len(self._records)

    @property
    def init_time_seconds(self) -> float:
        """Wall-clock seconds taken to load and index the dataset."""
        return self._init_time_seconds
