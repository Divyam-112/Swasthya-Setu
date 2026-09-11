"""
Step 11 metrics library. Every function here takes a (predicted, expected)
pair (or a list of them) and returns a plain, honestly-labeled number —
nothing here estimates or extrapolates accuracy from a synthetic sample.
The runner.py docstring and README.md in this package repeat the same
warning: numbers produced against document_ai/benchmark/datasets'
synthetic fixtures describe the evaluator's own correctness, not real-
world model accuracy. Real accuracy numbers require real labeled
documents, which this repository does not ship.
"""

from __future__ import annotations

from dataclasses import dataclass


# ------------------------------------------------------------------ OCR


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i] + [0] * len(b)
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            curr[j] = min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
        prev = curr
    return prev[-1]


def character_error_rate(hypothesis: str, reference: str) -> float | None:
    """CER = edit distance / len(reference). None if reference is empty —
    there's nothing to compute a rate against."""
    if not reference:
        return None
    return _levenshtein(hypothesis, reference) / len(reference)


def word_error_rate(hypothesis: str, reference: str) -> float | None:
    ref_words = reference.split()
    hyp_words = hypothesis.split()
    if not ref_words:
        return None
    return _word_edit_distance(hyp_words, ref_words) / len(ref_words)


def _word_edit_distance(hyp_words: list[str], ref_words: list[str]) -> int:
    prev = list(range(len(ref_words) + 1))
    for i, hw in enumerate(hyp_words, start=1):
        curr = [i] + [0] * len(ref_words)
        for j, rw in enumerate(ref_words, start=1):
            cost = 0 if hw == rw else 1
            curr[j] = min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
        prev = curr
    return prev[-1]


# ------------------------------------------------------------------ generic precision/recall/F1


@dataclass
class PRF:
    precision: float | None
    recall: float | None
    f1: float | None
    true_positives: int
    false_positives: int
    false_negatives: int


def prf_from_counts(tp: int, fp: int, fn: int) -> PRF:
    precision = tp / (tp + fp) if (tp + fp) > 0 else None
    recall = tp / (tp + fn) if (tp + fn) > 0 else None
    f1 = (2 * precision * recall / (precision + recall)) if precision and recall and (precision + recall) > 0 else None
    return PRF(precision=precision, recall=recall, f1=f1, true_positives=tp, false_positives=fp, false_negatives=fn)


def field_level_prf(predicted: dict, expected: dict, exclude_keys: set[str] = frozenset()) -> PRF:
    """Field-level exact-match precision/recall/F1 over a flat dict of
    field_name -> value. A field counts as a true positive only if BOTH
    sides have a non-None value AND they match exactly."""
    keys = (set(predicted) | set(expected)) - exclude_keys
    tp = fp = fn = 0
    for key in keys:
        p_val = predicted.get(key)
        e_val = expected.get(key)
        if e_val is None and p_val is None:
            continue
        if e_val is None and p_val is not None:
            fp += 1
        elif e_val is not None and p_val is None:
            fn += 1
        elif p_val == e_val:
            tp += 1
        else:
            fp += 1
            fn += 1
    return prf_from_counts(tp, fp, fn)


# ------------------------------------------------------------------ medicine normalization


@dataclass
class MedicineNormalizationMetrics:
    total: int
    exact_match_rate: float | None       # predicted vocabulary_normalized == expected, among all cases
    correct_match_rate: float | None     # predicted == expected, among cases where a prediction was made
    unresolved_rate: float               # fraction where predicted vocabulary_normalized is None
    false_normalization_rate: float | None  # fraction, among predictions made, that were WRONG


def medicine_normalization_metrics(cases: list[dict]) -> MedicineNormalizationMetrics:
    """Each case: {"predicted_normalized": str|None, "expected_normalized": str|None}."""
    total = len(cases)
    if total == 0:
        return MedicineNormalizationMetrics(0, None, None, 0.0, None)

    resolved = [c for c in cases if c.get("predicted_normalized") is not None]
    unresolved_count = total - len(resolved)

    correct = [c for c in resolved if c.get("predicted_normalized") == c.get("expected_normalized")]
    false_normalizations = [c for c in resolved if c.get("predicted_normalized") != c.get("expected_normalized")]

    return MedicineNormalizationMetrics(
        total=total,
        exact_match_rate=len(correct) / total,
        correct_match_rate=(len(correct) / len(resolved)) if resolved else None,
        unresolved_rate=unresolved_count / total,
        false_normalization_rate=(len(false_normalizations) / len(resolved)) if resolved else None,
    )


# ------------------------------------------------------------------ lab extraction


@dataclass
class LabExtractionMetrics:
    total: int
    test_name_accuracy: float | None
    value_accuracy: float | None
    reference_range_accuracy: float | None
    abnormal_status_accuracy: float | None


def _accuracy(cases: list[dict], predicted_key: str, expected_key: str) -> float | None:
    comparable = [c for c in cases if c.get(expected_key) is not None]
    if not comparable:
        return None
    correct = sum(1 for c in comparable if c.get(predicted_key) == c.get(expected_key))
    return correct / len(comparable)


def lab_extraction_metrics(cases: list[dict]) -> LabExtractionMetrics:
    """Each case may include: predicted_test_name/expected_test_name,
    predicted_value/expected_value, predicted_reference_range/expected_reference_range,
    predicted_abnormal_status/expected_abnormal_status."""
    return LabExtractionMetrics(
        total=len(cases),
        test_name_accuracy=_accuracy(cases, "predicted_test_name", "expected_test_name"),
        value_accuracy=_accuracy(cases, "predicted_value", "expected_value"),
        reference_range_accuracy=_accuracy(cases, "predicted_reference_range", "expected_reference_range"),
        abnormal_status_accuracy=_accuracy(cases, "predicted_abnormal_status", "expected_abnormal_status"),
    )


# ------------------------------------------------------------------ date / timeline


@dataclass
class DateExtractionMetrics:
    total: int
    date_accuracy: float | None
    ordering_accuracy: float | None  # fraction of adjacent pairs in predicted order that match expected relative order


def date_extraction_metrics(cases: list[dict]) -> DateExtractionMetrics:
    """Each case: {"predicted_date": iso str|None, "expected_date": iso str|None}."""
    accuracy = _accuracy(cases, "predicted_date", "expected_date")
    return DateExtractionMetrics(total=len(cases), date_accuracy=accuracy, ordering_accuracy=None)


def ordering_accuracy(predicted_order: list[str], expected_order: list[str]) -> float | None:
    """Fraction of adjacent-pair orderings in `expected_order` that
    `predicted_order` gets right, restricted to ids present in both."""
    common = [x for x in expected_order if x in predicted_order]
    if len(common) < 2:
        return None
    predicted_positions = {x: i for i, x in enumerate(predicted_order)}
    correct_pairs = 0
    total_pairs = 0
    for i in range(len(common)):
        for j in range(i + 1, len(common)):
            a, b = common[i], common[j]  # a comes before b in expected order
            total_pairs += 1
            if predicted_positions[a] < predicted_positions[b]:
                correct_pairs += 1
    return correct_pairs / total_pairs if total_pairs else None


# ------------------------------------------------------------------ uncertainty detection


@dataclass
class UncertaintyDetectionMetrics:
    """How well needs_verification flags matched a human's judgement of
    which fields actually needed review — this is itself a PRF over a
    binary "needs review" label per field."""
    prf: PRF


def uncertainty_detection_metrics(cases: list[dict]) -> UncertaintyDetectionMetrics:
    """Each case: {"predicted_needs_verification": bool, "expected_needs_verification": bool}."""
    tp = fp = fn = tn = 0
    for c in cases:
        p, e = bool(c.get("predicted_needs_verification")), bool(c.get("expected_needs_verification"))
        if p and e:
            tp += 1
        elif p and not e:
            fp += 1
        elif not p and e:
            fn += 1
        else:
            tn += 1
    return UncertaintyDetectionMetrics(prf=prf_from_counts(tp, fp, fn))
