import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const patientSchema = new mongoose.Schema(
  {
    abhaId: {
      type: String,
      unique: true,
      sparse: true, // Allows null (for patients without ABHA)
      index: true,
    },
    name: {
      type: String,
      required: [true, "Patient name is required"],
      trim: true,
    },
    password: {
      type: String,
      minlength: 6,
      select: false, // Don't return password by default in queries
    },
    age: {
      type: Number,
      min: 0,
      max: 150,
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    },
    phone: {
      type: String,
      trim: true,
    },
    // Biometric measurements
    height: {
      type: Number, // in centimeters (cm)
      min: 30,
      max: 300,
    },
    weight: {
      type: Number, // in kilograms (kg)
      min: 5,
      max: 500,
    },
    bmi: {
      type: Number,
      min: 5,
      max: 100,
    },
    bmiCategory: {
      type: String,
      enum: ["Underweight", "Normal", "Overweight", "Obese"],
    },
    // Patient informed consent for AI & data processing
    consent: {
      dataCollection: { type: Boolean, default: true },
      dataSharing: { type: Boolean, default: true },
      aiAnalysis: { type: Boolean, default: false },
      dataProcessing: { type: Boolean, default: false },
      dietYogaPersonalization: { type: Boolean, default: false },
      consentDate: { type: Date },
    },
    preferredLanguage: {
      type: String,
      enum: ["hi", "en", "ta", "te", "bn", "mr", "gu", "kn", "ml", "pa"],
      default: "hi",
    },
    // Sessions linked to this patient
    sessions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Session",
      },
    ],

    // ─── Unified Medical History JSON ─────────────────────────────
    // Continuously updated from 3 sources:
    //   1. Symptom interviews (appointment Q&A)
    //   2. Uploaded & OCR-processed medical documents
    //   3. Doctor diagnoses & digital prescriptions
    medicalHistory: {
      // Source 1: Symptom interviews from appointment wizard
      symptomInterviews: [
        {
          sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session" },
          date: { type: Date, default: Date.now },
          chiefComplaint: String,
          symptoms: [String],
          duration: String,
          severity: Number,
          interviewQA: [{ question: String, answer: String }],
          source: { type: String, default: "interview" },
        },
      ],

      // Source 2: Uploaded & OCR-processed documents
      uploadedDocuments: [
        {
          docId: mongoose.Schema.Types.ObjectId,
          sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session" },
          date: { type: Date, default: Date.now },
          type: { type: String, enum: ["prescription", "lab_report", "discharge_summary", "imaging", "other"] },
          hospitalName: String,
          diagnoses: [String],
          medications: [
            {
              name: String,
              dosage: String,
              frequency: String,
              duration: String,
              timing: String,
            },
          ],
          labResults: [
            {
              testName: String,
              value: String,
              unit: String,
              referenceRange: String,
              isAbnormal: Boolean,
            },
          ],
          rawText: String,
          source: { type: String, default: "document" },
        },
      ],

      // Source 3: Doctor-written digital prescriptions
      prescriptions: [
        {
          prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Prescription" },
          sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session" },
          date: { type: Date, default: Date.now },
          doctorName: String,
          specialization: String,
          diagnosis: String,
          medications: [
            {
              name: String,
              dosage: String,
              frequency: String,
              duration: String,
              timing: String,
              instructions: String,
            },
          ],
          investigations: [String],
          advice: [String],
          yogaPoses: [
            {
              name: String,
              sanskritName: String,
              durationMinutes: Number,
              reps: String,
              timeOfDay: String,
              instructions: String,
              benefits: String,
            },
          ],
          followUpDate: Date,
          notes: String,
          source: { type: String, default: "prescription" },
        },
      ],

      // Doctor prescribed/suggested yoga poses
      prescribedYogaPoses: [
        {
          name: String,
          sanskritName: String,
          durationMinutes: { type: Number, default: 10 },
          reps: String,
          timeOfDay: { type: String, default: "Morning" },
          instructions: String,
          benefits: String,
          prescribedBy: String,
          prescribedAt: { type: Date, default: Date.now },
        },
      ],

      // Cumulative unique conditions across all sources
      cumulativeDiagnoses: [
        {
          condition: String,
          firstSeenAt: { type: Date, default: Date.now },
          sources: [{ type: String, enum: ["interview", "document", "prescription"] }],
        },
      ],

      // Currently active medications (merged across prescriptions & documents)
      activeMedications: [
        {
          name: String,
          dosage: String,
          frequency: String,
          timing: String,
          prescribedBy: String,
          prescribedAt: { type: Date, default: Date.now },
          source: { type: String, enum: ["interview", "document", "prescription"] },
        },
      ],

      lastUpdated: { type: Date, default: Date.now },
    },

    // Extracted clinical medical summary JSON
    medicalSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
patientSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password method
patientSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

const Patient = mongoose.model("Patient", patientSchema);
export default Patient;
