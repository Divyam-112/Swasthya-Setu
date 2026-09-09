"""
Tests for the ABDM Drug Registry provider and the ABDM-first/local-fallback
router. All HTTP calls mocked — no live network to drugregistrysbx.abdm.gov.in
anywhere in this file, matching this project's convention for every
external-API provider.
"""

from unittest.mock import MagicMock, patch

import pytest

from document_ai.medicine.providers.abdm import ABDMDrugRegistryProvider, normalize_abdm_record
from document_ai.medicine.providers.base import VocabularyProviderError
from document_ai.medicine.providers.indian_medicine import IndianMedicineProvider, LocalBenchmarkProvider
from document_ai.medicine.providers.router import ABDMWithLocalFallbackProvider


PARACETAMOL_RECORD = {
    "brandIdentifier": "BR-001",
    "brandName": "Para Para (paracetamol) 650 mg oral tablet",
    "genericIdentifier": "GEN-010",
    "genericName": "Acetaminophen 650 mg oral tablet",
    "indication": "used for pain and fever",
    "contraIndication": "liver disease",
    "supplierIdentifier": "SUP-01",
    "supplierName": "Perk Pharmaceuticals Limited",
    "substanceIdentifier": ["SUB-01"],
    "substanceName": ["Acetaminophen"],
    "routeOfAdministrationIdentifier": ["ROA-01"],
    "routeOfAdministrationName": "Oral route",
    "drugFormIdentifier": "DF-01",
    "doseForm": "Oral tablet",
    "alternativeDrugs": [],
    "matchedFields": ["genericName"],
}


def _fake_response(drug_details: list[dict], status_ok: bool = True):
    resp = MagicMock()
    if status_ok:
        resp.raise_for_status.return_value = None
    else:
        import requests
        resp.raise_for_status.side_effect = requests.exceptions.HTTPError("500")
    resp.json.return_value = {"drugDetails": drug_details, "count": len(drug_details)}
    return resp


# ------------------------------------------------------------ mapping


def test_normalize_abdm_record_maps_every_confirmed_field():
    normalized = normalize_abdm_record(PARACETAMOL_RECORD)
    assert normalized["drug_code"] == "BR-001"
    assert normalized["brand_name"] == "Para Para (paracetamol) 650 mg oral tablet"
    assert normalized["generic_name"] == "Acetaminophen 650 mg oral tablet"
    assert normalized["manufacturer"] == "Perk Pharmaceuticals Limited"
    assert normalized["substance_names"] == ["Acetaminophen"]
    assert normalized["route"] == "Oral route"
    assert normalized["dosage_form"] == "Oral tablet"
    assert normalized["indication"] == "used for pain and fever"
    assert normalized["matched_fields"] == ["genericName"]
    # raw record preserved untouched, nothing lost even if not in the mapping table
    assert normalized["raw_abdm_record"] == PARACETAMOL_RECORD


def test_normalize_handles_singular_substance_name_gracefully():
    raw = dict(PARACETAMOL_RECORD)
    raw["substanceName"] = "Acetaminophen"  # singular, not a list, per real-world field variance
    normalized = normalize_abdm_record(raw)
    assert normalized["substance_names"] == ["Acetaminophen"]


# ------------------------------------------------------------ search / HTTP


def test_exact_lookup_matches_generic_name_case_insensitively():
    provider = ABDMDrugRegistryProvider()
    with patch("requests.get", return_value=_fake_response([PARACETAMOL_RECORD])):
        result = provider.exact_lookup("acetaminophen 650 mg oral tablet")
    assert result is not None
    assert result.match_type == "exact"
    assert result.score == 1.0
    assert result.record["raw_abdm_record"] == PARACETAMOL_RECORD


def test_exact_lookup_no_match_returns_none_not_error():
    provider = ABDMDrugRegistryProvider()
    with patch("requests.get", return_value=_fake_response([PARACETAMOL_RECORD])):
        result = provider.exact_lookup("completely different drug name")
    assert result is None


def test_approximate_lookup_scores_by_name_similarity_primarily():
    provider = ABDMDrugRegistryProvider()
    with patch("requests.get", return_value=_fake_response([PARACETAMOL_RECORD])):
        candidates = provider.approximate_lookup("paracetamol 650")
    assert len(candidates) == 1
    assert candidates[0].name == "Para Para (paracetamol) 650 mg oral tablet"
    assert candidates[0].score > 0.3


def test_no_results_returns_empty_list_not_error():
    provider = ABDMDrugRegistryProvider()
    with patch("requests.get", return_value=_fake_response([])):
        candidates = provider.approximate_lookup("nonexistent drug xyz")
    assert candidates == []


def test_multiple_results_are_ranked_and_capped():
    similar_record = dict(PARACETAMOL_RECORD)
    similar_record["brandName"] = "Totally unrelated brand name"
    similar_record["genericName"] = "Totally unrelated generic"
    with patch("requests.get", return_value=_fake_response([PARACETAMOL_RECORD, similar_record])):
        provider = ABDMDrugRegistryProvider()
        candidates = provider.approximate_lookup("paracetamol 650", max_candidates=1)
    assert len(candidates) == 1
    assert "paracetamol" in candidates[0].name.lower()


def test_http_failure_raises_provider_error_not_silent_empty():
    provider = ABDMDrugRegistryProvider()
    with patch("requests.get", return_value=_fake_response([], status_ok=False)):
        with pytest.raises(VocabularyProviderError):
            provider.approximate_lookup("paracetamol")


def test_network_timeout_raises_provider_error():
    provider = ABDMDrugRegistryProvider()
    with patch("requests.get", side_effect=TimeoutError("timed out")):
        with pytest.raises(VocabularyProviderError):
            provider.approximate_lookup("paracetamol")


def test_missing_drug_details_key_raises_provider_error():
    """Contract-change guard: if ABDM ever stops returning drugDetails,
    fail loudly rather than silently treating it as zero results."""
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {"unexpected_shape": True}
    provider = ABDMDrugRegistryProvider()
    with patch("requests.get", return_value=resp):
        with pytest.raises(VocabularyProviderError):
            provider.approximate_lookup("paracetamol")


def test_repeated_identical_query_uses_cache_not_a_second_request():
    provider = ABDMDrugRegistryProvider()
    with patch("requests.get", return_value=_fake_response([PARACETAMOL_RECORD])) as mock_get:
        provider.approximate_lookup("paracetamol")
        provider.approximate_lookup("Paracetamol")  # same query, different case
    assert mock_get.call_count == 1


def test_combination_medicine_result_is_handled_like_any_other_record():
    combo = dict(PARACETAMOL_RECORD)
    combo["genericName"] = "Paracetamol + Caffeine 650mg/50mg oral tablet"
    combo["substanceName"] = ["Acetaminophen", "Caffeine"]
    with patch("requests.get", return_value=_fake_response([combo])):
        provider = ABDMDrugRegistryProvider()
        candidates = provider.approximate_lookup("paracetamol caffeine")
    assert len(candidates) == 1
    assert candidates[0].record["substance_names"] == ["Acetaminophen", "Caffeine"]


def test_indication_context_hint_only_nudges_an_already_plausible_match():
    """Indication text must be supporting evidence only — a totally
    unrelated name shouldn't be pulled up just because the indication
    text happens to overlap with the context hint."""
    provider = ABDMDrugRegistryProvider()
    with patch("requests.get", return_value=_fake_response([PARACETAMOL_RECORD])):
        without_hint = provider.approximate_lookup("paracetamol 650")[0].score
        with_matching_hint = provider.approximate_lookup("paracetamol 650", context_hint="patient has fever")[0].score
    assert with_matching_hint >= without_hint
    assert with_matching_hint - without_hint == pytest.approx(0.05, abs=1e-6)  # capped, not primary


def test_indication_hint_alone_cannot_rescue_an_unrelated_name_match():
    unrelated = dict(PARACETAMOL_RECORD)
    unrelated["brandName"] = "Xyzquat 10mg"
    unrelated["genericName"] = "Xyzquatinib"
    unrelated["matchedFields"] = []  # a real unrelated result wouldn't carry the old record's matched fields
    with patch("requests.get", return_value=_fake_response([unrelated])):
        provider = ABDMDrugRegistryProvider()
        candidates = provider.approximate_lookup("totally different query string", context_hint="patient has fever")
    # name similarity is near zero regardless of the indication hint
    assert candidates == [] or candidates[0].score < 0.3


# ------------------------------------------------------------ router (ABDM-first, local fallback)


class _RaisingProvider:
    name = "raising"

    def exact_lookup(self, cleaned_name):
        raise VocabularyProviderError("simulated ABDM outage")

    def approximate_lookup(self, cleaned_name, max_candidates=5):
        raise VocabularyProviderError("simulated ABDM outage")


class _EmptyProvider:
    name = "empty"

    def exact_lookup(self, cleaned_name):
        return None

    def approximate_lookup(self, cleaned_name, max_candidates=5):
        return []


def test_router_prefers_abdm_when_available():
    with patch("requests.get", return_value=_fake_response([PARACETAMOL_RECORD])):
        router = ABDMWithLocalFallbackProvider(ABDMDrugRegistryProvider(), IndianMedicineProvider())
        candidates = router.approximate_lookup("paracetamol 650")
    assert candidates[0].name == "Para Para (paracetamol) 650 mg oral tablet"


def test_router_falls_back_to_local_when_abdm_provider_errors():
    router = ABDMWithLocalFallbackProvider(_RaisingProvider(), LocalBenchmarkProvider())
    candidates = router.approximate_lookup("Dolo 650")
    assert len(candidates) > 0
    assert candidates[0].name == "Dolo 650"


def test_router_falls_back_to_local_when_abdm_returns_no_candidates():
    router = ABDMWithLocalFallbackProvider(_EmptyProvider(), LocalBenchmarkProvider())
    candidates = router.approximate_lookup("Dolo 650")
    assert len(candidates) > 0


def test_router_exact_lookup_falls_back_on_abdm_error():
    router = ABDMWithLocalFallbackProvider(_RaisingProvider(), LocalBenchmarkProvider())
    result = router.exact_lookup("Dolo 650")
    assert result is not None
    assert result.name == "Dolo 650"


def test_router_never_raises_when_both_providers_fail_gracefully():
    """Local provider never raises (it's pure in-memory), so even a total
    ABDM outage still returns local's honest empty/no-match result rather
    than propagating an error up through the matcher."""
    router = ABDMWithLocalFallbackProvider(_RaisingProvider(), LocalBenchmarkProvider())
    candidates = router.approximate_lookup("completely unknown medicine xyz123")
    assert candidates == []
