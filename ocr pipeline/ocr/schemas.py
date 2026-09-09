"""
OCR result schema (Step 2 output contract).

Design rule: providers only populate fields they can actually produce.
Never invent a confidence score, bounding box, or language a provider
did not give us — leave it as None instead of faking precision.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional
import uuid


class OCRStatus(str, Enum):
    SUCCESS = "success"
    PARTIAL = "partial"          # some pages/regions failed, some succeeded
    FAILED = "failed"            # provider could not process the document at all


class DocumentType(str, Enum):
    PRESCRIPTION = "prescription"
    LAB_REPORT = "lab_report"
    DISCHARGE_SUMMARY = "discharge_summary"
    UNKNOWN = "unknown"


@dataclass
class Word:
    text: str
    confidence: Optional[float] = None          # 0.0-1.0, provider-native scale
    bounding_box: Optional[list[list[float]]] = None  # [[x,y], [x,y], [x,y], [x,y]] or None


@dataclass
class Paragraph:
    text: str
    words: list[Word] = field(default_factory=list)
    confidence: Optional[float] = None


@dataclass
class Block:
    paragraphs: list[Paragraph] = field(default_factory=list)
    block_type: Optional[str] = None   # e.g. "TEXT", "TABLE" — provider-native label, not inferred


@dataclass
class Page:
    page_number: int
    raw_text: str                                 # the single most important field downstream depends on
    language: Optional[str] = None                # BCP-47 if provider gives it, else None
    confidence: Optional[float] = None             # page-level average, only if provider supports it
    blocks: list[Block] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)   # e.g. "low_confidence", "possible_skew"


@dataclass
class OCRResult:
    document_id: str
    provider: str                                  # "google_vision" | "vlm:<model_name>" | "qwen"
    ocr_status: OCRStatus
    pages: list[Page] = field(default_factory=list)
    document_type_hint: DocumentType = DocumentType.UNKNOWN  # hint only — NOT a classification decision
    processing_time_seconds: Optional[float] = None
    error: Optional[str] = None                    # populated when ocr_status != SUCCESS

    @staticmethod
    def new_id() -> str:
        return str(uuid.uuid4())

    def to_dict(self) -> dict:
        d = asdict(self)
        d["ocr_status"] = self.ocr_status.value
        d["document_type_hint"] = self.document_type_hint.value
        return d

    def full_text(self) -> str:
        """Convenience: all pages' raw text concatenated, in page order."""
        return "\n\n".join(p.raw_text for p in sorted(self.pages, key=lambda p: p.page_number))

    def average_confidence(self) -> Optional[float]:
        confidences = [p.confidence for p in self.pages if p.confidence is not None]
        if not confidences:
            return None
        return sum(confidences) / len(confidences)
