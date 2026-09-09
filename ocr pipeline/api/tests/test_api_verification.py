"""Tests for the medicine verification API endpoint.

Uses FastAPI TestClient with in-memory fakes. No external API calls.
"""

import base64

import pytest
from fastapi.testclient import TestClient

from document_ai.api.main import app, get_config
from document_ai.medicine.schemas import NormalizedMedicine, ConfidenceLevel
from document_ai.medicine.providers.base import VocabularyCandidate, VocabularyProviderError
from document_ai.ocr.base import OCRProvider
from document_ai.ocr.router import OCRRouter
from document_ai.ocr.schemas import OCRResult, OCRStatus, Page
from document_ai.pipeline.orchestration import PipelineConfig
from document_ai.storage.memory import InMemoryStateStore
from document_ai.storage.schemas import StoredMedicine


class FakePacketOCR(OCRProvider):
    name = "fake_packet_ocr"

    def __init__(self, text: str = "Paracetamol 500mg"):
        self._text = text

    def transcribe(self, file_path, document_id=None):
        return OCRResult(
            document_id=document_id or "pkt",
            provider=self.name,
            ocr_status=OCRStatus.SUCCESS,
            pages=[Page(page_number=1, raw_text=self._text, confidence=0.9)],
        )


class FakePacketMedicineProvider:
    name = "FakeVocab"

    def __init__(self, match_name="Paracetamol", match_code="RX1"):
        self._match_name = match_name
        self._match_code = match_code

    def exact_lookup(self, cleaned_name: str):
        if cleaned_name.lower() == self._match_name.lower():
            return VocabularyCandidate(
                name=self._match_name, code=self._match_code, score=1.0, match_type="exact"
            )
        return None

    def approximate_lookup(self, cleaned_name: str, max_candidates=5):
        from difflib import SequenceMatcher
        sim = SequenceMatcher(a=cleaned_name.lower(), b=self._match_name.lower()).ratio()
        if sim > 0.4:
            return [VocabularyCandidate(
                name=self._match_name, code=self._match_code, score=sim, match_type="approximate"
            )]
        return []


def _make_config(ocr_text="Paracetamol 500mg", match_name="Paracetamol", match_code="RX1"):
    store = InMemoryStateStore()
    ocr = FakePacketOCR(text=ocr_text)
    router = OCRRouter(ocr, None, fallback_confidence_threshold=0.0)
    return PipelineConfig(
        ocr_router=router,
        extraction_client=None,
        medicine_provider=FakePacketMedicineProvider(match_name, match_code),
        state_store=store,
    ), store


def _store_medicine(store, medicine_id="med-1", raw_name="Paracetamol",
                    vocab_normalized="Paracetamol", vocab_code="RX1"):
    med = StoredMedicine(
        medicine_id=medicine_id,
        document_id="doc-1",
        normalized_medicine=NormalizedMedicine(
            raw_name=raw_name,
            vocabulary_normalized=vocab_normalized,
            vocabulary_code=vocab_code,
            needs_verification=True,
            confidence_level=ConfidenceLevel.LOW,
        ),
    )
    store.save_medicine(med)
    return med


def _fake_image_b64():
    """A minimal valid base64 string (not a real image, but enough for fake OCR)."""
    return base64.b64encode(b"fake-packet-image-bytes").decode()


def test_verification_missing_medicine_id_returns_404():
    config, store = _make_config()
    app.dependency_overrides[get_config] = lambda: config
    client = TestClient(app)
    try:
        response = client.post("/module-b/medicine-verification", json={
            "medicine_id": "nonexistent",
            "packet_image_base64": _fake_image_b64(),
        })
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_verification_no_store_returns_503():
    config = PipelineConfig(ocr_router=None, extraction_client=None, state_store=None)
    app.dependency_overrides[get_config] = lambda: config
    client = TestClient(app)
    try:
        response = client.post("/module-b/medicine-verification", json={
            "medicine_id": "med-1",
            "packet_image_base64": _fake_image_b64(),
        })
        assert response.status_code == 503
    finally:
        app.dependency_overrides.clear()


def test_verification_agree_returns_verified():
    config, store = _make_config(ocr_text="Paracetamol 500mg", match_name="Paracetamol", match_code="RX1")
    _store_medicine(store, vocab_normalized="Paracetamol", vocab_code="RX1")
    app.dependency_overrides[get_config] = lambda: config
    client = TestClient(app)
    try:
        response = client.post("/module-b/medicine-verification", json={
            "medicine_id": "med-1",
            "packet_image_base64": _fake_image_b64(),
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "PATIENT_VERIFIED"
        assert data["needs_verification"] is False
        assert data["verified_name"] == "Paracetamol"
    finally:
        app.dependency_overrides.clear()


def test_verification_disagree_returns_conflict():
    config, store = _make_config(ocr_text="Ibuprofen 400mg", match_name="Ibuprofen", match_code="RX4")
    _store_medicine(store, raw_name="Paracetamol", vocab_normalized="Paracetamol", vocab_code="RX1")
    app.dependency_overrides[get_config] = lambda: config
    client = TestClient(app)
    try:
        response = client.post("/module-b/medicine-verification", json={
            "medicine_id": "med-1",
            "packet_image_base64": _fake_image_b64(),
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "CONFLICT"
        assert data["needs_verification"] is True
        assert data["reason"] == "prescription_packet_mismatch"
    finally:
        app.dependency_overrides.clear()


def test_verification_preserves_original_raw_name():
    config, store = _make_config(ocr_text="Paracetamol 500mg", match_name="Paracetamol", match_code="RX1")
    _store_medicine(store, raw_name="Parcetmol", vocab_normalized="Paracetamol", vocab_code="RX1")
    app.dependency_overrides[get_config] = lambda: config
    client = TestClient(app)
    try:
        response = client.post("/module-b/medicine-verification", json={
            "medicine_id": "med-1",
            "packet_image_base64": _fake_image_b64(),
        })
        assert response.status_code == 200
        # Check the stored medicine still has original raw_name
        stored = store.get_medicine("med-1")
        assert stored.normalized_medicine.raw_name == "Parcetmol"
    finally:
        app.dependency_overrides.clear()


def test_verification_invalid_base64_returns_400():
    config, store = _make_config()
    _store_medicine(store)
    app.dependency_overrides[get_config] = lambda: config
    client = TestClient(app)
    try:
        response = client.post("/module-b/medicine-verification", json={
            "medicine_id": "med-1",
            "packet_image_base64": "!!!not-valid-base64!!!",
        })
        assert response.status_code == 400
    finally:
        app.dependency_overrides.clear()
