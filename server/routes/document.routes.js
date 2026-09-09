import { Router } from "express";
import multer from "multer";
import { verifyToken, restrictTo } from "../middleware/auth.js";
import {
  uploadDocument,
  processDocument,
  getDocument,
  getSessionDocuments,
  getPatientDocuments,
  deleteDocument,
} from "../controllers/documentController.js";

const router = Router();

// Multer config for document upload (in-memory)
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only images and PDFs are allowed"), false);
    }
  },
});

// Upload document
router.post(
  "/upload",
  verifyToken,
  restrictTo("patient"),
  documentUpload.single("document"),
  uploadDocument,
);

router.post("/process/:docId", verifyToken, restrictTo("patient"), processDocument);

router.get("/patient/all", verifyToken, restrictTo("patient"), getPatientDocuments);

// Delete specific document
router.delete("/:docId", verifyToken, deleteDocument);

// Get specific document
router.get("/:docId", verifyToken, getDocument);

// Get all documents for a session
router.get("/session/:sessionId", verifyToken, getSessionDocuments);

export default router;

