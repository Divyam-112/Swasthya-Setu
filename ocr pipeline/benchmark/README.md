# Module B benchmark / evaluation framework (Step 11)

## What this is

A generic evaluator: `metrics.py` implements the scoring functions
(CER/WER for OCR, field-level precision/recall/F1 for extraction,
match-rate metrics for medicine normalization, accuracy metrics for lab
extraction, date accuracy + ordering accuracy for the timeline, and a
precision/recall view of `needs_verification` flags). `runner.py` reads
JSON dataset files from `datasets/`, runs the right metric for each, and
writes a report to `reports/`.

`run_benchmark.py` (from Step 2) is kept as-is: it's a live OCR-provider
benchmark that actually calls a configured OCR provider against real
image samples. It measures something different from this generic
framework (live provider behavior vs. a static predicted/expected pair)
and both are useful.

## IMPORTANT — synthetic vs real

Every dataset in `datasets/` right now is `"synthetic": true`. These
exist ONLY to prove the metric functions themselves are computing what
they claim to compute (`document_ai/benchmark/tests/` asserts exact
expected numbers against these fixtures). They are not a measurement of
this pipeline's real-world OCR/extraction/normalization accuracy — they
were made up by hand, not sampled from real documents.

**Do not report numbers generated from a `synthetic: true` dataset as
model accuracy.** Every report generated from one is stamped with an
explicit warning field for this reason.

To get a real accuracy number:

1. Collect a set of real (de-identified) prescriptions/lab
   reports/discharge summaries.
2. Hand-label the ground truth for whichever stage you're evaluating
   (transcription text, extracted fields, normalized medicine names,
   lab abnormal status, event dates).
3. Write a dataset JSON file with `"synthetic": false` in the same shape
   as the examples in `datasets/` (see the `kind`-specific case shapes
   documented in each function's docstring in `metrics.py`).
4. Run `python -m document_ai.benchmark.runner`.

## Dataset file shape

```json
{
  "name": "my_dataset",
  "kind": "ocr | extraction | medicine | lab | date | uncertainty",
  "synthetic": false,
  "cases": [ ... ]
}
```

See `metrics.py` for the exact case shape expected for each `kind`.

## Running

```bash
python -m document_ai.benchmark.runner
```

Reports are written to `document_ai/benchmark/reports/<dataset>_report.json`.

For a live OCR-provider benchmark against real image samples (requires
provider credentials):

```bash
python -m document_ai.benchmark.run_benchmark --samples-dir samples/
```
