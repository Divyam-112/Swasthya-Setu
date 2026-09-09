"""
Gemini OCR provider — multimodal transcription via the Google Gemini API.

Uses the official google-genai SDK. Credentials: GEMINI_API_KEY environment
variable. Model: GEMINI_MODEL environment variable (default: gemini-2.5-flash).

Hard rule (same as every other OCR provider in this codebase):
  SEE → READ → TRANSCRIBE.
  NOT: SEE → GUESS → DIAGNOSE.

This provider must NEVER normalize medicines, structure clinical fields,
diagnose, or recommend anything. That's Step 3+, not this layer.

Confidence handling:
  Gemini does not provide per-word OCR confidence scores the way Google
  Cloud Vision does. This provider asks the model to self-report a
  transcription confidence on a final line (same pattern as VLMProvider).
  If the model doesn't follow the format, confidence is set to None —
  never fabricated. A successful API response does NOT mean 95% accuracy.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

from .base import OCRProvider, OCRProviderError
from .schemas import OCRResult, OCRStatus, Page

# Supported image MIME types for Gemini multimodal input.
_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".pdf": "application/pdf",
}

GEMINI_TRANSCRIPTION_PROMPT = """\
You are the OCR extraction engine for MediVault.

Analyze the input image and return valid JSON only.

Classify it as:

* 1 = Prescription
* 2 = Lab/Medical Report

If Prescription

Extract only:

* time_sequence - preserve the written order/timing of medicines
* medicines - name, dosage, quantity, frequency, duration, timing
* doctor - name, qualifications, specialization, registration number, clinic/hospital
* reports_suggested - tests/reports explicitly mentioned

If Medical Report

Identify whether it is:

* lab / data report -> extract parameter, value, unit, reference range, and explicitly marked abnormal/high/low values
* imaging report (X-ray, MRI, CT, ultrasound, etc.) -> set image_preserved: true and do not interpret the scan

Highlight a value as abnormal only if:

* the report explicitly marks it abnormal/high/low, OR
* an explicit reference range is present and the value is outside it.

Do not infer abnormality from medical knowledge.

Never infer a medicine solely from disease/diagnosis context. If a medicine name is unclear, transcribe it exactly as written (or mark unreadable) — do not substitute what the condition "should" be treated with.

OCR

Extract only what is actually written and readable. Preserve wording/values as shown. Use null for missing or unreadable fields. Do not infer or correct text — never silently correct or normalize a name to what you think was "meant."

Return OCR confidence from 0-1, including field-level confidence where possible.

JSON format

Prescription:
{
"type": 1,
"ocr_confidence": 0.95,
"data": {
"time_sequence": [],
"medicines": [],
"doctor": {},
"reports_suggested": [],
"diagnosis_or_symptoms": []
}
}

Report:
{
"type": 2,
"ocr_confidence": 0.95,
"data": {
"report_type": "lab",
"values": [],
"image_preserved": false,
"diagnosis_or_symptoms": []
}
}

For imaging reports use "report_type": "imaging" and "image_preserved": true.

Return nothing outside the JSON."""

# Default Gemini model. Configurable via GEMINI_MODEL env var.
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

# Default timeout for Gemini API calls (seconds).
DEFAULT_TIMEOUT_SECONDS = 30

# Max retries for transient failures.
DEFAULT_MAX_RETRIES = 2


class GeminiOCRProvider(OCRProvider):
    """Gemini-based OCR provider using the google-genai SDK.

    Implements the same OCRProvider contract as GoogleVisionProvider and
    VLMProvider. Downstream code sees an identical OCRResult regardless
    of which provider produced it.
    """

    name = "gemini"

    def __init__(
        self,
        client=None,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ):
        """
        `client` is injectable for testing (pass a fake). In production,
        leave it None and a real google.genai.Client is built from env
        credentials on first use.
        """
        self._client = client
        self._api_key = api_key
        self._model = model or os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
        self._timeout_seconds = timeout_seconds
        self._max_retries = max_retries

    def _get_client(self):
        if self._client is not None:
            return self._client

        api_key = self._api_key or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise OCRProviderError(
                "GEMINI_API_KEY is not set. Set it in the environment "
                "before using GeminiOCRProvider."
            )

        try:
            from google import genai  # local import: optional dependency
        except ImportError as e:
            raise OCRProviderError(
                "google-genai package not installed. Run: pip install google-genai"
            ) from e

        try:
            self._client = genai.Client(api_key=api_key)
        except Exception as e:
            raise OCRProviderError(f"Failed to initialize Gemini client: {e}") from e

        return self._client

    def transcribe(self, file_path: Path, document_id: str | None = None) -> OCRResult:
        client = self._get_client()
        document_id = document_id or OCRResult.new_id()
        t0 = time.time()

        suffix = Path(file_path).suffix.lower()
        media_type = _MEDIA_TYPES.get(suffix)
        if media_type is None:
            raise OCRProviderError(
                f"Unsupported file type '{suffix}' for Gemini transcription. "
                f"Supported: {list(_MEDIA_TYPES)}"
            )

        try:
            file_bytes = Path(file_path).read_bytes()
        except OSError as e:
            raise OCRProviderError(f"Could not read file {file_path}: {e}") from e

        if not file_bytes:
            raise OCRProviderError(f"File is empty: {file_path}")

        # Call Gemini API with retry for transient failures
        raw_output = self._call_gemini(client, file_bytes, media_type)

        # Parse the response
        raw_text, confidence = _split_confidence(raw_output)

        warnings: list[str] = []
        if confidence is not None and confidence < 0.5:
            warnings.append("low_confidence")
        if "[UNREADABLE]" in raw_text:
            warnings.append("contains_unreadable_regions")
        if not raw_text.strip():
            warnings.append("no_text_detected")

        page = Page(
            page_number=1,
            raw_text=raw_text,
            confidence=confidence,
            warnings=warnings,
        )

        return OCRResult(
            document_id=document_id,
            provider=self.name,
            ocr_status=OCRStatus.SUCCESS if raw_text.strip() else OCRStatus.PARTIAL,
            pages=[page],
            processing_time_seconds=time.time() - t0,
        )

    def _call_gemini(self, client, file_bytes: bytes, media_type: str) -> str:
        """Call the Gemini API with basic retry for transient errors."""
        last_error = None

        for attempt in range(1, self._max_retries + 2):  # +2 because range is exclusive, +1 for initial attempt
            try:
                return self._single_call(client, file_bytes, media_type)
            except OCRProviderError as e:
                # Check if this is a retryable error (rate limit, timeout)
                error_str = str(e).lower()
                is_retryable = any(term in error_str for term in (
                    "rate limit", "quota", "resource_exhausted", "429", "timeout",
                ))
                if is_retryable and attempt <= self._max_retries:
                    last_error = e
                    time.sleep(min(2 ** attempt, 8))  # exponential backoff, capped
                    continue
                raise  # Non-retryable or exhausted retries — propagate
            except Exception as e:
                last_error = e
                error_str = str(e).lower()
                # Don't retry auth failures or invalid requests
                if any(term in error_str for term in ("invalid api key", "unauthorized", "forbidden", "invalid_argument")):
                    raise OCRProviderError(f"Gemini API authentication/request error: {e}") from e
                # Retry on transient errors (rate limit, server errors, network)
                if attempt <= self._max_retries:
                    time.sleep(min(2 ** attempt, 8))  # exponential backoff, capped
                    continue
                break

        raise OCRProviderError(f"Gemini API call failed after {self._max_retries + 1} attempts: {last_error}") from last_error

    def _single_call(self, client, file_bytes: bytes, media_type: str) -> str:
        """Make a single Gemini API call. Returns the raw text response."""
        try:
            from google.genai import types  # local import: optional dependency
        except ImportError:
            # Fallback for testing with injected client — the client handles
            # the call format directly.
            pass

        try:
            response = client.models.generate_content(
                model=self._model,
                contents=[
                    types.Part.from_bytes(data=file_bytes, mime_type=media_type),
                    GEMINI_TRANSCRIPTION_PROMPT,
                ],
            )
        except Exception as e:
            error_str = str(e).lower()
            if any(term in error_str for term in ("quota", "rate", "resource_exhausted", "429")):
                raise OCRProviderError(f"Gemini API rate limit/quota exceeded: {e}") from e
            if any(term in error_str for term in ("timeout", "deadline")):
                raise OCRProviderError(f"Gemini API timeout: {e}") from e
            raise  # Let _call_gemini decide if it's retryable

        if response is None:
            raise OCRProviderError("Gemini returned None response")

        # Extract text from response
        try:
            text = response.text
        except (AttributeError, ValueError) as e:
            raise OCRProviderError(f"Gemini returned malformed response: {e}") from e

        if text is None:
            raise OCRProviderError("Gemini returned empty text in response")

        return text


def _split_confidence(raw_output: str) -> tuple[str, float | None]:
    if not raw_output:
        return "", None

    # Try parsing as JSON first (from revised prompt)
    clean_text = raw_output.strip()
    if clean_text.startswith("```json"):
        clean_text = clean_text[7:]
    if clean_text.startswith("```"):
        clean_text = clean_text[3:]
    if clean_text.endswith("```"):
        clean_text = clean_text[:-3]
    clean_text = clean_text.strip()
    
    import json
    try:
        data = json.loads(clean_text)
        if isinstance(data, dict) and "document_confidence" in data:
            return clean_text, max(0.0, min(1.0, float(data["document_confidence"])))
    except Exception:
        pass

    # Legacy fallback
    lines = raw_output.rstrip().splitlines()
    if lines and lines[-1].strip().upper().startswith("CONFIDENCE:"):
        tail = lines.pop()
        text = "\n".join(lines)
        try:
            value = float(tail.split(":", 1)[1].strip())
            return text, max(0.0, min(1.0, value))
        except (IndexError, ValueError):
            return raw_output, None
    return raw_output, None
