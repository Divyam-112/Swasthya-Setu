"""
Step 8 orchestration: takes Step 4's normalized medicines, dedupes them,
and checks every pair of *confirmed* identities against an
InteractionProvider.

"Confirmed identity" = has a vocabulary_normalized name and
needs_verification is False. An uncertain medicine name (weak match, no
match, provider was unavailable during normalization) is never silently
treated as a real drug for interaction-checking purposes — it's reported
as NOT_CHECKED instead of being paired.

Packet verification (Step 9/progressive verification) can change this
picture in both directions after the fact:
  - PATIENT_VERIFIED packet evidence can resolve an originally-uncertain
    medicine into a confirmed one (using the packet-verified name).
  - A CONFLICT between packet evidence and the prescription overrides an
    otherwise-confident original match — a confirmed-looking medicine
    whose packet evidence contradicts it must NOT be silently checked
    under either identity.
"""

from __future__ import annotations

from itertools import combinations

from document_ai.medicine.schemas import NormalizedMedicine, PacketVerificationStatus

from .providers.base import InteractionProvider, InteractionProviderError
from .schemas import DrugInteraction, InteractionCheckReport, InteractionStatus


def _confirmed_name(med: NormalizedMedicine) -> str | None:
    packet = med.packet_verification
    if packet is not None:
        if packet.status == PacketVerificationStatus.CONFLICT:
            # Packet evidence contradicts the prescription — never confirm
            # under either identity, even if the original match looked
            # confident before the conflict was discovered.
            return None
        if packet.status == PacketVerificationStatus.PATIENT_VERIFIED:
            # Packet evidence resolved an originally-uncertain (or even
            # originally-confident) identity — use the verified name.
            if packet.verified_name:
                return packet.verified_name

    if med.vocabulary_normalized and not med.needs_verification:
        return med.vocabulary_normalized
    return None


def check_interactions(
    medicines: list[NormalizedMedicine],
    provider: InteractionProvider | None,
) -> InteractionCheckReport:
    confirmed_names: list[str] = []
    unconfirmed: list[str] = []

    for med in medicines:
        name = _confirmed_name(med)
        if name is not None:
            confirmed_names.append(name)
        else:
            unconfirmed.append(med.vocabulary_normalized or med.raw_name)

    # Dedupe confirmed names, case-insensitively, preserving first-seen order.
    seen = set()
    deduped: list[str] = []
    for name in confirmed_names:
        key = name.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(name)

    interactions: list[DrugInteraction] = []

    for drug_a, drug_b in combinations(deduped, 2):
        if provider is None:
            interactions.append(DrugInteraction(
                drug_a=drug_a, drug_b=drug_b,
                status=InteractionStatus.PROVIDER_UNAVAILABLE,
                reason="no_provider_configured",
                needs_clinician_review=True,
            ))
            continue
        try:
            result = provider.check_pair(drug_a, drug_b)
        except InteractionProviderError as e:
            interactions.append(DrugInteraction(
                drug_a=drug_a, drug_b=drug_b,
                status=InteractionStatus.PROVIDER_UNAVAILABLE,
                reason=str(e),
                source=getattr(provider, "name", None),
                needs_clinician_review=True,
            ))
            continue

        if result.found:
            interactions.append(DrugInteraction(
                drug_a=drug_a, drug_b=drug_b,
                status=InteractionStatus.POTENTIAL_INTERACTION,
                evidence=result.evidence,
                source=provider.name,
                needs_clinician_review=True,
            ))
        else:
            interactions.append(DrugInteraction(
                drug_a=drug_a, drug_b=drug_b,
                status=InteractionStatus.NO_INTERACTION_INFORMATION,
                source=provider.name,
                needs_clinician_review=True,  # absence of info is never treated as "safe"
            ))

    # Every medicine whose identity wasn't confirmed is surfaced explicitly
    # as not checked, paired against every confirmed medicine AND against
    # every other unconfirmed medicine, so nothing about it is silently
    # dropped from the report — including the case of two uncertain
    # medicines taken together, which is exactly the situation where a
    # human reviewer most needs to be told "we couldn't check this."
    deduped_unconfirmed = list(dict.fromkeys(unconfirmed))  # dedupe, preserve order
    for unconfirmed_name in deduped_unconfirmed:
        for confirmed_name in deduped:
            interactions.append(DrugInteraction(
                drug_a=unconfirmed_name, drug_b=confirmed_name,
                status=InteractionStatus.NOT_CHECKED,
                reason="unconfirmed_identity",
                needs_clinician_review=True,
            ))
    for drug_a, drug_b in combinations(deduped_unconfirmed, 2):
        interactions.append(DrugInteraction(
            drug_a=drug_a, drug_b=drug_b,
            status=InteractionStatus.NOT_CHECKED,
            reason="unconfirmed_identity",
            needs_clinician_review=True,
        ))

    return InteractionCheckReport(interactions=interactions)
