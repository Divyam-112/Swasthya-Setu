"""
Step 10: thin FastAPI layer over the Module B pipeline.

All business logic lives in document_ai.pipeline / document_ai.ocr /
document_ai.extraction / document_ai.labs / document_ai.medicine /
document_ai.timeline / document_ai.interactions. This module only does
HTTP plumbing: request parsing, temp-file handling, calling into those
modules, and turning results/exceptions into HTTP responses.

No API key is ever read here directly and none is ever echoed back in a
response — see document_ai.pipeline.orchestration.build_default_config,
which reads credentials from environment variables exactly once at
startup.
"""

from __future__ import annotations

import logging
import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import sys, importlib.util
_ocr_root = str(Path(__file__).resolve().parent.parent)
if _ocr_root not in sys.path:
    sys.path.insert(0, _ocr_root)
if 'document_ai' not in sys.modules:
    _spec = importlib.util.spec_from_loader('document_ai', None, is_package=True)
    _doc_ai = importlib.util.module_from_spec(_spec)
    _doc_ai.__path__ = [_ocr_root]
    sys.modules['document_ai'] = _doc_ai

from document_ai.extraction.discharge_summary_extractor import extract_discharge_summary
from document_ai.extraction.lab_report_extractor import extract_lab_report
from document_ai.extraction.prescription_extractor import extract_prescription
from document_ai.ingestion.file_validator import validate_file
from document_ai.observability.errors import PipelineError, to_safe_error_response
from document_ai.observability.logging import get_logger
from document_ai.pipeline.module_b import run_module_b_pipeline
from document_ai.pipeline.orchestration import PipelineConfig, build_default_config
from document_ai.pipeline.schemas import ModuleBResult
import base64
from document_ai.medicine.verification import apply_verification, compare_evidence, process_packet_image
from document_ai.storage.schemas import StoredMedicine

from .schemas import ExtractOnlyRequest, HealthResponse, MedicineVerificationRequest, MedicineVerificationResponse, OCROnlyResponse

logger = get_logger(__name__)

app = FastAPI(
    title="Module B — Medical Document Digitization & Intelligence",
    description="AIML pipeline for SIH26047 Patient Case-Taking Software, Module B only.",
    version="1.0.0",
)

_EXTRACTORS = {
    "prescription": extract_prescription,
    "lab_report": extract_lab_report,
    "discharge_summary": extract_discharge_summary,
}

_config: PipelineConfig | None = None


def get_config() -> PipelineConfig:
    """Lazily builds the provider config once per process. A module-level
    singleton is fine here: it only reads env vars and constructs
    lightweight client objects, no network call happens at build time."""
    global _config
    if _config is None:
        _config = build_default_config()
    return _config


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    logger.error("unhandled_exception", extra={"path": str(request.url.path)})
    body = to_safe_error_response(exc)
    return JSONResponse(status_code=500, content=body.model_dump())


@app.get("/module-b/health", response_model=HealthResponse)
def health(config: PipelineConfig = Depends(get_config)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        ocr_provider_configured=config.ocr_router is not None,
        extraction_provider_configured=config.extraction_client is not None,
        medicine_provider_configured=config.medicine_provider is not None,
        interaction_provider_configured=config.interaction_provider is not None,
    )


@app.post("/module-b/ocr", response_model=OCROnlyResponse)
async def ocr_only(file: UploadFile = File(...), config: PipelineConfig = Depends(get_config)) -> OCROnlyResponse:
    if config.ocr_router is None:
        raise HTTPException(status_code=503, detail="OCR provider not configured")

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir) / (file.filename or "upload")
        with tmp_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)

        validation = validate_file(tmp_path)
        if not validation.valid:
            raise HTTPException(status_code=400, detail=f"File rejected: {validation.reason}")

        document_id = str(uuid.uuid4())
        try:
            result = config.ocr_router.transcribe(tmp_path, document_id=document_id)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"OCR provider failed: {type(e).__name__}") from e

    if result.ocr_status.value == "failed":
        raise HTTPException(status_code=502, detail=f"OCR provider failed: {result.error or 'unknown error'}")

    warnings = [w for page in result.pages for w in page.warnings]
    return OCROnlyResponse(
        document_id=result.document_id,
        ocr_status=result.ocr_status.value,
        provider=result.provider,
        average_confidence=result.average_confidence(),
        full_text=result.full_text(),
        warnings=warnings,
    )


@app.post("/module-b/extract")
async def extract_only(payload: ExtractOnlyRequest, config: PipelineConfig = Depends(get_config)) -> dict:
    if config.extraction_client is None:
        raise HTTPException(status_code=503, detail="Extraction provider not configured")

    extractor = _EXTRACTORS.get(payload.document_type)
    if extractor is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown document_type '{payload.document_type}'. Expected one of: {list(_EXTRACTORS)}",
        )

    class _FakeOCRResultWrapper:
        """extract_* helpers take an OCRResult and call .full_text() on it;
        this endpoint accepts raw text directly (no OCR step here), so we
        adapt without duplicating the extractor functions."""

        def __init__(self, text: str):
            self._text = text

        def full_text(self) -> str:
            return self._text

    extraction_model = extractor(_FakeOCRResultWrapper(payload.ocr_text), config.extraction_client)
    return extraction_model.model_dump(mode="json")


@app.post("/module-b/process", response_model=ModuleBResult)
async def process(files: list[UploadFile] = File(...), config: PipelineConfig = Depends(get_config)) -> ModuleBResult:
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_dir_path = Path(tmp_dir)
        saved_paths: list[Path] = []
        for upload in files:
            dest = tmp_dir_path / (upload.filename or f"{uuid.uuid4()}.bin")
            with dest.open("wb") as f:
                shutil.copyfileobj(upload.file, f)
            saved_paths.append(dest)

        try:
            result = run_module_b_pipeline(saved_paths, config)
        except PipelineError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e

    return result


@app.post("/module-b/medicine-verification", response_model=MedicineVerificationResponse)
async def medicine_verification(
    payload: MedicineVerificationRequest,
    config: PipelineConfig = Depends(get_config),
) -> MedicineVerificationResponse:
    """Verify a medicine's identity using a packet/strip/box photo.

    Requires a medicine_id from a previous /module-b/process call and a
    base64-encoded image of the medicine packaging. Updates the SAME
    medicine record — never creates a duplicate.
    """
    if config.state_store is None:
        raise HTTPException(
            status_code=503,
            detail="State store not configured. Medicine verification requires state persistence.",
        )

    stored = config.state_store.get_medicine(payload.medicine_id)
    if stored is None:
        raise HTTPException(status_code=404, detail=f"Medicine {payload.medicine_id!r} not found")

    # Decode base64 image to temp file
    try:
        image_bytes = base64.b64decode(payload.packet_image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}") from e

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir) / "packet_image.png"
        tmp_path.write_bytes(image_bytes)

        # Process packet image
        packet_result = process_packet_image(
            tmp_path,
            ocr_router=config.ocr_router,
            medicine_provider=config.medicine_provider,
        )

    # Compare evidence if we got candidates
    if packet_result.packet_candidates:
        packet_result = compare_evidence(stored.normalized_medicine, packet_result)

    # Apply verification to the medicine
    updated_medicine = apply_verification(stored.normalized_medicine, packet_result)

    # Persist the update
    from datetime import datetime, timezone
    stored.normalized_medicine = updated_medicine
    stored.updated_at = datetime.now(timezone.utc)
    config.state_store.update_medicine(payload.medicine_id, stored)

    return MedicineVerificationResponse(
        medicine_id=payload.medicine_id,
        status=packet_result.status.value,
        verified_name=packet_result.verified_name,
        needs_verification=updated_medicine.needs_verification,
        reason=packet_result.reason,
    )


@app.post("/api/ocr/process")
async def process_image_url(
    payload: dict,
    config: PipelineConfig = Depends(get_config),
):
    """Compatibility endpoint for Node.js backend: accepts { imageUrl: string }"""
    import urllib.request
    from document_ai.ocr.gemini import GeminiOCRProvider

    image_url = payload.get("imageUrl")
    if not image_url:
        raise HTTPException(status_code=400, detail="imageUrl is required")

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir) / "downloaded_document.jpg"
        try:
            req = urllib.request.Request(image_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req) as resp, tmp_path.open("wb") as out_f:
                shutil.copyfileobj(resp, out_f)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to fetch image: {e}")

        provider = GeminiOCRProvider()
        result = provider.transcribe(tmp_path)
        
        # Parse extracted json if available
        import json
        clean_text = result.full_text().strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.startswith("```"):
            clean_text = clean_text[3:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        clean_text = clean_text.strip()
        
        extracted_data = {}
        try:
            extracted_data = json.loads(clean_text)
        except Exception:
            extracted_data = {"rawText": result.full_text()}

        return {
            "rawText": result.full_text(),
            "extractedData": extracted_data,
        }

