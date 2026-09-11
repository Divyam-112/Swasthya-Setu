"""
Tests for the Gemini OCR provider.

Uses mocked Gemini API responses. Tests NEVER call the real Gemini API.
All tests follow the same patterns as test_vlm.py and test_google_vision.py.
"""

import os
from types import SimpleNamespace

import pytest

from document_ai.ocr.base import OCRProviderError
from document_ai.ocr.gemini import (
    DEFAULT_GEMINI_MODEL,
    GEMINI_TRANSCRIPTION_PROMPT,
    GeminiOCRProvider,
    _split_confidence,
)
from document_ai.ocr.schemas import OCRStatus


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

class FakeGeminiResponse:
    """Mimics a google.genai GenerateContentResponse for testing."""

    def __init__(self, text: str | None = None, error: bool = False):
        self._text = text
        self._error = error

    @property
    def text(self):
        if self._error:
            raise ValueError("Response has no text (blocked or empty)")
        return self._text


class FakeGeminiClient:
    """Mimics a google.genai.Client for testing. Injected into the provider."""

    def __init__(self, response: FakeGeminiResponse | None = None, error: Exception | None = None):
        self._response = response
        self._error = error
        self.last_model = None
        self.last_contents = None
        self.models = self  # client.models.generate_content(...)

    def generate_content(self, model, contents):
        self.last_model = model
        self.last_contents = contents
        if self._error is not None:
            raise self._error
        return self._response


class FakeGeminiClientRateLimit(FakeGeminiClient):
    """Simulates a rate limit error on first calls, then succeeds."""

    def __init__(self, response: FakeGeminiResponse, fail_count: int = 1):
        super().__init__(response=response)
        self._fail_count = fail_count
        self._call_count = 0

    def generate_content(self, model, contents):
        self._call_count += 1
        if self._call_count <= self._fail_count:
            raise Exception("429 Resource exhausted: rate limit exceeded")
        return self._response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_provider(
    response_text="Dolo 650\n1 tablet\ntwice daily\nCONFIDENCE: 0.82",
    error=None,
    model=None,
    client=None,
):
    if client is None:
        if error is not None:
            client = FakeGeminiClient(error=error)
        else:
            client = FakeGeminiClient(response=FakeGeminiResponse(text=response_text))
    return GeminiOCRProvider(client=client, model=model or "test-gemini-model", max_retries=0)


# ---------------------------------------------------------------------------
# 1. Successful transcription
# ---------------------------------------------------------------------------

def test_successful_transcription(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    provider = _make_provider("Dolo 650\n1 tablet\ntwice daily\nCONFIDENCE: 0.82")
    result = provider.transcribe(image_path, document_id="doc1")

    assert result.ocr_status == OCRStatus.SUCCESS
    assert result.provider == "gemini"
    assert "Dolo 650" in result.full_text()
    assert "1 tablet" in result.full_text()
    assert "CONFIDENCE" not in result.full_text()  # stripped from transcription
    assert result.pages[0].confidence == pytest.approx(0.82)
    assert result.document_id == "doc1"
    assert result.processing_time_seconds is not None


# ---------------------------------------------------------------------------
# 2. Empty response
# ---------------------------------------------------------------------------

def test_empty_response_returns_partial(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    provider = _make_provider("")
    result = provider.transcribe(image_path, document_id="doc1")

    assert result.ocr_status == OCRStatus.PARTIAL
    assert "no_text_detected" in result.pages[0].warnings


# ---------------------------------------------------------------------------
# 3. Malformed response
# ---------------------------------------------------------------------------

def test_malformed_response_raises(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    client = FakeGeminiClient(response=FakeGeminiResponse(error=True))
    provider = GeminiOCRProvider(client=client, model="test", max_retries=0)

    with pytest.raises(OCRProviderError, match="malformed response"):
        provider.transcribe(image_path)


# ---------------------------------------------------------------------------
# 4. Missing API key
# ---------------------------------------------------------------------------

def test_missing_api_key_raises(tmp_path, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    provider = GeminiOCRProvider()  # no injected client, no api_key

    with pytest.raises(OCRProviderError, match="GEMINI_API_KEY"):
        provider.transcribe(image_path)


# ---------------------------------------------------------------------------
# 5. Authentication / API error
# ---------------------------------------------------------------------------

def test_auth_error_raises(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    provider = _make_provider(error=Exception("invalid api key: unauthorized"))

    with pytest.raises(OCRProviderError, match="authentication"):
        provider.transcribe(image_path)


# ---------------------------------------------------------------------------
# 6. Rate-limit error
# ---------------------------------------------------------------------------

def test_rate_limit_error_raises(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    provider = _make_provider(error=Exception("quota exhausted: 429 Resource_exhausted"))

    with pytest.raises(OCRProviderError, match="rate limit|quota"):
        provider.transcribe(image_path)


# ---------------------------------------------------------------------------
# 7. Transient / network error
# ---------------------------------------------------------------------------

def test_network_error_raises(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    provider = _make_provider(error=ConnectionError("network unreachable"))

    with pytest.raises(OCRProviderError, match="failed"):
        provider.transcribe(image_path)


# ---------------------------------------------------------------------------
# 8. Timeout (via error message)
# ---------------------------------------------------------------------------

def test_timeout_error_raises(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    provider = _make_provider(error=Exception("deadline exceeded: timeout"))

    with pytest.raises(OCRProviderError, match="timeout"):
        provider.transcribe(image_path)


# ---------------------------------------------------------------------------
# 9. [UNREADABLE] handling
# ---------------------------------------------------------------------------

def test_unreadable_marker_adds_warning(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    provider = _make_provider("Dolo [UNREADABLE]\n1 tablet\nCONFIDENCE: 0.45")
    result = provider.transcribe(image_path)

    assert "contains_unreadable_regions" in result.pages[0].warnings
    assert "low_confidence" in result.pages[0].warnings
    assert "[UNREADABLE]" in result.full_text()


# ---------------------------------------------------------------------------
# 10. Medicine text preserved without normalization
# ---------------------------------------------------------------------------

def test_medicine_text_preserved_without_normalization(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    # The provider should preserve "Rantidine" exactly — NOT correct to "Ranitidine"
    provider = _make_provider("Rantidine 150mg\n1-0-1\nCONFIDENCE: 0.8")
    result = provider.transcribe(image_path)

    assert "Rantidine" in result.full_text()
    assert "Ranitidine" not in result.full_text()


# ---------------------------------------------------------------------------
# 11. Numeric dosage preserved
# ---------------------------------------------------------------------------

def test_numeric_dosage_preserved(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    provider = _make_provider("Paracetamol 650mg\nDose: 1.5 tablets\n1-0-1 x 5 days\nCONFIDENCE: 0.9")
    result = provider.transcribe(image_path)

    text = result.full_text()
    assert "650mg" in text
    assert "1.5 tablets" in text
    assert "1-0-1 x 5 days" in text


# ---------------------------------------------------------------------------
# 12. Lab values preserved
# ---------------------------------------------------------------------------

def test_lab_values_preserved(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    provider = _make_provider("Hemoglobin: 13.5 g/dL\nReference Range: 12-16 g/dL\nCONFIDENCE: 0.88")
    result = provider.transcribe(image_path)

    text = result.full_text()
    assert "13.5 g/dL" in text
    assert "12-16 g/dL" in text


# ---------------------------------------------------------------------------
# 13. Dates preserved
# ---------------------------------------------------------------------------

def test_dates_preserved(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    provider = _make_provider("Date: 15/08/2025\nFollow-up: 22-08-2025\nCONFIDENCE: 0.85")
    result = provider.transcribe(image_path)

    text = result.full_text()
    assert "15/08/2025" in text
    assert "22-08-2025" in text


# ---------------------------------------------------------------------------
# 14. No medical inference in provider logic
# ---------------------------------------------------------------------------

def test_prompt_never_asks_for_medical_inference():
    """Guardrail: the prompt must explicitly forbid medical inference."""
    prompt = GEMINI_TRANSCRIPTION_PROMPT.lower()
    assert "never infer a medicine solely from disease" in prompt

def test_prompt_forbids_medicine_correction():
    """'Rantid...' must NOT be auto-completed to 'Ranitidine' by the prompt."""
    prompt = GEMINI_TRANSCRIPTION_PROMPT.lower()
    assert "never silently correct" in prompt or "never normalize" in prompt


# ---------------------------------------------------------------------------
# 15. Provider conforms to existing OCR interface
# ---------------------------------------------------------------------------

def test_provider_inherits_ocr_provider():
    from document_ai.ocr.base import OCRProvider
    assert issubclass(GeminiOCRProvider, OCRProvider)


def test_provider_has_correct_name():
    provider = _make_provider()
    assert provider.name == "gemini"


# ---------------------------------------------------------------------------
# 16. Configuration selects Gemini
# ---------------------------------------------------------------------------

def test_config_selects_gemini_when_key_set(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key-for-test")
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    from document_ai.pipeline.orchestration import _build_ocr_router
    router = _build_ocr_router()

    assert router is not None
    assert router.primary.name == "gemini"
    assert router.fallback is None


# ---------------------------------------------------------------------------
# 18. Existing OCR router still works
# ---------------------------------------------------------------------------

def test_ocr_router_works_with_gemini_as_primary(tmp_path):
    from document_ai.ocr.router import OCRRouter

    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-image-bytes")

    primary = _make_provider("Dolo 650\nCONFIDENCE: 0.9")
    router = OCRRouter(primary, fallback=None)
    result = router.transcribe(image_path)

    assert result.ocr_status == OCRStatus.SUCCESS
    assert "Dolo 650" in result.full_text()


# ---------------------------------------------------------------------------
# 19. Packet verification still works with Gemini provider
# ---------------------------------------------------------------------------

def test_packet_verification_works_with_gemini_provider(tmp_path):
    """Gemini provider produces OCRResult compatible with packet verification."""
    from document_ai.medicine.verification import extract_packet_text

    image_path = tmp_path / "packet.png"
    image_path.write_bytes(b"fake-packet-bytes")

    provider = _make_provider("Paracetamol 500mg\nMFG: 01/2025\nEXP: 01/2027\nLOT: AB123\nCONFIDENCE: 0.85")
    result = provider.transcribe(image_path)

    # The OCR text should be processable by extract_packet_text
    candidate_lines = extract_packet_text(result.full_text())
    assert "Paracetamol 500mg" in candidate_lines
    # Noise lines should be filtered by the packet verification module
    assert not any("MFG" in line for line in candidate_lines)
    assert not any("EXP" in line for line in candidate_lines)


# ---------------------------------------------------------------------------
# Confidence parsing
# ---------------------------------------------------------------------------

def test_split_confidence_parses_correctly():
    text, conf = _split_confidence("Hello world\nCONFIDENCE: 0.72")
    assert text == "Hello world"
    assert conf == pytest.approx(0.72)


def test_split_confidence_missing_line():
    text, conf = _split_confidence("Hello world\nNo confidence here")
    assert text == "Hello world\nNo confidence here"
    assert conf is None


def test_split_confidence_empty_input():
    text, conf = _split_confidence("")
    assert text == ""
    assert conf is None


def test_split_confidence_none_is_not_fabricated():
    """If Gemini doesn't report confidence, we must NOT invent one."""
    text, conf = _split_confidence("Just some text")
    assert conf is None


def test_split_confidence_clamps_to_0_1():
    _, conf = _split_confidence("text\nCONFIDENCE: 1.5")
    assert conf == 1.0
    _, conf = _split_confidence("text\nCONFIDENCE: -0.3")
    assert conf == 0.0


# ---------------------------------------------------------------------------
# File handling
# ---------------------------------------------------------------------------

def test_unsupported_file_type_raises(tmp_path):
    bad_path = tmp_path / "rx.tiff"
    bad_path.write_bytes(b"fake-bytes")
    provider = _make_provider()

    with pytest.raises(OCRProviderError, match="Unsupported"):
        provider.transcribe(bad_path)


def test_missing_file_raises(tmp_path):
    provider = _make_provider()

    with pytest.raises(OCRProviderError, match="Could not read"):
        provider.transcribe(tmp_path / "does_not_exist.png")


def test_empty_file_raises(tmp_path):
    empty_path = tmp_path / "empty.png"
    empty_path.write_bytes(b"")
    provider = _make_provider()

    with pytest.raises(OCRProviderError, match="empty"):
        provider.transcribe(empty_path)


def test_pdf_file_type_supported(tmp_path):
    pdf_path = tmp_path / "doc.pdf"
    pdf_path.write_bytes(b"fake-pdf-bytes")

    provider = _make_provider("Page 1 text\nCONFIDENCE: 0.9")
    result = provider.transcribe(pdf_path)

    assert result.ocr_status == OCRStatus.SUCCESS
    assert "Page 1 text" in result.full_text()


# ---------------------------------------------------------------------------
# Model configuration
# ---------------------------------------------------------------------------

def test_model_configurable_via_env(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "gemini-2.5-pro")
    provider = GeminiOCRProvider(client=FakeGeminiClient(
        response=FakeGeminiResponse(text="test\nCONFIDENCE: 0.9")
    ))
    assert provider._model == "gemini-2.5-pro"


def test_model_default():
    provider = GeminiOCRProvider(client=FakeGeminiClient(
        response=FakeGeminiResponse(text="test")
    ))
    assert provider._model == DEFAULT_GEMINI_MODEL


def test_model_passed_to_api(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-bytes")

    client = FakeGeminiClient(response=FakeGeminiResponse(text="text\nCONFIDENCE: 0.9"))
    provider = GeminiOCRProvider(client=client, model="custom-model-123")
    provider.transcribe(image_path)

    assert client.last_model == "custom-model-123"


# ---------------------------------------------------------------------------
# Retry behavior
# ---------------------------------------------------------------------------

def test_retries_on_transient_error(tmp_path):
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-bytes")

    client = FakeGeminiClientRateLimit(
        response=FakeGeminiResponse(text="recovered text\nCONFIDENCE: 0.7"),
        fail_count=1,
    )
    provider = GeminiOCRProvider(client=client, model="test", max_retries=2)
    result = provider.transcribe(image_path)

    assert result.ocr_status == OCRStatus.SUCCESS
    assert "recovered text" in result.full_text()


def test_no_retry_on_auth_error(tmp_path):
    """Authentication errors must NOT be retried indefinitely."""
    image_path = tmp_path / "rx.png"
    image_path.write_bytes(b"fake-bytes")

    provider = GeminiOCRProvider(
        client=FakeGeminiClient(error=Exception("invalid api key")),
        model="test",
        max_retries=3,  # should not matter — auth errors exit immediately
    )

    with pytest.raises(OCRProviderError, match="authentication"):
        provider.transcribe(image_path)
