from __future__ import annotations

from document_ai.extraction.schemas import (
    DischargeSummaryExtraction,
    LabReportExtraction,
    PrescriptionExtraction,
)

from .date_parser import parse_date
from .schemas import DateConfidence, DatePrecision, EventType, TimelineEvent, TimelineResult


def _needs_verification(parsed) -> bool:
    """A date is only 'good enough' to skip verification when it's both an
    unambiguous format AND day-level precision. A month-only date (however
    unambiguously formatted) still needs a human to confirm the actual day
    if exact timing matters."""
    return parsed.confidence != DateConfidence.EXACT or parsed.precision != DatePrecision.DAY


def _medicine_summary(prescription: PrescriptionExtraction) -> str:
    names = [m.raw_name.value for m in prescription.medications if m.raw_name.value]
    if not names:
        return "Prescription"
    return "Prescription: " + ", ".join(names)


def prescription_event(document_id: str, prescription: PrescriptionExtraction) -> TimelineEvent:
    parsed = parse_date(prescription.prescription_date.value)
    return TimelineEvent(
        event_type=EventType.PRESCRIPTION,
        event_date=parsed.iso_date,
        event_date_raw=parsed.raw_text,
        date_confidence=parsed.confidence,
        date_precision=parsed.precision,
        source_document_id=document_id,
        needs_verification=_needs_verification(parsed),
        summary=_medicine_summary(prescription),
        related_fields=["prescription_date"],
    )


def lab_report_event(document_id: str, lab_report: LabReportExtraction) -> TimelineEvent:
    parsed = parse_date(lab_report.report_date.value)
    test_names = [t.test_name.value for t in lab_report.tests if t.test_name.value]
    summary = "Lab report: " + ", ".join(test_names) if test_names else "Lab report"
    return TimelineEvent(
        event_type=EventType.LAB_REPORT,
        event_date=parsed.iso_date,
        event_date_raw=parsed.raw_text,
        date_confidence=parsed.confidence,
        date_precision=parsed.precision,
        source_document_id=document_id,
        needs_verification=_needs_verification(parsed),
        summary=summary,
        related_fields=["report_date"],
    )


def discharge_summary_event(document_id: str, discharge: DischargeSummaryExtraction) -> TimelineEvent:
    """Uses discharge_date as the event date (when the patient's episode
    concluded) and keeps admission_date as the secondary document_date —
    the spec explicitly asks to distinguish document date from event date
    where possible, and admission/discharge is the clearest such case
    here."""
    discharge_parsed = parse_date(discharge.discharge_date.value)
    admission_parsed = parse_date(discharge.admission_date.value)

    event_date = discharge_parsed.iso_date
    confidence = discharge_parsed.confidence
    precision = discharge_parsed.precision
    raw = discharge_parsed.raw_text
    if event_date is None and admission_parsed.iso_date is not None:
        # Fall back to admission date only if discharge date is genuinely
        # unavailable — never invent a discharge date from it.
        event_date = admission_parsed.iso_date
        confidence = admission_parsed.confidence
        precision = admission_parsed.precision
        raw = admission_parsed.raw_text

    diagnoses = [d.value for d in discharge.diagnoses if d.value]
    summary = "Discharge summary: " + ", ".join(diagnoses) if diagnoses else "Discharge summary"

    return TimelineEvent(
        event_type=EventType.DISCHARGE_SUMMARY,
        event_date=event_date,
        event_date_raw=raw,
        date_confidence=confidence,
        date_precision=precision,
        document_date=admission_parsed.iso_date,
        source_document_id=document_id,
        needs_verification=(confidence != DateConfidence.EXACT or precision != DatePrecision.DAY),
        summary=summary,
        related_fields=["admission_date", "discharge_date"],
    )


def build_timeline(
    prescriptions: list[tuple[str, PrescriptionExtraction]] | None = None,
    lab_reports: list[tuple[str, LabReportExtraction]] | None = None,
    discharge_summaries: list[tuple[str, DischargeSummaryExtraction]] | None = None,
) -> TimelineResult:
    events: list[TimelineEvent] = []

    for doc_id, p in prescriptions or []:
        events.append(prescription_event(doc_id, p))
    for doc_id, lr in lab_reports or []:
        events.append(lab_report_event(doc_id, lr))
    for doc_id, ds in discharge_summaries or []:
        events.append(discharge_summary_event(doc_id, ds))

    dated = [e for e in events if e.event_date is not None]
    undated = [e for e in events if e.event_date is None]

    # String sort is safe here even with mixed precision: "2025-05" (a
    # month-only date) sorts before "2025-05-12" (a specific day in that
    # same month) because it's a strict prefix — a reasonable "earliest
    # possible" placement that never requires inventing a day number.
    dated.sort(key=lambda e: e.event_date)

    return TimelineResult(dated_events=dated, undated_events=undated)
