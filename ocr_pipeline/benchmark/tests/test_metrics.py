from document_ai.benchmark import metrics


def test_character_error_rate_exact_match():
    assert metrics.character_error_rate("hello", "hello") == 0.0


def test_character_error_rate_one_substitution():
    assert metrics.character_error_rate("hallo", "hello") == 1 / 5


def test_character_error_rate_empty_reference():
    assert metrics.character_error_rate("hello", "") is None


def test_word_error_rate_exact_match():
    assert metrics.word_error_rate("the quick fox", "the quick fox") == 0.0


def test_word_error_rate_one_word_wrong():
    assert metrics.word_error_rate("the slow fox", "the quick fox") == 1 / 3


def test_word_error_rate_empty_reference():
    assert metrics.word_error_rate("anything", "") is None


def test_field_level_prf_all_correct():
    prf = metrics.field_level_prf({"a": "1", "b": "2"}, {"a": "1", "b": "2"})
    assert prf.precision == 1.0
    assert prf.recall == 1.0
    assert prf.f1 == 1.0


def test_field_level_prf_wrong_value_counts_as_fp_and_fn():
    prf = metrics.field_level_prf({"a": "wrong"}, {"a": "right"})
    assert prf.true_positives == 0
    assert prf.false_positives == 1
    assert prf.false_negatives == 1


def test_field_level_prf_missing_predicted_field_is_false_negative():
    prf = metrics.field_level_prf({}, {"a": "1"})
    assert prf.false_negatives == 1
    assert prf.recall == 0.0


def test_field_level_prf_extra_predicted_field_is_false_positive():
    prf = metrics.field_level_prf({"a": "1"}, {})
    assert prf.false_positives == 1
    assert prf.precision == 0.0


def test_prf_from_counts_handles_zero_division():
    prf = metrics.prf_from_counts(0, 0, 0)
    assert prf.precision is None
    assert prf.recall is None
    assert prf.f1 is None


def test_medicine_normalization_metrics():
    cases = [
        {"predicted_normalized": "Paracetamol", "expected_normalized": "Paracetamol"},
        {"predicted_normalized": None, "expected_normalized": "Ranitidine"},
        {"predicted_normalized": None, "expected_normalized": None},
        {"predicted_normalized": "Wrong", "expected_normalized": "Right"},
    ]
    result = metrics.medicine_normalization_metrics(cases)
    assert result.total == 4
    assert result.unresolved_rate == 0.5  # 2 of 4 unresolved
    assert result.exact_match_rate == 0.25  # 1 of 4 exactly correct
    # of the 2 resolved predictions, 1 correct, 1 wrong
    assert result.correct_match_rate == 0.5
    assert result.false_normalization_rate == 0.5


def test_medicine_normalization_metrics_empty():
    result = metrics.medicine_normalization_metrics([])
    assert result.total == 0
    assert result.exact_match_rate is None


def test_lab_extraction_metrics():
    cases = [
        {"predicted_abnormal_status": "NORMAL", "expected_abnormal_status": "NORMAL"},
        {"predicted_abnormal_status": "UNKNOWN", "expected_abnormal_status": "HIGH"},
    ]
    result = metrics.lab_extraction_metrics(cases)
    assert result.abnormal_status_accuracy == 0.5


def test_date_extraction_metrics():
    cases = [
        {"predicted_date": "2025-05-12", "expected_date": "2025-05-12"},
        {"predicted_date": "2025-06-05", "expected_date": "2025-05-06"},
    ]
    result = metrics.date_extraction_metrics(cases)
    assert result.date_accuracy == 0.5


def test_ordering_accuracy_perfect_order():
    predicted = ["a", "b", "c"]
    expected = ["a", "b", "c"]
    assert metrics.ordering_accuracy(predicted, expected) == 1.0


def test_ordering_accuracy_reversed():
    predicted = ["c", "b", "a"]
    expected = ["a", "b", "c"]
    assert metrics.ordering_accuracy(predicted, expected) == 0.0


def test_ordering_accuracy_partial():
    predicted = ["a", "c", "b"]
    expected = ["a", "b", "c"]
    # pairs: (a,b) correct, (a,c) correct, (b,c) wrong -> 2/3
    assert round(metrics.ordering_accuracy(predicted, expected), 3) == round(2 / 3, 3)


def test_ordering_accuracy_insufficient_common_items():
    assert metrics.ordering_accuracy(["a"], ["a", "b", "c"]) is None


def test_uncertainty_detection_metrics():
    cases = [
        {"predicted_needs_verification": True, "expected_needs_verification": True},
        {"predicted_needs_verification": False, "expected_needs_verification": False},
        {"predicted_needs_verification": True, "expected_needs_verification": False},
        {"predicted_needs_verification": False, "expected_needs_verification": True},
    ]
    result = metrics.uncertainty_detection_metrics(cases)
    assert result.prf.true_positives == 1
    assert result.prf.false_positives == 1
    assert result.prf.false_negatives == 1
