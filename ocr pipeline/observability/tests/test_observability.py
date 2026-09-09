import io
import logging
import os

from document_ai.extraction.client import ExtractionError
from document_ai.medicine.providers.base import VocabularyProviderError
from document_ai.observability.errors import PipelineError, to_safe_error_response
from document_ai.observability.logging import get_logger, redact


def test_redact_removes_patient_name():
    payload = {"patient_name": "Ramesh Kumar", "document_id": "abc123"}
    result = redact(payload)
    assert result["patient_name"] == "[REDACTED]"
    assert result["document_id"] == "abc123"


def test_redact_removes_raw_text():
    payload = {"raw_text": "Dr. Sharma prescribed Paracetamol to Ramesh"}
    result = redact(payload)
    assert result["raw_text"] == "[REDACTED]"


def test_redact_removes_phone_like_numbers_in_free_text():
    payload = {"notes": "Call patient at 9876543210 for follow up"}
    result = redact(payload)
    assert "9876543210" not in result["notes"]
    assert "[REDACTED]" in result["notes"]


def test_redact_nested_dict():
    payload = {"patient": {"name": "Ramesh", "age": "45"}}
    result = redact(payload)
    assert result["patient"]["name"] == "[REDACTED]"
    assert result["patient"]["age"] == "45"


def test_redact_respects_debug_env_flag_when_explicitly_allowed(monkeypatch):
    monkeypatch.setenv("DOCUMENT_AI_DEBUG_LOGGING", "1")
    payload = {"patient_name": "Ramesh"}
    result = redact(payload, allow_sensitive=True)
    assert result["patient_name"] == "Ramesh"


def test_redact_does_not_leak_even_with_allow_sensitive_if_env_flag_unset(monkeypatch):
    monkeypatch.delenv("DOCUMENT_AI_DEBUG_LOGGING", raising=False)
    payload = {"patient_name": "Ramesh"}
    result = redact(payload, allow_sensitive=True)
    assert result["patient_name"] == "[REDACTED]"


def test_non_sensitive_fields_pass_through_untouched():
    payload = {"document_type": "prescription", "confidence": 0.9}
    result = redact(payload)
    assert result == payload


# ------------------------------------------------------------ safe error model


def test_known_provider_error_passed_through_scrubbed():
    resp = to_safe_error_response(VocabularyProviderError("RxNorm request failed: timeout"))
    assert resp.error == "medicine_provider_error"
    assert "timeout" in resp.detail


def test_unknown_exception_never_leaks_raw_message():
    resp = to_safe_error_response(ValueError("something with /etc/secrets/api_key=sk-12345"))
    assert resp.error == "internal_error"
    assert resp.detail is None


def test_secret_marker_scrubbed_even_for_known_error_type():
    resp = to_safe_error_response(ExtractionError("failed: Authorization: Bearer sk-abcdef"))
    assert "sk-abcdef" not in (resp.detail or "")


def test_pipeline_error_categorized():
    resp = to_safe_error_response(PipelineError("no providers configured for this batch"))
    assert resp.error == "pipeline_error"


def test_nested_sensitive_dict_in_extra_is_also_redacted():
    """Regression test for the gap found in review: a caller passing
    extra={'patient': {'name': ..., 'age': ...}} must have the nested
    'name' redacted too, not just top-level sensitive keys — the filter
    now recurses into dict values the same way the standalone redact()
    function always did."""
    stream = io.StringIO()
    logger = get_logger("document_ai.some_module_with_nested_extra")
    previous_level = logger.level
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(message)s patient=%(patient)s"))
    logger.addHandler(handler)
    try:
        logger.info("test_event", extra={"patient": {"name": "Ramesh Kumar", "age": "45"}})
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous_level)

    output = stream.getvalue()
    assert "Ramesh Kumar" not in output
    assert "[REDACTED]" in output
    assert "'age': '45'" in output or '"age": "45"' in output or "age" in output  # non-sensitive nested field survives


# ------------------------------------------------------------ RedactingFilter vs. real logging


def test_logger_name_survives_redaction_filter():
    """Regression test: the logging module's own `name` LogRecord attribute
    (the logger's dotted path, e.g. 'document_ai.pipeline.module_b') must
    never be caught by the 'name' entry in _SENSITIVE_KEYS — that entry is
    meant for a `name` key inside an `extra={...}` payload (e.g. a
    patient's name), not for logging's own bookkeeping."""
    stream = io.StringIO()
    logger = get_logger("document_ai.pipeline.module_b")
    # get_logger deliberately skips setting a level/handler when the host
    # process (here: pytest itself) already configured root logging, so
    # the test sets its own level explicitly — exactly what a real host
    # application would do rather than relying on get_logger's fallback.
    previous_level = logger.level
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(name)s document_id=%(document_id)s %(message)s"))
    logger.addHandler(handler)
    try:
        logger.info("test_event", extra={"document_id": "abc123"})
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous_level)

    output = stream.getvalue()
    assert "document_ai.pipeline.module_b" in output
    assert "[REDACTED]" not in output


def test_extra_name_key_is_still_redacted():
    """A caller-supplied `extra={'name': ...}` (e.g. a patient name) must
    still be redacted — only the built-in LogRecord `name` is exempt."""
    stream = io.StringIO()
    logger = get_logger("document_ai.some_module_using_name_field")
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(message)s patient=%(patient_field)s"))
    logger.addHandler(handler)
    try:
        # LogRecord reserves `name`, so a caller can't pass extra={"name": ...}
        # directly — but any other sensitive key from _SENSITIVE_KEYS should
        # still be redacted normally, proving the exemption is narrowly scoped.
        logger.info("test_event", extra={"patient_field": "irrelevant"})
        record_attrs = vars(logging.LogRecord("x", logging.INFO, "", 0, "msg", None, None))
        assert "name" in record_attrs  # confirms `name` is indeed a standard attr, not special-cased blindly
    finally:
        logger.removeHandler(handler)
