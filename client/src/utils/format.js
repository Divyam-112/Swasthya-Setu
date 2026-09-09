export function sameId(a, b) {
  return String(a || "") === String(b || "");
}

export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelativeDay(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startThat = new Date(date);
  startThat.setHours(0, 0, 0, 0);
  const diff = Math.round((startToday - startThat) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  return formatDate(date);
}

export function frequencyLabel(value) {
  const map = {
    once_daily: "Every day",
    twice_daily: "Twice a day",
    thrice_daily: "Three times a day",
    four_times_daily: "Four times a day",
    weekly: "Weekly",
    alternate_days: "Every other day",
    as_needed: "As needed",
    daily: "Every day",
    weekdays: "Weekdays",
    custom: "Custom",
  };
  return map[value] || value || "As scheduled";
}

export function languageLabel(code) {
  const map = {
    hi: "Hindi",
    en: "English",
    ta: "Tamil",
    te: "Telugu",
    bn: "Bengali",
    mr: "Marathi",
    gu: "Gujarati",
    kn: "Kannada",
    ml: "Malayalam",
    pa: "Punjabi",
  };
  return map[code] || code || "Not set";
}

export function readingLabel(type) {
  const map = {
    blood_pressure: "Blood pressure",
    blood_sugar: "Blood sugar",
    heart_rate: "Heart rate",
    weight: "Weight",
    temperature: "Temperature",
  };
  return map[type] || type;
}

export function classifyReading(reading) {
  if (!reading) return { label: "No reading", tone: "neutral" };
  if (reading.type === "blood_pressure") {
    const sys = Number(reading.value);
    const dia = Number(reading.secondaryValue);
    if (sys >= 140 || dia >= 90) return { label: "High", tone: "warn" };
    if (sys < 90 || dia < 60) return { label: "Low", tone: "warn" };
    return { label: "Usual range", tone: "ok" };
  }
  if (reading.type === "blood_sugar") {
    const value = Number(reading.value);
    if (reading.mealContext === "fasting") {
      if (value >= 126) return { label: "High", tone: "warn" };
      if (value < 70) return { label: "Low", tone: "warn" };
      return { label: "Usual range", tone: "ok" };
    }
    if (value >= 200) return { label: "High", tone: "warn" };
    if (value < 70) return { label: "Low", tone: "warn" };
    return { label: "Recorded", tone: "neutral" };
  }
  return { label: "Recorded", tone: "neutral" };
}

export function formatReadingValue(reading) {
  if (!reading) return "—";
  if (reading.type === "blood_pressure") {
    return `${reading.value}/${reading.secondaryValue} ${reading.unit || "mmHg"}`;
  }
  return `${reading.value} ${reading.unit || ""}`.trim();
}

export function trendFromReadings(readings = []) {
  if (!readings || readings.length < 2) return { label: "Not enough data", direction: "flat" };
  const newest = readings[0];
  const previous = readings[1];
  const newestValue = Number(newest.value);
  const previousValue = Number(previous.value);
  const delta = newestValue - previousValue;
  if (Math.abs(delta) < 0.5) return { label: "Stable", direction: "flat" };
  if (delta > 0) return { label: "Higher than last time", direction: "up" };
  return { label: "Lower than last time", direction: "down" };
}

export function hasEmergencyKeywords(text) {
  if (!text) return false;
  const needle = text.toLowerCase();
  return [
    "chest pain",
    "breathless",
    "shortness of breath",
    "unconscious",
    "stroke",
    "severe bleeding",
    "suicide",
    "can't breathe",
    "cannot breathe",
    "fainted",
    "seizure",
  ].some((term) => needle.includes(term));
}
