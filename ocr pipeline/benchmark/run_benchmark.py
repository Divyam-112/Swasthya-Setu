"""
Runs every configured provider against the same sample set and reports
transcription accuracy (edit distance against a hand-typed ground truth),
processing time, and confidence — nothing about medicine normalization.

Expected sample layout:

    samples/
        clear_printed_rx/
            image.png
            ground_truth.txt
        handwritten_rx/
            image.png
            ground_truth.txt
        ...

Each subdirectory is one benchmark case. `ground_truth.txt` is a
hand-typed transcription of what the document actually says — you
write these yourself; this script does not invent them.

Usage:
    python -m document_ai.benchmark.run_benchmark --samples-dir samples/
"""

from __future__ import annotations

import argparse
import difflib
import json
import time
from dataclasses import dataclass, asdict
from pathlib import Path

from document_ai.ocr.base import OCRProvider, OCRProviderError


@dataclass
class BenchmarkCase:
    case_name: str
    provider: str
    success: bool
    error: str | None
    processing_time_seconds: float | None
    ocr_confidence: float | None
    char_similarity: float | None   # 1.0 = exact match to ground truth, 0.0 = nothing alike
    transcribed_text: str
    ground_truth_text: str | None


def char_similarity(a: str, b: str) -> float:
    """difflib ratio — simple, dependency-free measure of how close the
    transcription is to ground truth. Not a substitute for a human
    reading both side by side, but useful for ranking providers.
    """
    return difflib.SequenceMatcher(None, a, b).ratio()


def discover_cases(samples_dir: Path) -> list[Path]:
    return sorted(p for p in samples_dir.iterdir() if p.is_dir())


def run_case(provider: OCRProvider, case_dir: Path) -> BenchmarkCase:
    image_candidates = [p for p in case_dir.glob("image.*")]
    if not image_candidates:
        return BenchmarkCase(
            case_name=case_dir.name,
            provider=provider.name,
            success=False,
            error="no_image_file_found_in_case_dir",
            processing_time_seconds=None,
            ocr_confidence=None,
            char_similarity=None,
            transcribed_text="",
            ground_truth_text=None,
        )
    image_path = image_candidates[0]

    ground_truth_path = case_dir / "ground_truth.txt"
    ground_truth = ground_truth_path.read_text() if ground_truth_path.exists() else None

    t0 = time.time()
    try:
        result = provider.transcribe(image_path)
        elapsed = time.time() - t0
        text = result.full_text()
        similarity = char_similarity(text, ground_truth) if ground_truth is not None else None
        return BenchmarkCase(
            case_name=case_dir.name,
            provider=provider.name,
            success=True,
            error=result.error,
            processing_time_seconds=elapsed,
            ocr_confidence=result.average_confidence(),
            char_similarity=similarity,
            transcribed_text=text,
            ground_truth_text=ground_truth,
        )
    except OCRProviderError as e:
        return BenchmarkCase(
            case_name=case_dir.name,
            provider=provider.name,
            success=False,
            error=str(e),
            processing_time_seconds=time.time() - t0,
            ocr_confidence=None,
            char_similarity=None,
            transcribed_text="",
            ground_truth_text=ground_truth,
        )


def run_benchmark(providers: list[OCRProvider], samples_dir: Path) -> list[BenchmarkCase]:
    results = []
    for case_dir in discover_cases(samples_dir):
        for provider in providers:
            results.append(run_case(provider, case_dir))
    return results


def print_summary(results: list[BenchmarkCase]) -> None:
    by_provider: dict[str, list[BenchmarkCase]] = {}
    for r in results:
        by_provider.setdefault(r.provider, []).append(r)

    print(f"{'provider':<20} {'cases':<7} {'success':<9} {'avg_sim':<9} {'avg_time_s':<11}")
    for provider, cases in by_provider.items():
        succeeded = [c for c in cases if c.success]
        sims = [c.char_similarity for c in cases if c.char_similarity is not None]
        times = [c.processing_time_seconds for c in cases if c.processing_time_seconds is not None]
        avg_sim = sum(sims) / len(sims) if sims else float("nan")
        avg_time = sum(times) / len(times) if times else float("nan")
        print(f"{provider:<20} {len(cases):<7} {len(succeeded):<9} {avg_sim:<9.3f} {avg_time:<11.2f}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples-dir", type=Path, default=Path("samples"))
    parser.add_argument("--output", type=Path, default=Path("benchmark_results.json"))
    args = parser.parse_args()

    # Wire up whichever providers you have credentials for. Left explicit
    # (not auto-discovered) so a missing credential fails loudly at the
    # top rather than silently skipping a provider mid-run.
    from document_ai.ocr.gemini import GeminiOCRProvider
    providers: list[OCRProvider] = [GeminiOCRProvider()]

    results = run_benchmark(providers, args.samples_dir)
    args.output.write_text(json.dumps([asdict(r) for r in results], indent=2))
    print_summary(results)
    print(f"\nFull results written to {args.output}")


if __name__ == "__main__":
    main()
