import { api } from "./client.js";

export function getAvailableDoctors(specialization) {
  const params = specialization ? `?specialization=${encodeURIComponent(specialization)}` : "";
  return api.get(`/appointment/doctors${params}`);
}

export function bookAppointment(payload) {
  return api.post("/appointment/book", payload);
}

export function getMyAppointments(status) {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return api.get(`/appointment/my-appointments${params}`);
}

export function cancelAppointment(appointmentId, reason) {
  return api.put(`/appointment/cancel/${appointmentId}`, { reason });
}

export function getRecommendations() {
  return api.get("/recommendation");
}

