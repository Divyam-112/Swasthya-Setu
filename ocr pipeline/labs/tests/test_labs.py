from document_ai.extraction.schemas import ExtractedField, LabReportExtraction, LabTestResult
from document_ai.labs.reference_range import is_non_numeric_result, parse_numeric_value, parse_reference_range
from document_ai.labs.schemas import AbnormalStatus
from document_ai.labs.validator import validate_lab_report, validate_lab_test


def _field(value=None, confidence=None, source_text=None):
    return ExtractedField(value=value, confidence=confidence, source_text=source_text)


def _test(value, ref_range, test_name="Test", unit=None):
    return LabTestResult(
        test_name=_field(test_name),
        value=_field(value, confidence=0.9, source_text=value),
        unit=_field(unit),
        reference_range=_field(ref_range),
    )


# ------------------------------------------------------------ reference_range parsing


def test_parse_between_hyphen():
    r = parse_reference_range("10-20")
    assert r.parseable and r.low == 10 and r.high == 20


def test_parse_between_spaced_hyphen():
    r = parse_reference_range("10 - 20")
    assert r.parseable and r.low == 10 and r.high == 20


def test_parse_between_en_dash():
    r = parse_reference_range("10\u201320")
    assert r.parseable and r.low == 10 and r.high == 20


def test_parse_between_to():
    r = parse_reference_range("10 to 20")
    assert r.parseable and r.low == 10 and r.high == 20


def test_parse_less_than():
    r = parse_reference_range("< 5")
    assert r.parseable and r.comparator == "<" and r.high == 5


def test_parse_less_than_equal():
    r = parse_reference_range("<= 5")
    assert r.parseable and r.comparator == "<=" and r.high == 5


def test_parse_greater_than():
    r = parse_reference_range("> 10")
    assert r.parseable and r.comparator == ">" and r.low == 10


def test_parse_greater_than_equal():
    r = parse_reference_range(">= 10")
    assert r.parseable and r.comparator == ">=" and r.low == 10


def test_parse_missing_range():
    r = parse_reference_range(None)
    assert r.parseable is False


def test_parse_garbage_range_not_forced():
    r = parse_reference_range("normal-ish")
    assert r.parseable is False


def test_parse_numeric_value():
    assert parse_numeric_value("15") == 15.0
    assert parse_numeric_value("13.5") == 13.5
    assert parse_numeric_value("11,000") == 11000.0
    assert parse_numeric_value("abnormal") is None
    assert parse_numeric_value(None) is None


def test_is_non_numeric_result():
    assert is_non_numeric_result("Positive")
    assert is_non_numeric_result("negative")
    assert is_non_numeric_result("Not Detected")
    assert not is_non_numeric_result("15")


# ------------------------------------------------------------ classification


def test_value_inside_between_range_is_normal():
    result = validate_lab_test(_test("15", "10-20"))
    assert result.abnormal_status == AbnormalStatus.NORMAL
    assert result.needs_verification is False


def test_value_above_between_range_is_high():
    result = validate_lab_test(_test("25", "10-20"))
    assert result.abnormal_status == AbnormalStatus.HIGH


def test_value_below_between_range_is_low():
    result = validate_lab_test(_test("5", "10-20"))
    assert result.abnormal_status == AbnormalStatus.LOW


def test_value_at_boundary_is_normal():
    result = validate_lab_test(_test("20", "10-20"))
    assert result.abnormal_status == AbnormalStatus.NORMAL


def test_less_than_comparator_high_when_exceeds():
    result = validate_lab_test(_test("8", "< 5"))
    assert result.abnormal_status == AbnormalStatus.HIGH


def test_less_than_comparator_normal_when_under():
    result = validate_lab_test(_test("2", "< 5"))
    assert result.abnormal_status == AbnormalStatus.NORMAL


def test_greater_than_comparator_low_when_under():
    result = validate_lab_test(_test("8", "> 10"))
    assert result.abnormal_status == AbnormalStatus.LOW


def test_missing_reference_range_is_unknown_and_needs_verification():
    result = validate_lab_test(_test("15", None))
    assert result.abnormal_status == AbnormalStatus.UNKNOWN
    assert result.needs_verification is True
    assert "reference_range_missing_or_unparseable" in result.reasons


def test_ambiguous_reference_range_is_unknown():
    result = validate_lab_test(_test("15", "roughly normal"))
    assert result.abnormal_status == AbnormalStatus.UNKNOWN
    assert result.needs_verification is True


def test_non_numeric_result_not_classified_via_numeric_logic():
    result = validate_lab_test(_test("Positive", "Negative"))
    assert result.is_non_numeric_result is True
    assert result.abnormal_status == AbnormalStatus.UNKNOWN
    assert result.needs_verification is True


def test_missing_value_flagged():
    t = LabTestResult(test_name=_field("Hemoglobin"), value=_field(None), unit=_field(), reference_range=_field("10-20"))
    result = validate_lab_test(t)
    assert result.needs_verification is True
    assert "missing_value" in result.reasons


def test_validate_lab_report_multiple_tests():
    extraction = LabReportExtraction(tests=[
        _test("15", "10-20", test_name="Hemoglobin", unit="g/dL"),
        _test("25", "10-20", test_name="WBC", unit="/uL"),
    ])
    report = validate_lab_report(extraction)
    assert len(report.tests) == 2
    assert report.tests[0].abnormal_status == AbnormalStatus.NORMAL
    assert report.tests[1].abnormal_status == AbnormalStatus.HIGH


def test_confidence_carried_through():
    result = validate_lab_test(_test("15", "10-20"))
    assert result.confidence == 0.9
