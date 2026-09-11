"""
Step 3 output contract: structured extraction from OCR text.

This is EXTRACTION, not normalization. `raw_name = "Rantidine"` must stay
"Rantidine" here — turning it into "Ranitidine" is Step 4's job, not this
layer's. Every field that could plausibly be missing/unreadable is wrapped
in ExtractedField so "we didn't see it" and "we saw it and it says X" are
never confused.
"""

from __future__ import annotations

from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ExtractedField(BaseModel, Generic[T]):
    value: Optional[T] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    source_text: Optional[str] = None       # verbatim OCR span this came from, when practical
    needs_verification: bool = False

    @classmethod
    def missing(cls) -> "ExtractedField[T]":
        return cls(value=None, confidence=None, source_text=None, needs_verification=True)


# ---------------------------------------------------------------- Prescription

class DoctorInfo(BaseModel):
    name: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    qualification: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    registration_number: ExtractedField[str] = Field(default_factory=ExtractedField.missing)


class PatientInfo(BaseModel):
    name: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    age: ExtractedField[str] = Field(default_factory=ExtractedField.missing)  # str: OCR may give "45" or "45 yrs"
    sex: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    patient_id: ExtractedField[str] = Field(default_factory=ExtractedField.missing)


class FrequencyGrid(BaseModel):
    morning: Optional[bool] = None
    afternoon: Optional[bool] = None
    evening: Optional[bool] = None
    night: Optional[bool] = None
    raw_marks: Optional[str] = None

class Medication(BaseModel):
    raw_name: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    strength: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    dosage_form: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    dose: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    route: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    frequency: ExtractedField[FrequencyGrid] = Field(default_factory=ExtractedField.missing)
    duration: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    timing: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    instructions: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    visual_evidence: Optional[dict] = None
    possible_candidates: list[dict] = Field(default_factory=list)
    evidence_status: Optional[str] = None
    medicine_identification_confidence: Optional[float] = None
    vocabulary_verified: Optional[bool] = None




class PrescriptionExtraction(BaseModel):
    document_type: str = "prescription"
    doctor: DoctorInfo = Field(default_factory=DoctorInfo)
    hospital_clinic: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    patient: PatientInfo = Field(default_factory=PatientInfo)
    prescription_date: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    diagnoses: list[ExtractedField[str]] = Field(default_factory=list)
    medications: list[Medication] = Field(default_factory=list)
    additional_notes: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    uncertain_fields: list[str] = Field(default_factory=list)  # dotted paths, e.g. "medications.1.raw_name"


# ---------------------------------------------------------------- Lab report

class LabTestResult(BaseModel):
    test_name: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    value: ExtractedField[str] = Field(default_factory=ExtractedField.missing)  # kept as string; Step 6 parses
    unit: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    reference_range: ExtractedField[str] = Field(default_factory=ExtractedField.missing)  # verbatim, unparsed


class LabReportExtraction(BaseModel):
    document_type: str = "lab_report"
    patient: PatientInfo = Field(default_factory=PatientInfo)
    hospital_laboratory: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    report_date: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    tests: list[LabTestResult] = Field(default_factory=list)
    uncertain_fields: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------- Discharge summary

class DischargeSummaryExtraction(BaseModel):
    document_type: str = "discharge_summary"
    patient: PatientInfo = Field(default_factory=PatientInfo)
    hospital: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    admission_date: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    discharge_date: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    diagnoses: list[ExtractedField[str]] = Field(default_factory=list)
    procedures: list[ExtractedField[str]] = Field(default_factory=list)
    surgery_history: list[ExtractedField[str]] = Field(default_factory=list)
    investigations: list[ExtractedField[str]] = Field(default_factory=list)
    medications: list[Medication] = Field(default_factory=list)
    follow_up_instructions: ExtractedField[str] = Field(default_factory=ExtractedField.missing)
    uncertain_fields: list[str] = Field(default_factory=list)
