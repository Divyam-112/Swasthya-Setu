"""
Step 7 output contract: chronological organization of medical events
across prescriptions, lab reports, and discharge summaries.

Hard rule carried through from the spec: never invent a date. Every event
either has a real ISO date recovered from the document, or it doesn't —
in which case it stays undated and visibly flagged, not silently dropped
and not guessed at.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class EventType(str, Enum):
    PRESCRIPTION = "prescription"
    LAB_REPORT = "lab_report"
    DISCHARGE_SUMMARY = "discharge_summary"
    PROCEDURE = "procedure"


class DateConfidence(str, Enum):
    EXACT = "EXACT"          # unambiguous format (ISO, or DD/MM with day > 12)
    INFERRED = "INFERRED"    # parsed under an assumed convention (e.g. DD/MM/YYYY when day <= 12) or natural-language
    UNKNOWN = "UNKNOWN"      # missing or unparseable — no date is invented


class DatePrecision(str, Enum):
    DAY = "DAY"      # full day-level date resolved
    MONTH = "MONTH"  # only month + year were present in the source text — day is genuinely unknown, never guessed
    UNKNOWN = "UNKNOWN"  # nothing usable resolved


class ParsedDate(BaseModel):
    iso_date: Optional[str] = None  # "YYYY-MM-DD" when precision=DAY, "YYYY-MM" when precision=MONTH
    confidence: DateConfidence = DateConfidence.UNKNOWN
    precision: DatePrecision = DatePrecision.UNKNOWN
    ambiguous: bool = False
    raw_text: Optional[str] = None


class TimelineEvent(BaseModel):
    event_type: EventType
    event_date: Optional[str] = None       # ISO date (or "YYYY-MM" for month-only), when resolved
    event_date_raw: Optional[str] = None
    date_confidence: DateConfidence = DateConfidence.UNKNOWN
    date_precision: DatePrecision = DatePrecision.UNKNOWN
    document_date: Optional[str] = None    # secondary date when distinguishable (e.g. admission vs discharge)
    source_document_id: Optional[str] = None
    needs_verification: bool = True
    summary: Optional[str] = None          # short human-readable label, not a diagnosis/inference
    related_fields: list[str] = Field(default_factory=list)  # dotted paths back into the source extraction


class TimelineResult(BaseModel):
    dated_events: list[TimelineEvent] = Field(default_factory=list)   # sorted chronologically ascending
    undated_events: list[TimelineEvent] = Field(default_factory=list)  # date missing/unparseable
