"""
Text cleaning for raw medicine names, prior to any vocabulary lookup.

This step is deliberately conservative: it only strips things that are
clearly OCR/formatting noise (surrounding whitespace, stray punctuation,
duplicate spaces). It never rewrites, expands, or "corrects" the name
itself — that would defeat the whole point of Step 4 being a separate,
inspectable layer from Step 3's verbatim extraction.
"""

from __future__ import annotations

import re

from .confidence import DEFAULT_THRESHOLDS, MedicineMatchThresholds, confidence_level_for_score
from .matcher import generate_candidates
from .providers.base import MedicineVocabularyProvider
from .schemas import ConfidenceLevel, NormalizedMedicine

_STRIP_CHARS = ".,;:*#()[]{}\"'`"
_WHITESPACE_RE = re.compile(r"\s+")


def clean_medicine_name(raw_name: str | None) -> str:
    """Whitespace/punctuation normalization only. '' in -> '' out."""
    if not raw_name:
        return ""
    text = raw_name.strip()
    text = text.strip(_STRIP_CHARS)
    text = _WHITESPACE_RE.sub(" ", text)
    return text.strip()


def is_empty_or_unreadable(cleaned_name: str) -> bool:
    """Distinguishes a truly empty input from a name a lookup should still
    attempt. Does NOT try to guess "this looks like gibberish" — that
    judgement belongs to match scoring against a real vocabulary, not to a
    hand-written heuristic that would itself need its own validation."""
    c = cleaned_name.strip().upper()
    return c == "" or "UNREADABLE" in c


def normalize_medicine(
    raw_name: str | None,
    provider: MedicineVocabularyProvider,
    vlm_normalized: str | None = None,
    thresholds: MedicineMatchThresholds = DEFAULT_THRESHOLDS,
    *,
    strength: str | None = None,
    dosage_form: str | None = None,
    dose: str | None = None,
    frequency: str | None = None,
    duration: str | None = None,
    visual_evidence: dict | None = None,
    evidence_status: str | None = None,
    medicine_identification_confidence: float | None = None,
    vocabulary_verified: bool | None = None,
    initial_needs_verification: bool = False,
    context_hint: str | None = None,
) -> NormalizedMedicine:
    """Runs the full Step 4 pipeline for a single medicine name.

    raw medicine name -> text cleaning -> exact lookup -> normalized lookup
    -> approximate candidate generation -> candidate scoring -> confidence
    calculation -> conservative normalization -> verification decision.
    """
    raw_name = raw_name or ""
    cleaned = clean_medicine_name(raw_name)

    result = NormalizedMedicine(
        raw_name=raw_name,
        vlm_normalized=vlm_normalized,
        strength=strength,
        dosage_form=dosage_form,
        dose=dose,
        frequency=frequency,
        duration=duration,
        visual_evidence=visual_evidence,
        evidence_status=evidence_status,
        medicine_identification_confidence=medicine_identification_confidence,
        vocabulary_verified=vocabulary_verified,
    )

    if is_empty_or_unreadable(cleaned):
        result.needs_verification = True
        result.reasons.append("empty_or_unreadable_name")
        return result

    candidates, provider_unavailable = generate_candidates(
        cleaned, 
        provider,
        visual_evidence=visual_evidence,
        strength=strength,
        dosage_form=dosage_form,
        context_hint=context_hint,
    )
    result.candidates = candidates

    if provider_unavailable:
        result.needs_verification = True
        result.reasons.append("provider_unavailable")
        return result

    if not candidates:
        result.needs_verification = True
        result.reasons.append("no_candidate")
        return result

    best = candidates[0]
    result.match_score = best.score
    result.confidence = best.score
    result.confidence_level = confidence_level_for_score(best.score, thresholds)

    # Conservative normalization: only ever set vocabulary_normalized when
    # the best candidate clears the explicit "safe to normalize" bar. A
    # merely-plausible candidate is kept visible (candidates list) but is
    # NOT promoted into vocabulary_normalized.
    if best.score >= thresholds.normalize_min_score:
        result.vocabulary_normalized = best.name
        result.vocabulary_source = best.source
        result.vocabulary_code = best.code
        result.manufacturer = best.manufacturer
        result.composition = best.composition
        result.is_discontinued = best.is_discontinued
    elif best.score >= thresholds.review_min_score:
        result.reasons.append("weak_match_requires_review")
    else:
        result.reasons.append("no_candidate")
        result.match_score = None
        result.confidence = None
        result.confidence_level = ConfidenceLevel.UNKNOWN

    # VLM/vocabulary agreement check — only meaningful once we actually have
    # a normalized vocabulary value to compare against.
    if result.vocabulary_normalized is not None and vlm_normalized:
        agree = clean_medicine_name(vlm_normalized).lower() == result.vocabulary_normalized.lower()
        result.agreement = agree
        if not agree:
            result.needs_verification = True
            result.reasons.append("vlm_vocabulary_disagreement")

    result.needs_verification = (
        initial_needs_verification or result.vocabulary_normalized is None or result.agreement is False or bool(result.reasons)
    )

    return result


def normalize_medications(medications, provider: MedicineVocabularyProvider,
                           thresholds: MedicineMatchThresholds = DEFAULT_THRESHOLDS,
                           diagnoses: list | None = None) -> list[NormalizedMedicine]:
    """Batch entry point: takes Step 3's list[extraction.schemas.Medication]
    and returns one NormalizedMedicine per entry, same order, order-preserving.

    `diagnoses` is an optional list[ExtractedField[str]] from the extraction
    model. When present, the joined diagnosis text is passed as context_hint
    to the ABDM provider's existing indication-boost mechanism.
    """
    # Build context_hint from diagnoses — a simple space-joined string of
    # all non-empty diagnosis values. The ABDM provider's _score() method
    # tokenises this and checks for term overlap with the ABDM record's
    # indication field, gated behind the existing name_score >= 0.3 floor
    # and capped at +0.05.
    context_hint: str | None = None
    if diagnoses:
        parts = []
        for d in diagnoses:
            val = getattr(d, "value", None) if hasattr(d, "value") else None
            if val and isinstance(val, str) and val.strip():
                parts.append(val.strip())
        context_hint = " ".join(parts) if parts else None
    results = []
    for med in medications:
        raw_name = med.raw_name.value if med.raw_name and med.raw_name.value else None
        results.append(
            normalize_medicine(
                raw_name,
                provider,
                vlm_normalized=raw_name,  # Step 3's extracted name IS the "VLM normalized" name for this pipeline
                thresholds=thresholds,
                strength=med.strength.value if med.strength else None,
                dosage_form=med.dosage_form.value if med.dosage_form else None,
                dose=med.dose.value if med.dose else None,
                frequency=med.frequency.value.model_dump() if med.frequency and med.frequency.value else None,
                duration=med.duration.value if med.duration else None,
                visual_evidence=med.visual_evidence,
                evidence_status=med.evidence_status,
                medicine_identification_confidence=med.medicine_identification_confidence,
                vocabulary_verified=med.vocabulary_verified,
                initial_needs_verification=med.raw_name.needs_verification if med.raw_name else False,
                context_hint=context_hint,
            )
        )
    return results
