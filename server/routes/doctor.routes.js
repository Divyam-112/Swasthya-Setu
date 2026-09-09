import { Router } from "express";
import { verifyToken, restrictTo } from "../middleware/auth.js";
import {
  getPatientQueue,
  getPatientDetail,
  getPatientMedicalHistory,
  submitReview,
  suggestYogaPoses,
} from "../controllers/doctorController.js";

const router = Router();

// All doctor routes require doctor role
router.use(verifyToken, restrictTo("doctor"));

// Get patient queue
router.get("/queue", getPatientQueue);

// Get patient details (session view)
router.get("/patient/:sessionId", getPatientDetail);

// Get full unified medical history for a patient
router.get("/patient/:patientId/medical-history", getPatientMedicalHistory);

// Suggest/prescribe yoga poses for a patient (saved to medical history)
router.post("/patient/:patientId/yoga-poses", suggestYogaPoses);

// Submit review
router.put("/review/:sessionId", submitReview);

export default router;
