from __future__ import annotations

from document_ai.ocr.schemas import OCRResult

from .client import ExtractionClient
from .common import extract_with_model
from .schemas import PrescriptionExtraction


def extract_prescription(ocr_result: OCRResult, client: ExtractionClient) -> PrescriptionExtraction:
    return extract_with_model(ocr_result.full_text(), PrescriptionExtraction, "prescription", client)
