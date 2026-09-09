import { api } from "./client.js";

// ─── Patient Auth ────────────────────────────────────────
export function registerPatient(payload) {
  return api.post("/auth/patient/register", payload);
}

export function loginPatient(payload) {
  return api.post("/auth/patient/login", payload);
}

export function getCurrentPatient() {
  return api.get("/auth/patient/me");
}

export function updateCurrentPatient(payload) {
  return api.patch("/auth/patient/me", payload);
}

export function recordConsent(payload) {
  return api.post("/auth/patient/consent", payload);
}

// ─── Doctor Auth ─────────────────────────────────────────
export function registerDoctor(payload) {
  return api.post("/auth/doctor/register", payload);
}

export function loginDoctor(payload) {
  return api.post("/auth/doctor/login", payload);
}

export function getCurrentDoctor() {
  return api.get("/auth/doctor/me");
}
