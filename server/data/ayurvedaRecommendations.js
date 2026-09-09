/**
 * Condition → Ayurvedic lifestyle and yoga recommendations.
 * Matched against a patient's diagnosis / chief complaint / past history.
 * This is educational content, not a treatment plan.
 */

const CATALOG = [
  {
    id: "diabetes",
    labels: [
      "diabetes",
      "type 2 diabetes",
      "type 2",
      "dm",
      "blood sugar",
      "hyperglycemia",
      "madhumeha",
    ],
    conditionName: "Diabetes (Madhumeha)",
    ayurveda: {
      explanation:
        "In Ayurveda, diabetes is often discussed as Madhumeha, linked with impaired Agni (digestive fire), excess Kapha, and depleted tissues. Care focuses on regular meals, movement, and avoiding very sweet, heavy foods.",
      lifestyle: [
        "Eat meals at consistent times and avoid long fasting if you take sugar-lowering medicine.",
        "Walk for 20–30 minutes after main meals if your doctor agrees.",
        "Prefer warm, freshly cooked food over leftover or very oily meals.",
        "Keep a regular sleep schedule; poor sleep can worsen sugar control.",
      ],
      diet: [
        "Limit sweets, sugary drinks, white bread, and refined flour.",
        "Include vegetables, dals, whole grains, and a modest portion of fruit.",
        "Avoid fruit juices; eat whole fruit instead, in amounts advised by your clinician.",
      ],
      references: [
        {
          title: "Ministry of AYUSH — Diabetes care resources",
          url: "https://www.ayush.gov.in/",
        },
      ],
    },
    yoga: [
      {
        name: "Walking",
        duration: 20,
        frequency: "Daily",
        explanation: "Gentle walking helps the body use insulin more effectively.",
        instructions:
          "Walk at a comfortable pace on even ground. Stop if you feel dizzy, very breathless, or have chest discomfort.",
        avoidWhen: "Unstable blood sugar, recent fall, or chest pain.",
      },
      {
        name: "Vajrasana after meals",
        duration: 5,
        frequency: "After lunch and dinner",
        explanation: "A simple seated posture often used after meals.",
        instructions:
          "Sit on your heels with a straight back. Breathe slowly. Use a cushion if your knees hurt.",
        avoidWhen: "Severe knee pain, recent knee surgery.",
      },
      {
        name: "Nadi Shodhana (alternate-nostril breathing)",
        duration: 8,
        frequency: "Once daily",
        explanation: "Slow breathing can reduce stress, which affects sugar levels.",
        instructions:
          "Sit comfortably. Close one nostril, inhale, switch, and exhale slowly. Do not hold the breath if you feel light-headed.",
        avoidWhen: "Severe nasal blockage, recent heart event, or dizziness.",
      },
    ],
  },
  {
    id: "hypertension",
    labels: [
      "hypertension",
      "high blood pressure",
      "high bp",
      "bp",
      "htn",
      "raktagata vata",
    ],
    conditionName: "High blood pressure (Hypertension)",
    ayurveda: {
      explanation:
        "Ayurveda often relates raised blood pressure to aggravated Vata and Pitta, stress, irregular routine, and excess salt. Daily rhythm, rest, and calming practices are emphasised alongside medical treatment.",
      lifestyle: [
        "Take prescribed blood-pressure medicines at the same time every day.",
        "Reduce extra table salt, pickles, papad, and packaged snacks.",
        "Keep a consistent sleep and wake time.",
        "Limit alcohol and avoid tobacco.",
      ],
      diet: [
        "Prefer home-cooked meals with vegetables, dals, and whole grains.",
        "Use less salt while cooking; taste food before adding more.",
        "Include potassium-rich foods such as banana or coconut water only if your doctor has not restricted them (especially in kidney disease).",
      ],
      references: [
        {
          title: "WHO — Hypertension overview",
          url: "https://www.who.int/news-room/fact-sheets/detail/hypertension",
        },
      ],
    },
    yoga: [
      {
        name: "Shavasana",
        duration: 10,
        frequency: "Daily",
        explanation: "Resting pose that can lower tension and heart rate.",
        instructions:
          "Lie on your back with arms relaxed. Close your eyes and breathe slowly for several minutes.",
        avoidWhen: "If lying flat causes breathlessness, use a supported seated rest instead.",
      },
      {
        name: "Anulom Vilom",
        duration: 8,
        frequency: "Daily",
        explanation: "Slow alternate-nostril breathing may help calm the nervous system.",
        instructions:
          "Sit upright. Breathe slowly through one nostril at a time. Stop if you feel dizzy.",
        avoidWhen: "Uncontrolled very high BP, recent stroke, or severe dizziness.",
      },
      {
        name: "Gentle walking",
        duration: 20,
        frequency: "Daily",
        explanation: "Regular movement supports heart health.",
        instructions: "Walk on even ground. Keep conversation possible. Do not strain.",
        avoidWhen: "Chest pain, severe headache, or dizziness during walking.",
      },
    ],
  },
  {
    id: "headache",
    labels: ["headache", "migraine", "sirah shula", "sir dard", "head pain"],
    conditionName: "Headache / migraine",
    ayurveda: {
      explanation:
        "Headache may relate to stress, poor sleep, skipped meals, eye strain, or sinus issues. Ayurveda advises identifying triggers, regular meals, and avoiding excess heat, screens, and late nights.",
      lifestyle: [
        "Keep a regular meal and sleep schedule.",
        "Limit long screen time; rest your eyes every 20 minutes.",
        "Stay hydrated with water through the day.",
        "Note triggers such as missed meals, strong smells, or lack of sleep.",
      ],
      diet: [
        "Do not skip breakfast.",
        "Reduce very spicy, fried, and leftover food if they trigger pain.",
        "Limit excess caffeine if it worsens your headache later in the day.",
      ],
      references: [
        {
          title: "CDC — Headache information",
          url: "https://www.cdc.gov/headache/",
        },
      ],
    },
    yoga: [
      {
        name: "Neck and shoulder stretches",
        duration: 8,
        frequency: "Daily",
        explanation: "Relieves tension that often accompanies headache.",
        instructions:
          "Sit tall. Slowly tilt the ear toward the shoulder. Do not force the neck backward.",
        avoidWhen: "Neck injury, sudden severe headache, or weakness on one side.",
      },
      {
        name: "Bhramari (humming breath)",
        duration: 5,
        frequency: "Once or twice daily",
        explanation: "A calming breath practice used for tension and restlessness.",
        instructions:
          "Sit quietly, inhale, and exhale with a soft humming sound. Keep the jaw relaxed.",
        avoidWhen: "Ear infection, severe sinus pain, or if humming increases pain.",
      },
    ],
  },
  {
    id: "joint_pain",
    labels: [
      "arthritis",
      "osteoarthritis",
      "joint pain",
      "knee pain",
      "sandhigata",
      "rheumatoid",
    ],
    conditionName: "Joint pain / arthritis",
    ayurveda: {
      explanation:
        "Joint discomfort is often discussed as Sandhigata Vata. Warmth, gentle movement, and avoiding long sitting in one position are common lifestyle measures. Swelling, redness, or fever needs medical review.",
      lifestyle: [
        "Keep joints warm and avoid sitting still for long periods.",
        "Use supportive footwear if knees or hips hurt.",
        "Apply warmth only if there is no acute swelling or infection.",
        "Maintain a healthy weight to reduce load on knees.",
      ],
      diet: [
        "Prefer warm, easily digested meals.",
        "Limit very cold drinks if they increase stiffness for you.",
        "Eat adequate protein from dals, milk, eggs, or other foods you tolerate.",
      ],
      references: [
        {
          title: "Ministry of AYUSH",
          url: "https://www.ayush.gov.in/",
        },
      ],
    },
    yoga: [
      {
        name: "Gentle joint rotations",
        duration: 10,
        frequency: "Daily",
        explanation: "Keeps joints moving without heavy load.",
        instructions:
          "Sit or stand with support. Slowly rotate ankles, knees (small range), wrists, and shoulders.",
        avoidWhen: "Hot, swollen joints or recent joint surgery.",
      },
      {
        name: "Supported Tadasana (mountain pose)",
        duration: 3,
        frequency: "Daily",
        explanation: "Improves posture and balance.",
        instructions:
          "Stand near a wall or chair. Lengthen the spine and breathe slowly.",
        avoidWhen: "Severe balance problems without support.",
      },
    ],
  },
  {
    id: "respiratory",
    labels: [
      "asthma",
      "copd",
      "cough",
      "cold",
      "breathlessness",
      "wheeze",
      "bronchitis",
      "respiratory",
    ],
    conditionName: "Cough / breathing difficulty",
    ayurveda: {
      explanation:
        "Respiratory complaints may relate to Kapha accumulation, dust, smoke, or infection. Steam, warm fluids, and avoiding smoke are common supportive measures. Sudden breathlessness is an emergency.",
      lifestyle: [
        "Avoid smoke, dust, and strong incense if they trigger cough.",
        "Sit upright while resting if breathing feels tight.",
        "Use prescribed inhalers exactly as advised.",
        "Keep the room ventilated but not dusty.",
      ],
      diet: [
        "Prefer warm water and warm soups.",
        "Avoid very cold drinks and ice cream during a flare if they worsen cough.",
        "Eat smaller meals if a full stomach makes breathing harder.",
      ],
      references: [
        {
          title: "WHO — Asthma",
          url: "https://www.who.int/news-room/fact-sheets/detail/asthma",
        },
      ],
    },
    yoga: [
      {
        name: "Pursed-lip breathing",
        duration: 5,
        frequency: "As needed",
        explanation: "Helps slow the breath during mild tightness.",
        instructions:
          "Inhale gently through the nose. Exhale slowly through pursed lips as if blowing out a candle.",
        avoidWhen: "Severe breathlessness, blue lips, or inability to speak — seek emergency care.",
      },
      {
        name: "Supported sitting stretch",
        duration: 6,
        frequency: "Daily when stable",
        explanation: "Opens the chest without lying flat.",
        instructions:
          "Sit on a chair, roll the shoulders back, and breathe slowly. Do not force deep breaths.",
        avoidWhen: "Acute asthma attack or chest pain.",
      },
    ],
  },
  {
    id: "gastric",
    labels: [
      "acidity",
      "gerd",
      "gastritis",
      "stomach pain",
      "abdominal pain",
      "indigestion",
      "amlapitta",
      "constipation",
    ],
    conditionName: "Acidity / stomach discomfort",
    ayurveda: {
      explanation:
        "Digestive complaints are often linked to irregular Agni. Regular meal times, not lying down immediately after eating, and avoiding very spicy or leftover food are standard lifestyle points.",
      lifestyle: [
        "Eat at regular times and avoid very late dinners.",
        "Do not lie down for at least 2 hours after a meal.",
        "Chew food slowly and avoid eating while rushed or angry.",
        "Limit tea, coffee, and fried snacks if they worsen burning.",
      ],
      diet: [
        "Prefer simple, warm, freshly cooked meals.",
        "Avoid excess chilli, pickles, and very sour foods during a flare.",
        "Drink water between meals rather than large amounts during meals.",
      ],
      references: [
        {
          title: "Ministry of AYUSH",
          url: "https://www.ayush.gov.in/",
        },
      ],
    },
    yoga: [
      {
        name: "Vajrasana",
        duration: 5,
        frequency: "After meals",
        explanation: "A seated posture commonly used after eating.",
        instructions: "Sit on the heels with a straight spine. Breathe slowly.",
        avoidWhen: "Severe knee pain.",
      },
      {
        name: "Pavanamuktasana (wind-relieving pose)",
        duration: 4,
        frequency: "Once daily on an empty or light stomach",
        explanation: "Gentle knee-to-chest movement may ease gas discomfort.",
        instructions:
          "Lie on your back and hug one knee toward the chest, then the other. Move slowly.",
        avoidWhen: "Recent abdominal surgery, hernia, or severe pain.",
      },
    ],
  },
  {
    id: "stress",
    labels: [
      "anxiety",
      "stress",
      "insomnia",
      "sleep",
      "depression",
      "tension",
      "mental health",
    ],
    conditionName: "Stress / sleep difficulty",
    ayurveda: {
      explanation:
        "Ayurveda emphasises Dinacharya (daily routine), sattvic food, and calming practices for mental restlessness. These support, but do not replace, professional mental-health care when needed.",
      lifestyle: [
        "Keep a fixed sleep and wake time, including weekends.",
        "Reduce screens for 30–60 minutes before bed.",
        "Spend a few minutes outdoors in daylight if possible.",
        "Talk to a clinician if low mood, panic, or hopelessness continues.",
      ],
      diet: [
        "Avoid heavy, very spicy dinners late at night.",
        "Limit caffeine after mid-afternoon.",
        "Have a light, warm evening meal.",
      ],
      references: [
        {
          title: "WHO — Mental health",
          url: "https://www.who.int/health-topics/mental-health",
        },
      ],
    },
    yoga: [
      {
        name: "Guided rest / Shavasana",
        duration: 10,
        frequency: "Daily",
        explanation: "Helps the body shift out of a stress response.",
        instructions:
          "Lie or sit supported. Close the eyes and notice the breath without forcing it.",
        avoidWhen: "If rest brings distressing thoughts, sit with a trusted person or clinician support.",
      },
      {
        name: "Bhramari",
        duration: 5,
        frequency: "Evening",
        explanation: "Humming breath can settle restlessness before sleep.",
        instructions: "Inhale quietly and exhale with a soft hum. Keep the face relaxed.",
        avoidWhen: "Ear infection or severe headache.",
      },
    ],
  },
];

const SAFETY = {
  general:
    "These suggestions are educational and based on common Ayurvedic lifestyle guidance. They are not a diagnosis or a substitute for your doctor, AYUSH practitioner, or emergency care.",
  avoidWhen: [
    "Stop any exercise that causes chest pain, severe breathlessness, fainting, or sudden weakness.",
    "Do not start new herbs, oils, or strong panchakarma without a qualified clinician.",
    "Pregnancy, recent surgery, uncontrolled diabetes, very high BP, or heart disease need personalised advice.",
  ],
  consultPhysician:
    "Consult a physician before changing medicines, diet in chronic disease, or exercise after a recent illness.",
};

export function matchRecommendations(conditionTexts = []) {
  const haystack = conditionTexts
    .filter(Boolean)
    .map((text) => String(text).toLowerCase())
    .join(" | ");

  if (!haystack.trim()) {
    return [];
  }

  return CATALOG.filter((entry) =>
    entry.labels.some((label) => haystack.includes(label)),
  ).map((entry) => ({
    id: entry.id,
    conditionName: entry.conditionName,
    matchedFrom: conditionTexts.filter((text) =>
      entry.labels.some((label) =>
        String(text || "")
          .toLowerCase()
          .includes(label),
      ),
    ),
    ayurveda: entry.ayurveda,
    yoga: entry.yoga,
  }));
}

export function getSafetyNotes() {
  return SAFETY;
}
