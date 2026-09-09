from __future__ import annotations

from document_ai.ocr.schemas import OCRResult

from .client import ExtractionClient
from .common import extract_with_model
from .schemas import LabReportExtraction


def extract_lab_report(ocr_result: OCRResult, client: ExtractionClient) -> LabReportExtraction:
    return extract_with_model(ocr_result.full_text(), LabReportExtraction, "lab_report", client)
