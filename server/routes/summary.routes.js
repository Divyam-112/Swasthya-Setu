import { Router } from "express";
import { verifyToken, restrictTo } from "../middleware/auth.js";
import {
  generateSummary,
  getSummary,
  updateSummary,
} from "../controllers/summaryController.js";

const router = Router();

// Generate clinical summary
router.post("/generate/:sessionId", verifyToken, generateSummary);

// Get summary
router.get("/:sessionId", verifyToken, getSummary);

// Update summary (doctor edit)
router.put("/:sessionId", verifyToken, restrictTo("doctor"), updateSummary);

export default router;
