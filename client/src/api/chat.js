import { api } from "./client.js";

export function startChat(payload = {}) {
  return api.post("/patient-chat/start", payload);
}

export function sendChatMessage(payload) {
  return api.post("/patient-chat/message", payload);
}

export function getAllChats() {
  return api.get("/patient-chat/all");
}

export function getChatHistory(chatId) {
  return api.get(`/patient-chat/history/${chatId}`);
}
