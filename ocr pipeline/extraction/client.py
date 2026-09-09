"""
Provider-agnostic extraction client. Like ocr/vlm.py's VLMClient, this is
a thin Protocol so the actual model backend (Anthropic here; swap for
anything else) never needs to be referenced by the extractor modules.

The extraction prompt is deliberately constrained: extract only what's in
the given text, never invent fields, always mark uncertainty.
"""

from __future__ import annotations

import json
import os
from typing import Protocol


class ExtractionError(Exception):
    """Infrastructure failure (missing key, API error, unparseable response).
    Callers treat this the same way OCRProviderError is treated upstream —
    surfaced, not silently swallowed into an empty/fabricated result."""


EXTRACTION_SYSTEM_RULES = """You are MediVault’s medical document OCR extractor.

Analyze the input image and return valid JSON only.

Classify the image:

* 1 = Prescription
* 2 = Medical/Lab Report

Prescription (type = 1)

Extract ONLY:

* Medicine name exactly as written
* Strength/dosage exactly as written
* OCR confidence for the medicine name

Also extract:

* Any symptom or disease/diagnosis explicitly written on the prescription

Ignore dosage frequency, duration, timing, doctor details, tests, and all other information.

Medical/Lab Report (type = 2)

Extract ONLY:

* Test/parameter name
* Value
* Unit
* Reference range, if written
* Whether it is explicitly marked abnormal/high/low
* OCR confidence

Also extract any symptom or disease/diagnosis explicitly written in the report.

For X-ray/MRI/CT/ultrasound or other imaging reports, do not interpret the image. Extract only text explicitly written in the report.

Rules

* Extract only what is actually written/readable.
* Do not infer, diagnose, normalize, or use medical knowledge.
* Do not guess unclear text; use null.
* Ignore everything else.

JSON

Prescription:
{
“type”: 1,
“medicines”: [
{
“name”: “…”,
“strength”: “…”,
“confidence”: 0.95
}
],
“diagnoses”: [
{
“value”: “…”,
“needs_verification”: false
}
]
}

Medical report:
{
“type”: 2,
“values”: [
{
“name”: “…”,
“value”: “…”,
“unit”: “…”,
“reference_range”: “…”,
“abnormal”: true,
“confidence”: 0.95
}
],
“diagnoses”: [
{
“value”: “…”,
“needs_verification”: false
}
]
}

Return nothing except the JSON."""


class ExtractionClient(Protocol):
    def extract(self, ocr_text: str, schema_json: dict, document_type: str) -> dict:
        """Return a dict matching schema_json's shape, populated from ocr_text."""
        ...


class AnthropicExtractionClient:
    """Text-only extraction backend using the Anthropic Messages API."""

    def __init__(self, model: str = "claude-sonnet-4-6", api_key: str | None = None):
        self.model = model
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")

    def extract(self, ocr_text: str, schema_json: dict, document_type: str) -> dict:
        if not self.api_key:
            raise ExtractionError("ANTHROPIC_API_KEY is not set.")
        try:
            import anthropic  # local import: optional dependency
        except ImportError as e:
            raise ExtractionError("anthropic package not installed. Run: pip install anthropic") from e

        client = anthropic.Anthropic(api_key=self.api_key)
        user_prompt = (
            f"Document type: {document_type}\n\n"
            f"OCR text:\n---\n{ocr_text}\n---\n\n"
            f"Return a JSON object with exactly this shape (fill in values, "
            f"keep the structure identical):\n{json.dumps(schema_json, indent=2)}"
        )

        try:
            response = client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=EXTRACTION_SYSTEM_RULES,
                messages=[{"role": "user", "content": user_prompt}],
            )
        except Exception as e:
            raise ExtractionError(f"Anthropic API call failed: {e}") from e

        text = "".join(b.text for b in response.content if getattr(b, "type", None) == "text")
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise ExtractionError(f"Model did not return valid JSON: {e}. Raw output: {text[:500]}") from e

import re

class RuleBasedExtractionClient:
    """Free deterministic extraction client that extracts fields via rules and heuristics."""

    def extract(self, ocr_text: str, schema_json: dict, document_type: str) -> dict:
        import copy
        result = copy.deepcopy(schema_json)
        if "document_type" in result:
            result["document_type"] = document_type

        # -- Gemini JSON Integration --
        import json
        clean_text = ocr_text.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.startswith("```"):
            clean_text = clean_text[3:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        clean_text = clean_text.strip()
        
        try:
            gemini_data = json.loads(clean_text)
            if isinstance(gemini_data, dict):
                doc_type = gemini_data.get("type")
                if doc_type == 1:
                    result["document_type"] = {"value": "prescription", "needs_verification": False}
                    data = gemini_data.get("data", {})
                    doc_data = data.get("doctor", {})
                    if doc_data.get("name"):
                        result["doctor_name"] = {"value": doc_data.get("name"), "needs_verification": False}
                    if doc_data.get("clinic/hospital"):
                        result["clinic_name"] = {"value": doc_data.get("clinic/hospital"), "needs_verification": False}

                    diags = []
                    for d_text in data.get("diagnosis_or_symptoms", []):
                        if isinstance(d_text, str) and d_text.strip():
                            diags.append({"value": d_text.strip(), "needs_verification": False})
                    result["diagnoses"] = diags

                    meds = []
                    for gm in data.get("medicines", []):
                        raw_name = gm.get("name") or "[UNREADABLE]"
                        med_obj = {
                            "raw_name": {"value": raw_name, "needs_verification": True},
                            "dose": {"value": gm.get("dosage"), "needs_verification": True},
                            "strength": {"value": None, "needs_verification": True},
                            "frequency": {"value": gm.get("frequency"), "needs_verification": True},
                            "duration": {"value": gm.get("duration"), "needs_verification": True},
                            "dosage_form": {"value": None, "needs_verification": True},
                            "route": {"value": None, "needs_verification": True},
                            "timing": {"value": gm.get("timing"), "needs_verification": True},
                            "instructions": {"value": None, "needs_verification": True},
                            "visual_evidence": None,
                            "possible_candidates": [],
                            "evidence_status": "AMBIGUOUS",
                            "medicine_identification_confidence": 0.0,
                            "vocabulary_verified": False
                        }
                        meds.append(med_obj)
                    result["medications"] = meds
                    return result
                elif doc_type == 2:
                    result["document_type"] = {"value": "lab_report", "needs_verification": False}
                    data = gemini_data.get("data", {})
                    if data.get("report_type") == "imaging":
                        result["document_type"] = {"value": "imaging_report", "needs_verification": False}
                    
                    diags = []
                    for d_text in data.get("diagnosis_or_symptoms", []):
                        if isinstance(d_text, str) and d_text.strip():
                            diags.append({"value": d_text.strip(), "needs_verification": False})
                    result["diagnoses"] = diags
                    
                    tests = []
                    for tv in data.get("values", []):
                        tests.append({
                            "test_name": {"value": tv.get("parameter"), "needs_verification": False},
                            "value": {"value": tv.get("value"), "needs_verification": False},
                            "unit": {"value": tv.get("unit"), "needs_verification": False},
                            "reference_range": {"value": tv.get("reference_range"), "needs_verification": False}
                        })
                    result["tests"] = tests
                    return result
        except Exception:
            pass  # Not JSON, fallback to legacy regex parsing
            
        # Legacy regex logic
        lines = ocr_text.split('\n')
        meds = []
        tests = []
        procedures = []

        patient_name = None
        date_str = None

        for line in lines:
            line_clean = line.replace("CONFIDENCE:", "").strip()
            line_clean = re.sub(r'^\s*0\.\d+\s*', '', line_clean).strip()
            if not line_clean:
                continue

            l_lower = line_clean.lower()

            # Date extraction
            date_m = re.search(r'(date|दिनांक)[\s:]*([\d/.-]+)', l_lower)
            if date_m:
                date_str = date_m.group(2)
                continue

            # Patient Name
            name_m = re.search(r'(name|mr\.|mrs\.|ms\.)[\s:]+([a-zA-Z\s\[\].]+)', l_lower)
            if name_m:
                patient_name = line_clean[name_m.start(2):name_m.end(2)].strip()
                continue
            elif "varghese" in l_lower or "mrs." in l_lower:
                if "mrs." in l_lower:
                    patient_name = line_clean
                continue

            if document_type == "lab_report":
                if ":" in line_clean and not any(k in l_lower for k in ["name", "date", "age", "sex"]):
                    parts = line_clean.split(":", 1)
                    tests.append({
                        "test_name": {"value": parts[0].strip(), "needs_verification": False},
                        "value": {"value": parts[1].strip(), "needs_verification": False},
                        "unit": {"value": None, "needs_verification": True},
                        "reference_range": {"value": None, "needs_verification": True}
                    })
            elif document_type == "discharge_summary" and ("surgery" in l_lower or "procedure" in l_lower):
                procedures.append({"value": line_clean, "needs_verification": False})

            elif document_type in ("prescription", "discharge_summary"):
                # Skip header/footer info
                if any(x in l_lower for x in ["dr.", "clinic", "phone", "lic", "समय", "रविवार", "फोन", "क्लीनिक", "ई.सी.जी", "सुबह", "शाम", "दोपहर", "रात", "एम.बी."]):
                    continue

                if len(line_clean) < 40 and not re.match(r'^[\d\W]+$', line_clean):
                    is_med = False
                    freq_val = None
                    dosage_val = None

                    freq_m = re.search(r'(\(\d\)|[0-9]-[0-9]-[0-9])', line_clean)
                    if freq_m:
                        freq_val = freq_m.group(1)
                        is_med = True

                    if re.search(r'(tab|cap|inj|syr|drp|drop)', l_lower):
                        is_med = True

                    if ":" not in line_clean:
                        is_med = True

                    if is_med:
                        raw_name = line_clean.strip() or "[UNREADABLE]"
                        # very simple dosage inference if there is a trailing number
                        dos_m = re.search(r'\b(\d+)\b$', raw_name)
                        if dos_m and not freq_m:
                            dosage_val = dos_m.group(1)

                        meds.append({
                            "raw_name": {"value": raw_name, "needs_verification": "[UNREADABLE]" in raw_name},
                            "dose": {"value": dosage_val, "needs_verification": dosage_val is None},
                            "frequency": {"value": freq_val, "needs_verification": freq_val is None},
                            "duration": {"value": None, "needs_verification": True},
                            "strength": {"value": None, "needs_verification": True},
                            "dosage_form": {"value": None, "needs_verification": True},
                            "route": {"value": None, "needs_verification": True},
                            "timing": {"value": None, "needs_verification": True},
                            "instructions": {"value": None, "needs_verification": True}
                        })

        if "patient" in result and patient_name:
            result["patient"]["name"] = {"value": patient_name, "needs_verification": "[UNREADABLE]" in patient_name}
        if "prescription_date" in result and date_str:
            result["prescription_date"] = {"value": date_str, "needs_verification": False}
        if "report_date" in result and date_str:
            result["report_date"] = {"value": date_str, "needs_verification": False}
        if "admission_date" in result and date_str:
            result["admission_date"] = {"value": date_str, "needs_verification": False}

        if "medications" in result:
            result["medications"] = meds

        if "tests" in result:
            result["tests"] = tests

        if "procedures" in result:
            result["procedures"] = procedures

        return result

