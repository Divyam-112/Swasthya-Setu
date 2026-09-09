"""
Step 6 output contract: rule-based lab report validation.

Deliberately NOT an LLM judgment call — when a valid reference range is
present, HIGH/LOW/NORMAL is pure arithmetic against it. No medical claim
is made beyond "this number is inside/outside the range the report itself
printed."
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class AbnormalStatus(str, Enum):
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    LOW = "LOW"
    UNKNOWN = "UNKNOWN"  # no usable reference range, or a non-numeric result we won't guess at


class ParsedReferenceRange(BaseModel):
    """What we could parse out of a reference_range string. Everything
    optional — a range we can't confidently parse stays all-None rather
    than guessing at bounds."""

    low: Optional[float] = None
    high: Optional[float] = None
    comparator: Optional[str] = None  # "<", "<=", ">", ">=" for one-sided ranges
    raw_text: Optional[str] = None
    parseable: bool = False


class ValidatedLabTest(BaseModel):
    test_name: Optional[str] = None
    value: Optional[str] = None            # verbatim, as extracted
    unit: Optional[str] = None
    reference_range: Optional[str] = None  # verbatim
    parsed_reference_range: Optional[ParsedReferenceRange] = None
    numeric_value: Optional[float] = None
    is_non_numeric_result: bool = False    # e.g. "Positive" / "Reactive"
    abnormal_status: AbnormalStatus = AbnormalStatus.UNKNOWN
    confidence: Optional[float] = None
    needs_verification: bool = True
    reasons: list[str] = Field(default_factory=list)
    source_text: Optional[str] = None


class ValidatedLabReport(BaseModel):
    tests: list[ValidatedLabTest] = Field(default_factory=list)
