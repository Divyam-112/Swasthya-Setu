const LANGUAGE_MAP = {
  hi: "hi-IN",
  en: "en-IN",
  bn: "bn-IN",
  ta: "ta-IN",
  te: "te-IN",
  mr: "mr-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  pa: "pa-IN",
};

// Fallback voice keywords for matching the best native/neural synthesizer voice
const PREFERRED_VOICES = {
  hi: ["Google हिन्दी", "Microsoft Swara", "Microsoft Madhur", "Kalpana", "Hemant", "Hindi"],
  bn: ["Google বাংলা", "Microsoft Bashkar", "Microsoft Tanishaa", "Bengali", "Bangla"],
  ta: ["Google தமிழ்", "Microsoft Pallavi", "Microsoft Valluvar", "Tamil"],
  te: ["Google తెలుగు", "Microsoft Mohan", "Microsoft Shruti", "Telugu"],
  mr: ["Google मराठी", "Microsoft Aarohi", "Microsoft Manohar", "Marathi"],
  gu: ["Google ગુજરાતી", "Microsoft Dhwani", "Microsoft Niranjan", "Gujarati"],
  kn: ["Google ಕನ್ನಡ", "Microsoft Sapna", "Microsoft Gagan", "Kannada"],
  ml: ["Google മലയാളം", "Microsoft Sobhana", "Microsoft Midhun", "Malayalam"],
  pa: ["Google ਪੰਜਾਬੀ", "Microsoft Raavi", "Punjabi"],
  en: ["Google UK English Female", "Google US English", "Microsoft Heera", "Microsoft Neerja", "Microsoft Ravi", "en-IN", "en-US", "en-GB"],
};

export function isSpeechRecognitionSupported() {
  return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported() {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

// Clean text for natural speech synthesis (remove markdown, URLs, symbols, and explanatory parentheticals)
export function cleanTextForSpeech(text) {
  if (!text) return "";
  return text
    .replace(/\(.*?\)/g, "") // Remove bracketed translations e.g. (Blood Pressure)
    .replace(/\[.*?\]/g, "")
    .replace(/[*_~`#>]/g, "") // Strip markdown formatting
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let cachedVoices = [];
function getAvailableVoices() {
  if (!isSpeechSynthesisSupported()) return [];
  if (cachedVoices.length > 0) return cachedVoices;
  cachedVoices = window.speechSynthesis.getVoices() || [];
  return cachedVoices;
}

// Ensure voices are loaded asynchronously in Chrome/Edge
if (isSpeechSynthesisSupported()) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices() || [];
  };
}

export function findBestVoice(langCode = "en") {
  const voices = getAvailableVoices();
  if (!voices || voices.length === 0) return null;

  const bcp47 = LANGUAGE_MAP[langCode] || "en-IN";
  const preferredNames = PREFERRED_VOICES[langCode] || [];

  // 1. Try matching preferred voice name substrings
  for (const name of preferredNames) {
    const matched = voices.find((v) => v.name.toLowerCase().includes(name.toLowerCase()));
    if (matched) return matched;
  }

  // 2. Try exact language match (e.g., "hi-IN", "bn-IN")
  const exactLang = voices.find((v) => v.lang.toLowerCase() === bcp47.toLowerCase());
  if (exactLang) return exactLang;

  // 3. Try language prefix match (e.g., starts with "hi", "bn")
  const prefixLang = voices.find((v) => v.lang.toLowerCase().startsWith(langCode.toLowerCase()));
  if (prefixLang) return prefixLang;

  // 4. Fallback to default or English voice
  return voices.find((v) => v.lang.includes("IN")) || voices[0] || null;
}

export function speakText(text, langCode = "en", onEnd) {
  if (!isSpeechSynthesisSupported() || !text) return;
  window.speechSynthesis.cancel();

  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return;

  const utterance = new SpeechSynthesisUtterance(cleaned);
  const bcp47 = LANGUAGE_MAP[langCode] || "en-IN";
  utterance.lang = bcp47;
  utterance.rate = 0.95; // Slightly slower, highly clear cadence for medical questions
  utterance.pitch = 1.0;

  const voice = findBestVoice(langCode);
  if (voice) {
    utterance.voice = voice;
  }

  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}

export function createRecognizer(langCode = "en", onResult, onError) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    throw new Error("Voice input is not supported in this browser.");
  }

  const recognition = new SpeechRecognition();
  recognition.lang = LANGUAGE_MAP[langCode] || "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    onResult?.(transcript);
  };
  recognition.onerror = (event) => {
    onError?.(event.error || "Voice input failed");
  };

  return recognition;
}
