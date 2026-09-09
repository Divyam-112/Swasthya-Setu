/** Canonical ABHA form used for register, login, and uniqueness checks. */
export function normalizeAbhaId(raw) {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[-\s]/g, "");
  if (/^\d{14}$/.test(digits)) return digits;
  return trimmed.toLowerCase();
}

export function isValidAbhaId(value) {
  return /^\d{14}$/.test(value) || /^[a-z0-9._]{4,}@[a-z]{3,}$/.test(value);
}

export function normalizeGender(gender) {
  if (!gender || typeof gender !== "string") return undefined;
  const key = gender.trim().toLowerCase();
  if (key === "male") return "Male";
  if (key === "female") return "Female";
  if (key === "other") return "Other";
  return undefined;
}

const LANGUAGE_CODES = new Set([
  "hi",
  "en",
  "ta",
  "te",
  "bn",
  "mr",
  "gu",
  "kn",
  "ml",
  "pa",
]);

export function normalizeLanguage(code) {
  if (typeof code === "string" && LANGUAGE_CODES.has(code)) return code;
  return "hi";
}
