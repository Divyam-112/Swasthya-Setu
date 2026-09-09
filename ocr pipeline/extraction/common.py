"""Shared logic used by all three per-doctype extractors."""

from __future__ import annotations

from typing import Type, TypeVar

from pydantic import BaseModel, ValidationError

from .client import ExtractionClient, ExtractionError
from .schemas import ExtractedField

M = TypeVar("M", bound=BaseModel)


def _skeleton(model_cls: Type[BaseModel]) -> dict:
    """A blank instance dumped to a dict — this is what we hand the model
    as the exact schema shape to fill in. Using the real default-factory
    instance (not a hand-written schema string) guarantees the shape the
    LLM is told to produce always matches what parse() can actually accept.
    """
    return model_cls().model_dump(mode="json")


def extract_with_model(
    ocr_text: str,
    model_cls: Type[M],
    document_type: str,
    client: ExtractionClient,
) -> M:
    """Runs extraction and returns a validated, parsed model instance.

    Never raises for a malformed/partial LLM response — falls back to an
    all-missing instance with a single uncertain_fields marker instead,
    since a hard crash here would take down the whole document, and "we
    couldn't extract this reliably" is itself useful, reportable information.
    Only raises ExtractionError for infrastructure failures (propagated
    from the client), matching the OCR provider convention.
    """
    schema_json = _skeleton(model_cls)
    raw = client.extract(ocr_text, schema_json, document_type)

    try:
        parsed = model_cls.model_validate(raw)
    except ValidationError:
        parsed = model_cls()
        parsed.uncertain_fields = ["extraction_parse_failed"]
        return parsed

    parsed.uncertain_fields = sorted(set(parsed.uncertain_fields) | set(find_uncertain_fields(parsed)))
    return parsed


def find_uncertain_fields(model: BaseModel, prefix: str = "") -> list[str]:
    """Walks a parsed model and collects dotted paths of every
    ExtractedField with needs_verification=True or value=None, so
    uncertain_fields doesn't rely on the LLM remembering to report it
    for every nested field itself.
    """
    paths: list[str] = []

    def walk(obj, path: str):
        if isinstance(obj, ExtractedField):
            if obj.needs_verification or obj.value is None:
                paths.append(path)
        elif isinstance(obj, BaseModel):
            for field_name in obj.__class__.model_fields:
                if field_name == "uncertain_fields":
                    continue
                child_path = f"{path}.{field_name}" if path else field_name
                walk(getattr(obj, field_name), child_path)
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                walk(item, f"{path}.{i}")

    walk(model, prefix)
    return paths
