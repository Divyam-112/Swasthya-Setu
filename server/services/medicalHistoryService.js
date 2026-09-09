/**
 * medicalHistoryService.js
 *
 * Central service for aggregating medical context from three clinical sources:
 *   1. Symptom interviews (appointment Q&A wizard)
 *   2. Uploaded & OCR-processed medical documents
 *   3. Doctor-written digital prescriptions
 */

import Patient from "../models/Patient.js";

// ─────────────────────────────────────────────────────────────────────────────
// Source 1 — Symptom Interview
// ─────────────────────────────────────────────────────────────────────────────
export async function appendInterviewContext(patientId, interviewData) {
  try {
    const {
      sessionId,
      chiefComplaint = "",
      symptoms = [],
      duration = "",
      severity = null,
      interviewQA = [],
    } = interviewData;

    const entry = {
      sessionId,
      date: new Date(),
      chiefComplaint,
      symptoms,
      duration,
      severity,
      interviewQA,
      source: "interview",
    };

    await Patient.findByIdAndUpdate(patientId, {
      $push: { "medicalHistory.symptomInterviews": entry },
      $set: { "medicalHistory.lastUpdated": new Date() },
    });

    console.log(`✅ [MedHistory] Interview context appended for patient ${patientId}`);
    return entry;
  } catch (err) {
    console.error("❌ [MedHistory] appendInterviewContext error:", err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Source 2 — Uploaded Medical Document (from OCR)
// ─────────────────────────────────────────────────────────────────────────────
export async function appendDocumentContext(patientId, documentData) {
  try {
    const {
      docId,
      sessionId = null,
      type = "other",
      hospitalName = "",
      diagnoses = [],
      medications = [],
      labResults = [],
      rawText = "",
    } = documentData;

    const entry = {
      docId,
      sessionId,
      date: new Date(),
      type,
      hospitalName,
      diagnoses,
      medications,
      labResults,
      rawText,
      source: "document",
    };

    const patient = await Patient.findById(patientId);
    if (!patient) throw new Error("Patient not found");

    if (!patient.medicalHistory) patient.medicalHistory = {};
    if (!patient.medicalHistory.uploadedDocuments) patient.medicalHistory.uploadedDocuments = [];

    const existingIndex = patient.medicalHistory.uploadedDocuments.findIndex(
      (d) => d.docId && docId && d.docId.toString() === docId.toString(),
    );

    if (existingIndex >= 0) {
      patient.medicalHistory.uploadedDocuments[existingIndex] = {
        ...patient.medicalHistory.uploadedDocuments[existingIndex].toObject?.() || patient.medicalHistory.uploadedDocuments[existingIndex],
        ...entry,
      };
    } else {
      patient.medicalHistory.uploadedDocuments.push(entry);
    }

    _mergeDiagnoses(patient, diagnoses, "document");
    _mergeActiveMedications(patient, medications, "", "document");
    patient.medicalHistory.lastUpdated = new Date();
    await patient.save();

    console.log(`✅ [MedHistory] Document context ${existingIndex >= 0 ? "updated" : "appended"} for patient ${patientId}`);
    return entry;
  } catch (err) {
    console.error("❌ [MedHistory] appendDocumentContext error:", err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Source 3 — Doctor Prescription
// ─────────────────────────────────────────────────────────────────────────────
export async function appendPrescriptionContext(patientId, prescriptionData) {
  try {
    const {
      prescriptionId,
      sessionId = null,
      doctorName = "",
      specialization = "",
      diagnosis = "",
      medications = [],
      investigations = [],
      advice = [],
      yogaPoses = [],
      followUpDate = null,
      notes = "",
    } = prescriptionData;

    const normalizedMeds = (medications || []).map((m) => ({
      name: (m.name || m.drug || "").trim(),
      dosage: m.dosage || m.dose || "",
      frequency: m.frequency || "",
      duration: m.duration || "",
      timing: m.timing || m.instructions || "",
      instructions: m.instructions || "",
    })).filter((m) => m.name.length > 0);

    const normalizedYogaPoses = (yogaPoses || []).map((pose) =>
      typeof pose === "string" ? { name: pose.trim() } : pose
    ).filter((p) => p && p.name);

    const entry = {
      prescriptionId,
      sessionId,
      date: new Date(),
      doctorName,
      specialization,
      diagnosis,
      medications: normalizedMeds,
      investigations,
      advice,
      yogaPoses: normalizedYogaPoses,
      followUpDate,
      notes,
      source: "prescription",
    };

    const patient = await Patient.findById(patientId);
    if (!patient) throw new Error("Patient not found");

    if (!patient.medicalHistory) patient.medicalHistory = {};
    if (!patient.medicalHistory.prescriptions) patient.medicalHistory.prescriptions = [];
    if (!patient.medicalHistory.prescribedYogaPoses) patient.medicalHistory.prescribedYogaPoses = [];

    const existingIndex = patient.medicalHistory.prescriptions.findIndex(
      (p) =>
        (prescriptionId && p.prescriptionId && p.prescriptionId.toString() === prescriptionId.toString()) ||
        (sessionId && p.sessionId && p.sessionId.toString() === sessionId.toString())
    );

    if (existingIndex >= 0) {
      patient.medicalHistory.prescriptions[existingIndex] = {
        ...(patient.medicalHistory.prescriptions[existingIndex].toObject?.() || patient.medicalHistory.prescriptions[existingIndex]),
        ...entry,
      };
    } else {
      patient.medicalHistory.prescriptions.push(entry);
    }

    if (normalizedYogaPoses.length > 0) {
      normalizedYogaPoses.forEach((pose) => {
        patient.medicalHistory.prescribedYogaPoses.push({
          name: pose.name,
          sanskritName: pose.sanskritName || "",
          durationMinutes: pose.durationMinutes || 10,
          reps: pose.reps || "",
          timeOfDay: pose.timeOfDay || "Morning",
          instructions: pose.instructions || "",
          benefits: pose.benefits || "",
          prescribedBy: doctorName || "Doctor",
          prescribedAt: new Date(),
        });
      });
    }

    if (diagnosis) _mergeDiagnoses(patient, [diagnosis], "prescription");
    _mergeActiveMedications(patient, normalizedMeds, doctorName, "prescription");

    patient.medicalSummary = {
      latestDiagnosis: diagnosis,
      prescriptionId,
      sessionId,
      doctorName,
      specialization,
      activeMedications: normalizedMeds,
      advice,
      yogaPoses: normalizedYogaPoses,
      followUpDate,
      updatedAt: new Date(),
    };

    patient.medicalHistory.lastUpdated = new Date();
    await patient.save();

    console.log(`✅ [MedHistory] Prescription context ${existingIndex >= 0 ? "updated" : "appended"} for patient ${patientId}`);
    return entry;
  } catch (err) {
    console.error("❌ [MedHistory] appendPrescriptionContext error:", err.message);
    throw err;
  }
}

/**
 * Directly append or update doctor suggested yoga poses for a patient
 */
export async function appendYogaPoses(patientId, yogaPoses = [], doctorName = "Doctor") {
  try {
    const patient = await Patient.findById(patientId);
    if (!patient) throw new Error("Patient not found");

    if (!patient.medicalHistory) patient.medicalHistory = {};
    if (!patient.medicalHistory.prescribedYogaPoses) patient.medicalHistory.prescribedYogaPoses = [];

    yogaPoses.forEach((pose) => {
      patient.medicalHistory.prescribedYogaPoses.push({
        name: pose.name,
        sanskritName: pose.sanskritName || "",
        durationMinutes: pose.durationMinutes || 10,
        reps: pose.reps || "",
        timeOfDay: pose.timeOfDay || "Morning",
        instructions: pose.instructions || "",
        benefits: pose.benefits || "",
        prescribedBy: doctorName,
        prescribedAt: new Date(),
      });
    });

    patient.medicalHistory.lastUpdated = new Date();
    await patient.save();
    console.log(`✅ [MedHistory] Yoga poses appended for patient ${patientId}`);
    return patient.medicalHistory.prescribedYogaPoses;
  } catch (err) {
    console.error("❌ [MedHistory] appendYogaPoses error:", err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retrieval
// ─────────────────────────────────────────────────────────────────────────────
export async function getUnifiedMedicalHistory(patientId) {
  try {
    const patient = await Patient.findById(patientId).select("medicalHistory name abhaId").lean();
    if (!patient) throw new Error("Patient not found");

    const mh = patient.medicalHistory || {};
    return {
      symptomInterviews: (mh.symptomInterviews || []).sort((a, b) => new Date(b.date) - new Date(a.date)),
      uploadedDocuments: (mh.uploadedDocuments || []).sort((a, b) => new Date(b.date) - new Date(a.date)),
      prescriptions: (mh.prescriptions || []).sort((a, b) => new Date(b.date) - new Date(a.date)),
      prescribedYogaPoses: mh.prescribedYogaPoses || [],
      cumulativeDiagnoses: mh.cumulativeDiagnoses || [],
      activeMedications: mh.activeMedications || [],
      lastUpdated: mh.lastUpdated,
    };
  } catch (err) {
    console.error("❌ [MedHistory] getUnifiedMedicalHistory error:", err.message);
    throw err;
  }
}

export async function getMedicalHistoryForAI(patientId) {
  try {
    const mh = await getUnifiedMedicalHistory(patientId);
    const lines = [];

    if (mh.prescribedYogaPoses && mh.prescribedYogaPoses.length > 0) {
      lines.push("=== DOCTOR PRESCRIBED YOGA POSES ===");
      mh.prescribedYogaPoses.forEach((pose) =>
        lines.push(`• ${pose.name}${pose.sanskritName ? " (" + pose.sanskritName + ")" : ""} — ${pose.durationMinutes || 10} mins [${pose.timeOfDay || "Morning"}]${pose.benefits ? " | " + pose.benefits : ""}${pose.prescribedBy ? " (Dr. " + pose.prescribedBy + ")" : ""}`)
      );
      lines.push("");
    }

    if (mh.cumulativeDiagnoses.length > 0) {
      lines.push("=== KNOWN CONDITIONS ===");
      mh.cumulativeDiagnoses.forEach((d) =>
        lines.push(`• ${d.condition} (first seen: ${_fmtDate(d.firstSeenAt)}, via: ${d.sources.join(", ")})`)
      );
      lines.push("");
    }

    if (mh.activeMedications.length > 0) {
      lines.push("=== ACTIVE MEDICATIONS ===");
      mh.activeMedications.forEach((m) =>
        lines.push(`• ${m.name} ${m.dosage || ""} — ${m.frequency || ""}${m.timing ? " (" + m.timing + ")" : ""}${m.prescribedBy ? " [Dr. " + m.prescribedBy + "]" : ""}`)
      );
      lines.push("");
    }

    const recentInterviews = mh.symptomInterviews.slice(0, 5);
    if (recentInterviews.length > 0) {
      lines.push("=== RECENT SYMPTOM INTERVIEWS ===");
      recentInterviews.forEach((iv) => {
        lines.push(`[${_fmtDate(iv.date)}] Chief Complaint: ${iv.chiefComplaint}`);
        if (iv.symptoms.length) lines.push(`  Symptoms: ${iv.symptoms.join(", ")}`);
        if (iv.duration) lines.push(`  Duration: ${iv.duration}`);
        if (iv.severity) lines.push(`  Severity: ${iv.severity}/10`);
      });
      lines.push("");
    }

    const recentRx = mh.prescriptions.slice(0, 5);
    if (recentRx.length > 0) {
      lines.push("=== RECENT DOCTOR PRESCRIPTIONS ===");
      recentRx.forEach((rx) => {
        lines.push(`[${_fmtDate(rx.date)}] Dr. ${rx.doctorName} (${rx.specialization})`);
        if (rx.diagnosis) lines.push(`  Diagnosis: ${rx.diagnosis}`);
        if (rx.medications.length)
          lines.push(`  Medications: ${rx.medications.map((m) => `${m.name} ${m.dosage || ""}`).join(", ")}`);
        if (rx.advice.length) lines.push(`  Advice: ${rx.advice.join("; ")}`);
        if (rx.followUpDate) lines.push(`  Follow-up: ${_fmtDate(rx.followUpDate)}`);
      });
      lines.push("");
    }

    const recentDocs = mh.uploadedDocuments.slice(0, 5);
    if (recentDocs.length > 0) {
      lines.push("=== RECENT UPLOADED DOCUMENTS & LAB REPORTS ===");
      recentDocs.forEach((doc) => {
        lines.push(`[${_fmtDate(doc.date)}] Type: ${doc.type.replace("_", " ").toUpperCase()}${doc.hospitalName ? " | Facility/Lab: " + doc.hospitalName : ""}`);
        if (doc.diagnoses.length) lines.push(`  Diagnoses/Findings: ${doc.diagnoses.join(", ")}`);
        if (doc.labResults.length) {
          lines.push(`  Lab Tests / Biomarkers:`);
          doc.labResults.forEach((l) => {
            const status = l.isAbnormal ? " [⚠️ ABNORMAL / OUT OF RANGE]" : " [Normal]";
            lines.push(`    - ${l.testName}: ${l.value} ${l.unit || ""} (Reference Interval: ${l.referenceRange || "N/A"})${status}`);
          });
        }
        if (doc.medications.length)
          lines.push(`  Medications Mentioned: ${doc.medications.map((m) => m.name).join(", ")}`);
        if (doc.rawText && doc.rawText.trim().length > 0 && !doc.labResults.length) {
          const excerpt = doc.rawText.replace(/\s+/g, " ").trim().slice(0, 300);
          lines.push(`  Document Text Excerpt: "${excerpt}..."`);
        }
      });
      lines.push("");
    }

    return lines.length === 0 ? "No medical history available yet." : lines.join("\n");
  } catch (err) {
    console.error("❌ [MedHistory] getMedicalHistoryForAI error:", err.message);
    return "Medical history temporarily unavailable.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────
function _fmtDate(d) {
  if (!d) return "N/A";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function _mergeDiagnoses(patient, conditions = [], source = "document") {
  if (!patient.medicalHistory) patient.medicalHistory = {};
  if (!patient.medicalHistory.cumulativeDiagnoses) patient.medicalHistory.cumulativeDiagnoses = [];
  const existing = patient.medicalHistory.cumulativeDiagnoses;
  conditions.forEach((cond) => {
    if (!cond || !cond.trim()) return;
    const normalized = cond.trim().toLowerCase();
    const found = existing.find((e) => e.condition.toLowerCase() === normalized);
    if (found) {
      if (!found.sources.includes(source)) found.sources.push(source);
    } else {
      existing.push({ condition: cond.trim(), firstSeenAt: new Date(), sources: [source] });
    }
  });
}

function _mergeActiveMedications(patient, medications = [], prescribedBy = "", source = "document") {
  if (!patient.medicalHistory) patient.medicalHistory = {};
  if (!patient.medicalHistory.activeMedications) patient.medicalHistory.activeMedications = [];
  const active = patient.medicalHistory.activeMedications;
  medications.forEach((med) => {
    if (!med || !med.name) return;
    const normalized = med.name.trim().toLowerCase();
    const ex = active.find((m) => m.name.toLowerCase() === normalized);
    if (!ex) {
      active.push({
        name: med.name.trim(),
        dosage: med.dosage || "",
        frequency: med.frequency || "",
        timing: med.timing || "",
        prescribedBy,
        prescribedAt: new Date(),
        source,
      });
    } else {
      if (med.dosage) ex.dosage = med.dosage;
      if (med.frequency) ex.frequency = med.frequency;
      if (med.timing) ex.timing = med.timing;
      if (prescribedBy) ex.prescribedBy = prescribedBy;
      ex.prescribedAt = new Date();
      ex.source = source;
    }
  });
}
