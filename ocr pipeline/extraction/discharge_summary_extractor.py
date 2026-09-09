from __future__ import annotations

from document_ai.ocr.schemas import OCRResult

from .client import ExtractionClient
from .common import extract_with_model
from .schemas import DischargeSummaryExtraction


def extract_discharge_summary(ocr_result: OCRResult, client: ExtractionClient) -> DischargeSummaryExtraction:
    return extract_with_model(ocr_result.full_text(), DischargeSummaryExtraction, "discharge_summary", client)
