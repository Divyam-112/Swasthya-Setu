from document_ai.extraction.schemas import (
    DischargeSummaryExtraction,
    ExtractedField,
    LabReportExtraction,
    LabTestResult,
    Medication,
    PrescriptionExtraction,
)
from document_ai.timeline.builder import build_timeline
from document_ai.timeline.date_parser import parse_date
from document_ai.timeline.schemas import DateConfidence, DatePrecision, EventType


def _field(value=None):
    return ExtractedField(value=value)


# ------------------------------------------------------------ date_parser


def test_parse_iso_date():
    p = parse_date("2025-05-12")
    assert p.iso_date == "2025-05-12"
    assert p.confidence == DateConfidence.EXACT
    assert p.ambiguous is False


def test_parse_ddmmyyyy_slash_unambiguous_day_over_12():
    p = parse_date("25/05/2025")
    assert p.iso_date == "2025-05-25"
    assert p.confidence == DateConfidence.EXACT


def test_parse_ddmmyyyy_dash():
    p = parse_date("25-05-2025")
    assert p.iso_date == "2025-05-25"


def test_parse_ambiguous_slash_date_assumes_dmy_but_flags_it():
    p = parse_date("05/06/2025")  # could be 5 June or May 6
    assert p.iso_date == "2025-06-05"  # DD/MM assumption
    assert p.confidence == DateConfidence.INFERRED
    assert p.ambiguous is True


def test_parse_natural_dmy():
    p = parse_date("12 May 2025")
    assert p.iso_date == "2025-05-12"
    assert p.confidence == DateConfidence.INFERRED


def test_parse_natural_dmy_with_ordinal():
    p = parse_date("12th May 2025")
    assert p.iso_date == "2025-05-12"


def test_parse_natural_mdy():
    p = parse_date("May 12, 2025")
    assert p.iso_date == "2025-05-12"


def test_parse_missing_date_never_invented():
    p = parse_date(None)
    assert p.iso_date is None
    assert p.confidence == DateConfidence.UNKNOWN


def test_parse_empty_string():
    p = parse_date("")
    assert p.iso_date is None
    assert p.confidence == DateConfidence.UNKNOWN


def test_parse_garbage_date_not_forced():
    p = parse_date("sometime last month")
    assert p.iso_date is None
    assert p.confidence == DateConfidence.UNKNOWN


def test_parse_invalid_calendar_date_rejected():
    p = parse_date("2025-02-30")  # Feb 30 doesn't exist
    assert p.iso_date is None
    assert p.confidence == DateConfidence.UNKNOWN


# ------------------------------------------------------------ month/year-only precision


def test_parse_iso_month_year():
    p = parse_date("2025-05")
    assert p.iso_date == "2025-05"
    assert p.precision == DatePrecision.MONTH
    assert p.confidence == DateConfidence.EXACT


def test_parse_slash_month_year():
    p = parse_date("05/2025")
    assert p.iso_date == "2025-05"
    assert p.precision == DatePrecision.MONTH


def test_parse_natural_month_year():
    p = parse_date("May 2025")
    assert p.iso_date == "2025-05"
    assert p.precision == DatePrecision.MONTH


def test_full_day_level_date_is_not_mistaken_for_month_year():
    """'12 May 2025' must resolve to a full day-level date, not fall
    through to the month/year path just because it also contains a month
    and a year."""
    p = parse_date("12 May 2025")
    assert p.iso_date == "2025-05-12"
    assert p.precision == DatePrecision.DAY


def test_day_level_dates_are_tagged_day_precision():
    assert parse_date("2025-05-12").precision == DatePrecision.DAY
    assert parse_date("12/05/2025").precision == DatePrecision.DAY


def test_unparseable_date_has_unknown_precision():
    assert parse_date("sometime last month").precision == DatePrecision.UNKNOWN
    assert parse_date(None).precision == DatePrecision.UNKNOWN


def test_month_year_precision_propagates_into_timeline_event_and_flags_verification():
    timeline = build_timeline(prescriptions=[("doc1", _prescription("May 2025"))])
    event = timeline.dated_events[0]
    assert event.event_date == "2025-05"
    assert event.date_precision == DatePrecision.MONTH
    assert event.needs_verification is True  # exact day still unknown


def test_month_year_and_full_date_sort_correctly_together():
    """A month-only event and a specific day within that same month should
    still land in a sensible relative order without inventing a day."""
    timeline = build_timeline(prescriptions=[
        ("month_only", _prescription("May 2025")),
        ("specific_day", _prescription("2025-05-12")),
        ("earlier_month", _prescription("2025-04-20")),
    ])
    order = [e.source_document_id for e in timeline.dated_events]
    assert order == ["earlier_month", "month_only", "specific_day"]


# ------------------------------------------------------------ same-date documents


def test_multiple_documents_on_the_same_date_are_both_preserved():
    timeline = build_timeline(
        prescriptions=[("rx1", _prescription("2025-05-12"))],
        lab_reports=[("lab1", _lab_report("2025-05-12"))],
    )
    assert len(timeline.dated_events) == 2
    dates = {e.event_date for e in timeline.dated_events}
    assert dates == {"2025-05-12"}
    doc_ids = {e.source_document_id for e in timeline.dated_events}
    assert doc_ids == {"rx1", "lab1"}


# ------------------------------------------------------------ build_timeline


def _prescription(date_value):
    p = PrescriptionExtraction()
    p.prescription_date = _field(date_value)
    p.medications = [Medication(raw_name=_field("Dolo 650"))]
    return p


def _lab_report(date_value):
    lr = LabReportExtraction()
    lr.report_date = _field(date_value)
    lr.tests = [LabTestResult(test_name=_field("Hemoglobin"))]
    return lr


def _discharge(admission, discharge):
    d = DischargeSummaryExtraction()
    d.admission_date = _field(admission)
    d.discharge_date = _field(discharge)
    d.diagnoses = [_field("Appendicitis")]
    return d


def test_events_sorted_chronologically():
    timeline = build_timeline(
        prescriptions=[("doc1", _prescription("2025-05-12"))],
        lab_reports=[("doc2", _lab_report("2025-04-01"))],
        discharge_summaries=[("doc3", _discharge("2025-03-01", "2025-03-10"))],
    )
    dates = [e.event_date for e in timeline.dated_events]
    assert dates == sorted(dates)
    assert dates == ["2025-03-10", "2025-04-01", "2025-05-12"]


def test_undated_events_kept_separate_not_invented():
    timeline = build_timeline(prescriptions=[("doc1", _prescription(None))])
    assert timeline.dated_events == []
    assert len(timeline.undated_events) == 1
    assert timeline.undated_events[0].event_date is None
    assert timeline.undated_events[0].needs_verification is True


def test_discharge_falls_back_to_admission_when_discharge_date_missing():
    timeline = build_timeline(discharge_summaries=[("doc1", _discharge("2025-03-01", None))])
    assert len(timeline.dated_events) == 1
    assert timeline.dated_events[0].event_date == "2025-03-01"
    assert timeline.dated_events[0].document_date == "2025-03-01"


def test_discharge_prefers_discharge_date_over_admission():
    timeline = build_timeline(discharge_summaries=[("doc1", _discharge("2025-03-01", "2025-03-10"))])
    event = timeline.dated_events[0]
    assert event.event_date == "2025-03-10"
    assert event.document_date == "2025-03-01"


def test_prescription_summary_lists_medicines():
    timeline = build_timeline(prescriptions=[("doc1", _prescription("2025-05-12"))])
    assert "Dolo 650" in timeline.dated_events[0].summary


def test_source_document_id_preserved():
    timeline = build_timeline(lab_reports=[("labdoc-42", _lab_report("2025-05-12"))])
    assert timeline.dated_events[0].source_document_id == "labdoc-42"


def test_event_type_set_correctly():
    timeline = build_timeline(
        prescriptions=[("d1", _prescription("2025-01-01"))],
        lab_reports=[("d2", _lab_report("2025-01-02"))],
        discharge_summaries=[("d3", _discharge("2025-01-03", "2025-01-04"))],
    )
    types = {e.source_document_id: e.event_type for e in timeline.dated_events}
    assert types["d1"] == EventType.PRESCRIPTION
    assert types["d2"] == EventType.LAB_REPORT
    assert types["d3"] == EventType.DISCHARGE_SUMMARY


def test_empty_inputs_produce_empty_timeline():
    timeline = build_timeline()
    assert timeline.dated_events == []
    assert timeline.undated_events == []
