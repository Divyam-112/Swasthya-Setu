import json
import tempfile
from pathlib import Path

from document_ai.benchmark.runner import DEFAULT_DATASETS_DIR, load_dataset, run_all, run_dataset


def test_load_all_shipped_datasets_are_valid_json():
    for path in DEFAULT_DATASETS_DIR.glob("*.json"):
        dataset = load_dataset(path)
        assert "kind" in dataset
        assert "cases" in dataset


def test_run_dataset_ocr_kind():
    dataset = load_dataset(DEFAULT_DATASETS_DIR / "synthetic_ocr.json")
    report = run_dataset(dataset)
    assert report["kind"] == "ocr"
    assert report["synthetic"] is True
    assert "warning" in report
    assert len(report["metrics"]["per_case"]) == 3
    exact = [c for c in report["metrics"]["per_case"] if c["case"] == "exact_match"][0]
    assert exact["character_error_rate"] == 0.0


def test_run_dataset_medicine_kind():
    dataset = load_dataset(DEFAULT_DATASETS_DIR / "synthetic_medicine.json")
    report = run_dataset(dataset)
    assert report["kind"] == "medicine"
    assert report["case_count"] == 4
    assert 0.0 <= report["metrics"]["unresolved_rate"] <= 1.0


def test_run_dataset_unknown_kind_raises():
    import pytest
    with pytest.raises(ValueError):
        run_dataset({"kind": "not_a_real_kind", "cases": []})


def test_non_synthetic_dataset_has_no_warning():
    dataset = {"name": "real_data", "kind": "date", "synthetic": False,
               "cases": [{"predicted_date": "2025-01-01", "expected_date": "2025-01-01"}]}
    report = run_dataset(dataset)
    assert "warning" not in report


def test_run_all_writes_reports_to_disk():
    with tempfile.TemporaryDirectory() as tmp:
        reports_dir = Path(tmp) / "reports"
        reports = run_all(datasets_dir=DEFAULT_DATASETS_DIR, reports_dir=reports_dir)
        assert len(reports) == len(list(DEFAULT_DATASETS_DIR.glob("*.json")))
        written_files = list(reports_dir.glob("*_report.json"))
        assert len(written_files) == len(reports)
        # each written file must be valid JSON matching its in-memory report
        sample = json.loads(written_files[0].read_text())
        assert "kind" in sample
