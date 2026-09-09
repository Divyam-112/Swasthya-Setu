import Session from "../models/Session.js";
import Patient from "../models/Patient.js";
import HealthTracker from "../models/HealthTracker.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import cloudinary from "../config/cloudinary.js";
import axios from "axios";
import { processDocumentOCR } from "../services/ocrService.js";
import { appendDocumentContext } from "../services/medicalHistoryService.js";

async function resolveUploadSession(patientId, sessionId) {
  if (sessionId) {
    const session = await Session.findById(sessionId);
    if (!session) {
      throw new ApiError(404, "Session not found");
    }
    if (session.patient.toString() !== patientId) {
      throw new ApiError(403, "This session does not belong to you");
    }
    return session;
  }

  // History sessions self-delete after 24h (privacy TTL). Attaching a
  // standalone upload to one would silently take the document with it, so
  // only reuse a session that is not about to expire.
  const keepUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  let session = await Session.findOne({
    patient: patientId,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: keepUntil } }],
  }).sort({ createdAt: -1 });

  if (!session) {
    session = await Session.create({
      patient: patientId,
      sessionType: "allopathic",
      status: "completed",
      completionPercentage: 100,
      currentCategory: "closing",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
    await Patient.findByIdAndUpdate(patientId, {
      $push: { sessions: session._id },
    });
  }

  return session;
}

/**
 * POST /api/documents/upload
 * Upload a medical document (prescription, lab report, etc.)
 */
export const uploadDocument = asyncHandler(async (req, res) => {
  const { sessionId, type } = req.body;

  if (!req.file) {
    throw new ApiError(400, "Document file is required");
  }

  const session = await resolveUploadSession(req.userId, sessionId);

  // Upload to Cloudinary
  let imageUrl = "";
  try {
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "swasthyasetu/documents",
          resource_type: "image",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      );
      uploadStream.end(req.file.buffer);
    });
    imageUrl = result.secure_url;
  } catch (error) {
    console.error("Cloudinary upload error:", error.message);
    throw new ApiError(500, "Failed to upload document. Please try again.");
  }

  // Add document to session
  const newDoc = {
    type: type || "other",
    imageUrl,
    ocrText: "",
    extractedData: {},
    uploadedAt: new Date(),
  };

  session.scannedDocuments.push(newDoc);
  await session.save();

  // Get the saved document (last one in array)
  const savedDoc =
    session.scannedDocuments[session.scannedDocuments.length - 1];

  // Immediately track uploaded document in unified medical history
  try {
    await appendDocumentContext(req.userId, {
      docId: savedDoc._id,
      sessionId: session._id,
      type: type || "other",
      hospitalName: "",
      diagnoses: [],
      medications: [],
      labResults: [],
      rawText: "",
    });
  } catch (mhErr) {
    console.warn("⚠️ [MedHistory] Pre-OCR document registration warning:", mhErr.message);
  }

  res.status(201).json(
    new ApiResponse(
      201,
      {
        docId: savedDoc._id,
        sessionId: session._id,
        imageUrl,
        status: "uploaded",
        type: type || "other",
      },
      "Document uploaded successfully",
    ),
  );
});

/**
 * POST /api/documents/process/:docId
 * Trigger OCR processing on an uploaded document.
 * Calls the ML service (teammate's OCR API) to extract data.
 */
export const processDocument = asyncHandler(async (req, res) => {
  const { docId } = req.params;
  const { sessionId } = req.body;

  if (!sessionId) {
    throw new ApiError(400, "Session ID is required");
  }

  const session = await Session.findById(sessionId);
  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  if (session.patient.toString() !== req.userId) {
    throw new ApiError(403, "This session does not belong to you");
  }

  // Find the document in session
  const doc = session.scannedDocuments.id(docId);
  if (!doc) {
    throw new ApiError(404, "Document not found");
  }

  try {
    // Process document via Gemini Multimodal OCR (with ML service fallback)
    const ocrResult = await processDocumentOCR(doc.imageUrl);
    const { rawText, extractedData } = ocrResult;

    // Update document with OCR results
    doc.ocrText = rawText || "";
    doc.extractedData = {
      diagnoses: extractedData?.diagnoses || [],
      medications: extractedData?.medications || [],
      labResults: extractedData?.labResults || [],
      procedures: extractedData?.procedures || [],
      doctorName: extractedData?.doctorName || "",
      hospitalName: extractedData?.hospitalName || "",
      date: extractedData?.date ? new Date(extractedData.date) : null,
    };

    await session.save();

    // ── Push OCR-extracted data into unified Medical History ──────
    try {
      await appendDocumentContext(req.userId, {
        docId: doc._id,
        sessionId: session._id,
        type: doc.type || "other",
        hospitalName: extractedData?.hospitalName || "",
        diagnoses: extractedData?.diagnoses || [],
        medications: extractedData?.medications || [],
        labResults: extractedData?.labResults || [],
        rawText: rawText || "",
      });
    } catch (mhErr) {
      // Non-blocking — log but don't fail the request
      console.error("[MedHistory] Failed to append document context:", mhErr.message);
    }

    // ── Auto-fill Health Tracker if BP, Sugar, etc. are mentioned in the report ──
    try {
      let tracker = await HealthTracker.findOne({ patient: req.userId });
      if (!tracker) {
        tracker = await HealthTracker.create({
          patient: req.userId,
          healthReadings: [],
          medicineReminders: [],
          exerciseReminders: [],
        });
      }

      const reportDate = extractedData?.date ? new Date(extractedData.date) : new Date();
      const vitals = extractedData?.vitals || {};
      const labResults = extractedData?.labResults || [];
      const newReadings = [];

      // 1. Blood Pressure
      if (vitals.bloodPressure) {
        let systolic = null;
        let diastolic = null;
        if (typeof vitals.bloodPressure === "object") {
          systolic = Number(vitals.bloodPressure.systolic);
          diastolic = Number(vitals.bloodPressure.diastolic);
        } else if (typeof vitals.bloodPressure === "string") {
          const match = vitals.bloodPressure.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
          if (match) {
            systolic = Number(match[1]);
            diastolic = Number(match[2]);
          }
        }
        if (systolic && diastolic && systolic > 50 && diastolic > 30) {
          newReadings.push({
            type: "blood_pressure",
            value: systolic,
            secondaryValue: diastolic,
            unit: "mmHg",
            measuredAt: reportDate,
            notes: `Auto-filled from ${doc.type || "report"} (${extractedData?.hospitalName || "Lab"})`,
          });
        }
      }

      // Check labResults or raw text for BP if not yet captured
      if (!newReadings.some((r) => r.type === "blood_pressure")) {
        const bpLab = labResults.find((l) => /blood pressure|bp/i.test(l.testName || l.test || ""));
        const rawMatch = (rawText || "").match(/(?:BP|Blood Pressure)[:\s]+(\d{2,3})\s*\/\s*(\d{2,3})/i);
        if (bpLab && /^\d{2,3}\/\d{2,3}$/.test(String(bpLab.value).trim())) {
          const [s, d] = String(bpLab.value).trim().split("/").map(Number);
          if (s && d) {
            newReadings.push({
              type: "blood_pressure",
              value: s,
              secondaryValue: d,
              unit: "mmHg",
              measuredAt: reportDate,
              notes: `Auto-filled from ${bpLab.testName || "report"}`,
            });
          }
        } else if (rawMatch) {
          newReadings.push({
            type: "blood_pressure",
            value: Number(rawMatch[1]),
            secondaryValue: Number(rawMatch[2]),
            unit: "mmHg",
            measuredAt: reportDate,
            notes: "Auto-filled from report",
          });
        }
      }

      // 2. Blood Sugar / Glucose
      let sugarVal = null;
      let sugarContext = "random";
      if (vitals.bloodSugar) {
        if (typeof vitals.bloodSugar === "object") {
          sugarVal = Number(vitals.bloodSugar.value);
          if (vitals.bloodSugar.mealContext) sugarContext = vitals.bloodSugar.mealContext;
        } else {
          sugarVal = Number(vitals.bloodSugar);
        }
      }

      if (!sugarVal) {
        const sugarLab = labResults.find((l) =>
          /blood sugar|glucose|fbs|ppbs|rbs|fasting sugar|post prandial/i.test(l.testName || l.test || ""),
        );
        if (sugarLab) {
          const numericVal = parseFloat(String(sugarLab.value).replace(/[^0-9.]/g, ""));
          if (!isNaN(numericVal) && numericVal > 20 && numericVal < 600) {
            sugarVal = numericVal;
            const testTitle = (sugarLab.testName || sugarLab.test || "").toLowerCase();
            if (testTitle.includes("fasting") || testTitle.includes("fbs")) sugarContext = "fasting";
            else if (testTitle.includes("post") || testTitle.includes("pp")) sugarContext = "post_meal";
          }
        }
      }

      if (sugarVal && sugarVal > 20 && sugarVal < 600) {
        newReadings.push({
          type: "blood_sugar",
          value: sugarVal,
          unit: "mg/dL",
          mealContext: sugarContext,
          measuredAt: reportDate,
          notes: `Auto-filled from ${doc.type || "report"}`,
        });
      }

      // 3. Heart Rate / Pulse
      let hrVal = vitals.heartRate ? Number(vitals.heartRate) : null;
      if (!hrVal) {
        const pulseLab = labResults.find((l) => /pulse|heart rate|pulse rate/i.test(l.testName || l.test || ""));
        if (pulseLab) {
          const num = parseFloat(String(pulseLab.value).replace(/[^0-9.]/g, ""));
          if (!isNaN(num) && num >= 40 && num <= 220) hrVal = num;
        }
      }
      if (hrVal && hrVal >= 40 && hrVal <= 220) {
        newReadings.push({
          type: "heart_rate",
          value: hrVal,
          unit: "bpm",
          measuredAt: reportDate,
          notes: `Auto-filled from ${doc.type || "report"}`,
        });
      }

      // 4. Weight
      const weightVal = vitals.weight ? Number(vitals.weight) : null;
      if (weightVal && weightVal >= 10 && weightVal <= 300) {
        newReadings.push({
          type: "weight",
          value: weightVal,
          unit: "kg",
          measuredAt: reportDate,
          notes: `Auto-filled from ${doc.type || "report"}`,
        });
      }

      // 5. Temperature
      const tempVal = vitals.temperature ? Number(vitals.temperature) : null;
      if (tempVal && tempVal >= 30 && tempVal <= 110) {
        newReadings.push({
          type: "temperature",
          value: tempVal,
          unit: tempVal > 45 ? "°F" : "°C",
          measuredAt: reportDate,
          notes: `Auto-filled from ${doc.type || "report"}`,
        });
      }

      if (newReadings.length > 0) {
        tracker.healthReadings.push(...newReadings);
        await tracker.save();
        console.log(`✅ [HealthTracker] Auto-filled ${newReadings.length} reading(s) from report for patient ${req.userId}`);
      }
    } catch (htErr) {
      console.warn("⚠️ [HealthTracker] Auto-fill from document error:", htErr.message);
    }

    res.status(200).json(
      new ApiResponse(
        200,
        {
          docId,
          status: "processed",
          extractedData: doc.extractedData,
          ocrText: doc.ocrText,
        },
        "Document processed successfully",
      ),
    );
  } catch (error) {
    console.error("OCR Service Error:", error.message);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, `Document processing failed: ${error.message}`);
  }
});

/**
 * GET /api/documents/:docId
 * Get a specific document with its extracted data
 */
export const getDocument = asyncHandler(async (req, res) => {
  const { docId } = req.params;
  const { sessionId } = req.query;

  if (!sessionId) {
    throw new ApiError(400, "Session ID is required as query param");
  }

  const session = await Session.findById(sessionId);
  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  if (req.userRole === "patient" && session.patient.toString() !== req.userId) {
    throw new ApiError(403, "You don't have permission to view this document");
  }

  const doc = session.scannedDocuments.id(docId);
  if (!doc) {
    throw new ApiError(404, "Document not found");
  }

  res
    .status(200)
    .json(new ApiResponse(200, doc, "Document retrieved successfully"));
});

/**
 * GET /api/documents/session/:sessionId
 * Get all documents for a session (timeline view)
 */
export const getSessionDocuments = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await Session.findById(sessionId).select(
    "scannedDocuments patient",
  );

  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  if (
    req.userRole === "patient" &&
    session.patient.toString() !== req.userId
  ) {
    throw new ApiError(403, "You don't have permission to view these documents");
  }

  // Sort by upload date (newest first)
  const documents = session.scannedDocuments.sort(
    (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt),
  );

  res
    .status(200)
    .json(new ApiResponse(200, documents, "Documents retrieved successfully"));
});

/**
 * GET /api/documents/patient/all
 * All uploaded documents across the patient's sessions.
 */
export const getPatientDocuments = asyncHandler(async (req, res) => {
  const sessions = await Session.find({ patient: req.userId })
    .select("scannedDocuments createdAt sessionType")
    .sort({ createdAt: -1 });

  const documents = sessions.flatMap((session) =>
    (session.scannedDocuments || []).map((doc) => ({
      ...doc.toObject(),
      sessionId: session._id,
      sessionCreatedAt: session.createdAt,
      sessionType: session.sessionType,
    })),
  );

  documents.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  res.status(200).json(
    new ApiResponse(200, documents, "Patient documents retrieved successfully"),
  );
});

/**
 * DELETE /api/documents/:docId
 * Delete an uploaded document from a session
 */
export const deleteDocument = asyncHandler(async (req, res) => {
  const { docId } = req.params;
  const { sessionId } = req.query;

  let session;
  if (sessionId) {
    session = await Session.findById(sessionId);
  } else {
    session = await Session.findOne({ "scannedDocuments._id": docId });
  }

  if (!session) {
    throw new ApiError(404, "Document or session not found");
  }

  if (
    req.userRole === "patient" &&
    session.patient.toString() !== req.userId
  ) {
    throw new ApiError(403, "You don't have permission to delete this document");
  }

  const doc = session.scannedDocuments.id(docId);
  if (!doc) {
    throw new ApiError(404, "Document not found in session");
  }

  session.scannedDocuments.pull(docId);
  await session.save();

  res.status(200).json(
    new ApiResponse(200, { docId }, "Document deleted successfully"),
  );
});

