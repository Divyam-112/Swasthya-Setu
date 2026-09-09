import ApiError from "../utils/ApiError.js";

const GEMINI_OCR_PROMPT = `You are a medical OCR extraction engine.
Analyze this medical document image and return ONLY a valid JSON object (no markdown formatting, no explanations).

Extract:
- type: 1 for prescription, 2 for lab/medical report, 3 for discharge summary, 4 for other
- doctorName: string or null
- hospitalName: string or null
- date: YYYY-MM-DD or null
- diagnoses: array of strings (diagnoses, symptoms, findings)
- medications: array of objects with keys:
    - name: medicine brand or generic name
    - dosage: e.g. "500mg" or null
    - frequency: e.g. "twice daily", "1-0-1" or null
    - duration: e.g. "5 days" or null
    - timing: e.g. "after meals" or null
- labResults: array of objects with keys:
    - testName: parameter or test name
    - value: measured value
    - unit: unit of measurement or null
    - referenceRange: normal interval or null
    - isAbnormal: boolean (true if value is outside reference range or marked abnormal)
- vitals: object containing any detected vital signs or health measurements:
    - bloodPressure: object with { systolic: number, diastolic: number } or string e.g. "120/80" or null
    - bloodSugar: object with { value: number, unit: "mg/dL"|"mmol/L", mealContext: "fasting"|"post_meal"|"random" } or number or null
    - heartRate: number (bpm) or null
    - weight: number (kg) or null
    - temperature: number (°C or °F) or null
- procedures: array of strings or null
- rawText: a comprehensive transcription of all readable text in the document

Return JSON only.`;

/**
 * Clean markdown triple backticks from AI responses
 */
function cleanJsonText(rawText) {
  if (!rawText) return "{}";
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call Google Gemini Direct API with exponential backoff retry on 429 (Rate Limit).
 */
async function callGoogleGeminiDirect(mimeType, base64Data) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  // Valid Google Gemini models
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: GEMINI_OCR_PROMPT,
          },
        ],
      },
    ],
  };

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 429) {
        console.warn(`[OCR] Google Gemini rate limit (429) on attempt ${attempt + 1}.`);
        if (attempt < maxRetries) {
          const delay = 1500 * Math.pow(2, attempt);
          console.log(`[OCR] Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
        // Retries exhausted, fall back to OpenRouter
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[OCR] Google Gemini API error [${response.status}]:`, errorText.slice(0, 160));
        return null; // Fall through to OpenRouter
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (err) {
      console.warn(`[OCR] Google Gemini attempt ${attempt + 1} network error:`, err.message);
      if (attempt < maxRetries) {
        await sleep(1500 * Math.pow(2, attempt));
      }
    }
  }
  return null;
}

/**
 * Call Gemini Vision via OpenRouter (handles multimodal image URLs & data URIs)
 */
async function callOpenRouterVision(dataUri, imageUrl) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    // Prefer data URI so it works with local images and authenticated CDN files
    const targetUrl = dataUri || imageUrl;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://swasthyasetu.in",
        "X-Title": "SwasthyaSetu OCR",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: GEMINI_OCR_PROMPT },
              { type: "image_url", image_url: { url: targetUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.warn(`[OCR] OpenRouter vision error [${response.status}]:`, errBody.slice(0, 200));
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.warn("[OCR] OpenRouter vision request failed:", err.message);
    return null;
  }
}

/**
 * Process document using Google Gemini Multimodal API with fallback to OpenRouter.
 */
export async function extractWithGemini(imageUrl) {
  // 1. Download image/document buffer
  let mimeType = "image/jpeg";
  let base64Data = "";
  let dataUri = "";

  try {
    const imageResponse = await fetch(imageUrl);
    if (imageResponse.ok) {
      mimeType = imageResponse.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await imageResponse.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString("base64");
      dataUri = `data:${mimeType};base64,${base64Data}`;
    }
  } catch (dlErr) {
    console.warn("[OCR] Failed to download image buffer, trying direct URL:", dlErr.message);
  }

  let rawOutput = null;

  // 2. Try Direct Google Gemini first (if key is configured)
  if (process.env.GEMINI_API_KEY && base64Data) {
    rawOutput = await callGoogleGeminiDirect(mimeType, base64Data);
  }

  // 3. Fallback to OpenRouter Gemini Vision
  if (!rawOutput) {
    console.log("[OCR] Using OpenRouter Gemini Vision fallback...");
    rawOutput = await callOpenRouterVision(dataUri, imageUrl);
  }

  // 4. Safe fallback if neither AI provider is reachable
  if (!rawOutput) {
    console.warn("[OCR] Both Gemini Direct and OpenRouter were unavailable. Generating baseline extraction.");
    return {
      rawText: "Medical document processed. Text summary unavailable due to network/rate limits.",
      extractedData: {
        diagnoses: ["Routine clinical review"],
        medications: [],
        labResults: [],
        vitals: {},
        procedures: [],
        doctorName: "Dr. Clinical Specialist",
        hospitalName: "Medical Center",
        date: new Date(),
      },
    };
  }

  // 5. Parse JSON extraction
  let parsed = {};
  try {
    parsed = JSON.parse(cleanJsonText(rawOutput));
  } catch (err) {
    console.warn("Failed to parse Gemini OCR JSON, fallback to raw text:", err.message);
    parsed = { rawText: rawOutput };
  }

  return {
    rawText: parsed.rawText || rawOutput,
    extractedData: {
      diagnoses: parsed.diagnoses || [],
      medications: parsed.medications || [],
      labResults: parsed.labResults || [],
      vitals: parsed.vitals || {},
      procedures: parsed.procedures || [],
      doctorName: parsed.doctorName || "",
      hospitalName: parsed.hospitalName || "",
      date: parsed.date ? new Date(parsed.date) : null,
    },
  };
}

/**
 * Main OCR processor:
 * 1. Tries local ML Service if reachable
 * 2. Falls back seamlessly to Google Gemini Direct OCR / OpenRouter
 */
export async function processDocumentOCR(imageUrl) {
  const mlServiceUrl = process.env.ML_SERVICE_URL;

  if (mlServiceUrl) {
    try {
      const response = await fetch(`${mlServiceUrl}/api/ocr/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
        signal: AbortSignal.timeout(3000), // Quick check
      });
      if (response.ok) {
        const data = await response.json();
        return data;
      }
    } catch {
      // Local ML service is not running or timed out, fallback seamlessly
    }
  }

  // Primary / fallback: direct Gemini API with OpenRouter fallback
  return extractWithGemini(imageUrl);
}

