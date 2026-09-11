import pytest

from document_ai.ocr.schemas import DocumentType, OCRResult, OCRStatus, Page


def test_full_text_orders_pages_correctly():
    result = OCRResult(
        document_id="doc1",
        provider="test",
        ocr_status=OCRStatus.SUCCESS,
        pages=[
            Page(page_number=2, raw_text="second"),
            Page(page_number=1, raw_text="first"),
        ],
    )
    assert result.full_text() == "first\n\nsecond"


def test_average_confidence_ignores_missing_values():
    result = OCRResult(
        document_id="doc1",
        provider="test",
        ocr_status=OCRStatus.SUCCESS,
        pages=[
            Page(page_number=1, raw_text="a", confidence=0.8),
            Page(page_number=2, raw_text="b", confidence=None),
            Page(page_number=3, raw_text="c", confidence=0.4),
        ],
    )
    assert result.average_confidence() == pytest.approx(0.6)


def test_average_confidence_none_when_no_provider_gave_one():
    result = OCRResult(
        document_id="doc1",
        provider="test",
        ocr_status=OCRStatus.SUCCESS,
        pages=[Page(page_number=1, raw_text="a", confidence=None)],
    )
    assert result.average_confidence() is None


def test_to_dict_serializes_enums_as_plain_strings():
    result = OCRResult(
        document_id="doc1",
        provider="test",
        ocr_status=OCRStatus.PARTIAL,
        document_type_hint=DocumentType.PRESCRIPTION,
        pages=[],
    )
    d = result.to_dict()
    assert d["ocr_status"] == "partial"
    assert d["document_type_hint"] == "prescription"
