"""
Tests OpenFDAProvider's parsing/decision logic directly, with `requests`
mocked — no live network call, matching the rest of this project's
convention for external-API providers.
"""

from unittest.mock import MagicMock, patch

import pytest

from document_ai.interactions.providers.base import InteractionProviderError
from document_ai.interactions.providers.openfda import OpenFDAProvider


def _fake_response(results: list[dict]):
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {"results": results}
    return resp


def test_finds_interaction_mentioned_in_drug_a_label():
    provider = OpenFDAProvider()
    responses = {
        "Warfarin": _fake_response([{"drug_interactions": ["Avoid concurrent use with Aspirin."]}]),
    }

    def fake_get(url, params, timeout):
        name = params["search"].split('"')[1]
        return responses.get(name, _fake_response([]))

    with patch("requests.get", side_effect=fake_get):
        result = provider.check_pair("Warfarin", "Aspirin")

    assert result.found is True
    assert "Warfarin's label" in result.evidence


def test_finds_interaction_mentioned_only_in_drug_b_label():
    """This is the bidirectionality fix: drug_a's own label says nothing,
    but drug_b's label documents the interaction with drug_a."""
    provider = OpenFDAProvider()
    responses = {
        "Aspirin": _fake_response([{"drug_interactions": ["No significant interactions listed."]}]),
        "Warfarin": _fake_response([{"drug_interactions": ["Increases bleeding risk with Aspirin."]}]),
    }

    def fake_get(url, params, timeout):
        name = params["search"].split('"')[1]
        return responses.get(name, _fake_response([]))

    with patch("requests.get", side_effect=fake_get):
        result = provider.check_pair("Aspirin", "Warfarin")

    assert result.found is True
    assert "Warfarin's label" in result.evidence


def test_no_mention_in_either_direction_returns_not_found():
    provider = OpenFDAProvider()
    responses = {
        "Paracetamol": _fake_response([{"drug_interactions": ["No known interactions."]}]),
        "Ibuprofen": _fake_response([{"drug_interactions": ["Use caution with other NSAIDs."]}]),
    }

    def fake_get(url, params, timeout):
        name = params["search"].split('"')[1]
        return responses.get(name, _fake_response([]))

    with patch("requests.get", side_effect=fake_get):
        result = provider.check_pair("Paracetamol", "Ibuprofen")

    assert result.found is False


def test_no_label_data_for_either_drug_is_not_found_not_an_error():
    provider = OpenFDAProvider()
    with patch("requests.get", return_value=_fake_response([])):
        result = provider.check_pair("UnknownDrugX", "UnknownDrugY")

    assert result.found is False


def test_network_failure_raises_provider_error_not_silent_false():
    provider = OpenFDAProvider()
    with patch("requests.get", side_effect=ConnectionError("network down")):
        with pytest.raises(InteractionProviderError):
            provider.check_pair("Warfarin", "Aspirin")
