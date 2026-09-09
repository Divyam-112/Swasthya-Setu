from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from document_ai.api.main import app, get_config
from document_ai.ocr.base import OCRProvider
from document_ai.ocr.router import OCRRouter
from document_ai.ocr.schemas import OCRResult, OCRStatus, Page
from document_ai.pipeline.orchestration import PipelineConfig


class FakeOCRProvider(OCRProvider):
    name = "fake_ocr"

    def transcribe(self, file_path: Path, document_id: str | None = None) -> OCRResult:
        return OCRResult(
            document_id=document_id or "doc",
            provider=self.name,
            ocr_status=OCRStatus.SUCCESS,
            pages=[Page(page_number=1, raw_text="Paracetamol 650mg 1-0-1 x 5 days", confidence=0.9)],
        )


class FailingOCRProvider(OCRProvider):
    name = "failing_ocr"

    def transcribe(self, file_path: Path, document_id: str | None = None) -> OCRResult:
        from document_ai.ocr.base import OCRProviderError
        raise OCRProviderError("simulated provider outage")


class FakeExtractionClient:
    def extract(self, ocr_text, schema_json, document_type):
        return {
            "document_type": "prescription",
            "medications": [{"raw_name": {"value": "Paracetamol", "confidence": 0.9,
                                           "source_text": "Paracetamol", "needs_verification": False}}],
        }


def _empty_config() -> PipelineConfig:
    return PipelineConfig(ocr_router=None, extraction_client=None, medicine_provider=None, interaction_provider=None)


def _working_config() -> PipelineConfig:
    router = OCRRouter(FakeOCRProvider(), None, fallback_confidence_threshold=0.0)
    return PipelineConfig(ocr_router=router, extraction_client=FakeExtractionClient(),
                           medicine_provider=None, interaction_provider=None)


def _failing_ocr_config() -> PipelineConfig:
    router = OCRRouter(FailingOCRProvider(), None, fallback_confidence_threshold=0.0)
    return PipelineConfig(ocr_router=router, extraction_client=None)


@pytest.fixture
def client_no_providers():
    app.dependency_overrides[get_config] = _empty_config
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def client_with_providers():
    app.dependency_overrides[get_config] = _working_config
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health_endpoint_no_providers(client_no_providers):
    resp = client_no_providers.get("/module-b/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["ocr_provider_configured"] is False
    assert body["extraction_provider_configured"] is False


def test_health_endpoint_with_providers(client_with_providers):
    resp = client_with_providers.get("/module-b/health")
    body = resp.json()
    assert body["ocr_provider_configured"] is True
    assert body["extraction_provider_configured"] is True


def test_ocr_endpoint_returns_503_when_unconfigured(client_no_providers):
    resp = client_no_providers.post("/module-b/ocr", files={"file": ("rx.png", b"fake bytes", "image/png")})
    assert resp.status_code == 503


def test_ocr_endpoint_success(client_with_providers):
    resp = client_with_providers.post("/module-b/ocr", files={"file": ("rx.png", b"fake bytes", "image/png")})
    assert resp.status_code == 200
    body = resp.json()
    assert body["ocr_status"] == "success"
    assert "Paracetamol" in body["full_text"]
    assert body["provider"] == "fake_ocr"


def test_ocr_endpoint_provider_failure_returns_502():
    app.dependency_overrides[get_config] = _failing_ocr_config
    client = TestClient(app)
    resp = client.post("/module-b/ocr", files={"file": ("rx.png", b"fake bytes", "image/png")})
    app.dependency_overrides.clear()
    assert resp.status_code == 502


def test_ocr_endpoint_rejects_unsupported_file_type(client_with_providers):
    """Regression test: /module-b/ocr previously skipped file_validator
    entirely, unlike /module-b/process — an unsupported file type should
    be rejected with 400 before ever reaching the OCR provider."""
    resp = client_with_providers.post("/module-b/ocr", files={"file": ("notes.exe", b"fake bytes", "application/octet-stream")})
    assert resp.status_code == 400
    assert "unsupported_file_type" in resp.json()["detail"]


def test_ocr_endpoint_rejects_empty_file(client_with_providers):
    resp = client_with_providers.post("/module-b/ocr", files={"file": ("rx.png", b"", "image/png")})
    assert resp.status_code == 400
    assert "empty_file" in resp.json()["detail"]


def test_extract_endpoint_returns_503_when_unconfigured(client_no_providers):
    resp = client_no_providers.post("/module-b/extract", json={"ocr_text": "Paracetamol", "document_type": "prescription"})
    assert resp.status_code == 503


def test_extract_endpoint_success(client_with_providers):
    resp = client_with_providers.post("/module-b/extract", json={"ocr_text": "Paracetamol 650mg", "document_type": "prescription"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["medications"][0]["raw_name"]["value"] == "Paracetamol"


def test_extract_endpoint_unknown_document_type(client_with_providers):
    resp = client_with_providers.post("/module-b/extract", json={"ocr_text": "x", "document_type": "not_a_real_type"})
    assert resp.status_code == 400


def test_process_endpoint_requires_at_least_one_file(client_with_providers):
    resp = client_with_providers.post("/module-b/process", files=[])
    assert resp.status_code in (400, 422)


def test_process_endpoint_end_to_end(client_with_providers):
    resp = client_with_providers.post(
        "/module-b/process",
        files=[("files", ("rx.png", b"fake bytes", "image/png"))],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "document_id" in body
    assert body["patient_reference"] is None
    assert "pipeline" in body
    assert body["pipeline"]["status"] in ("success", "partial", "failed")


def test_no_secrets_in_error_response(client_no_providers):
    """Even for an unhandled exception, the response body must never
    contain anything resembling a leaked key/token."""
    resp = client_no_providers.post("/module-b/extract", json={"ocr_text": "", "document_type": "prescription"})
    assert resp.status_code in (400, 503, 500)
    text = resp.text.lower()
    assert "api_key" not in text
    assert "bearer " not in text
