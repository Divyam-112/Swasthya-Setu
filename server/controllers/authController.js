import Patient from "../models/Patient.js";
import Doctor from "../models/Doctor.js";
import Session from "../models/Session.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { generateToken } from "../middleware/auth.js";
import {
  isValidAbhaId,
  normalizeAbhaId,
  normalizeGender,
  normalizeLanguage,
} from "../utils/abha.js";

// ─── PATIENT AUTH ─────────────────────────────────────────────────

/**
 * POST /api/auth/patient/register
 * Register a new patient
 */
export const registerPatient = asyncHandler(async (req, res) => {
  const { name, phone, abhaId, preferredLanguage, age, gender, password, consent } = req.body;

  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    throw new ApiError(400, "Patient name is required");
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  const normalizedAbha = normalizeAbhaId(abhaId);
  if (!normalizedAbha) {
    throw new ApiError(400, "ABHA ID is required");
  }
  if (!isValidAbhaId(normalizedAbha)) {
    throw new ApiError(
      400,
      "Enter a valid 14-digit ABHA number or an ABHA address (e.g. name@abdm).",
    );
  }

  const trimmedPhone = typeof phone === "string" ? phone.trim() : "";
  if (!trimmedPhone || !/^\d{10}$/.test(trimmedPhone)) {
    throw new ApiError(400, "Enter a valid 10-digit mobile number");
  }

  const ageNumber = Number(age);
  if (!Number.isInteger(ageNumber) || ageNumber < 1 || ageNumber > 120) {
    throw new ApiError(400, "Enter a valid age between 1 and 120");
  }

  const normalizedGender = normalizeGender(gender);
  if (!normalizedGender) {
    throw new ApiError(400, "Select a valid gender");
  }

  const existingPatient = await Patient.findOne({ abhaId: normalizedAbha });
  if (existingPatient) {
    throw new ApiError(400, "This ABHA ID is already registered. Please log in.");
  }

  const consentData = {
    dataCollection: consent?.dataCollection !== false,
    dataSharing: consent?.dataSharing !== false,
    aiAnalysis: consent?.aiAnalysis !== false,
    dataProcessing: consent?.dataProcessing !== false,
    dietYogaPersonalization: consent?.dietYogaPersonalization !== false,
    consentDate: new Date(),
  };

  const patient = await Patient.create({
    name: trimmedName,
    phone: trimmedPhone,
    abhaId: normalizedAbha,
    preferredLanguage: normalizeLanguage(preferredLanguage),
    age: ageNumber,
    gender: normalizedGender,
    password,
    consent: consentData,
  });

  const token = generateToken(patient._id, "patient");

  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { patient, token },
        "Patient registered successfully",
      ),
    );
});

/**
 * POST /api/auth/patient/login
 * Login patient via ABHA ID
 */
export const loginPatient = asyncHandler(async (req, res) => {
  const { abhaId, password } = req.body;

  const normalizedAbha = normalizeAbhaId(abhaId);
  if (!normalizedAbha) {
    throw new ApiError(400, "ABHA ID is required");
  }

  const rawTrimmed = typeof abhaId === "string" ? abhaId.trim() : "";
  const patient = await Patient.findOne({
    $or: [{ abhaId: normalizedAbha }, { abhaId: rawTrimmed }],
  }).select("+password");

  if (!patient) {
    throw new ApiError(
      404,
      "No account found for this ABHA ID. Please register first.",
    );
  }

  // If patient has a password set, verify it
  if (patient.password) {
    if (!password) {
      throw new ApiError(400, "Password is required");
    }
    const isPasswordCorrect = await patient.comparePassword(password);
    if (!isPasswordCorrect) {
      throw new ApiError(401, "Invalid ABHA ID or password");
    }
  } else if (password && typeof password === "string" && password.length >= 6) {
    // Legacy account without password: automatically set it on first login
    patient.password = password;
    await patient.save();
  }

  if (patient.abhaId !== normalizedAbha) {
    patient.abhaId = normalizedAbha;
    await patient.save();
  }

  // Remove password from response
  const patientResponse = patient.toObject();
  delete patientResponse.password;

  const token = generateToken(patient._id, "patient");

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { patient: patientResponse, token },
        "Patient logged in successfully",
      ),
    );
});

/**
 * POST /api/auth/patient/consent
 * Record patient consent for data collection/sharing
 */
export const recordConsent = asyncHandler(async (req, res) => {
  const { sessionId, dataCollection, dataSharing, abhaLinking, method } =
    req.body;

  if (!sessionId) {
    throw new ApiError(400, "Session ID is required");
  }

  const session = await Session.findById(sessionId);
  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  // Verify this session belongs to the logged-in patient
  if (session.patient.toString() !== req.userId) {
    throw new ApiError(403, "You don't have permission to update this session");
  }

  session.consent = {
    dataCollectionConsent: dataCollection || false,
    dataSharingConsent: dataSharing || false,
    abhaLinkingConsent: abhaLinking || false,
    consentTimestamp: new Date(),
    consentMethod: method || "touch",
  };

  await session.save();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { consent: session.consent },
        "Consent recorded successfully",
      ),
    );
});

// ─── DOCTOR AUTH ──────────────────────────────────────────────────

/**
 * POST /api/auth/doctor/register
 * Register a new doctor
 */
export const registerDoctor = asyncHandler(async (req, res) => {
  const { name, email, password, specialization, hospitalId } = req.body;

  const trimmedName = typeof name === "string" ? name.trim() : "";
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!trimmedName || !normalizedEmail || !password) {
    throw new ApiError(400, "Name, email, and password are required");
  }

  if (typeof password !== "string" || password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  const existingDoctor = await Doctor.findOne({ email: normalizedEmail });
  if (existingDoctor) {
    throw new ApiError(400, "Doctor with this email already exists");
  }

  const doctor = await Doctor.create({
    name: trimmedName,
    email: normalizedEmail,
    password,
    specialization,
    hospitalId,
  });

  // Remove password from response
  const doctorResponse = doctor.toObject();
  delete doctorResponse.password;

  const token = generateToken(doctor._id, "doctor");

  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { doctor: doctorResponse, token },
        "Doctor registered successfully",
      ),
    );
});

/**
 * POST /api/auth/doctor/login
 * Login doctor via email + password
 */
export const loginDoctor = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!normalizedEmail || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  // Need to explicitly select password since it's excluded by default
  const doctor = await Doctor.findOne({ email: normalizedEmail }).select(
    "+password",
  );

  if (!doctor) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isPasswordCorrect = await doctor.comparePassword(password);

  if (!isPasswordCorrect) {
    throw new ApiError(401, "Invalid email or password");
  }

  const doctorResponse = doctor.toObject();
  delete doctorResponse.password;

  const token = generateToken(doctor._id, "doctor");

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { doctor: doctorResponse, token },
        "Doctor logged in successfully",
      ),
    );
});

/**
 * GET /api/auth/doctor/me
 * Return the logged-in doctor from the JWT.
 */
export const getCurrentDoctor = asyncHandler(async (req, res) => {
  res
    .status(200)
    .json(new ApiResponse(200, { doctor: req.user }, "Doctor session valid"));
});

/**
 * GET /api/auth/patient/me
 * Return the logged-in patient from the JWT.
 */
export const getCurrentPatient = asyncHandler(async (req, res) => {
  res
    .status(200)
    .json(new ApiResponse(200, { patient: req.user }, "Patient session valid"));
});

/**
 * PATCH /api/auth/patient/me
 * Update the logged-in patient's profile fields.
 */
export const updateCurrentPatient = asyncHandler(async (req, res) => {
  const { name, phone, preferredLanguage, age, gender, height, weight, consent } = req.body;
  const patient = await Patient.findById(req.userId);

  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  if (typeof name === "string" && name.trim()) {
    patient.name = name.trim();
  }

  if (typeof phone === "string") {
    const trimmedPhone = phone.trim();
    if (!/^\d{10}$/.test(trimmedPhone)) {
      throw new ApiError(400, "Enter a valid 10-digit mobile number");
    }
    patient.phone = trimmedPhone;
  }

  if (preferredLanguage !== undefined) {
    patient.preferredLanguage = normalizeLanguage(preferredLanguage);
  }

  if (age !== undefined && age !== null && age !== "") {
    const ageNumber = Number(age);
    if (!Number.isInteger(ageNumber) || ageNumber < 1 || ageNumber > 120) {
      throw new ApiError(400, "Enter a valid age between 1 and 120");
    }
    patient.age = ageNumber;
  }

  if (gender !== undefined) {
    const normalizedGender = normalizeGender(gender);
    if (!normalizedGender) {
      throw new ApiError(400, "Select a valid gender");
    }
    patient.gender = normalizedGender;
  }

  // Handle Height (cm)
  if (height !== undefined && height !== null && height !== "") {
    const heightNum = Number(height);
    if (isNaN(heightNum) || heightNum < 30 || heightNum > 300) {
      throw new ApiError(400, "Enter a valid height between 30 cm and 300 cm");
    }
    patient.height = Math.round(heightNum * 10) / 10;
  }

  // Handle Weight (kg)
  if (weight !== undefined && weight !== null && weight !== "") {
    const weightNum = Number(weight);
    if (isNaN(weightNum) || weightNum < 5 || weightNum > 500) {
      throw new ApiError(400, "Enter a valid weight between 5 kg and 500 kg");
    }
    patient.weight = Math.round(weightNum * 10) / 10;
  }

  // Compute BMI dynamically if both height and weight are available
  if (patient.height && patient.weight) {
    const heightInMeters = patient.height / 100;
    const computedBmi = Math.round((patient.weight / (heightInMeters * heightInMeters)) * 10) / 10;
    patient.bmi = computedBmi;

    if (computedBmi < 18.5) {
      patient.bmiCategory = "Underweight";
    } else if (computedBmi < 25) {
      patient.bmiCategory = "Normal";
    } else if (computedBmi < 30) {
      patient.bmiCategory = "Overweight";
    } else {
      patient.bmiCategory = "Obese";
    }
  }

  // Handle Consent
  if (consent && typeof consent === "object") {
    patient.consent = {
      aiAnalysis: Boolean(consent.aiAnalysis),
      dataProcessing: Boolean(consent.dataProcessing),
      dietYogaPersonalization: Boolean(consent.dietYogaPersonalization),
      consentDate: new Date(),
    };
  }

  await patient.save();

  res
    .status(200)
    .json(new ApiResponse(200, { patient }, "Profile updated successfully"));
});
