"""
Safe parsing of reference-range strings and numeric lab values.

Supported reference formats (per spec):
  10-20 / 10 - 20 / 10–20 (en dash) / 10—20 (em dash) / 10 to 20
  < 5 / <= 5 / > 10 / >= 10

Anything that doesn't cleanly match one of these shapes is left
unparsed (parseable=False) rather than guessed at.
"""

from __future__ import annotations

import re

from .schemas import ParsedReferenceRange

_NUM = r"-?\d+(?:,\d{3})*(?:\.\d+)?"

_BETWEEN_RE = re.compile(
    rf"^\s*({_NUM})\s*(?:-|–|—|to)\s*({_NUM})\s*$", re.IGNORECASE
)
_COMPARATOR_RE = re.compile(rf"^\s*(<=|>=|<|>)\s*({_NUM})\s*$")

# Non-numeric qualitative results a lab may report instead of a number.
# We recognize these ONLY to correctly route them to UNKNOWN/non-numeric
# handling — never to decide whether they're clinically normal.
NON_NUMERIC_RESULTS = {
    "positive", "negative", "reactive", "non-reactive", "nonreactive",
    "detected", "not detected", "present", "absent", "trace",
}


def _to_float(num_str: str) -> float | None:
    try:
        return float(num_str.replace(",", ""))
    except (TypeError, ValueError):
        return None


def parse_numeric_value(value_text: str | None) -> float | None:
    """Extracts a plain numeric value from an OCR'd result string. Returns
    None (not 0, not a guess) for anything that isn't cleanly numeric."""
    if not value_text:
        return None
    text = value_text.strip()
    match = re.fullmatch(_NUM, text)
    if not match:
        return None
    return _to_float(text)


def is_non_numeric_result(value_text: str | None) -> bool:
    if not value_text:
        return False
    return value_text.strip().lower() in NON_NUMERIC_RESULTS


def parse_reference_range(range_text: str | None) -> ParsedReferenceRange:
    if not range_text or not range_text.strip():
        return ParsedReferenceRange(raw_text=range_text, parseable=False)

    text = range_text.strip()

    between = _BETWEEN_RE.match(text)
    if between:
        low = _to_float(between.group(1))
        high = _to_float(between.group(2))
        if low is not None and high is not None:
            if low > high:
                low, high = high, low
            return ParsedReferenceRange(low=low, high=high, raw_text=range_text, parseable=True)

    comparator = _COMPARATOR_RE.match(text)
    if comparator:
        op, num_str = comparator.group(1), comparator.group(2)
        num = _to_float(num_str)
        if num is not None:
            if op in ("<", "<="):
                return ParsedReferenceRange(high=num, comparator=op, raw_text=range_text, parseable=True)
            else:
                return ParsedReferenceRange(low=num, comparator=op, raw_text=range_text, parseable=True)

    return ParsedReferenceRange(raw_text=range_text, parseable=False)
