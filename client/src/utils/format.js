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

export function formatRelativeDay(value, t) {
  if (!value) return t ? t("no_data", "No date") : "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t ? t("no_data", "No date") : "No date";
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startThat = new Date(date);
  startThat.setHours(0, 0, 0, 0);
  const diff = Math.round((startToday - startThat) / 86400000);
  if (diff === 0) return t ? t("today", "Today") : "Today";
  if (diff === 1) return t ? t("yesterday", "Yesterday") : "Yesterday";
  if (diff === -1) return t ? t("tomorrow", "Tomorrow") : "Tomorrow";
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

export function languageLabel(code, currentLang) {
  const langMaps = {
    en: {
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
    },
    hi: {
      hi: "हिन्दी",
      en: "अंग्रेज़ी",
      ta: "तमिल",
      te: "तेलुगु",
      bn: "बंगाली",
      mr: "मराठी",
      gu: "गुजराती",
      kn: "कन्नड़",
      ml: "मलयालम",
      pa: "पंजाबी",
    },
    bn: {
      bn: "বাংলা",
      en: "ইংরেজি",
      hi: "হিন্দি",
      ta: "তামিল",
      te: "তেলেগু",
      mr: "মারাঠি",
      gu: "গুজরাতি",
      kn: "কন্নড়",
      ml: "মালয়ালম",
      pa: "পাঞ্জাবি",
    },
    ta: {
      ta: "தமிழ்",
      en: "ஆங்கிலம்",
      hi: "இந்தி",
      bn: "வங்காளம்",
      te: "தெலுங்கு",
      mr: "மராத்தி",
      gu: "குஜராத்தி",
      kn: "கன்னடம்",
      ml: "மலையாளம்",
      pa: "பஞ்சாபி",
    },
    te: {
      te: "తెలుగు",
      en: "ఇంగ్లీష్",
      hi: "హిందీ",
      bn: "బెంగాలీ",
      ta: "తమిళం",
      mr: "మరాఠీ",
      gu: "గుజరాతీ",
      kn: "కన్నడ",
      ml: "మలయాళం",
      pa: "పంజాబీ",
    },
    mr: {
      mr: "मराठी",
      en: "इंग्रजी",
      hi: "हिंदी",
      bn: "बंगाली",
      ta: "तमिळ",
      te: "तेलुगू",
      gu: "गुजराती",
      kn: "कन्नड",
      ml: "मल्याळम",
      pa: "पंजाबी",
    },
    gu: {
      gu: "ગુજરાતી",
      en: "અંગ્રેજી",
      hi: "હિન્દી",
      bn: "બંગાળી",
      ta: "તમિલ",
      te: "તેલુગુ",
      mr: "મરાઠી",
      kn: "કન્નડ",
      ml: "મલયાલમ",
      pa: "પંજાબી",
    },
    kn: {
      kn: "ಕನ್ನಡ",
      en: "ಇಂಗ್ಲಿಷ್",
      hi: "ಹಿಂದಿ",
      bn: "ಬಂಗಾಳಿ",
      ta: "ತಮಿಳು",
      te: "ತೆಲುಗು",
      mr: "ಮರಾಠಿ",
      gu: "ಗುಜರಾತಿ",
      ml: "ಮಲಯಾಳಂ",
      pa: "ಪಂಜಾಬಿ",
    },
    ml: {
      ml: "മലയാളം",
      en: "ഇംഗ്ലീഷ്",
      hi: "ഹിന്ദി",
      bn: "ബംഗാളി",
      ta: "തമിഴ്",
      te: "തെലുങ്ക്",
      mr: "മറാഠി",
      gu: "ഗുജറാത്തി",
      kn: "കന്നഡ",
      pa: "പഞ്ചാബി",
    },
    pa: {
      pa: "ਪੰਜਾਬੀ",
      en: "ਅੰਗਰੇਜ਼ੀ",
      hi: "ਹਿੰਦੀ",
      bn: "ਬੰਗਾਲੀ",
      ta: "ਤਾਮਿਲ",
      te: "ਤੇਲਗੂ",
      mr: "ਮਰਾਠੀ",
      gu: "ਗੁਜਰਾਤੀ",
      kn: "ਕੰਨੜ",
      ml: "ਮਲਿਆਲਮ",
    },
  };

  const activeMap = langMaps[currentLang] || langMaps.en;
  return activeMap[code] || langMaps.en[code] || code || (currentLang === "hi" ? "दर्ज नहीं" : "Not set");
}

export function readingLabel(type, t) {
  if (t) {
    if (type === "blood_pressure") return t("blood_pressure_label", "Blood pressure");
    if (type === "blood_sugar") return t("blood_sugar_label", "Blood sugar");
    if (type === "heart_rate") return t("heart_rate_label", "Heart rate");
    if (type === "weight") return t("weight", "Weight");
    if (type === "temperature") return t("temperature", "Temperature");
  }
  const map = {
    blood_pressure: "Blood pressure",
    blood_sugar: "Blood sugar",
    heart_rate: "Heart rate",
    weight: "Weight",
    temperature: "Temperature",
  };
  return map[type] || type;
}

export function classifyReading(reading, t) {
  if (!reading) return { label: t ? t("no_data", "No reading") : "No reading", tone: "neutral" };
  const labelUsual = t ? t("usual_range", "Usual range") : "Usual range";
  const labelHigh = t ? t("high", "High") : "High";
  const labelLow = t ? t("low", "Low") : "Low";
  const labelRecorded = t ? t("recorded", "Recorded") : "Recorded";

  if (reading.type === "blood_pressure") {
    const sys = Number(reading.value);
    const dia = Number(reading.secondaryValue);
    if (sys >= 140 || dia >= 90) return { label: labelHigh, tone: "warn" };
    if (sys < 90 || dia < 60) return { label: labelLow, tone: "warn" };
    return { label: labelUsual, tone: "ok" };
  }
  if (reading.type === "blood_sugar") {
    const value = Number(reading.value);
    if (reading.mealContext === "fasting") {
      if (value >= 126) return { label: labelHigh, tone: "warn" };
      if (value < 70) return { label: labelLow, tone: "warn" };
      return { label: labelUsual, tone: "ok" };
    }
    if (value >= 200) return { label: labelHigh, tone: "warn" };
    if (value < 70) return { label: labelLow, tone: "warn" };
    return { label: labelRecorded, tone: "neutral" };
  }
  return { label: labelRecorded, tone: "neutral" };
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
