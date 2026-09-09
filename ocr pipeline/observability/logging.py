"""
Step 12: structured logging with privacy redaction built in.

Never logs, by default: patient names, phone numbers, addresses, ABHA
IDs, raw document contents/full prescriptions. Logging those requires
explicitly passing allow_sensitive=True AND setting
DOCUMENT_AI_DEBUG_LOGGING=1 in the environment — a deliberate double
opt-in so it can't happen by accident in production.

Every log call should include a document_id/correlation_id where one is
available, so a support engineer can trace one document's path through
the pipeline without ever needing the document's actual contents.
"""

from __future__ import annotations

import logging
import os
import re

_SENSITIVE_KEYS = {
    "patient_name", "name", "phone", "phone_number", "address", "abha_id",
    "abha", "raw_text", "full_text", "prescription", "source_text",
}

# Redact anything that looks like a 10+ digit phone number or an ABHA-style
# 14-digit ID, even inside free text, as a defense-in-depth backstop.
_PHONE_RE = re.compile(r"\b\d{10,14}\b")


def _debug_logging_enabled() -> bool:
    return os.environ.get("DOCUMENT_AI_DEBUG_LOGGING") == "1"


def redact(payload: dict, allow_sensitive: bool = False) -> dict:
    """Returns a copy of `payload` with sensitive keys removed/redacted,
    unless BOTH allow_sensitive=True and the debug-logging env var is set."""
    if allow_sensitive and _debug_logging_enabled():
        return dict(payload)

    redacted = {}
    for key, value in payload.items():
        if key.lower() in _SENSITIVE_KEYS:
            redacted[key] = "[REDACTED]"
        elif isinstance(value, str) and _PHONE_RE.search(value):
            redacted[key] = _PHONE_RE.sub("[REDACTED]", value)
        elif isinstance(value, dict):
            redacted[key] = redact(value, allow_sensitive=allow_sensitive)
        else:
            redacted[key] = value
    return redacted


# Built-in LogRecord attributes (logging's own bookkeeping, e.g. the
# logger's `name`, not anything from an `extra={...}` payload) must never
# be touched by redaction — only keys a caller actually stashed via
# `extra=` are fair game.
_STANDARD_LOGRECORD_ATTRS = frozenset(vars(logging.LogRecord("", 0, "", 0, "", None, None)).keys()) | {
    "message", "asctime",
}


class RedactingFilter(logging.Filter):
    """Applied to every document_ai logger so ad-hoc `extra={...}` dicts
    passed to logger calls are redacted before they reach any handler.

    Recurses into nested dict values on the record's extra attributes —
    matching `redact()` above. A flat top-level check alone would miss
    e.g. `extra={"patient": {"name": "..."}}`, where the sensitive key is
    one level down; no log call in this codebase currently does that, but
    the filter shouldn't rely on every future call site remembering to
    flatten its own payload first.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        for attr in ("document_id", "correlation_id"):
            if not hasattr(record, attr):
                setattr(record, attr, None)
        # Redact anything stashed on the record via `extra=` — never a
        # standard LogRecord attribute like `name` (the logger's own name,
        # e.g. "document_ai.pipeline.module_b") or `msg`.
        for key, value in list(vars(record).items()):
            if key in _STANDARD_LOGRECORD_ATTRS:
                continue
            if key.lower() in _SENSITIVE_KEYS:
                setattr(record, key, "[REDACTED]")
            elif isinstance(value, dict):
                setattr(record, key, redact(value))
            elif isinstance(value, str) and _PHONE_RE.search(value):
                setattr(record, key, _PHONE_RE.sub("[REDACTED]", value))
        return True


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not any(isinstance(f, RedactingFilter) for f in logger.filters):
        logger.addFilter(RedactingFilter())
    if not logger.handlers and not logging.getLogger().handlers:
        # Only attach a default handler if nothing else in the process has
        # configured logging yet — never fight the host application's setup.
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s document_id=%(document_id)s %(message)s"
        ))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger
