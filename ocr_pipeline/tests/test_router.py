from pathlib import Path

from document_ai.ocr.base import OCRProvider, OCRProviderError
from document_ai.ocr.router import OCRRouter
from document_ai.ocr.schemas import OCRResult, OCRStatus, Page


class StubProvider(OCRProvider):
    def __init__(self, name, result=None, raises=None):
        self.name = name
        self._result = result
        self._raises = raises
        self.called = False

    def transcribe(self, file_path: Path, document_id=None):
        self.called = True
        if self._raises:
            raise self._raises
        return self._result


def _result(provider, text, confidence, status=OCRStatus.SUCCESS):
    return OCRResult(
        document_id="doc1",
        provider=provider,
        ocr_status=status,
        pages=[Page(page_number=1, raw_text=text, confidence=confidence)],
    )


def test_uses_primary_when_confidence_is_acceptable(tmp_path):
    primary = StubProvider("primary", result=_result("primary", "clear text", 0.9))
    fallback = StubProvider("fallback", result=_result("fallback", "should not be used", 0.9))
    router = OCRRouter(providers=[primary, fallback], fallback_confidence_threshold=0.5)

    result = router.transcribe(tmp_path / "x.png")

    assert result.provider == "primary"
    assert fallback.called is False


def test_falls_back_when_primary_confidence_below_threshold(tmp_path):
    primary = StubProvider("primary", result=_result("primary", "scrawl", 0.2))
    fallback = StubProvider("fallback", result=_result("fallback", "vlm read", 0.8))
    router = OCRRouter(providers=[primary, fallback], fallback_confidence_threshold=0.5)

    result = router.transcribe(tmp_path / "x.png")

    assert result.provider == "fallback"
    assert fallback.called is True


def test_falls_back_when_primary_raises(tmp_path):
    primary = StubProvider("primary", raises=OCRProviderError("no credentials"))
    fallback = StubProvider("fallback", result=_result("fallback", "vlm read", 0.8))
    router = OCRRouter(providers=[primary, fallback], fallback_confidence_threshold=0.5)

    result = router.transcribe(tmp_path / "x.png")

    assert result.provider == "fallback"


def test_returns_primary_result_when_fallback_also_fails(tmp_path):
    primary = StubProvider("primary", result=_result("primary", "scrawl", 0.2))
    fallback = StubProvider("fallback", raises=OCRProviderError("api down"))
    router = OCRRouter(providers=[primary, fallback], fallback_confidence_threshold=0.5)

    result = router.transcribe(tmp_path / "x.png")

    assert result.provider == "primary"
    assert result.pages[0].raw_text == "scrawl"


def test_no_fallback_configured_returns_primary_regardless(tmp_path):
    primary = StubProvider("primary", result=_result("primary", "scrawl", 0.1))
    router = OCRRouter(providers=[primary], fallback_confidence_threshold=0.5)

    result = router.transcribe(tmp_path / "x.png")

    assert result.provider == "primary"


def test_empty_text_triggers_fallback_even_with_high_confidence(tmp_path):
    primary = StubProvider("primary", result=_result("primary", "", 0.99))
    fallback = StubProvider("fallback", result=_result("fallback", "actual text", 0.7))
    router = OCRRouter(providers=[primary, fallback], fallback_confidence_threshold=0.5)

    result = router.transcribe(tmp_path / "x.png")

    assert result.provider == "fallback"
