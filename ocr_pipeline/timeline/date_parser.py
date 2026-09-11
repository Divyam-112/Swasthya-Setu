"""
Safe date parsing. Supports:
  YYYY-MM-DD
  DD/MM/YYYY, DD-MM-YYYY
  common natural-language forms: "12 May 2025", "May 12, 2025", "12th May 2025"
  month/year only: "2025-05", "05/2025", "May 2025"

DD/MM/YYYY is assumed over MM/DD/YYYY (Indian context) whenever the slash
form is itself ambiguous (both parts <= 12) — but that assumption is
recorded via DateConfidence.INFERRED and ambiguous=True, never presented
as certain. When day > 12, the format is unambiguous regardless of
convention and is EXACT.

Never invents a date: unparseable/missing input always returns
iso_date=None, confidence=UNKNOWN, precision=UNKNOWN.

Never invents a day either: if the source text only gives month + year,
the result stays at precision=MONTH with iso_date="YYYY-MM" — it does NOT
fabricate a day-of-month to force a full date.
"""

from __future__ import annotations

import re
from datetime import date

from .schemas import DateConfidence, DatePrecision, ParsedDate

_ISO_RE = re.compile(r"^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$")
_SLASH_OR_DASH_RE = re.compile(r"^\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s*$")

# Month/year only — day is genuinely absent from the source text, never guessed.
_ISO_MONTH_YEAR_RE = re.compile(r"^\s*(\d{4})-(\d{1,2})\s*$")
_SLASH_MONTH_YEAR_RE = re.compile(r"^\s*(\d{1,2})[/-](\d{4})\s*$")

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}

_NATURAL_DMY_RE = re.compile(
    r"^\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s+(\d{4})\s*$"
)
_NATURAL_MDY_RE = re.compile(
    r"^\s*([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\s*$"
)
# Must be tried only after DMY/MDY (both require a day token) fail, so a
# full "12 May 2025" never gets mis-parsed as month/year by accident.
_NATURAL_MONTH_YEAR_RE = re.compile(r"^\s*([A-Za-z]+)\.?,?\s+(\d{4})\s*$")


def _valid_ymd(y: int, m: int, d: int) -> str | None:
    try:
        return date(y, m, d).isoformat()
    except ValueError:
        return None


def _valid_ym(y: int, m: int) -> str | None:
    if 1 <= m <= 12 and 1 <= y <= 9999:
        return f"{y:04d}-{m:02d}"
    return None


def parse_date(text: str | None) -> ParsedDate:
    if not text or not text.strip():
        return ParsedDate(raw_text=text, iso_date=None, confidence=DateConfidence.UNKNOWN,
                           precision=DatePrecision.UNKNOWN)

    raw = text.strip()

    iso_match = _ISO_RE.match(raw)
    if iso_match:
        y, m, d = (int(g) for g in iso_match.groups())
        iso = _valid_ymd(y, m, d)
        if iso:
            return ParsedDate(raw_text=raw, iso_date=iso, confidence=DateConfidence.EXACT,
                               precision=DatePrecision.DAY)
        return ParsedDate(raw_text=raw, iso_date=None, confidence=DateConfidence.UNKNOWN,
                           precision=DatePrecision.UNKNOWN)

    slash_match = _SLASH_OR_DASH_RE.match(raw)
    if slash_match:
        a, b, y = (int(g) for g in slash_match.groups())
        # Assume DD/MM/YYYY (Indian convention).
        day, month = a, b
        if day > 12 and month <= 12:
            iso = _valid_ymd(y, month, day)
            if iso:
                return ParsedDate(raw_text=raw, iso_date=iso, confidence=DateConfidence.EXACT,
                                   precision=DatePrecision.DAY, ambiguous=False)
        elif month > 12 and day <= 12:
            # Only valid the other way around (i.e. it was actually MM/DD).
            iso = _valid_ymd(y, day, month)
            if iso:
                return ParsedDate(raw_text=raw, iso_date=iso, confidence=DateConfidence.EXACT,
                                   precision=DatePrecision.DAY, ambiguous=False)
        elif day <= 12 and month <= 12:
            # Genuinely ambiguous — both readings are calendar-valid.
            iso = _valid_ymd(y, month, day)
            if iso:
                return ParsedDate(raw_text=raw, iso_date=iso, confidence=DateConfidence.INFERRED,
                                   precision=DatePrecision.DAY, ambiguous=True)
        return ParsedDate(raw_text=raw, iso_date=None, confidence=DateConfidence.UNKNOWN,
                           precision=DatePrecision.UNKNOWN)

    dmy = _NATURAL_DMY_RE.match(raw)
    if dmy:
        d_str, month_str, y_str = dmy.groups()
        month = _MONTHS.get(month_str.lower())
        if month:
            iso = _valid_ymd(int(y_str), month, int(d_str))
            if iso:
                return ParsedDate(raw_text=raw, iso_date=iso, confidence=DateConfidence.INFERRED,
                                   precision=DatePrecision.DAY)

    mdy = _NATURAL_MDY_RE.match(raw)
    if mdy:
        month_str, d_str, y_str = mdy.groups()
        month = _MONTHS.get(month_str.lower())
        if month:
            iso = _valid_ymd(int(y_str), month, int(d_str))
            if iso:
                return ParsedDate(raw_text=raw, iso_date=iso, confidence=DateConfidence.INFERRED,
                                   precision=DatePrecision.DAY)

    # --- Month/year only, from here down. No day token present anywhere
    # in the source text — iso_date becomes "YYYY-MM", never a guessed day.

    iso_month_year = _ISO_MONTH_YEAR_RE.match(raw)
    if iso_month_year:
        y, m = (int(g) for g in iso_month_year.groups())
        ym = _valid_ym(y, m)
        if ym:
            return ParsedDate(raw_text=raw, iso_date=ym, confidence=DateConfidence.EXACT,
                               precision=DatePrecision.MONTH)

    slash_month_year = _SLASH_MONTH_YEAR_RE.match(raw)
    if slash_month_year:
        m, y = (int(g) for g in slash_month_year.groups())
        ym = _valid_ym(y, m)
        if ym:
            return ParsedDate(raw_text=raw, iso_date=ym, confidence=DateConfidence.INFERRED,
                               precision=DatePrecision.MONTH)

    natural_month_year = _NATURAL_MONTH_YEAR_RE.match(raw)
    if natural_month_year:
        month_str, y_str = natural_month_year.groups()
        month = _MONTHS.get(month_str.lower())
        if month:
            ym = _valid_ym(int(y_str), month)
            if ym:
                return ParsedDate(raw_text=raw, iso_date=ym, confidence=DateConfidence.EXACT,
                                   precision=DatePrecision.MONTH)

    return ParsedDate(raw_text=raw, iso_date=None, confidence=DateConfidence.UNKNOWN,
                       precision=DatePrecision.UNKNOWN)
