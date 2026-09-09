import Prescription from "../models/Prescription.js";
import Session from "../models/Session.js";
import Patient from "../models/Patient.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  matchRecommendations,
  getSafetyNotes,
} from "../data/ayurvedaRecommendations.js";

export const LIGHT_YOGA_POSES = [
  {
    id: "light-1",
    name: "Tadasana (Mountain Pose)",
    sanskritName: "ताड़ासन",
    category: "Morning Warm-up",
    timeOfDay: "Morning",
    durationMinutes: 5,
    reps: "Hold for 5-8 breaths, repeat 3 times",
    benefits: "Improves posture, grounds body, strengthens core alignment",
    instructions: "Stand tall with big toes touching. Distribute weight evenly across both feet. Gently engage thigh muscles and draw belly slightly inward. Inhale, extend arms overhead with palms facing each other. Breathe calmly.",
    precautions: "If balance feels unsteady, keep feet hip-width apart.",
    isDoctorPrescribed: false,
  },
  {
    id: "light-2",
    name: "Vrikshasana (Tree Pose)",
    sanskritName: "वृक्षासन",
    category: "Morning Balance",
    timeOfDay: "Morning",
    durationMinutes: 5,
    reps: "1-2 minutes on each leg",
    benefits: "Builds mental focus, stabilizes ankle joints, improves muscular balance",
    instructions: "Shift weight onto left foot. Place sole of right foot against inner left calf or thigh (avoid the knee). Bring palms together at chest center (Anjali Mudra). Focus on a fixed point ahead.",
    precautions: "Use wall or chair support if experiencing imbalance.",
    isDoctorPrescribed: false,
  },
  {
    id: "light-3",
    name: "Marjaryasana-Bitilasana (Cat-Cow Stretch)",
    sanskritName: "मार्जरी-बिटिलासन",
    category: "Spine Mobility",
    timeOfDay: "Morning",
    durationMinutes: 8,
    reps: "8 to 10 slow breath cycles",
    benefits: "Gently warms and flexes the entire spine, relieves lower back tension",
    instructions: "Come to all fours with wrists below shoulders and knees below hips. Inhale: drop belly down, gently lift chest and tailbone (Cow). Exhale: round spine upwards, tuck chin to chest (Cat).",
    precautions: "Maintain smooth, unhurried breath without straining the neck.",
    isDoctorPrescribed: false,
  },
  {
    id: "light-4",
    name: "Bhujangasana (Gentle Cobra Pose)",
    sanskritName: "भुजङ्गासन",
    category: "Back Care & Strength",
    timeOfDay: "Afternoon",
    durationMinutes: 6,
    reps: "Hold for 15-20 seconds, repeat 3 times",
    benefits: "Opens chest and shoulders, strengthens spinal extensors, aids digestion",
    instructions: "Lie face down with legs extended. Place hands beside ribs, elbows tucked in. Inhale, gently peel chest off the mat using back muscles rather than pushing through hands. Keep neck soft.",
    precautions: "Avoid high lifting if you have recent abdominal or spine surgery.",
    isDoctorPrescribed: false,
  },
  {
    id: "light-5",
    name: "Balasana (Child's Pose)",
    sanskritName: "बालासन",
    category: "Restorative Relaxation",
    timeOfDay: "Evening",
    durationMinutes: 7,
    reps: "Rest for 3 to 5 minutes",
    benefits: "Calms nervous system, relieves fatigue and releases hip tightness",
    instructions: "Kneel on mat, bring big toes to touch and separate knees comfortably. Sit hips back onto heels and fold torso forward, resting forehead on the ground. Keep arms relaxed forward.",
    precautions: "Place folded blanket under knees or hips if joints are sensitive.",
    isDoctorPrescribed: false,
  },
  {
    id: "light-6",
    name: "Anulom Vilom (Alternate Nostril Breathing)",
    sanskritName: "अनुलोम विलोम प्राणायाम",
    category: "Evening Breathwork",
    timeOfDay: "Evening",
    durationMinutes: 10,
    reps: "10-15 gentle breathing cycles",
    benefits: "Harmonizes autonomic nervous system, relieves anxiety, promotes sleep",
    instructions: "Sit cross-legged comfortably with spine upright. Use right thumb to close right nostril, inhale slowly through left. Close left with ring finger, exhale through right. Inhale right, exhale left.",
    precautions: "Breathe naturally without retention or force.",
    isDoctorPrescribed: false,
  },
];

/**
 * GET /api/recommendations
 * Ayurvedic + yoga guidance based on the patient's recorded conditions or doctor prescription.
 */
export const getRecommendations = asyncHandler(async (req, res) => {
  const patientId = req.userId;

  const [prescriptions, sessions, patient] = await Promise.all([
    Prescription.find({ patient: patientId })
      .select("diagnosis yogaPoses createdAt")
      .sort({ createdAt: -1 })
      .limit(5),
    Session.find({ patient: patientId })
      .select(
        "clinicalHistory.chiefComplaint clinicalHistory.pastMedicalHistory clinicalSummary.generatedText createdAt",
      )
      .sort({ createdAt: -1 })
      .limit(5),
    Patient.findById(patientId).select("medicalHistory.prescribedYogaPoses"),
  ]);

  const conditionTexts = [];

  for (const rx of prescriptions) {
    if (rx.diagnosis) conditionTexts.push(rx.diagnosis);
  }

  for (const session of sessions) {
    if (session.clinicalHistory?.chiefComplaint) {
      conditionTexts.push(session.clinicalHistory.chiefComplaint);
    }
    for (const item of session.clinicalHistory?.pastMedicalHistory || []) {
      if (item.condition) conditionTexts.push(item.condition);
    }
  }

  const uniqueConditions = [...new Set(conditionTexts.map((text) => text.trim()))];
  const recommendations = matchRecommendations(uniqueConditions);

  const doctorYoga = patient?.medicalHistory?.prescribedYogaPoses || [];
  const hasDoctorPrescribed = doctorYoga.length > 0;

  const activeYogaPoses = hasDoctorPrescribed
    ? doctorYoga.map((p, idx) => ({
        id: p._id?.toString() || `doc-yoga-${idx}`,
        name: p.name,
        sanskritName: p.sanskritName || "",
        category: p.timeOfDay || "Daily Routine",
        timeOfDay: p.timeOfDay || "Morning",
        durationMinutes: p.durationMinutes || 10,
        reps: p.reps || "Follow daily guidance",
        benefits: p.benefits || "Prescribed by doctor for your condition",
        instructions: p.instructions || "Practice mindfully as advised by your doctor.",
        prescribedBy: p.prescribedBy || "Doctor",
        prescribedAt: p.prescribedAt,
        isDoctorPrescribed: true,
      }))
    : LIGHT_YOGA_POSES;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        sourceConditions: uniqueConditions,
        recommendations,
        doctorPrescribedYoga: doctorYoga,
        lightYogaPoses: LIGHT_YOGA_POSES,
        activeYogaPoses,
        isDoctorPrescribed: hasDoctorPrescribed,
        safety: getSafetyNotes(),
        hasClinicalSource: uniqueConditions.length > 0,
      },
      hasDoctorPrescribed
        ? "Doctor prescribed yoga plan retrieved from medical history"
        : "Light yoga plan provided as default wellness routine",
    ),
  );
});
