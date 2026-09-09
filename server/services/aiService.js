import axios from "axios";

// ─── LANGUAGE CONFIGURATION ──────────────────────────────────────

const LANGUAGE_MAP = {
  hi: { name: "Hindi", script: "Devanagari", example: "Aapko kya taklif hai?" },
  en: {
    name: "English",
    script: "Latin",
    example: "What seems to be the problem?",
  },
  bn: { name: "Bengali", script: "Bengali", example: "আপনার কী সমস্যা হচ্ছে?" },
  ta: { name: "Tamil", script: "Tamil", example: "உங்களுக்கு என்ன பிரச்சனை?" },
  te: { name: "Telugu", script: "Telugu", example: "మీకు ఏమి సమస్య ఉంది?" },
  mr: {
    name: "Marathi",
    script: "Devanagari",
    example: "तुम्हाला काय त्रास होतोय?",
  },
  gu: { name: "Gujarati", script: "Gujarati", example: "તમને શું તકલીફ છે?" },
  kn: { name: "Kannada", script: "Kannada", example: "ನಿಮಗೆ ಏನು ಸಮಸ್ಯೆ?" },
  ml: {
    name: "Malayalam",
    script: "Malayalam",
    example: "നിങ്ങൾക്ക് എന്താണ് പ്രശ്നം?",
  },
  pa: { name: "Punjabi", script: "Gurmukhi", example: "ਤੁਹਾਨੂੰ ਕੀ ਤਕਲੀਫ਼ ਹੈ?" },
};

// ─── SYSTEM PROMPTS ──────────────────────────────────────────────

function getClinicalSystemPrompt(langCode = "hi") {
  const lang = LANGUAGE_MAP[langCode] || LANGUAGE_MAP.hi;

  return `You are a professional medical history-taking AI assistant at an Indian hospital.
Your job is to conduct a short, focused clinical history interview with the patient.

LANGUAGE INSTRUCTION (MANDATORY):
- You MUST ask all questions and provide all options strictly in ${lang.name} language (${lang.script} script).
- Use simple, respectful, and empathetic conversational ${lang.name}.
- For medical terms, you may include the English term in parentheses for clarity (e.g. "ब्लड प्रेशर (Blood Pressure)").
- Never switch to English or other languages unless English is specifically requested.

INTERVIEW LENGTH RULES (CRITICAL):
1. The interview MUST be short and focused: EXACTLY 5 TO 6 QUESTIONS TOTAL.
2. Ask only ONE question at a time.
3. Flow:
   - Question 1: Chief complaint (already asked at session start)
   - Question 2: Duration / Onset (Since when have you experienced this?)
   - Question 3: Severity and quality of symptoms
   - Question 4: Medical history, chronic conditions & medications
   - Question 5: FINAL INQUIRY — You MUST specifically ask in ${lang.name}: "Is there any other specific symptom, allergy, or detail you would like to add for the doctor?"
4. Provide 4-5 multiple-choice options along with each question for easy tap input in ${lang.name}.
5. When the patient responds to the final question (or upon reaching 5-6 questions), you MUST set "completionPercentage": 100 and "category": "closing".
6. Flag RED FLAGS immediately if symptoms indicate life-threatening conditions (chest pain radiating to arm, acute breathlessness, sudden weakness/stroke, severe hemorrhage).

OUTPUT FORMAT (strict JSON only, no markdown):
{
  "question": "Your next question to the patient in ${lang.name}",
  "options": ["Option 1 in ${lang.name}", "Option 2 in ${lang.name}", "Option 3", "Option 4"],
  "category": "chief_complaint|hpi|past_medical|drug_history|allergy|closing",
  "isRedFlag": false,
  "redFlagAlert": null,
  "completionPercentage": 35,
  "extractedData": {
    "chiefComplaint": "extracted complaint",
    "timing": "extracted duration"
  }
}`;
}

function getAyushExtensionPrompt(langCode = "hi") {
  const lang = LANGUAGE_MAP[langCode] || LANGUAGE_MAP.hi;

  return `

ADDITIONAL AYUSH/AYURVEDIC ASSESSMENT:
After completing the standard medical history, also assess:
- Prakriti (body constitution: Vata/Pitta/Kapha)
- Vikriti (current dosha imbalance)
- Agni (digestive fire: Samagni/Vishamagni/Teekshnagni/Mandagni)
- Koshtha (bowel nature: Mridu/Madhyama/Krura)
- Sara (tissue quality)
- Sattva (mental constitution: Pravara/Madhyama/Avara)
- Ahara-Vihara (diet and lifestyle)

Ask these in simple ${lang.name} with options. Include "ayush_assessment" as category for these questions.
When AYUSH assessment is also complete, then set completionPercentage to 100.`;
}

function getSummaryPrompt(langCode = "hi") {
  const lang = LANGUAGE_MAP[langCode] || LANGUAGE_MAP.hi;

  return `You are a clinical summary generator. Generate a structured clinical history summary from the provided data.

You MUST generate TWO summaries:
1. "summary" — A formal, physician-facing clinical summary in ENGLISH (standard medical format)
2. "patientSummary" — A simple, easy-to-understand summary in ${lang.name} language for the patient

FORMAT for "summary" (English, doctor-facing):
1. CHIEF COMPLAINT
2. HISTORY OF PRESENT ILLNESS (detailed narrative using SOCRATES findings)
3. PAST MEDICAL HISTORY
4. PAST SURGICAL HISTORY
5. DRUG HISTORY (current medications with doses)
6. ALLERGY HISTORY
7. FAMILY HISTORY
8. PERSONAL HISTORY (diet, sleep, exercise, habits)
9. REVIEW OF SYSTEMS
10. PRIOR INVESTIGATIONS (from scanned documents)
11. RED FLAGS / ALERTS

FORMAT for "patientSummary" (${lang.name}, patient-facing):
- Write in simple, conversational ${lang.name}
- Summarize what the patient told (chief complaint, key history points)
- List any medications they mentioned
- Mention any red flags in simple words the patient can understand
- Keep it short (5-8 lines max)

Also identify and return separately:
- redFlags: Any emergency conditions
- abnormalValues: Out-of-range lab values
- drugInteractions: Potential medication conflicts

Return as JSON:
{
  "summary": "Full formatted clinical summary in English",
  "patientSummary": "Simple summary in ${lang.name} for the patient",
  "ayushSummary": "Dashavidha Pariksha summary if AYUSH session",
  "redFlags": ["flag1", "flag2"],
  "abnormalValues": [{"test": "name", "value": "val", "concern": "reason"}],
  "drugInteractions": ["interaction1"]
}`;
}

// ─── AI SERVICE FUNCTIONS ────────────────────────────────────────

/**
 * Call Google Gemini API directly using GEMINI_API_KEY
 */
async function callGemini(systemPrompt = "", userMessages = [], jsonMode = false) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = (userMessages || [])
    .map((m) => ({
      role: (m.role === "assistant" || m.role === "ai" || m.role === "model") ? "model" : "user",
      parts: [{ text: m.content || m.message || "" }],
    }))
    .filter((c) => c.parts[0].text.trim().length > 0);

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "Hello" }] });
  }

  const requestBody = {
    contents,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1200,
      ...(jsonMode && { responseMimeType: "application/json" }),
    },
  };

  if (systemPrompt) {
    requestBody.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Gemini API Error [${response.status}]:`, errText);
    throw new Error(`Gemini API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

/**
 * Call LLM API (Google Gemini preferred, OpenRouter fallback, or mock)
 */
async function callLLM(messages, jsonMode = true) {
  const systemMsg = messages.find((m) => m.role === "system");
  const otherMsgs = messages.filter((m) => m.role !== "system");

  // 1. Prioritize Google Gemini if configured
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiResponse = await callGemini(systemMsg?.content, otherMsgs, jsonMode);
      if (geminiResponse) return geminiResponse;
    } catch (gErr) {
      console.warn("[AI] Gemini API failed, falling back to OpenRouter:", gErr.message);
    }
  }

  // 2. OpenRouter fallback
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    try {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "anthropic/claude-sonnet-4-5",
          messages,
          ...(jsonMode && { response_format: { type: "json_object" } }),
          temperature: 0.3,
          max_tokens: 1000,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://swasthyasetu.in",
            "X-Title": "SwasthyaSetu",
          },
          timeout: 30000,
        },
      );
      return response.data.choices[0].message.content;
    } catch (error) {
      console.warn("[AI] OpenRouter API Error:", error.response?.data?.error?.message || error.message);
    }
  }

  // 3. Fallback to mock response
  return null;
}

/**
 * Get next question from AI based on conversation history.
 * Falls back to mock data if API key is not configured.
 * @param {Array} conversationHistory - Chat messages
 * @param {string} sessionType - "allopathic" or "ayush"
 * @param {string} language - Patient's preferred language code (e.g., "hi", "ta", "bn")
 */
export async function getNextQuestion(
  conversationHistory,
  sessionType = "allopathic",
  language = "en",
) {
  const patientMsgCount = conversationHistory.filter(
    (m) => m.role === "user" || m.role === "patient",
  ).length;

  // Enforce max 5-6 questions hard stop:
  // If the patient has already answered 5 or more questions, complete the interview (100%)!
  if (patientMsgCount >= 5) {
    const bank = MOCK_INTERVIEW_BANK[language] || MOCK_INTERVIEW_BANK.en;
    return bank[bank.length - 1]; // Closing completion item (100%)
  }

  const systemPrompt =
    sessionType === "ayush"
      ? getClinicalSystemPrompt(language) + getAyushExtensionPrompt(language)
      : getClinicalSystemPrompt(language);

  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
  ];

  const response = await callLLM(messages);

  if (!response) {
    return getMockResponse(conversationHistory, language);
  }

  try {
    const parsed = JSON.parse(response);
    // If patient is at question 4, ensure question 5 is the specific symptom inquiry
    if (patientMsgCount === 4) {
      const bank = MOCK_INTERVIEW_BANK[language] || MOCK_INTERVIEW_BANK.en;
      parsed.question = parsed.question || bank[3].question;
      parsed.completionPercentage = Math.max(parsed.completionPercentage || 85, 85);
    } else if (patientMsgCount >= 5) {
      parsed.completionPercentage = 100;
      parsed.category = "closing";
    }
    return parsed;
  } catch {
    console.error("Failed to parse LLM response:", response);
    return getMockResponse(conversationHistory, language);
  }
}

/**
 * Generate clinical summary from session data
 * @param {Object} session - Populated session document
 * @param {string} language - Patient's preferred language code
 * @param {string} medicalHistoryContext - Pre-formatted unified medical history string
 */
export async function generateClinicalSummary(session, language = "hi", medicalHistoryContext = "") {
  const messages = [
    { role: "system", content: getSummaryPrompt(language) },
    {
      role: "user",
      content: `Generate a clinical summary from this data:

PATIENT: ${session.patient?.name || "Unknown"}, Age: ${session.patient?.age || "N/A"}, Gender: ${session.patient?.gender || "N/A"}
ABHA ID: ${session.patient?.abhaId || "N/A"}
PATIENT LANGUAGE: ${language}

${medicalHistoryContext ? `UNIFIED MEDICAL HISTORY (from interviews, documents & prescriptions):
${medicalHistoryContext}
` : ""}
CURRENT SESSION CLINICAL HISTORY:
${JSON.stringify(session.clinicalHistory, null, 2)}

SCANNED DOCUMENTS (this session):
${JSON.stringify(
  session.scannedDocuments?.map((d) => d.extractedData) || [],
  null,
  2,
)}

${
  session.sessionType === "ayush"
    ? `AYUSH ASSESSMENT: ${JSON.stringify(session.ayushAssessment, null, 2)}`
    : ""
}`,
    },
  ];

  const response = await callLLM(messages);

  if (!response) {
    // Mock summary
    return {
      summary: `CLINICAL HISTORY SUMMARY
Patient: ${session.patient?.name || "Unknown"}

Chief Complaint: ${session.clinicalHistory?.chiefComplaint || "Not recorded"}

[Summary will be generated when OpenRouter API key is configured]

Note: This is a mock summary. Configure OPENROUTER_API_KEY in .env for AI-generated summaries.`,
      patientSummary: "[Patient summary will be generated in their language when API key is configured]",
      redFlags: session.clinicalSummary?.redFlags || [],
      abnormalValues: [],
      drugInteractions: [],
    };
  }

  try {
    return JSON.parse(response);
  } catch {
    return {
      summary: response,
      patientSummary: "",
      redFlags: [],
      abnormalValues: [],
      drugInteractions: [],
    };
  }
}

/**
 * Extract and merge clinical data from AI response into session
 */
export async function extractClinicalData(session, extractedData) {
  if (!extractedData) return;

  const history = session.clinicalHistory || {};

  // Merge extracted data based on field names
  for (const [key, value] of Object.entries(extractedData)) {
    switch (key) {
      case "chiefComplaint":
        history.chiefComplaint = value;
        break;
      case "site":
      case "onset":
      case "character":
      case "radiation":
      case "timing":
      case "severity":
        if (!history.hpiDetails) history.hpiDetails = {};
        history.hpiDetails[key] = value;
        break;
      case "associatedSymptoms":
      case "exacerbatingFactors":
      case "relievingFactors":
        if (!history.hpiDetails) history.hpiDetails = {};
        if (!history.hpiDetails[key]) history.hpiDetails[key] = [];
        if (Array.isArray(value)) {
          history.hpiDetails[key].push(...value);
        } else {
          history.hpiDetails[key].push(value);
        }
        break;
      default:
        // Store any other extracted data in appropriate fields
        break;
    }
  }

  session.clinicalHistory = history;
}

// ─── PATIENT CHAT SYSTEM PROMPT ──────────────────────────────────

function getPatientChatSystemPrompt(langCode = "hi", contextSummary = "") {
  const lang = LANGUAGE_MAP[langCode] || LANGUAGE_MAP.hi;

  return `You are "SwasthyaSetu Health Companion" — a friendly, knowledgeable AI health assistant for Indian patients.

LANGUAGE INSTRUCTION:
- Respond ONLY in ${lang.name} language using simple, conversational words.
- Use the ${lang.script} script.
- For medical terms, include English in parentheses for clarity.

YOUR ROLE:
You are a health EDUCATOR and WELLNESS GUIDE, NOT a doctor. You help patients understand their health better.

WHAT YOU CAN DO:
1. ✅ Explain medical conditions in simple ${lang.name}
2. ✅ Clarify common health doubts and misconceptions
3. ✅ Provide Ayurvedic wellness knowledge:
   - Prakriti (Vata/Pitta/Kapha) based diet and lifestyle tips
   - Dosha balancing through food and daily routine
   - Common Ayurvedic herbs and their general benefits (Ashwagandha, Tulsi, Haldi, Amla, etc.)
   - Panchakarma awareness
   - Dinacharya (daily routine) and Ritucharya (seasonal routine)
4. ✅ Suggest basic exercises:
   - Yoga asanas suitable for common conditions
   - Pranayama (breathing exercises) — Anulom Vilom, Kapalbhati, Bhramari
   - Walking and stretching routines
   - Exercises for specific conditions (back pain, diabetes management, stress)
5. ✅ Provide general wellness tips (hydration, sleep hygiene, stress management)
6. ✅ Explain what lab reports mean in simple language

STRICT SAFETY RULES — YOU MUST NEVER:
1. ❌ NEVER prescribe any medicine (allopathic, ayurvedic, or homeopathic)
2. ❌ NEVER suggest changing doses of existing medications
3. ❌ NEVER diagnose any condition
4. ❌ NEVER contradict the doctor's prescription or advice
5. ❌ NEVER provide treatment plans
6. ❌ NEVER claim to replace a doctor's consultation

If asked to prescribe or diagnose, ALWAYS respond with:
"Main aapko dawai ya diagnosis nahi de sakta. Iske liye apne doctor se zaroor milein."

PATIENT'S HEALTH CONTEXT:
${contextSummary || "No clinical summary available for this patient yet."}

RESPONSE STYLE:
- Be warm, empathetic, and encouraging
- Use simple language, avoid complex medical jargon
- Keep responses concise (3-6 sentences for simple questions, more for detailed explanations)
- Use bullet points for lists
- Always end with encouragement or a wellness tip when appropriate
- If you're unsure, recommend consulting their doctor`;
}

/**
 * Get AI response for patient chat
 * @param {Array} conversationHistory - Chat messages
 * @param {string} contextSummary - Patient's clinical summary for context
 * @param {string} language - Patient's preferred language code
 * @param {boolean} isFirstMessage - Whether this is the first message (welcome)
 */
export async function getPatientChatResponse(
  conversationHistory,
  contextSummary = "",
  language = "hi",
  isFirstMessage = false,
) {
  const systemPrompt = getPatientChatSystemPrompt(language, contextSummary);
  const lang = LANGUAGE_MAP[language] || LANGUAGE_MAP.hi;

  const messages = [];

  if (isFirstMessage) {
    messages.push({
      role: "user",
      content: `Greet the patient warmly in ${lang.name}. Introduce yourself as SwasthyaSetu Health Companion. Briefly mention what you can help with (health doubts, ayurvedic tips, exercises). ${contextSummary ? "You have their health summary — let them know you're aware of their recent visit and ready to help with any questions." : "Let them know they can ask any health-related questions."} Keep it short and friendly (3-4 lines max).`,
    });
  } else {
    messages.push(...conversationHistory);
  }

  // 1. Prioritize Google Gemini API
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiReply = await callGemini(systemPrompt, messages, false);
      if (geminiReply) return geminiReply;
    } catch (gErr) {
      console.warn("[PatientChat] Gemini API call error:", gErr.message);
    }
  }

  // 2. Fallback to OpenRouter if available
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    try {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "anthropic/claude-sonnet-4-5",
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          temperature: 0.5,
          max_tokens: 800,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://swasthyasetu.in",
            "X-Title": "SwasthyaSetu Health Companion",
          },
          timeout: 30000,
        },
      );
      if (response.data?.choices?.[0]?.message?.content) {
        return response.data.choices[0].message.content;
      }
    } catch (error) {
      console.warn(
        "[PatientChat] OpenRouter API Error:",
        error.response?.data?.error?.message || error.message,
      );
    }
  }

  // 3. Empathetic Mock / Offline response so patient is never left stranded
  const mockGreetings = {
    en: "Hello! I'm SwasthyaSetu Health Companion. I can help you understand your health better, share Ayurvedic wellness tips, and suggest exercises. What would you like to know?",
    hi: "नमस्ते! मैं स्वास्थ्यसेतु हेल्थ कंपैनियन हूँ। मैं आपकी सेहत से जुड़ी बातें समझाने, आयुर्वेदिक नुस्खे और व्यायाम सुझाने में मदद कर सकता हूँ। पूछिए, आप क्या जानना चाहते हैं?",
    bn: "নমস্কার! আমি স্বাস্থ্যসেতু হেলথ কম্প্যানিয়ন। আমি আপনার স্বাস্থ্য সংক্রান্ত প্রশ্ন বুঝতে, আয়ুর্বেদিক পরামর্শ দিতে এবং ব্যায়াম সাজেস্ট করতে সাহায্য করতে পারি। আপনি কী জানতে চান?",
    ta: "வணக்கம்! நான் ஸ்வஸ்த்யசேது ஹெல்த் கம்பேனியன். உங்கள் உடல்நலம், ஆயுர்வேத குறிப்புகள் மற்றும் உடற்பயிற்சிகளை புரிந்து கொள்ள உங்களுக்கு உதவ முடியும். நீங்கள் என்ன தெரிந்து கொள்ள விரும்புகிறீர்கள்?",
    te: "నమస్కారం! నేను స్వాస్థ్యసేతు హెల్త్ కంపానియన్. మీ ఆరోగ్యం, ఆయుర్వేద చిట్కాలు మరియు వ్యాయామాల గురించి అర్థం చేసుకోవడంలో నేను మీకు సహాయపడగలను. మీరు ఏమి తెలుసుకోవాలనుకుంటున్నారు?",
    mr: "नमस्कार! मी स्वास्थ्यसेतू हेल्थ कम्पॅनियन आहे. मी तुमचे आरोग्य समजून घेण्यासाठी, आयुर्वेदिक उपाय आणि व्यायामाबद्दल मार्गदर्शन करण्यासाठी येथे आहे. तुम्हाला काय विचारायचे आहे?",
    gu: "નમસ્તે! હું સ્વાસ્થ્યસેતુ હેલ્થ કમ્પેનિયન છું. હું તમારા સ્વાસ્થ્ય, આયુર્વેદિક ઉપચાર અને કસરતો વિશે માહિતી આપવામાં મદદ કરી શકું છું. તમે શું જાણવા માંગો છો?",
    kn: "ನಮಸ್ಕಾರ! ನಾನು ಸ್ವಾಸ್ಥ್ಯಸೇತು ಹೆಲ್ತ್ ಕಂಪ್ಯಾನಿಯನ್. ನಿಮ್ಮ ಆರೋಗ್ಯ, ಆಯುರ್ವೇದ ಸಲಹೆಗಳು ಮತ್ತು ವ್ಯಾಯಾಮಗಳ ಬಗ್ಗೆ ತಿಳಿಯಲು ನಾನು ನಿಮಗೆ ಸಹಾಯ ಮಾಡಬಲ್ಲೆ. ನೀವು ಏನು ತಿಳಿಯಲು ಬಯಸುತ್ತೀರಿ?",
    ml: "നമസ്കാരം! ഞാൻ സ്വാസ്ഥ്യസേതു ഹെൽത്ത് കമ്പാനിയൻ ആണ്. നിങ്ങളുടെ ആരോഗ്യം, ആയുർവേദ നിർദ്ദേശങ്ങൾ, വ്യായാമങ്ങൾ എന്നിവ മനസ്സിലാക്കാൻ എന്നെ സമീപിക്കാം. നിങ്ങൾക്ക് എന്താണ് അറിയേണ്ടത്?",
    pa: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਸਵਾਸਥਿਆਸੇਤੂ ਹੈਲਥ ਕੰਪੈਨੀਅਨ ਹਾਂ। ਮੈਂ ਤੁਹਾਡੀ ਸਿਹਤ, ਆਯੁਰਵੈਦਿਕ ਨੁਸਖਿਆਂ ਅਤੇ ਕਸਰਤਾਂ ਬਾਰੇ ਜਾਣਕਾਰੀ ਦੇਣ ਵਿੱਚ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ। ਤੁਸੀਂ ਕੀ ਜਾਣਨਾ ਚਾਹੁੰਦੇ ਹੋ?",
  };

  if (isFirstMessage) {
    return mockGreetings[language] || mockGreetings.en;
  }

  const mockFallbacks = {
    en: "Thank you for reaching out with your health question. Based on clinical guidelines, remember to stay well hydrated, maintain balanced nutrition, get 7-8 hours of sound sleep, and consult your physician for any acute or lingering symptoms.",
    hi: "स्वास्थ्य सम्बन्धी प्रश्न पूछने के लिए धन्यवाद। अच्छी सेहत के लिए दिन भर पर्याप्त पानी पिएं, पौष्टिक आहार लें, 7-8 घंटे की नींद लें, और किसी भी समस्या के लिए डॉक्टर से परामर्श करें।",
    bn: "আপনার স্বাস্থ্য প্রশ্নের জন্য ধন্যবাদ। সুস্থ থাকতে পর্যাপ্ত জল পান করুন, সুষম খাবার খান, ৭-৮ ঘণ্টা ঘুমান এবং চিকিৎসকের পরামর্শ নিন।",
    ta: "உங்கள் உடல்நலக் கேள்விக்கு நன்றி. போதுமான தண்ணீர் குடிக்கவும், சத்தான உணவை உட்கொள்ளவும், 7-8 மணிநேரம் தூங்கவும், மருத்துவரை அணுகவும்.",
    te: "మీ ఆరోగ్య ప్రశ్నకు ధన్యவாదాలు. తగినంత నీరు త్రాగండి, సమతుల్య ఆహారం తీసుకోండి, 7-8 గంటలు నిద్రపోండి మరియు వైద్యుడిని సంప్రదించండి.",
    mr: "तुमच्या आरोग्यविषयक प्रश्नाबद्दल धन्यवाद. पुरेसे पाणी प्या, संतुलित आहार घ्या, ७-८ तास झोप घ्या आणि डॉक्टरांचा सल्ला घ्या.",
    gu: "તમારા સ્વાસ્થ્ય પ્રશ્ન માટે આભાર. પૂરતું પાણી પીઓ, પૌષ્ટિક આહાર લો, 7-8 કલાક ઊંઘો અને ડૉક્ટરની સલાહ લો.",
    kn: "ನಿಮ್ಮ ಆರೋಗ್ಯ ಪ್ರಶ್ನೆಗೆ ಧನ್ಯವಾದಗಳು. ಸಾಕಷ್ಟು ನೀರು ಕುಡಿಯಿರಿ, ಪೌಷ್ಟಿಕ ಆಹಾರ ಸೇವಿಸಿ, 7-8 ಗಂಟೆಗಳ ಕಾಲ ನಿದ್ರಿಸಿ ಮತ್ತು ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    ml: "നിങ്ങളുടെ ആരോഗ്യപരമായ ചോദ്യത്തിന് നന്ദി. ധാരാളം വെള്ളം കുടിക്കുക, സമീകൃതാഹാരം കഴിക്കുക, ഡോക്ടറെ കാണുക.",
    pa: "ਤੁਹਾਡੇ ਸਿਹਤ ਸੰਬੰਧੀ ਸਵਾਲ ਲਈ ਧੰਨਵਾਦ। ਖੂਬ ਪਾਣੀ ਪੀਓ, ਸੰਤੁਲਿਤ ਖੁਰਾਕ ਲਓ, 7-8 ਘੰਟੇ ਨੀਂਦ ਲਓ ਅਤੇ ਡਾਕਟਰ ਦੀ ਸਲਾਹ ਲਓ।",
  };

  return mockFallbacks[language] || mockFallbacks.en;
}

// ─── MULTILINGUAL INTERVIEW QUESTION BANK (5-6 Questions Max) ────────────

const MOCK_INTERVIEW_BANK = {
  en: [
    {
      question: "Since when have you been experiencing this trouble?",
      options: ["Started today", "Past 2-3 days", "About a week", "More than a month", "Chronic / long time"],
      category: "hpi",
      completionPercentage: 35,
      isRedFlag: false,
      extractedData: { timing: "recent" },
    },
    {
      question: "How would you describe the severity and nature of the discomfort?",
      options: ["Mild / manageable", "Moderate discomfort", "Severe / sharp pain", "Dull throbbing", "Comes and goes"],
      category: "hpi",
      completionPercentage: 55,
      isRedFlag: false,
      extractedData: { severity: 5 },
    },
    {
      question: "Do you have any existing health conditions (like BP, Diabetes, Thyroid) or take regular medications?",
      options: ["No prior medical conditions", "High Blood Pressure (BP)", "Diabetes (Sugar)", "Thyroid disorder", "Heart condition", "Taking daily medications"],
      category: "past_medical",
      completionPercentage: 75,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "Is there any other specific symptom, allergy, or detail you would like to add for the doctor before we conclude?",
      options: ["No other symptoms, that is all", "Fever or chills", "Nausea or dizziness", "Body ache and fatigue", "Known medication allergy", "Yes, something else"],
      category: "closing",
      completionPercentage: 90,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "Thank you! Your clinical history is complete and prepared for your doctor's review.",
      options: ["Review summary", "Proceed to doctor"],
      category: "closing",
      completionPercentage: 100,
      isRedFlag: false,
      extractedData: {},
    },
  ],
  hi: [
    {
      question: "यह समस्या आपको कब से महसूस हो रही है?",
      options: ["आज से शुरू हुई", "पिछले 2-3 दिन से", "लगभग 1 हफ्ते से", "1 महीने से अधिक", "काफी पुरानी तकलीफ है"],
      category: "hpi",
      completionPercentage: 35,
      isRedFlag: false,
      extractedData: { timing: "recent" },
    },
    {
      question: "तकलीफ कितनी गंभीर है और किस प्रकार की है?",
      options: ["हल्की / सहन करने योग्य", "मध्यम", "बहुत तेज / चुभने वाला दर्द", "लगातार भारीपन", "आती-जाती रहती है"],
      category: "hpi",
      completionPercentage: 55,
      isRedFlag: false,
      extractedData: { severity: 5 },
    },
    {
      question: "क्या आपको पहले से कोई बीमारी (जैसे बीपी, शुगर, थायराइड) है या कोई नियमित दवा लेते हैं?",
      options: ["कोई पुरानी बीमारी नहीं", "हाई ब्लड प्रेशर (BP)", "डायबिटीज (शुगर)", "थायराइड", "हृदय रोग", "नियमित दवा ले रहा/रही हूँ"],
      category: "past_medical",
      completionPercentage: 75,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "क्या कोई अन्य विशिष्ट लक्षण, एलर्जी या महत्वपूर्ण बात है जो आप डॉक्टर को बताना चाहते हैं?",
      options: ["नहीं, बस इतना ही है", "बुखार या ठंड लगना", "उल्टी या चक्कर आना", "कमजोरी और बदन दर्द", "किसी दवा से एलर्जी है", "हाँ, कुछ और भी है"],
      category: "closing",
      completionPercentage: 90,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "धन्यवाद! आपकी मेडिकल हिस्ट्री पूरी हो गई है और डॉक्टर के परामर्श के लिए तैयार है।",
      options: ["सारांश देखें", "डॉक्टर के पास जाएं"],
      category: "closing",
      completionPercentage: 100,
      isRedFlag: false,
      extractedData: {},
    },
  ],
  bn: [
    {
      question: "এই সমস্যাটি আপনার কতদিন ধরে হচ্ছে?",
      options: ["আজ থেকে", "২-৩ দিন ধরে", "প্রায় ১ সপ্তাহ ধরে", "১ মাসের বেশি", "অনেক পুরনো সমস্যা"],
      category: "hpi",
      completionPercentage: 35,
      isRedFlag: false,
      extractedData: { timing: "recent" },
    },
    {
      question: "কষ্টটি কতটা তীব্র এবং কেমন ধরনের?",
      options: ["হালকা / সহ্যযোগ্য", "মাঝারি", "খুব তীব্র / তীক্ষ্ণ ব্যথা", "ধুকপুক করা ব্যথা", "মাঝে মাঝে আসে"],
      category: "hpi",
      completionPercentage: 55,
      isRedFlag: false,
      extractedData: { severity: 5 },
    },
    {
      question: "আপনার কি আগে থেকে কোনো রোগ (যেমন প্রেশার, সুগার, থাইরয়েড) আছে বা নিয়মিত ওষুধ খান?",
      options: ["আগের কোনো রোগ নেই", "হাই ব্লাড প্রেশার (BP)", "ডায়াবেটিস (সুগার)", "থাইরয়েড", "হার্টের সমস্যা", "নিয়মিত ওষুধ খাচ্ছি"],
      category: "past_medical",
      completionPercentage: 75,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "ডাক্তারবাবুকে জানানোর মতো অন্য কোনো নির্দিষ্ট লক্ষণ, অ্যালার্জি বা বিশেষ তথ্য কি আপনি যোগ করতে চান?",
      options: ["না, আর কিছু নেই", "জ্বর বা কাঁপুনি", "বমি ভাব বা মাথা ঘোরা", "গা-হাত-পা ব্যথা ও দুর্বলতা", "ওষুধে অ্যালার্জি আছে", "হ্যাঁ, অন্য কিছু"],
      category: "closing",
      completionPercentage: 90,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "ধন্যবাদ! আপনার চিকিৎসার ইতিহাস সম্পন্ন হয়েছে এবং ডাক্তারের জন্য প্রস্তুত।",
      options: ["সারাংশ দেখুন", "ডাক্তারের সাথে দেখা করুন"],
      category: "closing",
      completionPercentage: 100,
      isRedFlag: false,
      extractedData: {},
    },
  ],
  ta: [
    {
      question: "இந்த உடல்நலப் பிரச்சனை உங்களுக்கு எவ்வளவு நாட்களாக உள்ளது?",
      options: ["இன்று முதல்", "2-3 நாட்களாக", "சுமார் 1 வாரமாக", "1 மாதத்திற்கு மேலாக", "நீண்ட கால பிரச்சனை"],
      category: "hpi",
      completionPercentage: 35,
      isRedFlag: false,
      extractedData: { timing: "recent" },
    },
    {
      question: "இந்த வலி அல்லது அசௌகரியம் எவ்வளவு தீவிரமானது?",
      options: ["லேசானது", "மிதமானது", "மிகக் கடுமையான வலி", "விட்டு விட்டு வருகிறது", "எரியும் உணர்வு"],
      category: "hpi",
      completionPercentage: 55,
      isRedFlag: false,
      extractedData: { severity: 5 },
    },
    {
      question: "உங்களுக்கு ரத்த அழுத்தம், சர்க்கரை நோய் போன்ற பிற பாதிப்புகள் உள்ளதா அல்லது வழக்கமாக மாத்திரை உட்கொள்கிறீர்களா?",
      options: ["முந்தைய நோய்கள் ஏதுமில்லை", "உயர் ரத்த அழுத்தம் (BP)", "நீரிழிவு (சர்க்கரை)", "தைராய்டு", "இதய நோய்", "தினசரி மருந்து எடுக்கிறேன்"],
      category: "past_medical",
      completionPercentage: 75,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "மருத்துவரிடம் தெரிவிக்க வேறு ஏதேனும் குறிப்பிட்ட அறிகுறிகள், ஒவ்வாமை அல்லது கூடுதல் தகவல்கள் உள்ளதா?",
      options: ["இல்லை, அவ்வளவுதான்", "காய்ச்சல் / நடுக்கம்", "மயக்கம் / வாந்தி", "உடல் வலி / சோர்வு", "மருந்து ஒவ்வாமை (Allergy)", "ஆம், வேறு சில"],
      category: "closing",
      completionPercentage: 90,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "நன்றி! உங்கள் மருத்துவ வரலாறு பதிவு செய்யப்பட்டு மருத்துவருக்கு தயார் செய்யப்பட்டுள்ளது.",
      options: ["சுருக்கத்தைப் பார்க்கவும்", "தொடரவும்"],
      category: "closing",
      completionPercentage: 100,
      isRedFlag: false,
      extractedData: {},
    },
  ],
  te: [
    {
      question: "ఈ సమస్య మీకు ఎన్ని రోజుల నుండి ఉంది?",
      options: ["ఈ రోజు నుంచే", "గత 2-3 రోజుల నుండి", "దాదాపు వారం నుండి", "నెల కంటే ఎక్కువ", "చాలా కాలంగా ఉంది"],
      category: "hpi",
      completionPercentage: 35,
      isRedFlag: false,
      extractedData: { timing: "recent" },
    },
    {
      question: "ఈ నొప్పి లేదా అసౌకర్యం ఎంత తీవ్రంగా ఉంది?",
      options: ["తేలికపాటిది", "మధ్యస్థంగా ఉంది", "చాలా తీవ్రమైన నొప్పి", "వస్తూ పోతూ ఉంటుంది", "మంటగా ఉంది"],
      category: "hpi",
      completionPercentage: 55,
      isRedFlag: false,
      extractedData: { severity: 5 },
    },
    {
      question: "మీకు బీపీ, షుగర్ వంటి వ్యాధులు ఉన్నాయా లేదా రోజూ ఏవైనా మందులు వాడుతున్నారా?",
      options: ["మునుపటి వ్యాధులు లేవు", "హై బీపీ (Blood Pressure)", "డయాబెటిస్ (షుగర్)", "థైరాయిడ్", "గుండె సమస్య", "నిత్యం మందులు వాడుతున్నాను"],
      category: "past_medical",
      completionPercentage: 75,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "డాక్టర్‌కు తెలియజేయడానికి మీరు జోడించాలనుకుంటున్న ఇతర నిర్దిష్ట లక్షణాలు, అలర్జీలు లేదా వివరాలు ఏమైనా ఉన్నాయా?",
      options: ["ఇక ఏమీ లేవు, అంతే", "జ్వరం లేదా చలి", "వాంతులు లేదా తలతిరగడం", "ఒంటి నొప్పులు, నీరసం", "మందుల అలర్జీ ఉంది", "అవును, ఇంకొన్ని ఉన్నాయి"],
      category: "closing",
      completionPercentage: 90,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "ధన్యవాదాలు! మీ వైద్య చరిత్ర నమోదైంది, డాక్టర్ పరిశీలనకు సిద్ధంగా ఉంది.",
      options: ["సారాంశం చూడండి", "ముందుకు సాగండి"],
      category: "closing",
      completionPercentage: 100,
      isRedFlag: false,
      extractedData: {},
    },
  ],
  mr: [
    {
      question: "हा त्रास तुम्हाला किती दिवसांपासून होत आहे?",
      options: ["आजपासून", "गेल्या २-३ दिवसांपासून", "सुमारे १ आठवड्यापासून", "१ महिन्यापेक्षा जास्त", "खूप जुना त्रास आहे"],
      category: "hpi",
      completionPercentage: 35,
      isRedFlag: false,
      extractedData: { timing: "recent" },
    },
    {
      question: "त्रास किती तीव्र आहे आणि कशा स्वरूपाचा आहे?",
      options: ["हलका / सहन होणारा", "मध्यम", "फार तीव्र / टोचण्यासारखा", "कधीतरी येतो", "जळजळ होणारा"],
      category: "hpi",
      completionPercentage: 55,
      isRedFlag: false,
      extractedData: { severity: 5 },
    },
    {
      question: "तुम्हाला आधीपासून रक्तदाब (BP), मधुमेह (शुगर) सारखा आजार आहे का किंवा नियमित औषधे घेता का?",
      options: ["कोणताही जुना आजार नाही", "हाय बीपी (Blood Pressure)", "डायबिटीज (शुगर)", "थायरॉईड", "हृदयरोग", "नियमित औषध चालू आहे"],
      category: "past_medical",
      completionPercentage: 75,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "डॉक्टरांना सांगण्यासाठी तुम्ही इतर कोणतेही विशिष्ट लक्षण, ॲलर्जी किंवा माहिती जोडू इच्छिता का?",
      options: ["नाही, एवढेच आहे", "ताप किंवा थंडी", "उलटी किंवा चक्कर", "अंगदुखी आणि थकवा", "औषधाची ॲलर्जी आहे", "होय, आणखी काही"],
      category: "closing",
      completionPercentage: 90,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "धन्यवाद! तुमचा वैद्यकीय इतिहास पूर्ण झाला असून डॉक्टरांसाठी तयार आहे.",
      options: ["तपशील पहा", "पुढे जा"],
      category: "closing",
      completionPercentage: 100,
      isRedFlag: false,
      extractedData: {},
    },
  ],
  gu: [
    {
      question: "આ તકલીફ તમને કેટલા સમયથી થઈ રહી છે?",
      options: ["આજથી શરૂ થઈ", "છેલ્લા ૨-૩ દિવસથી", "લગભગ ૧ અઠવાડિયાથી", "૧ મહિના કરતાં વધુ", "ઘણી જૂની તકલીફ છે"],
      category: "hpi",
      completionPercentage: 35,
      isRedFlag: false,
      extractedData: { timing: "recent" },
    },
    {
      question: "તકલીફ કેટલી તીવ્ર છે અને કેવા પ્રકારની છે?",
      options: ["હળવી / સહન થઈ શકે તેવી", "મધ્યમ", "ખૂબ તીવ્ર / ચૂંક આવવી", "વારંવાર થાય છે", "બળતરા જેવી"],
      category: "hpi",
      completionPercentage: 55,
      isRedFlag: false,
      extractedData: { severity: 5 },
    },
    {
      question: "શું તમને પહેલાંથી કોઈ બીમારી (જેમ કે બીપી, ડાયાબિટીસ) છે અથવા કોઈ નિયમિત દવા લો છો?",
      options: ["કોઈ જૂની બીમારી નથી", "હાઈ બ્લડ પ્રેશર (BP)", "ડાયાબિટીસ (શુગર)", "થાઈરોઈડ", "હૃદયરોગ", "નિયમિત દવા લઉં છું"],
      category: "past_medical",
      completionPercentage: 75,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "ડૉક્ટરને જણાવવા માટે તમે અન્ય કોઈ ચોક્કસ લક્ષણ, એલર્જી અથવા વિગત ઉમેરવા માંગો છો?",
      options: ["ના, બસ આટલું જ", "તાવ અથવા ધ્રૂજારી", "ઊલટી અથવા ચક્કર", "શરીરનો દુખાવો અને નબળાઈ", "દવાની એલર્જી છે", "હા, કંઈક બીજું છે"],
      category: "closing",
      completionPercentage: 90,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "આભાર! તમારો તબીબી ઇતિહાસ નોંધાઈ ગયો છે અને ડૉક્ટર માટે તૈયાર છે.",
      options: ["વિગત જુઓ", "આગળ વધો"],
      category: "closing",
      completionPercentage: 100,
      isRedFlag: false,
      extractedData: {},
    },
  ],
  kn: [
    {
      question: "ಈ ಸಮಸ್ಯೆ ನಿಮಗೆ ಎಷ್ಟು ದಿನಗಳಿಂದ ಇದೆ?",
      options: ["ಇಂದಿನಿಂದ", "ಕಳೆದ ೨-೩ ದಿನಗಳಿಂದ", "ಸುಮಾರು ೧ ವಾರದಿಂದ", "೧ ತಿಂಗಳಿಗಿಂತ ಹೆಚ್ಚು", "ಹಳೆಯ ಸಮಸ್ಯೆ"],
      category: "hpi",
      completionPercentage: 35,
      isRedFlag: false,
      extractedData: { timing: "recent" },
    },
    {
      question: "ನೋವು ಅಥವಾ ಅಸ್ವಸ್ಥತೆ ಎಷ್ಟು ತೀವ್ರವಾಗಿದೆ?",
      options: ["ಸೌಮ್ಯವಾಗಿದೆ", "ಮಧ್ಯಮ", "ತುಂಬಾ ತೀವ್ರವಾದ ನೋವು", "ಬಂದು ಹೋಗುತ್ತದೆ", "ಉರಿಯುವ ಸಂವೇದನೆ"],
      category: "hpi",
      completionPercentage: 55,
      isRedFlag: false,
      extractedData: { severity: 5 },
    },
    {
      question: "ನಿಮಗೆ ಬಿಪಿ, ಸಕ್ಕರೆ ಕಾಯಿಲೆಯಂತಹ ಸಮಸ್ಯೆಗಳಿವೆಯೇ ಅಥವಾ ನಿಯಮಿತವಾಗಿ ಔಷಧ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದ್ದೀರಾ?",
      options: ["ಹಳೆಯ ಕಾಯಿಲೆಗಳಿಲ್ಲ", "ಹೈ ಬಿಪಿ (Blood Pressure)", "ಡಯಾಬಿಟಿಸ್ (ಸಕ್ಕರೆ ಕಾಯಿಲೆ)", "ಥೈರಾಯ್ಡ್", "ಹೃದ್ರೋಗ", "ದಿನವೂ ಮಾತ್ರೆ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದ್ದೇನೆ"],
      category: "past_medical",
      completionPercentage: 75,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "ವೈದ್ಯರಿಗೆ ತಿಳಿಸಲು ನೀವು ಸೇರಿಸಲು ಬಯಸುವ ಇತರ ಯಾವುದೇ ನಿರ್ದಿಷ್ಟ ಲಕ್ಷಣಗಳು, ಅಲರ್ಜಿ ಅಥವಾ ವಿವರಗಳಿವೆಯೇ?",
      options: ["ಇಲ್ಲ, ಇಷ್ಟೇ", "ಜ್ವರ ಅಥವಾ ಚಳಿ", "ವಾಂತಿ ಅಥವಾ ತಲೆತಿರುಗುವಿಕೆ", "ಮೈಕೈ ನೋವು ಮತ್ತು ಆಯಾಸ", "ಔಷಧ ಅಲರ್ಜಿ ಇದೆ", "ಹೌದು, ಬೇರೆ ಏನಾದರೂ ಇದೆ"],
      category: "closing",
      completionPercentage: 90,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "ಧನ್ಯವಾದಗಳು! ನಿಮ್ಮ ವೈದ್ಯಕೀಯ ಇತಿಹಾಸ ದಾಖಲಾಗಿದೆ ಮತ್ತು ವೈದ್ಯರ ಪರಿಶೀಲನೆಗೆ ಸಿದ್ಧವಾಗಿದೆ.",
      options: ["ಸಾರಾಂಶ ನೋಡಿ", "ಮುಂದುವರಿಯಿರಿ"],
      category: "closing",
      completionPercentage: 100,
      isRedFlag: false,
      extractedData: {},
    },
  ],
  ml: [
    {
      question: "ഈ ബുദ്ധിമുട്ട് തുടങ്ങിയിട്ട് എത്ര നാളായി?",
      options: ["ഇന്ന് തുടങ്ങി", "കഴിഞ്ഞ 2-3 ദിവസമായി", "ഏകദേശം 1 ആഴ്ചയായി", "1 മാസത്തിൽ കൂടുതൽ", "ദീർഘകാലമായി ഉള്ളതാണ്"],
      category: "hpi",
      completionPercentage: 35,
      isRedFlag: false,
      extractedData: { timing: "recent" },
    },
    {
      question: "ഈ അസ്വസ്ഥത എത്രത്തോളം കഠിനമാണ്?",
      options: ["നേരിയ വേദന", "മിതമായത്", "കഠിനമായ വേദന", "ഇടവിട്ട് വരുന്നത്", "പുകച്ചിൽ"],
      category: "hpi",
      completionPercentage: 55,
      isRedFlag: false,
      extractedData: { severity: 5 },
    },
    {
      question: "നിങ്ങൾക്ക് പ്രഷർ, ഷുഗർ തുടങ്ങിയ രോഗങ്ങൾ ഉണ്ടോ അതോ സ്ഥിരമായി മരുന്ന് കഴിക്കുന്നുണ്ടോ?",
      options: ["മറ്റു രോഗങ്ങൾ ഒന്നുമില്ല", "ഹൈ ബിപി (Blood Pressure)", "ഡയബറ്റിസ് (ഷുഗർ)", "തൈറോയ്ഡ്", "ഹൃദ്രോഗം", "സ്ഥിരമായി മരുന്ന് കഴിക്കുന്നുണ്ട്"],
      category: "past_medical",
      completionPercentage: 75,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "ഡോക്ടറോട് പറയാൻ മറ്റെന്തെങ്കിലും പ്രത്യേക ലക്ഷണങ്ങളോ അലർജിയോ വിവരങ്ങളോ ചേർക്കാൻ നിങ്ങൾ ആഗ്രഹിക്കുന്നുണ്ടോ?",
      options: ["ഇല്ല, ഇത്രയേ ഉള്ളൂ", "പനി അല്ലെങ്കിൽ വിറയൽ", "ഛർദ്ദി അല്ലെങ്കിൽ തലകറക്കം", "ശരീരവേദനയും ക്ഷീണവും", "മരുന്ന് അലർജിയുണ്ട്", "അതെ, വേറെ ചിലതുണ്ട്"],
      category: "closing",
      completionPercentage: 90,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "നന്ദി! നിങ്ങളുടെ മെഡിക്കൽ വിവരങ്ങൾ പൂർത്തിയായി, ഡോക്ടറുടെ പരിശോധനയ്ക്ക് തയ്യാറാണ്.",
      options: ["വിവരങ്ങൾ കാണുക", "തുടരുക"],
      category: "closing",
      completionPercentage: 100,
      isRedFlag: false,
      extractedData: {},
    },
  ],
  pa: [
    {
      question: "ਇਹ ਤਕਲੀਫ਼ ਤੁਹਾਨੂੰ ਕਦੋਂ ਤੋਂ ਮਹਿਸੂਸ ਹੋ ਰਹੀ ਹੈ?",
      options: ["ਅੱਜ ਤੋਂ", "ਪਿਛਲੇ 2-3 ਦਿਨਾਂ ਤੋਂ", "ਲਗਭਗ 1 ਹਫ਼ਤੇ ਤੋਂ", "1 ਮਹੀਨੇ ਤੋਂ ਵੱਧ", "ਬਹੁਤ ਪੁਰਾਣੀ ਤਕਲੀਫ਼ ਹੈ"],
      category: "hpi",
      completionPercentage: 35,
      isRedFlag: false,
      extractedData: { timing: "recent" },
    },
    {
      question: "ਤਕਲੀਫ਼ ਕਿੰਨੀ ਤੇਜ਼ ਹੈ ਅਤੇ ਕਿਸ ਤਰ੍ਹਾਂ ਦੀ ਹੈ?",
      options: ["ਹਲਕੀ / ਸਹਿਣਯੋਗ", "ਦਰਮਿਆਨੀ", "ਬਹੁਤ ਤੇਜ਼ / ਚੁਭਣ ਵਾਲਾ ਦਰਦ", "ਕਦੇ-ਕਦੇ ਹੁੰਦਾ ਹੈ", "ਸੜਨ ਵਾਲੀ"],
      category: "hpi",
      completionPercentage: 55,
      isRedFlag: false,
      extractedData: { severity: 5 },
    },
    {
      question: "ਕੀ ਤੁਹਾਨੂੰ ਪਹਿਲਾਂ ਤੋਂ ਕੋਈ ਬਿਮਾਰੀ (ਜਿਵੇਂ ਬੀਪੀ, ਸ਼ੂਗਰ) ਹੈ ਜਾਂ ਕੋਈ ਦਵਾਈ ਲੈਂਦੇ ਹੋ?",
      options: ["ਕੋਈ ਪੁਰਾਣੀ ਬਿਮਾਰੀ ਨਹੀਂ", "ਹਾਈ ਬੀਪੀ (BP)", "ਸ਼ੂਗਰ (Diabetes)", "ਥਾਇਰਾਇਡ", "ਦਿਲ ਦੀ ਬਿਮਾਰੀ", "ਰੋਜ਼ਾਨਾ ਦਵਾਈ ਲੈਂਦਾ/ਲੈਂਦੀ ਹਾਂ"],
      category: "past_medical",
      completionPercentage: 75,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "ਕੀ ਕੋਈ ਹੋਰ ਖ਼ਾਸ ਲੱਛਣ, ਐਲਰਜੀ ਜਾਂ ਗੱਲ ਹੈ ਜੋ ਤੁਸੀਂ ਡਾਕਟਰ ਨੂੰ ਦੱਸਣਾ ਚਾਹੁੰਦੇ ਹੋ?",
      options: ["ਨਹੀਂ, ਬੱਸ ਇੰਨਾ ਹੀ", "ਬੁਖ਼ਾਰ ਜਾਂ ਕਾਂਬਾ", "ਉਲਟੀ ਜਾਂ ਚੱਕਰ", "ਸਰੀਰ ਦਰਦ ਅਤੇ ਕਮਜ਼ੋਰੀ", "ਕਿਸੇ ਦਵਾਈ ਤੋਂ ਐਲਰਜੀ", "ਹਾਂ, ਕੁਝ ਹੋਰ ਵੀ ਹੈ"],
      category: "closing",
      completionPercentage: 90,
      isRedFlag: false,
      extractedData: {},
    },
    {
      question: "ਧੰਨਵਾਦ! ਤੁਹਾਡਾ ਮੈਡੀਕਲ ਇਤਿਹਾਸ ਦਰਜ ਹੋ ਗਿਆ ਹੈ ਅਤੇ ਡਾਕਟਰ ਦੀ ਸਲਾਹ ਲਈ ਤਿਆਰ ਹੈ।",
      options: ["ਸੰਖੇਪ ਦੇਖੋ", "ਅੱਗੇ ਵਧੋ"],
      category: "closing",
      completionPercentage: 100,
      isRedFlag: false,
      extractedData: {},
    },
  ],
};

function getMockResponse(conversationHistory, language = "en") {
  const patientMessages = conversationHistory.filter(
    (m) => m.role === "user" || m.role === "patient",
  ).length;

  const bank = MOCK_INTERVIEW_BANK[language] || MOCK_INTERVIEW_BANK.en;
  // Patient just answered question 1 (chief complaint) -> index 0 (Q2 Duration)
  // Patient answered question 2 -> index 1 (Q3 Severity)
  // Patient answered question 3 -> index 2 (Q4 Conditions/Meds)
  // Patient answered question 4 -> index 3 (Q5 Specific Additional Symptoms Inquiry)
  // Patient answered question 5 -> index 4 (Q6 Completed 100%)
  const index = Math.max(0, Math.min(patientMessages - 1, bank.length - 1));
  return bank[index];
}
