import { Router } from "express";
import { verifyToken, restrictTo } from "../middleware/auth.js";
import {
  startSession,
  getSession,
  getPatientSessions,
  verifySession,
} from "../controllers/sessionController.js";

const router = Router();

// Start new session
router.post("/start", verifyToken, restrictTo("patient"), startSession);

// Get all sessions for logged-in patient. Must stay above "/:sessionId",
// or "patient" gets read as a session id and the lookup fails.
router.get("/patient/all", verifyToken, restrictTo("patient"), getPatientSessions);

// Get session by ID — patient owns it; doctor reads via /doctor/patient/:id
router.get("/:sessionId", verifyToken, getSession);

// Patient confirms the generated history (with any corrections)
router.post("/:sessionId/verify", verifyToken, restrictTo("patient"), verifySession);

export default router;
