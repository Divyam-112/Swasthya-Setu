import { Router } from "express";
import { verifyToken, restrictTo } from "../middleware/auth.js";
import {
  getAvailableDoctors,
  bookAppointment,
  getMyAppointments,
  cancelAppointment,
  getDoctorQueue,
  updateAppointmentStatus,
} from "../controllers/appointmentController.js";

const router = Router();

// ─── Public Routes (no auth needed) ─────────────────────────────
// View available doctors (publicly browsable for booking wizard)
router.get("/doctors", getAvailableDoctors);

// All routes below require authentication
router.use(verifyToken);

// ─── Patient-side Routes ─────────────────────────────────────────
// Book an appointment with a doctor
router.post("/book", restrictTo("patient"), bookAppointment);

// View patient's own appointments
router.get(
  "/my-appointments",
  restrictTo("patient"),
  getMyAppointments,
);

// Cancel an appointment
router.put(
  "/cancel/:appointmentId",
  restrictTo("patient"),
  cancelAppointment,
);

// ─── Doctor-side Routes ──────────────────────────────────────────
// Get doctor's assigned patient queue for a day
router.get("/doctor/queue", restrictTo("doctor"), getDoctorQueue);

// Update appointment status (start, complete, no-show)
router.put(
  "/doctor/status/:appointmentId",
  restrictTo("doctor"),
  updateAppointmentStatus,
);

export default router;
