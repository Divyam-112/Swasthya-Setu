import { api } from "./client.js";

/**
 * Fetch the doctor's assigned OPD patient queue.
 * Prioritizes /appointment/doctor/queue; falls back to /doctor/queue if needed.
 */
export async function fetchDoctorQueue(date, status) {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (status) params.set("status", status);
  const qs = params.toString();

  try {
    const res = await api.get(`/appointment/doctor/queue${qs ? `?${qs}` : ""}`);
    return res.data;
  } catch (err) {
    // Fallback to legacy queue endpoint if appointment queue is unavailable
    const fallbackRes = await api.get(`/doctor/queue`);
    return {
      date: date || new Date().toISOString().split("T")[0],
      totalAppointments: fallbackRes.data?.length || 0,
      queue: (fallbackRes.data || []).map((s, idx) => ({
        appointmentId: s.sessionId || `session-${idx}`,
        tokenNumber: idx + 1,
        patientName: s.patientName || "Patient",
        age: s.age || 30,
        gender: s.gender || "Other",
        abhaId: s.abhaId || "",
        phone: s.phone || "",
        sessionId: s.sessionId,
        sessionType: s.sessionType || "OPD",
        chiefComplaint: s.chiefComplaint || "General consultation",
        sessionStatus: s.status || "in_progress",
        completionPercentage: s.completionPercentage || 100,
        hasRedFlags: Boolean(s.hasRedFlags),
        redFlags: s.redFlags || [],
        hasSummary: true,
        appointmentStatus: "booked",
        preferredTimeSlot: "morning",
        scheduledDate: s.createdAt || new Date().toISOString(),
        createdAt: s.createdAt || new Date().toISOString(),
      })),
    };
  }
}

/**
 * Fetch full patient and clinical session details for doctor review.
 */
export async function fetchPatientDetail(sessionId) {
  const res = await api.get(`/doctor/patient/${sessionId}`);
  return res.data;
}

/**
 * Submit clinical review (accepted / modified / rejected).
 */
export async function submitReview(sessionId, status, modifications) {
  const res = await api.put(`/doctor/review/${sessionId}`, {
    status,
    modifications,
  });
  return res.data;
}

/**
 * Update appointment status (in_progress / completed / no_show).
 */
export async function updateAppointmentStatus(appointmentId, status, doctorNotes) {
  const res = await api.put(`/appointment/doctor/status/${appointmentId}`, {
    status,
    doctorNotes,
  });
  return res.data;
}

/**
 * Fetch patient unified medical history by patient ID.
 */
export async function fetchPatientMedicalHistory(patientId) {
  const res = await api.get(`/doctor/patient/${patientId}/medical-history`);
  return res.data;
}

/**
 * Create a digital prescription for a session.
 */
export async function createPrescription(sessionId, payload) {
  const res = await api.post(`/prescription/${sessionId}`, payload);
  return res.data;
}

/**
 * Retrieve the prescription for a session.
 */
export async function getPrescription(sessionId) {
  const res = await api.get(`/prescription/${sessionId}`);
  return res.data;
}

/**
 * Update an existing prescription for a session.
 */
export async function updatePrescription(sessionId, payload) {
  const res = await api.put(`/prescription/${sessionId}`, payload);
  return res.data;
}

/**
 * Fetch all prescriptions authored by the doctor.
 */
export async function fetchDoctorPrescriptions() {
  const res = await api.get(`/prescription/doctor/all`);
  return res.data;
}
