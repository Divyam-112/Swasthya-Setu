from difflib import SequenceMatcher

from document_ai.medicine.confidence import MedicineMatchThresholds
from document_ai.medicine.normalizer import clean_medicine_name, normalize_medicine
from document_ai.medicine.providers.base import VocabularyCandidate, VocabularyProviderError
from document_ai.medicine.schemas import ConfidenceLevel


class FakeVocabProvider:
    """In-memory stand-in for RxNormProvider — exact + approximate lookups
    against a small fixed vocabulary, no network."""

    name = "FakeVocab"

    def __init__(self, vocab: dict[str, str]):
        # vocab: {canonical_name: code}
        self.vocab = vocab

    def exact_lookup(self, cleaned_name: str):
        for canonical, code in self.vocab.items():
            if canonical.lower() == cleaned_name.lower():
                return VocabularyCandidate(name=canonical, code=code, score=1.0, match_type="exact")
        return None

    def approximate_lookup(self, cleaned_name: str, max_candidates: int = 5):
        scored = []
        for canonical, code in self.vocab.items():
            sim = SequenceMatcher(a=cleaned_name.lower(), b=canonical.lower()).ratio()
            scored.append(VocabularyCandidate(name=canonical, code=code, score=sim, match_type="approximate"))
        scored.sort(key=lambda c: c.score, reverse=True)
        return scored[:max_candidates]


class FailingProvider:
    name = "FailingVocab"

    def exact_lookup(self, cleaned_name: str):
        raise VocabularyProviderError("simulated network failure")

    def approximate_lookup(self, cleaned_name: str, max_candidates: int = 5):
        raise VocabularyProviderError("simulated network failure")


class EmptyProvider:
    """Provider reachable but with nothing close in its vocabulary."""

    name = "EmptyVocab"

    def exact_lookup(self, cleaned_name: str):
        return None

    def approximate_lookup(self, cleaned_name: str, max_candidates: int = 5):
        return []


VOCAB = FakeVocabProvider({
    "Paracetamol": "RX1",
    "Ranitidine": "RX2",
    "Azithromycin": "RX3",
    "Ibuprofen": "RX4",
    "Amoxicillin": "RX5",
})


def test_exact_match():
    result = normalize_medicine("Paracetamol", VOCAB)
    assert result.vocabulary_normalized == "Paracetamol"
    assert result.vocabulary_code == "RX1"
    assert result.confidence_level == ConfidenceLevel.HIGH
    assert result.needs_verification is False


def test_normalized_match_case_and_whitespace():
    result = normalize_medicine("  paracetamol   ", VOCAB)
    assert result.vocabulary_normalized == "Paracetamol"


def test_misspelling_is_a_weak_candidate_not_a_silent_correction():
    """'Rantidine' must never silently become 'Ranitidine' in raw_name —
    it can only ever appear as a candidate, gated by score."""
    result = normalize_medicine("Rantidine", VOCAB)
    assert result.raw_name == "Rantidine"  # never mutated
    assert result.candidates, "should generate at least one candidate"
    assert result.candidates[0].name == "Ranitidine"
    # raw_name is never touched regardless of how confident the candidate is.
    assert result.raw_name != result.candidates[0].name or result.raw_name == "Rantidine"
    # It may or may not clear the auto-normalize threshold — either way,
    # vocabulary_normalized (if set) must be a SEPARATE field, never a
    # rewrite of raw_name, and it must trace back to a scored candidate.
    if result.vocabulary_normalized is not None:
        assert result.vocabulary_normalized == "Ranitidine"
        assert result.match_score is not None
    else:
        assert result.needs_verification is True


def test_abbreviation_does_not_falsely_match():
    result = normalize_medicine("Amx", VOCAB)
    # short abbreviations should not be blindly promoted to a full name
    assert result.raw_name == "Amx"
    if result.vocabulary_normalized is not None:
        assert result.confidence_level in (ConfidenceLevel.MEDIUM, ConfidenceLevel.HIGH)
    else:
        assert result.needs_verification is True


def test_indian_brand_name_with_no_generic_match_stays_unverified():
    """'Dolo 650' isn't in our (tiny) vocab — this simulates a real Indian
    brand name a small local vocabulary doesn't cover."""
    result = normalize_medicine("Dolo 650", VOCAB)
    assert result.vocabulary_normalized is None
    assert result.needs_verification is True


def test_garbage_ocr_is_never_forced_into_a_match():
    for garbage in ["gr snne", "gr mxw", "gr xperor"]:
        result = normalize_medicine(garbage, VOCAB)
        assert result.vocabulary_normalized is None, f"{garbage!r} must not be force-matched"
        assert result.needs_verification is True
        assert result.match_score is None


def test_empty_string_input():
    result = normalize_medicine("", VOCAB)
    assert result.vocabulary_normalized is None
    assert result.needs_verification is True
    assert "empty_or_unreadable_name" in result.reasons


def test_ambiguous_medicine_multiple_close_candidates_kept_visible():
    vocab = FakeVocabProvider({"Cef 500": "RXA", "Cef 250": "RXB", "Cif 500": "RXC"})
    result = normalize_medicine("Cef500", vocab)
    assert len(result.candidates) >= 2
    # ambiguity itself doesn't force a pick; whichever wins must still be gated by score


def test_vlm_and_vocabulary_agreement():
    result = normalize_medicine("Paracetamol", VOCAB, vlm_normalized="Paracetamol")
    assert result.agreement is True
    assert result.needs_verification is False


def test_vlm_and_vocabulary_disagreement_preserves_both():
    result = normalize_medicine("Paracetamol", VOCAB, vlm_normalized="Ibuprofen")
    assert result.vlm_normalized == "Ibuprofen"
    assert result.vocabulary_normalized == "Paracetamol"
    assert result.agreement is False
    assert result.needs_verification is True
    assert "vlm_vocabulary_disagreement" in result.reasons


def test_provider_failure_does_not_crash_and_requires_verification():
    result = normalize_medicine("Paracetamol", FailingProvider())
    assert result.vocabulary_normalized is None
    assert result.needs_verification is True
    assert "provider_unavailable" in result.reasons


def test_no_candidate_available_from_reachable_provider():
    result = normalize_medicine("Paracetamol", EmptyProvider())
    assert result.vocabulary_normalized is None
    assert result.needs_verification is True
    assert "no_candidate" in result.reasons


def test_multiple_candidates_sorted_best_first():
    result = normalize_medicine("Amoxicilin", VOCAB)  # one-letter typo
    assert len(result.candidates) > 1
    scores = [c.score for c in result.candidates]
    assert scores == sorted(scores, reverse=True)


def test_clean_medicine_name_strips_noise_only():
    assert clean_medicine_name("  Dolo 650.  ") == "Dolo 650"
    assert clean_medicine_name(None) == ""
    assert clean_medicine_name("") == ""


def test_custom_thresholds_are_respected():
    strict = MedicineMatchThresholds(normalize_min_score=0.999, review_min_score=0.9,
                                      high_confidence_min=0.999, medium_confidence_min=0.9,
                                      low_confidence_min=0.8)
    result = normalize_medicine("Paracetamol", VOCAB, thresholds=strict)
    # exact match still scores 1.0, so it should still clear even a strict bar
    assert result.vocabulary_normalized == "Paracetamol"
