import { api } from "./client.js";

export function startSession(payload = {}) {
  return api.post("/session/start", payload);
}

export function getPatientSessions() {
  return api.get("/session/patient/all");
}

export function getSession(sessionId) {
  return api.get(`/session/${sessionId}`);
}

export function verifySession(sessionId, payload = {}) {
  return api.post(`/session/${sessionId}/verify`, payload);
}

export function respondToQuestion(payload) {
  return api.post("/conversation/respond", payload);
}

export function respondVoice(payload) {
  return api.post("/conversation/voice", payload);
}

export function getConversation(sessionId) {
  return api.get(`/conversation/${sessionId}`);
}

export function getSpeechLanguages() {
  return api.get("/conversation/speech/languages");
}

export function generateSummary(sessionId) {
  return api.post(`/summary/generate/${sessionId}`, {});
}

export function getSummary(sessionId) {
  return api.get(`/summary/${sessionId}`);
}

export function getPatientPrescriptions() {
  return api.get("/prescription/patient/all");
}
