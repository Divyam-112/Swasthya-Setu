"""
Step 11 runner. Reads JSON dataset files from document_ai/benchmark/datasets/,
dispatches each to the right metric function in metrics.py based on its
declared "kind", and writes a report to document_ai/benchmark/reports/.

Dataset file shape:
{
  "name": "...",
  "kind": "ocr" | "extraction" | "medicine" | "lab" | "date" | "uncertainty",
  "synthetic": true | false,
  "cases": [ ... shape depends on "kind", see metrics.py docstrings ... ]
}

`synthetic: true` is not optional metadata — every report generated from
such a dataset is stamped with a loud warning and the runner refuses to
call it an accuracy measurement. Only `synthetic: false` datasets (real,
hand-labeled samples you provide) produce a report intended to represent
real-world performance.
"""

from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

from . import metrics

THIS_DIR = Path(__file__).parent
DEFAULT_DATASETS_DIR = THIS_DIR / "datasets"
DEFAULT_REPORTS_DIR = THIS_DIR / "reports"

_SYNTHETIC_WARNING = (
    "This dataset is marked synthetic=true. These numbers evaluate the "
    "metric functions themselves (i.e. 'does the evaluator compute what "
    "it claims to'), NOT real-world model accuracy. Do not report this as "
    "OCR/extraction/normalization accuracy — replace with a real labeled "
    "sample set to get an actual accuracy number."
)


def _to_jsonable(obj: Any) -> Any:
    if is_dataclass(obj):
        return {k: _to_jsonable(v) for k, v in asdict(obj).items()}
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_jsonable(v) for v in obj]
    return obj


def load_dataset(path: Path) -> dict:
    return json.loads(Path(path).read_text())


def run_dataset(dataset: dict) -> dict:
    kind = dataset.get("kind")
    cases = dataset.get("cases", [])

    if kind == "ocr":
        results = [
            {
                "case": c.get("case_name"),
                "character_error_rate": metrics.character_error_rate(c["hypothesis"], c["reference"]),
                "word_error_rate": metrics.word_error_rate(c["hypothesis"], c["reference"]),
            }
            for c in cases
        ]
        report_metrics: Any = {"per_case": results}

    elif kind == "extraction":
        results = [metrics.field_level_prf(c["predicted"], c["expected"]) for c in cases]
        overall_tp = sum(r.true_positives for r in results)
        overall_fp = sum(r.false_positives for r in results)
        overall_fn = sum(r.false_negatives for r in results)
        report_metrics = {
            "per_case": [_to_jsonable(r) for r in results],
            "overall": _to_jsonable(metrics.prf_from_counts(overall_tp, overall_fp, overall_fn)),
        }

    elif kind == "medicine":
        report_metrics = _to_jsonable(metrics.medicine_normalization_metrics(cases))

    elif kind == "lab":
        report_metrics = _to_jsonable(metrics.lab_extraction_metrics(cases))

    elif kind == "date":
        report_metrics = _to_jsonable(metrics.date_extraction_metrics(cases))

    elif kind == "uncertainty":
        report_metrics = _to_jsonable(metrics.uncertainty_detection_metrics(cases))

    else:
        raise ValueError(f"Unknown dataset kind: {kind!r}")

    report = {
        "name": dataset.get("name", "unnamed"),
        "kind": kind,
        "synthetic": dataset.get("synthetic", True),
        "case_count": len(cases),
        "metrics": report_metrics,
    }
    if report["synthetic"]:
        report["warning"] = _SYNTHETIC_WARNING
    return report


def run_all(datasets_dir: Path = DEFAULT_DATASETS_DIR, reports_dir: Path = DEFAULT_REPORTS_DIR) -> list[dict]:
    datasets_dir = Path(datasets_dir)
    reports_dir = Path(reports_dir)
    reports_dir.mkdir(parents=True, exist_ok=True)

    reports = []
    for dataset_path in sorted(datasets_dir.glob("*.json")):
        dataset = load_dataset(dataset_path)
        report = run_dataset(dataset)
        report_path = reports_dir / f"{dataset_path.stem}_report.json"
        report_path.write_text(json.dumps(report, indent=2))
        reports.append(report)
    return reports


def main():
    reports = run_all()
    for r in reports:
        flag = " (SYNTHETIC — evaluator test only)" if r["synthetic"] else ""
        print(f"{r['name']} [{r['kind']}]{flag}: {r['case_count']} cases")


if __name__ == "__main__":
    main()
