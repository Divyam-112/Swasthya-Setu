"""
Safety audit — end-to-end pipeline tests.

Section 23 of the project context ("current priority") lists open safety
questions that need answering before more architecture is added. Unit
tests elsewhere already cover most of these at the component level (see
medicine/tests/test_medicine.py, medicine/tests/test_verification.py).

What's missing is END-TO-END coverage: proof that the safety properties
survive real wiring through process_document() / run_module_b_pipeline(),
not just in an isolated function call. A component-level guarantee can
still leak if two correctly-behaving pieces are wired together wrong.

Each test below is named after the section-23 question it answers.
"""

from __future__ import annotations

from pathlib import Path

from document_ai.interactions.checker import check_interactions
from document_ai.interactions.providers.base import PairInteractionResult
from document_ai.medicine.providers.base import VocabularyCandidate
from document_ai.medicine.schemas import ConfidenceLevel
from document_ai.ocr.base import OCRProvider
from document_ai.ocr.schemas import OCRResult, OCRStatus, Page
from document_ai.pipeline.module_b import process_document
from document_ai.pipeline.orchestration import PipelineConfig
from document_ai.pipeline.schemas import PipelineStatus

FIXTURES = Path(__file__).parent.parent.parent / "pipeline" / "tests" / "fixtures"


class FakeOCRProvider(OCRProvider):
    """Returns fixed text/confidence regardless of input — lets a test
    simulate exactly what a real OCR call (Gemini or otherwise) might
    hand back, including a suspiciously high self-reported confidence
    on text that is actually garbage."""

    name = "fake_ocr"

    def __init__(self, text: str, confidence: float | None = 0.9):
        self.text = text
        self.confidence = confidence

    def transcribe(self, file_path: Path, document_id: str | None = None) -> OCRResult:
        return OCRResult(
            document_id=document_id or "doc",
            provider=self.name,
            ocr_status=OCRStatus.SUCCESS,
            pages=[Page(page_number=1, raw_text=self.text, confidence=self.confidence)],
        )


class FakeExtractionClient:
    """Echoes a fixed structured-extraction response regardless of input,
    so a test can control exactly what 'medication.raw_name' the pipeline
    sees without depending on a real LLM extraction call."""

    def __init__(self, response: dict):
        self.response = response

    def extract(self, ocr_text, schema_json, document_type):
        return self.response


class NoMatchVocabProvider:
    """Reachable, but nothing in the vocabulary is close — the correct
    stand-in for 'Gemini hallucinated a plausible-looking string that
    isn't a real medicine'. This is NOT the same as a provider outage."""

    name = "NoMatchVocab"

    def exact_lookup(self, cleaned_name: str):
        return None

    def approximate_lookup(self, cleaned_name: str, max_candidates: int = 5):
        return []


class AlwaysFoundInteractionProvider:
    """If this were ever queried for an unconfirmed medicine, that would
    itself be the bug — it exists so a leaking test fails loudly (a real
    interaction result) instead of quietly (an absent one)."""

    name = "AlwaysFoundInteractionDB"

    def check_pair(self, drug_a: str, drug_b: str) -> PairInteractionResult:
        return PairInteractionResult(found=True, evidence="simulated — should never be reached")


def _field(value=None, confidence=0.9):
    return {"value": value, "confidence": confidence, "source_text": value, "needs_verification": value is None}


def _prescription_response(raw_names: list[str]) -> dict:
    return {
        "document_type": "prescription",
        "doctor": {"name": _field("Dr. Sharma"), "qualification": _field(), "registration_number": _field()},
        "hospital_clinic": _field("City Hospital"),
        "patient": {"name": _field("Ramesh"), "age": _field("45"), "sex": _field("M"), "patient_id": _field()},
        "prescription_date": _field("2025-05-12"),
        "diagnoses": [_field("Fever")],
        "medications": [
            {"raw_name": _field(name), "strength": _field(), "dosage_form": _field(),
             "dose": _field(), "route": _field(), "frequency": _field(), "duration": _field(),
             "timing": _field(), "instructions": _field()}
            for name in raw_names
        ],
        "additional_notes": _field(),
        "uncertain_fields": [],
    }


def _config(ocr_text: str, raw_medicine_names: list[str], ocr_confidence: float | None = 0.9) -> PipelineConfig:
    from document_ai.ocr.router import OCRRouter

    return PipelineConfig(
        ocr_router=OCRRouter(FakeOCRProvider(ocr_text, confidence=ocr_confidence)),
        extraction_client=FakeExtractionClient(_prescription_response(raw_medicine_names)),
        medicine_provider=NoMatchVocabProvider(),
        interaction_provider=AlwaysFoundInteractionProvider(),
    )


# --- Q1 / Q2: can hallucinated OCR reach normalization and become confirmed? ---

def test_hallucinated_plausible_medicine_name_never_confirmed_end_to_end(tmp_path):
    """A Gemini-style hallucination looks like a real medicine name (unlike
    obvious gibberish) — that's the actual danger case from section 9/10 of
    the project context ('Sehadil', 'Calintem'). Even a clean-looking
    plausible string must stay unconfirmed if nothing in the vocabulary
    actually matches it."""
    f = tmp_path / "rx.png"
    f.write_bytes(b"fake-image-bytes")

    config = _config(ocr_text="Tab Sehadil 1-0-1", raw_medicine_names=["Sehadil"])
    doc = process_document(f, config, document_type_hint="prescription")

    assert doc.extraction_model is not None
    assert len(doc.normalized_medicines) == 1
    med = doc.normalized_medicines[0]

    assert med.needs_verification is True
    assert med.confidence_level in (ConfidenceLevel.UNKNOWN, ConfidenceLevel.LOW)
    assert med.vocabulary_normalized is None, (
        "a hallucinated-but-plausible name must never be silently promoted "
        "to a confirmed vocabulary_normalized value"
    )
    # Raw evidence must be preserved verbatim, not discarded or corrected.
    assert med.raw_name == "Sehadil"


# --- Q5: can bad/uncertain OCR trigger a false drug interaction? ---

def test_two_unconfirmed_medicines_are_never_paired_for_interaction_checking(tmp_path):
    """Two hallucinated-looking names together are exactly the scenario
    interactions/checker.py's docstring calls out as the case a human
    reviewer most needs a NOT_CHECKED flag for. If AlwaysFoundInteractionProvider
    ever gets queried here, that's a wiring leak — the safety gate
    (vocabulary_normalized is not None AND needs_verification is False)
    should stop it before it reaches the provider at all."""
    f = tmp_path / "rx.png"
    f.write_bytes(b"fake-image-bytes")

    config = _config(
        ocr_text="Tab Sehadil 1-0-1, Tab Forenern ER 1-0-0",
        raw_medicine_names=["Sehadil", "Forenern ER"],
    )
    doc = process_document(f, config, document_type_hint="prescription")
    assert len(doc.normalized_medicines) == 2

    report = check_interactions(doc.normalized_medicines, config.interaction_provider)

    from document_ai.interactions.schemas import InteractionStatus
    assert len(report.interactions) == 1
    assert report.interactions[0].status == InteractionStatus.NOT_CHECKED
    assert all(i.status != InteractionStatus.POTENTIAL_INTERACTION for i in report.interactions)


# --- Q4: can self-reported OCR confidence bypass medicine verification? ---

def test_high_self_reported_ocr_confidence_does_not_bypass_medicine_verification(tmp_path):
    """Simulates Gemini reporting CONFIDENCE: 0.90 (as it did on the real
    handwriting test in section 9) on a page whose medicine name is still
    a hallucination. OCR-level confidence must have zero influence on
    medicine-matching confidence — matching runs its own independent
    scoring against the vocabulary, per medicine/confidence.py."""
    f = tmp_path / "rx.png"
    f.write_bytes(b"fake-image-bytes")

    config = _config(ocr_text="Tab Sehadil 1-0-1", raw_medicine_names=["Sehadil"], ocr_confidence=0.99)
    doc = process_document(f, config, document_type_hint="prescription")

    assert doc.ocr_result.average_confidence() == 0.99  # OCR really did self-report high confidence
    med = doc.normalized_medicines[0]
    assert med.needs_verification is True, (
        "high OCR self-reported confidence must never leak into and "
        "override the independent medicine-matching verification decision"
    )
    assert med.confidence_level != ConfidenceLevel.HIGH


# --- Q10: what happens when OCR transcription is empty? ---

def test_pipeline_handles_empty_ocr_transcription_without_crashing(tmp_path):
    """OCR can report SUCCESS with an empty page (e.g. a blank/corrupt scan).
    That must be surfaced as an explicit error, not silently proceed into
    extraction with nothing to extract from."""
    f = tmp_path / "blank.png"
    f.write_bytes(b"fake-image-bytes")

    config = _config(ocr_text="", raw_medicine_names=[])
    doc = process_document(f, config, document_type_hint="prescription")

    assert doc.extraction_model is None
    assert any("ocr_failed" in e for e in doc.errors)


# --- Q8: what happens when the vocabulary provider has no match? ---

def test_no_vocabulary_match_is_needs_verification_not_medicine_does_not_exist(tmp_path):
    """No RxNorm match must produce 'needs_verification', never a claim
    that the medicine doesn't exist — RxNorm is one candidate source, not
    ground truth (section 12 of the project context), and this must hold
    through the full pipeline, not just the matcher in isolation."""
    f = tmp_path / "rx.png"
    f.write_bytes(b"fake-image-bytes")

    config = _config(ocr_text="Tab IndianBrandXYZ 1-0-1", raw_medicine_names=["IndianBrandXYZ"])
    doc = process_document(f, config, document_type_hint="prescription")

    med = doc.normalized_medicines[0]
    assert med.needs_verification is True
    assert med.raw_name == "IndianBrandXYZ"  # not dropped, not rewritten
    assert "no_candidate" in med.reasons
