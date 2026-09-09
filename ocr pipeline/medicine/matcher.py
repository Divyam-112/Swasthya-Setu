from __future__ import annotations
import re
from difflib import SequenceMatcher

from .providers.base import MedicineVocabularyProvider, VocabularyProviderError
from .schemas import MatchCandidate


def _local_similarity(a: str, b: str) -> float:
    if not a or not b: return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def _score_candidate(
    candidate,
    cleaned_name: str,
    visual_evidence: dict | None = None,
    strength: str | None = None,
    dosage_form: str | None = None,
    provider_name: str = "unknown_provider",
) -> MatchCandidate:
    """
    Score a candidate based on string similarity, visual evidence, strength, and dosage form.
    """
    if candidate.match_type == "exact":
        base_score = candidate.score
    else:
        base_score = min(candidate.score, _local_similarity(cleaned_name, candidate.name))
    
    # 1. Phonetic/transliteration match from the provider is already baked into candidate.score
    # 2. visual/string similarity is `base_score`
    
    score = base_score
    reason = "Approximate match based on string similarity."

    if visual_evidence:
        first_chars = visual_evidence.get("first_visible_characters")
        last_chars = visual_evidence.get("last_visible_characters")
        approx_len = visual_evidence.get("approximate_character_count")
        
        # 3. first-character similarity
        if first_chars and candidate.name.lower().startswith(first_chars.lower()[:3]):
            score = min(score + 0.1, 1.0)
            reason += " Strong first-character match."
            
        # 4. last-character similarity
        if last_chars and candidate.name.lower().endswith(last_chars.lower()[-3:]):
            score = min(score + 0.1, 1.0)
            
        # 5. approximate length
        if approx_len and abs(len(candidate.name) - approx_len) <= 2:
            score = min(score + 0.05, 1.0)
            
        # 9. formulation suffix (ER/SR/CR/PR) ONLY when visually present
        formulation_match = re.search(r'\b(ER|SR|CR|PR|XR|MR)\b', candidate.name, re.IGNORECASE)
        if formulation_match:
            suffix = formulation_match.group(1).upper()
            visual_suffix_present = False
            
            if first_chars and suffix in first_chars.upper(): visual_suffix_present = True
            if last_chars and suffix in last_chars.upper(): visual_suffix_present = True
            
            if not visual_suffix_present:
                score = score * 0.7  # Penalize hallucinating a formulation suffix
                reason += f" Penalized: {suffix} not visually present."
            else:
                score = min(score + 0.1, 1.0)
                reason += f" Validated {suffix} suffix."

    record = candidate.record or {}
    
    # 7. visible strength
    record_strength = record.get("strength")
    if strength and record_strength:
        if _local_similarity(strength, record_strength) > 0.8:
            score = min(score + 0.15, 1.0)
            reason += " Strength match."
        else:
            # Explicit mismatch
            score = score * 0.8
            reason += " Strength mismatch."
            
    # 8. dosage form
    record_form = record.get("dosage_form")
    if dosage_form and record_form:
        if _local_similarity(dosage_form, record_form) > 0.7:
            score = min(score + 0.05, 1.0)

    # 10/11. Vocabulary/alias match already factored in provider score

    manufacturer = record.get("manufacturer_name") or record.get("manufacturer")
    comp_parts = []
    if record.get("short_composition1"):
        comp_parts.append(str(record["short_composition1"]).strip())
    if record.get("short_composition2"):
        comp_parts.append(str(record["short_composition2"]).strip())
    if comp_parts:
        composition = " + ".join(comp_parts)
    else:
        composition = record.get("composition")

    is_discontinued = record.get("Is_discontinued")
    if is_discontinued is None:
        is_discontinued = record.get("is_discontinued")

    return MatchCandidate(
        name=candidate.name,
        source=provider_name,
        code=candidate.code,
        score=round(score, 3),
        match_type=candidate.match_type,
        reason=reason.strip(),
        manufacturer=manufacturer,
        composition=composition,
        is_discontinued=is_discontinued,
        record=record if record else None,
    )


def generate_candidates(
    cleaned_name: str,
    provider: MedicineVocabularyProvider,
    visual_evidence: dict | None = None,
    strength: str | None = None,
    dosage_form: str | None = None,
    max_candidates: int = 5,
    context_hint: str | None = None,
) -> tuple[list[MatchCandidate], bool]:
    """Returns (candidates, provider_unavailable)."""
    if not cleaned_name.strip():
        return [], False

    try:
        exact = provider.exact_lookup(cleaned_name)
    except VocabularyProviderError:
        return [], True

    candidates: list[MatchCandidate] = []
    if exact is not None:
        scored = _score_candidate(exact, cleaned_name, visual_evidence, strength, dosage_form, provider_name=provider.name)
        candidates.append(scored)
        return candidates, False

    try:
        # Pass context_hint if the provider supports it (e.g. ABDMDrugRegistryProvider).
        # Providers that don't accept it (base Protocol) simply ignore the kwarg.
        try:
            approx = provider.approximate_lookup(cleaned_name, max_candidates=max_candidates, context_hint=context_hint)
        except TypeError:
            # Provider doesn't accept context_hint — fall back to the base signature
            approx = provider.approximate_lookup(cleaned_name, max_candidates=max_candidates)
    except VocabularyProviderError:
        return [], True

    for c in approx:
        scored = _score_candidate(c, cleaned_name, visual_evidence, strength, dosage_form, provider_name=provider.name)
        candidates.append(scored)

    candidates.sort(key=lambda c: c.score, reverse=True)
    return candidates[:max_candidates], False
