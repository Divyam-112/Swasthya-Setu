from __future__ import annotations

from document_ai.extraction.schemas import LabReportExtraction, LabTestResult

from .reference_range import is_non_numeric_result, parse_numeric_value, parse_reference_range
from .schemas import AbnormalStatus, ValidatedLabReport, ValidatedLabTest


def _classify(numeric_value: float | None, ref) -> AbnormalStatus:
    if numeric_value is None or not ref.parseable:
        return AbnormalStatus.UNKNOWN

    if ref.comparator in ("<", "<="):
        # reference expresses an upper bound only, e.g. "< 5"
        return AbnormalStatus.NORMAL if numeric_value < ref.high or (ref.comparator == "<=" and numeric_value == ref.high) else AbnormalStatus.HIGH
    if ref.comparator in (">", ">="):
        return AbnormalStatus.NORMAL if numeric_value > ref.low or (ref.comparator == ">=" and numeric_value == ref.low) else AbnormalStatus.LOW

    if ref.low is not None and ref.high is not None:
        if numeric_value < ref.low:
            return AbnormalStatus.LOW
        if numeric_value > ref.high:
            return AbnormalStatus.HIGH
        return AbnormalStatus.NORMAL

    return AbnormalStatus.UNKNOWN


def validate_lab_test(test: LabTestResult) -> ValidatedLabTest:
    value_text = test.value.value if test.value else None
    range_text = test.reference_range.value if test.reference_range else None

    confidences = [f.confidence for f in (test.test_name, test.value, test.reference_range)
                   if f is not None and f.confidence is not None]
    confidence = min(confidences) if confidences else None

    result = ValidatedLabTest(
        test_name=test.test_name.value if test.test_name else None,
        value=value_text,
        unit=test.unit.value if test.unit else None,
        reference_range=range_text,
        confidence=confidence,
        source_text=test.value.source_text if test.value else None,
    )

    if value_text is None:
        result.reasons.append("missing_value")
        return result

    if is_non_numeric_result(value_text):
        result.is_non_numeric_result = True
        result.abnormal_status = AbnormalStatus.UNKNOWN
        result.reasons.append("non_numeric_result_not_classified")
        # A qualitative result can still be reported verbatim; we simply
        # never route it through numeric HIGH/LOW/NORMAL logic.
        return result

    numeric_value = parse_numeric_value(value_text)
    result.numeric_value = numeric_value

    if numeric_value is None:
        result.reasons.append("value_not_numeric_and_not_recognized")
        return result

    parsed_range = parse_reference_range(range_text)
    result.parsed_reference_range = parsed_range

    if not parsed_range.parseable:
        result.abnormal_status = AbnormalStatus.UNKNOWN
        result.reasons.append("reference_range_missing_or_unparseable")
        return result

    result.abnormal_status = _classify(numeric_value, parsed_range)
    result.needs_verification = result.abnormal_status == AbnormalStatus.UNKNOWN
    return result


def validate_lab_report(extraction: LabReportExtraction) -> ValidatedLabReport:
    return ValidatedLabReport(tests=[validate_lab_test(t) for t in extraction.tests])
