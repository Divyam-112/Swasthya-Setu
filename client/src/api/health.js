import { api } from "./client.js";

export function getHealthDashboard() {
  return api.get("/health-tracker/dashboard");
}

export function getReadings(params = {}) {
  const query = new URLSearchParams();
  if (params.type) query.set("type", params.type);
  if (params.days) query.set("days", String(params.days));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get(`/health-tracker/readings${suffix}`);
}

export function addReading(payload) {
  return api.post("/health-tracker/reading", payload);
}

export function deleteReading(readingId) {
  return api.delete(`/health-tracker/reading/${readingId}`);
}

export function getMedicineReminders(active) {
  const suffix = active ? "?active=true" : "";
  return api.get(`/health-tracker/medicine-reminders${suffix}`);
}

export function addMedicineReminder(payload) {
  return api.post("/health-tracker/medicine-reminder", payload);
}

export function updateMedicineReminder(reminderId, payload) {
  return api.put(`/health-tracker/medicine-reminder/${reminderId}`, payload);
}

export function deleteMedicineReminder(reminderId) {
  return api.delete(`/health-tracker/medicine-reminder/${reminderId}`);
}

export function addMedicineLog(payload) {
  return api.post("/health-tracker/medicine-log", payload);
}

export function getMedicineLogs(days) {
  const suffix = days ? `?days=${days}` : "";
  return api.get(`/health-tracker/medicine-logs${suffix}`);
}

export function deleteMedicineLog(logId) {
  return api.delete(`/health-tracker/medicine-log/${logId}`);
}

export function getExerciseReminders(active) {
  const suffix = active ? "?active=true" : "";
  return api.get(`/health-tracker/exercise-reminders${suffix}`);
}

export function addExerciseReminder(payload) {
  return api.post("/health-tracker/exercise-reminder", payload);
}

export function updateExerciseReminder(reminderId, payload) {
  return api.put(`/health-tracker/exercise-reminder/${reminderId}`, payload);
}

export function deleteExerciseReminder(reminderId) {
  return api.delete(`/health-tracker/exercise-reminder/${reminderId}`);
}

export function addExerciseLog(payload) {
  return api.post("/health-tracker/exercise-log", payload);
}

export function getExerciseLogs(days) {
  const suffix = days ? `?days=${days}` : "";
  return api.get(`/health-tracker/exercise-logs${suffix}`);
}

export function deleteExerciseLog(logId) {
  return api.delete(`/health-tracker/exercise-log/${logId}`);
}
