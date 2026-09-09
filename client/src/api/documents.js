import { api, request } from "./client.js";

export function getPatientDocuments() {
  return api.get("/documents/patient/all");
}

export function getSessionDocuments(sessionId) {
  return api.get(`/documents/session/${sessionId}`);
}

export function uploadDocument({ file, type, sessionId }) {
  const form = new FormData();
  form.append("document", file);
  if (type) form.append("type", type);
  if (sessionId) form.append("sessionId", sessionId);
  return request("/documents/upload", {
    method: "POST",
    body: form,
    isForm: true,
  });
}

export function processDocument(docId, sessionId) {
  return api.post(`/documents/process/${docId}`, { sessionId });
}

export function deleteDocument(docId, sessionId) {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  return api.delete(`/documents/${docId}${query}`);
}

