import { Router } from "express";
import { verifyToken, restrictTo } from "../middleware/auth.js";
import {
  registerPatient,
  loginPatient,
  recordConsent,
  registerDoctor,
  loginDoctor,
  getCurrentDoctor,
  getCurrentPatient,
  updateCurrentPatient,
} from "../controllers/authController.js";

const router = Router();

// Patient auth
router.post("/patient/register", registerPatient);
router.post("/patient/login", loginPatient);
router.get("/patient/me", verifyToken, restrictTo("patient"), getCurrentPatient);
router.patch(
  "/patient/me",
  verifyToken,
  restrictTo("patient"),
  updateCurrentPatient,
);
router.post("/patient/consent", verifyToken, restrictTo("patient"), recordConsent);

// Doctor auth
router.post("/doctor/register", registerDoctor);
router.post("/doctor/login", loginDoctor);
router.get("/doctor/me", verifyToken, restrictTo("doctor"), getCurrentDoctor);

export default router;
