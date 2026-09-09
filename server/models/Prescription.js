import mongoose from "mongoose";

const prescriptionSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: [true, "Session reference is required"],
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: [true, "Patient reference is required"],
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: [true, "Doctor reference is required"],
    },
    diagnosis: {
      type: String,
      required: [true, "Diagnosis is required"],
      trim: true,
    },
    medications: [
      {
        name: {
          type: String,
          required: [true, "Medicine name is required"],
          trim: true,
        },
        dosage: {
          type: String,
          trim: true,
        },
        frequency: {
          type: String,
          default: "Twice daily",
          trim: true,
        },
        duration: {
          type: String,
          trim: true,
        },
        timing: {
          type: String,
          default: "After food",
          trim: true,
        },
        instructions: {
          type: String,
          trim: true,
        },
      },
    ],
    investigations: [
      {
        type: String,
        trim: true,
      },
    ],
    advice: [
      {
        type: String,
        trim: true,
      },
    ],
    yogaPoses: [
      {
        name: { type: String, trim: true },
        sanskritName: { type: String, trim: true },
        durationMinutes: { type: Number, default: 10 },
        reps: { type: String, trim: true },
        timeOfDay: { type: String, default: "Morning" },
        instructions: { type: String, trim: true },
        benefits: { type: String, trim: true },
      },
    ],
    followUpDate: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// Index for quick lookups
prescriptionSchema.index({ session: 1 });
prescriptionSchema.index({ patient: 1, createdAt: -1 });
prescriptionSchema.index({ doctor: 1, createdAt: -1 });

const Prescription = mongoose.model("Prescription", prescriptionSchema);
export default Prescription;
