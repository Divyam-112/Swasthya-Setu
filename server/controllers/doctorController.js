import Session from "../models/Session.js";
import Appointment from "../models/Appointment.js";
import Patient from "../models/Patient.js";
import Doctor from "../models/Doctor.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getUnifiedMedicalHistory, getMedicalHistoryForAI } from "../services/medicalHistoryService.js";

/**
 * GET /api/doctor/queue
 * Get all patients in queue (sessions with completed/in_progress status)
 */
export const getPatientQueue = asyncHandler(async (req, res) => {
  let doctorIds = [req.userId];
  const currentDoc = await Doctor.findById(req.userId);
  if (currentDoc?.name) {
    const cleanName = currentDoc.name.replace(/^Dr\.\s*/i, "").trim();
    if (cleanName.length >= 3) {
      const matchingDocs = await Doctor.find({
        name: new RegExp(cleanName, "i"),
      }).select("_id");
      doctorIds = matchingDocs.map((d) => d._id);
    }
  }

  const assigned = await Appointment.find({ doctor: { $in: doctorIds } }).select(
    "session",
  );
  const sessionIds = assigned.map((item) => item.session).filter(Boolean);

  const sessions = await Session.find({
    _id: { $in: sessionIds },
    status: { $in: ["completed", "in_progress"] },
  })
    .populate("patient", "name age gender abhaId preferredLanguage")
    .select(
      "patient sessionType status completionPercentage clinicalHistory.chiefComplaint clinicalSummary.redFlags createdAt",
    )
    .sort({ createdAt: -1 });

  // Format for queue display
  const queue = sessions.map((session) => ({
    sessionId: session._id,
    patientName: session.patient?.name || "Unknown",
    age: session.patient?.age,
    gender: session.patient?.gender,
    abhaId: session.patient?.abhaId,
    sessionType: session.sessionType,
    chiefComplaint:
      session.clinicalHistory?.chiefComplaint || "Not recorded yet",
    status: session.status,
    completionPercentage: session.completionPercentage,
    hasRedFlags: session.clinicalSummary?.redFlags?.length > 0,
    redFlags: session.clinicalSummary?.redFlags || [],
    createdAt: session.createdAt,
  }));

  res
    .status(200)
    .json(new ApiResponse(200, queue, "Patient queue retrieved successfully"));
});

/**
 * GET /api/doctor/patient/:sessionId
 * Get full patient data for a specific session (doctor view)
 */
export const getPatientDetail = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await Session.findById(sessionId)
    .populate("patient", "name age gender abhaId phone preferredLanguage")
    .populate("doctorReview.reviewedBy", "name specialization");

  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  // Also attach the patient's full unified medical history for the doctor
  let unifiedMedicalHistory = null;
  try {
    unifiedMedicalHistory = await getUnifiedMedicalHistory(session.patient._id.toString());
  } catch (e) {
    console.error("[Doctor] Could not fetch medical history:", e.message);
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, { session, unifiedMedicalHistory }, "Patient details retrieved successfully"),
    );
});

/**
 * GET /api/doctor/patient/:patientId/medical-history
 * Get a patient's complete unified medical history (all 3 sources)
 */
export const getPatientMedicalHistory = asyncHandler(async (req, res) => {
  const { patientId } = req.params;

  const patient = await Patient.findById(patientId).select("name age gender abhaId");
  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  const medicalHistory = await getUnifiedMedicalHistory(patientId);
  const aiContext = await getMedicalHistoryForAI(patientId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        patient: { name: patient.name, age: patient.age, gender: patient.gender, abhaId: patient.abhaId },
        medicalHistory,
        aiContext, // formatted string for AI prompt injection (debugging)
      },
      "Patient medical history retrieved successfully",
    ),
  );
});

/**
 * PUT /api/doctor/review/:sessionId
 * Doctor submits review (accept/modify/reject)
 */
export const submitReview = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { status, modifications } = req.body;

  if (!status || !["accepted", "modified", "rejected"].includes(status)) {
    throw new ApiError(
      400,
      "Valid review status is required (accepted/modified/rejected)",
    );
  }

  const session = await Session.findById(sessionId);

  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  session.doctorReview = {
    reviewedBy: req.userId,
    reviewedAt: new Date(),
    status,
    modifications: modifications || "",
  };

  session.status = "reviewed";

  await session.save();

  res.status(200).json(
    new ApiResponse(
      200,
      {
        sessionId,
        reviewStatus: status,
        reviewedAt: session.doctorReview.reviewedAt,
      },
      `Session ${status} successfully`,
    ),
  );
});

/**
 * POST /api/doctor/patient/:patientId/yoga-poses
 * Doctor suggests yoga poses directly for a patient, saved in medical history
 */
export const suggestYogaPoses = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const { yogaPoses } = req.body;

  if (!Array.isArray(yogaPoses) || yogaPoses.length === 0) {
    throw new ApiError(400, "yogaPoses array is required");
  }

  const patient = await Patient.findById(patientId);
  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  const Doctor = (await import("../models/Doctor.js")).default;
  const { appendYogaPoses } = await import("../services/medicalHistoryService.js");

  const doctor = await Doctor.findById(req.userId);
  const doctorName = doctor ? doctor.name : "Doctor";

  const updatedYogaPoses = await appendYogaPoses(patientId, yogaPoses, doctorName);

  res.status(200).json(
    new ApiResponse(
      200,
      { prescribedYogaPoses: updatedYogaPoses },
      "Yoga poses successfully suggested and saved to patient medical history",
    ),
  );
});
