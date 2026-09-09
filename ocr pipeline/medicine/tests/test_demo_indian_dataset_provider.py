"""
Tests for DemoIndianMedicineDatasetProvider.

Test strategy
-------------
- Tests A-O use a TINY IN-MEMORY TEST FIXTURE (see _FIXTURE_RECORDS below).
  This keeps unit tests fast, hermetic, and runnable in CI without the
  92 MB dataset on disk.

- Tests that require the real 92 MB dataset are decorated with
  @pytest.mark.realdata and skipped unless the environment variable
  MEDICINE_DATASET_PATH points to a readable indian_medicine_data.json.
  The skip message tells the tester exactly how to enable them.

  To run real-data tests:
      MEDICINE_DATASET_PATH=./data/indian_medicine_data.json pytest -m realdata

TEST FIXTURE LABEL
------------------
  _FIXTURE_RECORDS below is a TEST FIXTURE -- a tiny synthetic list of
  medicine records shaped like the real dataset.  It is used ONLY in unit
  tests and must never be used as runtime medicine data.
"""

from __future__ import annotations

import os
import time

import pytest

from document_ai.medicine.providers.base import VocabularyProviderError
from document_ai.medicine.providers.demo_indian_dataset import (
    DemoIndianMedicineDatasetProvider,
    _normalize,
    _tokenize,
)

# ---------------------------------------------------------------------------
# TEST FIXTURE  -- NOT production data, NOT the real dataset.
# ---------------------------------------------------------------------------
_FIXTURE_RECORDS = [
    {
        "id": 1,
        "name": "Paracetamol 500mg Tablet",
        "price(\u20b9)": 12.5,
        "Is_discontinued": False,
        "manufacturer_name": "Cipla Ltd",
        "type": "allopathy",
        "pack_size_label": "strip of 10 tablets",
        "short_composition1": "Paracetamol (500mg)",
        "short_composition2": None,
    },
    {
        "id": 2,
        "name": "Augmentin 625 Duo Tablet",
        "price(\u20b9)": 210.0,
        "Is_discontinued": False,
        "manufacturer_name": "GlaxoSmithKline Pharmaceuticals Ltd",
        "type": "allopathy",
        "pack_size_label": "strip of 10 tablets",
        "short_composition1": "Amoxycillin (500mg)",
        "short_composition2": "Clavulanic Acid (125mg)",
    },
    {
        "id": 3,
        "name": "Metformin 500 MG Tablet",
        "price(\u20b9)": 25.0,
        "Is_discontinued": False,
        "manufacturer_name": "Sun Pharmaceutical Industries Ltd",
        "type": "allopathy",
        "pack_size_label": "strip of 10 tablets",
        "short_composition1": "Metformin (500mg)",
        "short_composition2": None,
    },
    {
        "id": 4,
        "name": "Discontinex 100mg Tablet",
        "price(\u20b9)": 55.0,
        "Is_discontinued": True,   # <-- discontinued
        "manufacturer_name": "TestPharma Ltd",
        "type": "allopathy",
        "pack_size_label": "strip of 10 tablets",
        "short_composition1": "Discontinexol (100mg)",
        "short_composition2": None,
    },
    {
        "id": 5,
        "name": "Amoxicillin 250mg Capsule",
        "price(\u20b9)": 35.0,
        "Is_discontinued": False,
        "manufacturer_name": "Alkem Laboratories Ltd",
        "type": "allopathy",
        "pack_size_label": "strip of 10 capsules",
        "short_composition1": "Amoxycillin (250mg)",
        "short_composition2": None,
    },
]


def _fixture_provider() -> DemoIndianMedicineDatasetProvider:
    """Return a provider initialised from the TEST FIXTURE, bypassing
    file I/O by patching _records and rebuilding indexes."""
    p = object.__new__(DemoIndianMedicineDatasetProvider)
    p._records = _FIXTURE_RECORDS
    p._dataset_path = "<test-fixture>"
    p._init_time_seconds = 0.0
    (
        p._name_index,
        p._token_index,
        p._comp_index,
        p._manuf_index,
    ) = DemoIndianMedicineDatasetProvider._build_indexes(_FIXTURE_RECORDS)
    return p


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _real_dataset_available() -> bool:
    path_env = os.environ.get("MEDICINE_DATASET_PATH", "./data/indian_medicine_data.json")
    import pathlib
    p = pathlib.Path(path_env)
    if not p.is_absolute():
        p = pathlib.Path.cwd() / p
    return p.exists()


realdata = pytest.mark.skipif(
    not _real_dataset_available(),
    reason=(
        "Real 92 MB dataset not found. "
        "Set MEDICINE_DATASET_PATH=./data/indian_medicine_data.json to enable."
    ),
)


# ===========================================================================
# A: Provider initialises successfully with the JSON dataset.
# ===========================================================================
class TestA_Initialization:

    def test_fixture_init_succeeds(self):
        """A: Provider initialises successfully with the TEST FIXTURE."""
        p = _fixture_provider()
        assert p.record_count == len(_FIXTURE_RECORDS)

    @realdata
    def test_real_dataset_init_succeeds(self):
        """A: Provider initialises successfully with the real 92 MB JSON."""
        p = DemoIndianMedicineDatasetProvider()
        assert p.record_count > 200_000, "Expected >200k records in the real dataset"


# ===========================================================================
# B: Missing dataset path produces a clear error.
# ===========================================================================
class TestB_MissingDataset:

    def test_missing_path_raises_vocabulary_provider_error(self, tmp_path):
        """B: Missing dataset path raises VocabularyProviderError with helpful message."""
        bad_path = str(tmp_path / "nonexistent_medicine_data.json")
        with pytest.raises(VocabularyProviderError) as exc_info:
            DemoIndianMedicineDatasetProvider(dataset_path=bad_path)
        assert "MEDICINE_DATASET_PATH" in str(exc_info.value)

    def test_error_message_mentions_path(self, tmp_path):
        """B: Error message includes the path that was tried."""
        bad_path = str(tmp_path / "missing.json")
        with pytest.raises(VocabularyProviderError) as exc_info:
            DemoIndianMedicineDatasetProvider(dataset_path=bad_path)
        assert "missing.json" in str(exc_info.value)


# ===========================================================================
# C: Exact name lookup.
# ===========================================================================
class TestC_ExactNameLookup:

    def test_exact_match_found(self):
        """C: Exact normalized name lookup returns the correct candidate."""
        p = _fixture_provider()
        result = p.exact_lookup("Paracetamol 500mg Tablet")
        assert result is not None
        assert result.name == "Paracetamol 500mg Tablet"
        assert result.score == 1.0
        assert result.match_type == "exact"

    def test_exact_match_returns_none_for_unknown(self):
        """C: Exact lookup returns None for a name not in the dataset."""
        p = _fixture_provider()
        result = p.exact_lookup("Completely Unknown Medicine XYZ")
        assert result is None


# ===========================================================================
# D: Case-insensitive lookup.
# ===========================================================================
class TestD_CaseInsensitive:

    def test_lowercase_query_matches(self):
        """D: Lowercase query matches a mixed-case dataset entry."""
        p = _fixture_provider()
        result = p.exact_lookup("paracetamol 500mg tablet")
        assert result is not None
        assert result.name == "Paracetamol 500mg Tablet"

    def test_uppercase_query_matches(self):
        """D: Uppercase query matches a mixed-case dataset entry."""
        p = _fixture_provider()
        result = p.exact_lookup("PARACETAMOL 500MG TABLET")
        assert result is not None

    def test_mixed_case_query_matches(self):
        """D: Mixed-case query matches correctly."""
        p = _fixture_provider()
        result = p.exact_lookup("pArAcEtAmOl 500mg Tablet")
        assert result is not None


# ===========================================================================
# E: Whitespace normalization.
# ===========================================================================
class TestE_WhitespaceNormalization:

    def test_leading_trailing_whitespace_stripped(self):
        """E: Leading and trailing whitespace is stripped before lookup."""
        p = _fixture_provider()
        result = p.exact_lookup("  Paracetamol 500mg Tablet  ")
        assert result is not None

    def test_internal_repeated_whitespace_collapsed(self):
        """E: Internal repeated whitespace is collapsed before lookup."""
        p = _fixture_provider()
        result = p.exact_lookup("Paracetamol  500mg   Tablet")
        assert result is not None

    def test_normalize_function_directly(self):
        """E: _normalize produces expected output for whitespace cases."""
        assert _normalize("  Augmentin 625 Duo Tablet  ") == "augmentin 625 duo tablet"
        assert _normalize("a   b   c") == "a b c"
        assert _normalize("") == ""
        assert _normalize(None) == ""


# ===========================================================================
# F: OCR typo / fuzzy lookup.
# ===========================================================================
class TestF_FuzzyOcrTypo:

    def test_ocr_typo_paracetmol(self):
        """F: 'paracetmol' (OCR typo) is fuzzily matched to Paracetamol."""
        p = _fixture_provider()
        # typo: missing 'a'
        candidates = p.approximate_lookup("Paracetmol 500mg Tablet")
        assert candidates, "Expected at least one candidate for OCR typo"
        names = [c.name for c in candidates]
        assert any("Paracetamol" in n for n in names), (
            "Expected 'Paracetamol ...' in candidates, got: {}".format(names)
        )

    def test_fuzzy_augmentin_typo(self):
        """F: 'Augmentin625' (missing space) finds a candidate."""
        p = _fixture_provider()
        candidates = p.approximate_lookup("Augmentin625 Duo Tablet")
        assert candidates, "Expected at least one candidate"

    def test_fuzzy_does_not_invent_medicines(self):
        """F: A clearly unrelated query returns no candidates."""
        p = _fixture_provider()
        candidates = p.approximate_lookup("zzzzqqqwwwxxx999")
        assert candidates == [], (
            "Provider must not invent medicine matches for garbage input"
        )


# ===========================================================================
# G: No-match query.
# ===========================================================================
class TestG_NoMatch:

    def test_exact_lookup_returns_none(self):
        """G: Exact lookup with no match returns None."""
        p = _fixture_provider()
        result = p.exact_lookup("Nonexistex Zygophenol 800mg")
        assert result is None

    def test_approximate_lookup_returns_empty_list(self):
        """G: Approximate lookup with no match returns empty list."""
        p = _fixture_provider()
        results = p.approximate_lookup("xyzunknowndrugabc")
        assert results == []


# ===========================================================================
# H: Multiple candidates are ranked.
# ===========================================================================
class TestH_MultipleRankedCandidates:

    def test_candidates_sorted_best_first(self):
        """H: Multiple candidates are returned sorted by score descending."""
        p = _fixture_provider()
        # "Amoxicillin" should match both Augmentin (contains Amoxycillin)
        # and Amoxicillin directly -- multiple candidates possible.
        candidates = p.approximate_lookup("Amoxicillin", max_candidates=5)
        if len(candidates) > 1:
            scores = [c.score for c in candidates]
            assert scores == sorted(scores, reverse=True), (
                "Candidates must be sorted best-first. Got: {}".format(scores)
            )

    def test_max_candidates_respected(self):
        """H: Number of returned candidates does not exceed max_candidates."""
        p = _fixture_provider()
        candidates = p.approximate_lookup("Paracetamol 500mg Tablet", max_candidates=2)
        assert len(candidates) <= 2


# ===========================================================================
# I: Manufacturer information is preserved.
# ===========================================================================
class TestI_ManufacturerPreserved:

    def test_manufacturer_in_candidate_record(self):
        """I: Manufacturer information is preserved in the candidate record."""
        p = _fixture_provider()
        result = p.exact_lookup("Paracetamol 500mg Tablet")
        assert result is not None
        assert result.record.get("manufacturer_name") == "Cipla Ltd"

    def test_manufacturer_is_original_value(self):
        """I: The manufacturer value is the original dataset string, not normalized."""
        p = _fixture_provider()
        result = p.exact_lookup("Augmentin 625 Duo Tablet")
        assert result is not None
        assert result.record.get("manufacturer_name") == "GlaxoSmithKline Pharmaceuticals Ltd"


# ===========================================================================
# J: Composition information is preserved.
# ===========================================================================
class TestJ_CompositionPreserved:

    def test_composition1_in_record(self):
        """J: short_composition1 is preserved in the candidate record."""
        p = _fixture_provider()
        result = p.exact_lookup("Augmentin 625 Duo Tablet")
        assert result is not None
        assert result.record.get("short_composition1") == "Amoxycillin (500mg)"

    def test_composition2_in_record(self):
        """J: short_composition2 is preserved in the candidate record."""
        p = _fixture_provider()
        result = p.exact_lookup("Augmentin 625 Duo Tablet")
        assert result is not None
        assert result.record.get("short_composition2") == "Clavulanic Acid (125mg)"

    def test_composition_none_preserved_as_none(self):
        """J: A None composition is preserved as None, not converted."""
        p = _fixture_provider()
        result = p.exact_lookup("Paracetamol 500mg Tablet")
        assert result is not None
        assert result.record.get("short_composition2") is None


# ===========================================================================
# K: Discontinued status is preserved.
# ===========================================================================
class TestK_DiscontinuedPreserved:

    def test_discontinued_true_is_returned(self):
        """K: Is_discontinued=True is preserved and returned to the caller."""
        p = _fixture_provider()
        result = p.exact_lookup("Discontinex 100mg Tablet")
        assert result is not None
        assert result.record.get("Is_discontinued") is True

    def test_discontinued_false_is_returned(self):
        """K: Is_discontinued=False is also preserved (not stripped)."""
        p = _fixture_provider()
        result = p.exact_lookup("Paracetamol 500mg Tablet")
        assert result is not None
        assert result.record.get("Is_discontinued") is False

    def test_discontinued_record_is_not_silently_deleted(self):
        """K: Discontinued medicines appear in approximate search results."""
        p = _fixture_provider()
        candidates = p.approximate_lookup("Discontinex 100mg Tablet")
        statuses = [c.record.get("Is_discontinued") for c in candidates]
        # The discontinued record must be findable -- caller decides what to do
        assert True in statuses or any(
            "discontinex" in c.name.lower() for c in candidates
        ), "Discontinued record must not be silently omitted"


# ===========================================================================
# L: Original dataset name is preserved.
# ===========================================================================
class TestL_OriginalNamePreserved:

    def test_original_name_in_candidate(self):
        """L: candidate.name is the original dataset name, not the normalized key."""
        p = _fixture_provider()
        result = p.exact_lookup("paracetamol 500mg tablet")
        assert result is not None
        # Original name has capitalisation
        assert result.name == "Paracetamol 500mg Tablet"

    def test_original_name_in_record_field(self):
        """L: record['name'] also holds the original value."""
        p = _fixture_provider()
        result = p.exact_lookup("augmentin 625 duo tablet")
        assert result is not None
        assert result.record.get("name") == "Augmentin 625 Duo Tablet"


# ===========================================================================
# M: Provider does not invent records.
# ===========================================================================
class TestM_NoInvention:

    def test_fever_does_not_produce_paracetamol(self):
        """M: Searching for 'fever' (a diagnosis) must not return paracetamol."""
        p = _fixture_provider()
        candidates = p.approximate_lookup("fever")
        names = [c.name.lower() for c in candidates]
        assert not any("paracetamol" in n for n in names), (
            "Provider must not invent medicine-diagnosis associations"
        )

    def test_unknown_query_returns_empty(self):
        """M: A completely unknown query string returns no candidates."""
        p = _fixture_provider()
        candidates = p.approximate_lookup("supercalifragilisticexpialidocious")
        assert candidates == []


# ===========================================================================
# N: Dataset is loaded once rather than once per lookup.
# ===========================================================================
class TestN_LoadedOnce:

    def test_records_reference_identity_stable(self):
        """N: The same _records list object is referenced across multiple lookups."""
        p = _fixture_provider()
        id1 = id(p._records)
        p.exact_lookup("Paracetamol 500mg Tablet")
        p.approximate_lookup("Metformin")
        p.exact_lookup("Augmentin 625 Duo Tablet")
        id2 = id(p._records)
        assert id1 == id2, "Provider must not reload the dataset on every lookup"

    def test_index_reference_identity_stable(self):
        """N: The index dicts are built once at init and not rebuilt on lookup."""
        p = _fixture_provider()
        idx_id_before = id(p._name_index)
        p.approximate_lookup("Paracetamol 500mg Tablet")
        idx_id_after = id(p._name_index)
        assert idx_id_before == idx_id_after


# ===========================================================================
# O: Empty / null query is handled safely.
# ===========================================================================
class TestO_EmptyNullQuery:

    def test_exact_lookup_empty_string(self):
        """O: exact_lookup('') returns None without raising."""
        p = _fixture_provider()
        assert p.exact_lookup("") is None

    def test_exact_lookup_whitespace_only(self):
        """O: exact_lookup('   ') returns None without raising."""
        p = _fixture_provider()
        assert p.exact_lookup("   ") is None

    def test_approximate_lookup_empty_string(self):
        """O: approximate_lookup('') returns [] without raising."""
        p = _fixture_provider()
        assert p.approximate_lookup("") == []

    def test_approximate_lookup_whitespace_only(self):
        """O: approximate_lookup('   ') returns [] without raising."""
        p = _fixture_provider()
        assert p.approximate_lookup("   ") == []


# ===========================================================================
# Real-data tests (require MEDICINE_DATASET_PATH to point to actual dataset)
# ===========================================================================

# Module-level fixture to avoid pytest class-scoped instance method deprecation.
# (See: https://docs.pytest.org/en/stable/deprecations.html#class-scoped-fixture-as-instance-method)
@pytest.fixture(scope="module")
def real_provider():
    """Single instance of the real-data provider, shared across all TestRealData tests."""
    return DemoIndianMedicineDatasetProvider()


@realdata
class TestRealData:
    """
    Integration tests against the real 92 MB indian_medicine_data.json.

    Run with:
        MEDICINE_DATASET_PATH=./data/indian_medicine_data.json pytest medicine/tests/test_demo_indian_dataset_provider.py -v
    """

    def test_real_record_count(self, real_provider):
        """Real dataset has >200k records."""
        assert real_provider.record_count > 200_000

    def test_init_timing_reported(self, real_provider):
        """Init time is recorded and positive."""
        assert real_provider.init_time_seconds > 0.0

    def test_paracetamol_lookup(self, real_provider):
        """
        Paracetamol lookup finds at least one candidate whose name contains
        'Paracetamol' (case-insensitive).

        The real dataset stores full brand names like 'Paracetamol Tablet',
        'Paracetamol 500mg Tablet', etc.  We expect the leading-token bonus
        in _score_record to rank these at the top.
        """
        result = real_provider.exact_lookup("Paracetamol Tablet")
        if result is not None:
            assert "Paracetamol" in result.name
        else:
            candidates = real_provider.approximate_lookup("Paracetamol", max_candidates=5)
            assert candidates, "Expected candidates for 'Paracetamol'"
            names_lower = [c.name.lower() for c in candidates]
            assert any("paracetamol" in n for n in names_lower), (
                "Expected at least one candidate with 'paracetamol' in name, "
                "got: {}".format([c.name for c in candidates])
            )

    def test_augmentin_approximate_lookup(self, real_provider):
        """Augmentin approximate lookup finds a candidate."""
        candidates = real_provider.approximate_lookup("Augmentin 625 Duo Tablet", max_candidates=5)
        assert candidates, "Expected candidates for 'Augmentin 625 Duo Tablet'"
        assert any("Augmentin" in c.name or "augmentin" in c.name.lower() for c in candidates)

    def test_metformin_lookup(self, real_provider):
        """Metformin lookup finds a candidate."""
        result = real_provider.exact_lookup("Metformin 500 MG Tablet")
        if result is None:
            candidates = real_provider.approximate_lookup("Metformin", max_candidates=5)
            assert candidates, "Expected candidates for 'Metformin'"

    def test_paracetmol_typo_fuzzy(self, real_provider):
        """'paracetmol' (OCR typo for paracetamol) finds a fuzzy candidate."""
        candidates = real_provider.approximate_lookup("paracetmol", max_candidates=5)
        assert candidates, "Expected at least one fuzzy candidate for 'paracetmol'"
        names = [c.name.lower() for c in candidates]
        assert any("paracetamol" in n for n in names), (
            "Expected 'paracetamol' in fuzzy results, got: {}".format(names)
        )

    def test_lookup_timing(self, real_provider):
        """Repeated lookup after init is fast (< 5 seconds per query)."""
        t0 = time.perf_counter()
        real_provider.approximate_lookup("Paracetamol", max_candidates=5)
        elapsed = time.perf_counter() - t0
        assert elapsed < 5.0, (
            "Lookup took {:.3f}s; expected < 5s after init".format(elapsed)
        )

    def test_manufacturer_preserved_real(self, real_provider):
        """Manufacturer information is preserved on a real record."""
        candidates = real_provider.approximate_lookup("Augmentin 625 Duo Tablet", max_candidates=1)
        if candidates:
            assert candidates[0].record.get("manufacturer_name") is not None

    def test_composition_preserved_real(self, real_provider):
        """Composition information is preserved on a real record."""
        candidates = real_provider.approximate_lookup("Augmentin 625 Duo Tablet", max_candidates=1)
        if candidates:
            rec = candidates[0].record
            has_comp = (
                rec.get("short_composition1") is not None
                or rec.get("short_composition2") is not None
            )
            assert has_comp, "Expected at least one composition field to be non-None"

    def test_discontinued_status_preserved_real(self, real_provider):
        """Is_discontinued field is always present in returned records."""
        candidates = real_provider.approximate_lookup("Paracetamol", max_candidates=5)
        for c in candidates:
            assert "Is_discontinued" in c.record, (
                "Is_discontinued must be in every returned record"
            )
