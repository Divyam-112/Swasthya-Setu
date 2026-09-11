"""File-level validation — runs before preprocessing/OCR touches anything."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ALLOWED_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_PDF_SUFFIXES = {".pdf"}
ALLOWED_SUFFIXES = ALLOWED_IMAGE_SUFFIXES | ALLOWED_PDF_SUFFIXES

MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB — adjust to your infra's actual limit


@dataclass
class ValidationResult:
    valid: bool
    reason: str | None = None
    is_pdf: bool = False


def validate_file(file_path: Path) -> ValidationResult:
    path = Path(file_path)

    if not path.exists():
        return ValidationResult(valid=False, reason="file_not_found")

    if not path.is_file():
        return ValidationResult(valid=False, reason="not_a_file")

    suffix = path.suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        return ValidationResult(valid=False, reason=f"unsupported_file_type:{suffix}")

    size = path.stat().st_size
    if size == 0:
        return ValidationResult(valid=False, reason="empty_file")
    if size > MAX_FILE_SIZE_BYTES:
        return ValidationResult(valid=False, reason=f"file_too_large:{size}_bytes")

    return ValidationResult(valid=True, is_pdf=suffix in ALLOWED_PDF_SUFFIXES)
