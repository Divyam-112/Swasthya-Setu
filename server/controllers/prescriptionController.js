import Prescription from "../models/Prescription.js";
import Session from "../models/Session.js";
import Appointment from "../models/Appointment.js";
import Patient from "../models/Patient.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  appendPrescriptionContext,
  getUnifiedMedicalHistory,
} from "../services/medicalHistoryService.js";

/**
 * POST /api/prescription/:sessionId
 * Doctor creates a digital prescription for a session
 */
export const createPrescription = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const {
    diagnosis,
    medications,
    investigations,
    advice,
    yogaPoses,
    followUpDate,
    notes,
  } = req.body;

  if (!diagnosis) {
    throw new ApiError(400, "Diagnosis is required");
  }

  // Find the session and verify it exists
  const session = await Session.findById(sessionId).populate(
    "patient",
    "name age gender abhaId",
  );

  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  const normalizedMeds = (medications || []).map((m) => ({
    name: (m.name || m.drug || "").trim(),
    dosage: m.dosage || m.dose || "",
    frequency: m.frequency || "",
    duration: m.duration || "",
    timing: m.timing || m.instructions || "",
    instructions: m.instructions || "",
  })).filter((m) => m.name.length > 0);

  const normalizedYoga = (yogaPoses || []).map((pose) =>
    typeof pose === "string" ? { name: pose.trim() } : pose
  ).filter((p) => p && p.name);

  // Check if a prescription already exists for this session
  let prescription = await Prescription.findOne({
    session: sessionId,
  });

  if (prescription) {
    prescription.diagnosis = diagnosis;
    prescription.medications = normalizedMeds;
    prescription.investigations = investigations || [];
    prescription.advice = advice || [];
    prescription.yogaPoses = normalizedYoga;
    prescription.followUpDate = followUpDate || null;
    prescription.notes = notes || "";
    await prescription.save();
  } else {
    // Create the prescription
    prescription = await Prescription.create({
      session: sessionId,
      patient: session.patient._id,
      doctor: req.userId,
      diagnosis,
      medications: normalizedMeds,
      investigations: investigations || [],
      advice: advice || [],
      yogaPoses: normalizedYoga,
      followUpDate: followUpDate || null,
      notes: notes || "",
    });
  }

  // Populate doctor info for response
  await prescription.populate("doctor", "name specialization");
  await prescription.populate("patient", "name age gender abhaId");

  // Link prescription to session & mark session completed
  session.prescription = prescription._id;
  session.status = "completed";
  session.completedAt = new Date();

  // Save clinical summary JSON on session
  if (!session.clinicalSummary) session.clinicalSummary = {};
  session.clinicalSummary.prescription = prescription.toObject ? prescription.toObject() : prescription;
  session.clinicalSummary.diagnosis = diagnosis;
  if (!session.clinicalSummary.generatedText) {
    session.clinicalSummary.generatedText = `Clinical diagnosis: ${diagnosis}. Prescribed medications: ${normalizedMeds.map((m) => `${m.name} ${m.dosage}`).join(", ") || "None"}.`;
  }
  session.clinicalSummary.generatedAt = new Date();

  // Save into session's pastMedicalHistory
  if (!session.clinicalHistory) session.clinicalHistory = {};
  if (!session.clinicalHistory.pastMedicalHistory) session.clinicalHistory.pastMedicalHistory = [];
  session.clinicalHistory.pastMedicalHistory.push({
    condition: diagnosis,
    duration: "Diagnosed on " + new Date().toISOString().split("T")[0],
    currentMedications: normalizedMeds.map((m) => m.name),
    status: "active",
  });

  await session.save();

  // Update associated appointment to completed
  try {
    await Appointment.updateMany(
      {
        $or: [
          { session: sessionId },
          { patient: session.patient._id, status: { $in: ["booked", "in_progress"] } },
        ],
      },
      { $set: { status: "completed", completedAt: new Date() } }
    );
  } catch (appErr) {
    console.error("[Prescription] Failed to update appointment status:", appErr.message);
  }

  // ── Push prescription into unified Medical History & Patient summary ──
  let unifiedHistory = null;
  try {
    await appendPrescriptionContext(session.patient._id.toString(), {
      prescriptionId: prescription._id,
      sessionId: sessionId,
      doctorName: prescription.doctor?.name || "",
      specialization: prescription.doctor?.specialization || "",
      diagnosis,
      medications: normalizedMeds,
      investigations: investigations || [],
      advice: advice || [],
      yogaPoses: normalizedYoga,
      followUpDate: followUpDate || null,
      notes: notes || "",
    });

    unifiedHistory = await getUnifiedMedicalHistory(session.patient._id.toString());
    console.log(`[MedHistory] Prescription synced for patient ${session.patient?.name || "Tushar"}`);
  } catch (mhErr) {
    console.error("[MedHistory] Failed to append prescription context:", mhErr.message);
  }

  const responseData = {
    ...prescription.toObject(),
    medicalHistory: unifiedHistory,
  };

  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        responseData,
        "Prescription created successfully",
      ),
    );
});

/**
 * GET /api/prescription/:sessionId
 * Get the prescription for a session
 */
export const getPrescription = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const prescription = await Prescription.findOne({ session: sessionId })
    .populate("doctor", "name specialization email")
    .populate("patient", "name age gender abhaId phone");

  if (!prescription) {
    throw new ApiError(404, "No prescription found for this session");
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        prescription,
        "Prescription retrieved successfully",
      ),
    );
});

/**
 * PUT /api/prescription/:sessionId
 * Doctor updates the prescription for a session
 */
export const updatePrescription = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const {
    diagnosis,
    medications,
    investigations,
    advice,
    yogaPoses,
    followUpDate,
    notes,
  } = req.body;

  const prescription = await Prescription.findOne({ session: sessionId });

  if (!prescription) {
    throw new ApiError(404, "No prescription found for this session");
  }

  const normalizedMeds = (medications || []).map((m) => ({
    name: (m.name || m.drug || "").trim(),
    dosage: m.dosage || m.dose || "",
    frequency: m.frequency || "",
    duration: m.duration || "",
    timing: m.timing || m.instructions || "",
    instructions: m.instructions || "",
  })).filter((m) => m.name.length > 0);

  const normalizedYoga = (yogaPoses || []).map((pose) =>
    typeof pose === "string" ? { name: pose.trim() } : pose
  ).filter((p) => p && p.name);

  // Update fields if provided
  if (diagnosis) prescription.diagnosis = diagnosis;
  prescription.medications = normalizedMeds;
  if (investigations) prescription.investigations = investigations;
  if (advice) prescription.advice = advice;
  prescription.yogaPoses = normalizedYoga;
  if (followUpDate !== undefined) prescription.followUpDate = followUpDate;
  if (notes !== undefined) prescription.notes = notes;

  await prescription.save();

  // Populate for response
  await prescription.populate("doctor", "name specialization");
  await prescription.populate("patient", "name age gender abhaId");

  // Update session
  try {
    const session = await Session.findById(sessionId);
    if (session) {
      session.status = "completed";
      session.completedAt = new Date();
      if (!session.clinicalSummary) session.clinicalSummary = {};
      session.clinicalSummary.prescription = prescription.toObject ? prescription.toObject() : prescription;
      if (diagnosis) session.clinicalSummary.diagnosis = diagnosis;
      session.clinicalSummary.generatedAt = new Date();
      await session.save();
    }
  } catch (sessErr) {
    console.error("[Prescription] Error updating session clinical summary:", sessErr.message);
  }

  // ── Update Medical History with latest prescription data ────────
  let unifiedHistory = null;
  try {
    await appendPrescriptionContext(prescription.patient._id.toString(), {
      prescriptionId: prescription._id,
      sessionId: sessionId,
      doctorName: prescription.doctor?.name || "",
      specialization: prescription.doctor?.specialization || "",
      diagnosis: prescription.diagnosis,
      medications: normalizedMeds,
      investigations: prescription.investigations || [],
      advice: prescription.advice || [],
      yogaPoses: normalizedYoga,
      followUpDate: prescription.followUpDate || null,
      notes: prescription.notes || "",
    });

    unifiedHistory = await getUnifiedMedicalHistory(prescription.patient._id.toString());
    console.log(`[MedHistory] Prescription updated & synced for patient ${prescription.patient?.name || "Tushar"}`);
  } catch (mhErr) {
    console.error("[MedHistory] Failed to update prescription in med history:", mhErr.message);
  }

  const responseData = {
    ...prescription.toObject(),
    medicalHistory: unifiedHistory,
  };

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        responseData,
        "Prescription updated successfully",
      ),
    );
});

/**
 * GET /api/prescription/patient/all
 * Get all prescriptions for the logged-in patient
 */
export const getPatientPrescriptions = asyncHandler(async (req, res) => {
  const patientId = req.userId;

  const prescriptions = await Prescription.find({ patient: patientId })
    .populate("doctor", "name specialization hospitalId email")
    .populate("patient", "name age gender abhaId phone")
    .populate("session", "sessionType clinicalHistory.chiefComplaint createdAt")
    .sort({ createdAt: -1 });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        prescriptions,
        "Patient prescriptions retrieved successfully",
      ),
    );
});

/**
 * GET /api/prescription/doctor/all
 * Get all prescriptions authored by the logged-in doctor
 */
export const getDoctorPrescriptions = asyncHandler(async (req, res) => {
  const doctorId = req.userId;

  const prescriptions = await Prescription.find({ doctor: doctorId })
    .populate("patient", "name age gender abhaId phone")
    .populate("session", "sessionType clinicalHistory.chiefComplaint createdAt")
    .sort({ createdAt: -1 });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        prescriptions,
        "Doctor prescriptions retrieved successfully",
      ),
    );
});
