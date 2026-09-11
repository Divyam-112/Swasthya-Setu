# document_ai — Module B: Medical Document Digitization & Intelligence

SIH26047, Module B only. Covers Steps 1–12: ingestion, preprocessing, OCR,
structured extraction, medicine normalization, confidence/uncertainty
validation, lab validation, chronological organization, drug-interaction
checking, the unified pipeline, the FastAPI layer, and benchmarking.

Deliberately NOT here: Module A (voice/conversational intake), Module C
(clinical summary generation), Module D (ABHA/ABDM, consent, FHIR), doctor
dashboard, patient UI. Those consume this module's output; they aren't part
of it.

## Install

```bash
pip install -r requirements.txt
```

`torch` / `transformers` / `qwen-vl-utils` are **not** in requirements.txt —
only needed if you run `ocr/qwen.py` locally on a GPU. It has never been run
in any sandbox this project was built in (no GPU, no Hugging Face network
access there) — treat it as unverified until you run it yourself.

## Environment variables

| Variable | Used by | Required? |
|---|---|---|
| `GEMINI_API_KEY` | `GeminiOCRProvider` | For default Gemini OCR |
| `GEMINI_MODEL` | `GeminiOCRProvider` | Optional: model override (default: gemini-2.5-flash) |
| `GOOGLE_APPLICATION_CREDENTIALS` | `GoogleVisionProvider` | Optional: For Google Vision OCR |
| `ANTHROPIC_API_KEY` | `AnthropicVLMClient`, `AnthropicExtractionClient` | For VLM OCR fallback and Step 3 extraction |
| `DOCUMENT_AI_DEBUG_LOGGING` | `observability/logging.py` | Set to `1` (together with `allow_sensitive=True` at the call site) to allow sensitive fields in logs — off by default |
| `MEDICINE_PROVIDER` | `pipeline/orchestration.py` | Set to `local` to force the offline synthetic dataset only, skipping ABDM entirely (e.g. for a demo where you don't want to depend on sandbox availability live). Default: ABDM first, local fallback. |

`openFDA` (`interactions/providers/openfda.py`) and the ABDM Drug Registry
(`medicine/providers/abdm.py`) need no API key but ARE live network
dependencies — see Known limitations. `IndianMedicineProvider` /
`LocalBenchmarkProvider` (`medicine/providers/indian_medicine.py`) is the
opposite: a small offline synthetic dataset with **no** network dependency
at all — used as the fallback when ABDM is unreachable, and for unit tests.
(RxNorm was the original vocabulary provider design; it was replaced for
Indian brand-name coverage — see project history. `MedicineVocabularyProvider`
is still a provider-agnostic interface, so RxNorm could be reintroduced as
an additional source later.)

Every provider raises its own `*Error` immediately when a credential is
missing — none silently no-op.

## Pipeline stages

```
UPLOAD -> INGESTION -> PREPROCESSING -> OCR ROUTER -> RAW TRANSCRIPTION
  -> DOCUMENT TYPE DETECTION -> STRUCTURED EXTRACTION -> MEDICINE NORMALIZATION
  -> CONFIDENCE/UNCERTAINTY VALIDATION -> LAB VALIDATION
  -> CHRONOLOGICAL ORGANIZATION -> DRUG INTERACTION CHECK -> FINAL MODULE B JSON
```

| Step | Module | Responsibility |
|---|---|---|
| 1 | `ingestion/`, `preprocessing/` | File validation, PDF to image, deskew/denoise/contrast |
| 2 | `ocr/` | Google Vision + VLM transcription, provider routing |
| 3 | `extraction/` | OCR text to structured prescription/lab/discharge fields (verbatim, never normalized) |
| 4 | `medicine/` | Raw medicine name to vocabulary-matched candidate — ABDM Drug Registry first, local synthetic fallback (`ABDMWithLocalFallbackProvider`), conservatively gated |
| 5 | `validation/` | Combines OCR/extraction/medicine confidence into one uncertainty report |
| 6 | `labs/` | Rule-based reference-range parsing and NORMAL/HIGH/LOW/UNKNOWN classification |
| 7 | `timeline/` | Date parsing (never invents a date) and chronological event ordering |
| 8 | `interactions/` | openFDA-backed potential drug-interaction flags, never claims "safe" |
| 9 | `pipeline/` | Wires all of the above into `process_document()` / `run_module_b_pipeline()` |
| 10 | `api/` | Thin FastAPI layer over the pipeline |
| 11 | `benchmark/` | OCR/extraction/medicine/lab/date/uncertainty evaluation, synthetic-vs-real tagged |
| 12 | `observability/` | Redacting logger, safe error responses |

## Basic usage — full pipeline

```python
from pathlib import Path
from document_ai.pipeline.orchestration import build_default_config
from document_ai.pipeline.module_b import run_module_b_pipeline

config = build_default_config()  # reads env vars once
result = run_module_b_pipeline(
    [Path("samples/rx1.png"), Path("samples/lab1.pdf")],
    config,
    patient_reference="patient-local-ref-123",
)
print(result.model_dump(mode="json"))
```

## Basic usage — OCR only (Step 2)

```python
from document_ai.ocr.gemini import GeminiOCRProvider
from document_ai.ocr.vlm import VLMProvider, AnthropicVLMClient
from document_ai.ocr.router import OCRRouter
from pathlib import Path

# Gemini is the default primary provider. VLM is fallback.
router = OCRRouter(GeminiOCRProvider(), VLMProvider(AnthropicVLMClient(), "claude"),
                    fallback_confidence_threshold=0.5)  # placeholder, see Known limitations
result = router.transcribe(Path("samples/handwritten_rx/image.png"))
```

## Running the API

```bash
uvicorn document_ai.api.main:app --reload
```

- `GET /module-b/health` — which providers are configured
- `POST /module-b/ocr` — OCR a single file, returns raw transcription
- `POST /module-b/extract` — extract structured fields from raw text (no OCR)
- `POST /module-b/process` — full pipeline over one or more uploaded files

## Running the tests

```bash
pytest document_ai/ -q
```

**All mocked** — no live API calls, no credentials, no GPU, no internet
required. Coverage includes: OCR schema/providers/router, Step 3 extraction
(all three doc types plus malformed-response handling), medicine matching
(exact/misspelling/abbreviation/Indian-brand/garbage/agreement-disagreement/
provider-failure), the ABDM Drug Registry provider and its local-fallback
router, confidence validation, lab reference-range parsing and boundary
classification, timeline date parsing and ordering, drug-interaction status
semantics (including packet-verification gating), the full pipeline
end-to-end (mocked providers throughout), the FastAPI endpoints, and log
redaction.

## Running the benchmark (needs real samples + credentials)

See `benchmark/README.md`. Every report is tagged `synthetic: true/false` —
synthetic-dataset numbers are explicitly never reported as real accuracy.
Use real benchmark results, not the placeholders below, to set:
- `ocr/router.py`'s `DEFAULT_FALLBACK_CONFIDENCE_THRESHOLD`
- `medicine/confidence.py`'s `MedicineMatchThresholds`

## Medicine vocabulary sourcing

Official production source intended: the **ABDM Drug Registry**
(production portal: `https://drugregistry.abdm.gov.in`). This project
integrates against the confirmed sandbox search endpoint,
`https://drugregistrysbx.abdm.gov.in/drug-registry/v1/search` — **this is
sandbox integration, not a claim of production integration.**

Current development/demo fallback: `LocalBenchmarkProvider`, a hardcoded
list of 12 synthetic medicines, used only when ABDM is unreachable or for
offline unit tests. It is not, and is never presented as, the real Indian
medicine database.

## What's deliberately NOT here
- Diagnosis inference, treatment recommendation, autonomous clinical decisions
- Medicine inferred from a diagnosis, or vice versa
- A claim that missing drug-interaction data means "safe"
- ABHA authentication, consent management, FHIR exchange, doctor dashboard, patient UI, voice intake, clinical summary generation (Modules A/C/D). (The ABDM **Drug Registry** lookup used by `medicine/providers/abdm.py` is a separate, read-only reference-data API — it is not ABHA/consent/FHIR and does not touch patient identity.)
- A vector database or RAG (not needed for this scope)

## Known limitations (read before demoing)

- **ABDM Drug Registry integration is built against a captured, not officially documented, endpoint.** `medicine/providers/abdm.py` calls `https://drugregistrysbx.abdm.gov.in/drug-registry/v1/search` — this was confirmed via browser network inspection of the public ABDM Drug Registry site returning real HTTP 200 responses, but it does not appear in ABDM's published developer sandbox API documentation. It is very likely genuine (the "sbx" subdomain convention matches other confirmed ABDM sandbox subdomains, e.g. `healthidsbx.abdm.gov.in`), but being a public website's internal API rather than a documented one, it can change shape or add bot/CORS protection without a deprecation notice. **This endpoint has never been reached from any sandbox this project was built in** — implemented against the exact captured contract (URL, params, response field mapping) and covered by mocked tests, but UNVERIFIED live. Run a real lookup for "paracetamol" and "metformin" yourself before trusting it in a demo.
- **`LocalBenchmarkProvider` (alias of `IndianMedicineProvider`) is a synthetic, hardcoded list of 12 medicines** (`medicine/providers/indian_medicine._INDIAN_MEDICINES`) — not a real drug database, and not the official ABDM registry. It has no network dependency at all, and is used only as the offline fallback when ABDM is unreachable, and for unit tests. Any real prescription medicine outside that list, when ABDM is also unavailable, correctly falls through to `needs_verification` rather than being wrongly matched. Do not represent this synthetic list as production medicine coverage.
- **openFDA has never been reached from any sandbox this project was built in** (it's outside every network allowlist used throughout this project's development). It's implemented against its documented API contract and covered by mocked tests, but is UNVERIFIED against the live service. Run one real call against it yourself before trusting it in a demo.
- **`QwenVLMClient` is untested** — no GPU/HF access in any build environment used here.
- **Confidence/match-score thresholds are explicit placeholders**, not benchmark-derived: `ocr/router.py`'s `DEFAULT_FALLBACK_CONFIDENCE_THRESHOLD` and `medicine/confidence.py`'s `MedicineMatchThresholds`. Run the real benchmark on your own labeled samples before trusting them.
- **Timeline dates support day-level and month/year-level precision** — day-level formats (ISO, DD/MM/YYYY, natural language) and month-year-only formats (e.g. "May 2025", "05/2025") are both parsed; anything less precise than that stays `UNKNOWN` rather than guessed at.
- **openFDA interaction checking is one-directional per pair by default** — see `interactions/providers/openfda.py`; `checker.py` now queries both directions and merges the result, but each direction is still a single provider's labeling text, not a curated interaction database.
- **Gemini OCR confidence is self-reported** — Gemini does not provide native bounding-box / per-word confidence scores like Google Cloud Vision. The reported confidence is requested in the prompt and estimated by the model. A successful API response does NOT mean 95%+ accuracy.
- **`AnthropicVLMClient`/`AnthropicExtractionClient`/`GeminiOCRProvider` send document content to external APIs** — fine for synthetic/demo data, flag to your team before any real patient document goes through it.
- This is a hackathon prototype. It is not a certified medical device, not clinically validated, and not a substitute for a clinician's own review of every field it produces.
