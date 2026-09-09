"""
Step 8 output contract: potential drug interaction checking.

This is a SAFETY feature, not a clearance feature. It is structurally
impossible for this layer to say "these medicines are safe together" —
there is no such status. The only statuses are: a potential interaction
was found, no information was available, the provider couldn't be
reached, or the pair was never checked at all (e.g. because one of the
medicines' identity wasn't confirmed). Missing data is never treated as
"no interaction."
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class InteractionStatus(str, Enum):
    POTENTIAL_INTERACTION = "POTENTIAL_INTERACTION"
    NO_INTERACTION_INFORMATION = "NO_INTERACTION_INFORMATION"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    NOT_CHECKED = "NOT_CHECKED"


class DrugInteraction(BaseModel):
    drug_a: str
    drug_b: str
    status: InteractionStatus
    evidence: Optional[str] = None
    source: Optional[str] = None
    needs_clinician_review: bool = True
    reason: Optional[str] = None  # populated for NOT_CHECKED / PROVIDER_UNAVAILABLE, e.g. "unconfirmed_identity"


class InteractionCheckReport(BaseModel):
    interactions: list[DrugInteraction] = Field(default_factory=list)
