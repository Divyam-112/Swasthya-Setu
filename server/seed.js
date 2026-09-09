/**
 * seed.js — Populate the database with demo data for video recording.
 *
 * Creates:
 *   - 1 Patient  (Aarav Sharma)
 *   - 1 Doctor   (Dr. Priya Mehta)
 *   - 2 Completed sessions with full AI conversation history
 *   - 1 In-progress session (for live demo of AI interview)
 *   - 2 Prescriptions
 *   - 3 Appointments (past completed, upcoming, future)
 *   - Health tracker with 30 days of BP, blood sugar, weight, heart rate data
 *   - Medicine and exercise reminders
 *   - Medical history from interviews, documents, and prescriptions
 *
 * Usage:
 *   node seed.js            # Seed the database
 *   node seed.js --reset    # Drop existing demo data and re-seed
 *
 * Login credentials after seeding:
 *   Patient — ABHA: 1234-5678-9012-34  |  Password: demo1234
 *   Doctor  — Email: priya@hospital.in  |  Password: doctor1234
 */

import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "./config/db.js";
import Patient from "./models/Patient.js";
import Doctor from "./models/Doctor.js";
import Session from "./models/Session.js";
import Prescription from "./models/Prescription.js";
import Appointment from "./models/Appointment.js";
import HealthTracker from "./models/HealthTracker.js";

// ─── Helpers ────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Main ───────────────────────────────────────────────────────

async function seed() {
  await connectDB();

  const isReset = process.argv.includes("--reset");

  const demoAbhas = [
    "12345678901234",
    "98765432109876",
    "55443322110099",
    "44332211009988",
    "77665544332211",
  ];

  if (isReset) {
    console.log("Resetting demo data...");
    const oldPatients = await Patient.find({ abhaId: { $in: demoAbhas } }).select("_id");
    const oldPatientIds = oldPatients.map((p) => p._id);
    const oldDoctors = await Doctor.find({ email: "priya@hospital.in" }).select("_id");
    const oldDoctorIds = oldDoctors.map((d) => d._id);

    await Appointment.deleteMany({
      $or: [{ patient: { $in: oldPatientIds } }, { doctor: { $in: oldDoctorIds } }],
    });
    await Session.deleteMany({ patient: { $in: oldPatientIds } });
    await Prescription.deleteMany({
      $or: [{ patient: { $in: oldPatientIds } }, { doctor: { $in: oldDoctorIds } }],
    });
    await HealthTracker.deleteMany({ patient: { $in: oldPatientIds } });
    await Patient.deleteMany({ abhaId: { $in: demoAbhas } });
    await Doctor.deleteMany({ email: "priya@hospital.in" });
    console.log("Old demo data removed.");
  }

  // Check if demo patient already exists
  const existingPatient = await Patient.findOne({ abhaId: "12345678901234" });
  if (existingPatient) {
    console.log("Demo data already exists. Use --reset to re-seed.");
    console.log("");
    console.log("Login credentials:");
    console.log("  Patient — ABHA: 1234-5678-9012-34  |  Password: demo1234");
    console.log("  Doctor  — Email: priya@hospital.in  |  Password: doctor1234");
    process.exit(0);
  }

  // ─── 1. Create Doctor ─────────────────────────────────────────

  console.log("Creating doctor...");
  const doctor = await Doctor.create({
    name: "Dr. Priya Mehta",
    email: "priya@hospital.in",
    password: "doctor1234",
    specialization: "General Medicine",
    hospitalId: "AIIMS-DEL-001",
    role: "doctor",
  });

  // ─── 2. Create Patient ────────────────────────────────────────

  console.log("Creating patient...");
  const patient = await Patient.create({
    name: "Aarav Sharma",
    phone: "9876543210",
    abhaId: "12345678901234",
    preferredLanguage: "hi",
    age: 35,
    gender: "Male",
    password: "demo1234",
    height: 172,
    weight: 78,
    bmi: 26.4,
    bmiCategory: "Overweight",
    consent: {
      dataCollection: true,
      dataSharing: true,
      aiAnalysis: true,
      dataProcessing: true,
      dietYogaPersonalization: true,
      consentDate: new Date(),
    },
    medicalHistory: {
      symptomInterviews: [],
      uploadedDocuments: [],
      prescriptions: [],
      prescribedYogaPoses: [
        {
          name: "Tree Pose",
          sanskritName: "Vrikshasana",
          durationMinutes: 5,
          reps: "3 each side",
          timeOfDay: "Morning",
          instructions: "Stand on one leg, place the other foot on inner thigh. Raise arms overhead.",
          benefits: "Improves balance, strengthens legs, calms the mind",
          prescribedBy: "Dr. Priya Mehta",
          prescribedAt: daysAgo(15),
        },
        {
          name: "Cobra Pose",
          sanskritName: "Bhujangasana",
          durationMinutes: 3,
          reps: "5 times",
          timeOfDay: "Morning",
          instructions: "Lie face down, place palms near shoulders, lift chest gently.",
          benefits: "Strengthens spine, stretches chest and lungs, reduces stress",
          prescribedBy: "Dr. Priya Mehta",
          prescribedAt: daysAgo(15),
        },
      ],
      cumulativeDiagnoses: [
        {
          condition: "Essential Hypertension (Stage 1)",
          firstSeenAt: daysAgo(90),
          sources: ["interview", "prescription"],
        },
        {
          condition: "Type 2 Diabetes Mellitus (Pre-diabetic)",
          firstSeenAt: daysAgo(60),
          sources: ["document", "prescription"],
        },
        {
          condition: "Vitamin D Deficiency",
          firstSeenAt: daysAgo(30),
          sources: ["document"],
        },
      ],
      activeMedications: [
        {
          name: "Amlodipine",
          dosage: "5mg",
          frequency: "Once daily",
          timing: "Morning",
          prescribedBy: "Dr. Priya Mehta",
          prescribedAt: daysAgo(30),
          source: "prescription",
        },
        {
          name: "Metformin",
          dosage: "500mg",
          frequency: "Twice daily",
          timing: "After meals",
          prescribedBy: "Dr. Priya Mehta",
          prescribedAt: daysAgo(30),
          source: "prescription",
        },
        {
          name: "Cholecalciferol (Vitamin D3)",
          dosage: "60000 IU",
          frequency: "Once weekly",
          timing: "After breakfast",
          prescribedBy: "Dr. Priya Mehta",
          prescribedAt: daysAgo(30),
          source: "prescription",
        },
      ],
      lastUpdated: new Date(),
    },
  });

  // ─── 3. Create Completed Session 1 (30 days ago) ──────────────

  console.log("Creating sessions...");

  const session1 = await Session.create({
    patient: patient._id,
    sessionType: "allopathic",
    language: "hi",
    status: "completed",
    completionPercentage: 100,
    currentCategory: "closing",
    completedAt: daysAgo(30),
    createdAt: daysAgo(30),
    conversation: [
      {
        role: "ai",
        content: JSON.stringify({
          question: "नमस्ते आरव जी! मैं आपका AI स्वास्थ्य सहायक हूँ। आपको क्या तकलीफ हो रही है?",
          options: ["सिर में दर्द", "पेट में दर्द", "बुखार", "चक्कर आना", "कुछ और बताना चाहूँगा"],
          category: "chief_complaint",
          isRedFlag: false,
          completionPercentage: 10,
        }),
        category: "chief_complaint",
        timestamp: daysAgo(30),
      },
      {
        role: "patient",
        content: "सिर में दर्द और चक्कर आ रहे हैं",
        inputMode: "touch",
        category: "chief_complaint",
        timestamp: daysAgo(30),
      },
      {
        role: "ai",
        content: JSON.stringify({
          question: "सिर दर्द और चक्कर कब से आ रहे हैं?",
          options: ["आज से", "2-3 दिन से", "1 हफ्ते से", "1 महीने से ज्यादा"],
          category: "hpi",
          isRedFlag: false,
          completionPercentage: 30,
          extractedData: { chiefComplaint: "Headache with dizziness" },
        }),
        category: "hpi",
        timestamp: daysAgo(30),
      },
      {
        role: "patient",
        content: "1 हफ्ते से",
        inputMode: "touch",
        category: "hpi",
        timestamp: daysAgo(30),
      },
      {
        role: "ai",
        content: JSON.stringify({
          question: "दर्द कितना तेज है? और क्या सुबह ज्यादा होता है?",
          options: ["हल्का दर्द, सहन होता है", "मध्यम दर्द, काम में दिक्कत", "बहुत तेज दर्द", "सुबह उठने पर सबसे ज्यादा"],
          category: "hpi",
          isRedFlag: false,
          completionPercentage: 50,
          extractedData: { timing: "1 week" },
        }),
        category: "hpi",
        timestamp: daysAgo(30),
      },
      {
        role: "patient",
        content: "मध्यम दर्द, काम में दिक्कत होती है",
        inputMode: "touch",
        category: "hpi",
        timestamp: daysAgo(30),
      },
      {
        role: "ai",
        content: JSON.stringify({
          question: "क्या आपको पहले से कोई बीमारी है? कोई दवाई चल रही है?",
          options: ["हाँ, BP (Blood Pressure) है", "हाँ, Sugar (मधुमेह) है", "कोई बीमारी नहीं", "BP और Sugar दोनों हैं"],
          category: "past_medical",
          isRedFlag: false,
          completionPercentage: 70,
        }),
        category: "past_medical",
        timestamp: daysAgo(30),
      },
      {
        role: "patient",
        content: "हाँ, BP की दवा चल रही है पिछले 2 साल से",
        inputMode: "text",
        category: "past_medical",
        timestamp: daysAgo(30),
      },
      {
        role: "ai",
        content: JSON.stringify({
          question: "क्या आप कोई और बात डॉक्टर को बताना चाहेंगे? कोई एलर्जी या अन्य लक्षण?",
          options: ["नहीं, बस इतना ही", "हाँ, नींद नहीं आती", "हाँ, आँखों में धुंधलापन", "हाँ, कोई दवा से एलर्जी है"],
          category: "closing",
          isRedFlag: false,
          completionPercentage: 90,
        }),
        category: "closing",
        timestamp: daysAgo(30),
      },
      {
        role: "patient",
        content: "हाँ, नींद भी ठीक से नहीं आती पिछले कुछ दिनों से",
        inputMode: "text",
        category: "closing",
        timestamp: daysAgo(30),
      },
      {
        role: "ai",
        content: JSON.stringify({
          question: "धन्यवाद आरव जी। आपकी जानकारी डॉक्टर को भेज दी गई है। कृपया प्रतीक्षा करें।",
          options: [],
          category: "closing",
          isRedFlag: false,
          completionPercentage: 100,
        }),
        category: "closing",
        timestamp: daysAgo(30),
      },
    ],
    responses: [
      { questionId: "तकलीफ / Chief Complaint", question: "नमस्ते आरव जी! आपको क्या तकलीफ हो रही है?", answer: "सिर में दर्द और चक्कर आ रहे हैं", timestamp: daysAgo(30) },
      { questionId: "अवधि / Duration", question: "सिर दर्द और चक्कर कब से आ रहे हैं?", answer: "1 हफ्ते से आ रहे हैं", timestamp: daysAgo(30) },
      { questionId: "तीव्रता / Severity", question: "दर्द कितना तेज है? और क्या सुबह ज्यादा होता है?", answer: "मध्यम दर्द, काम में दिक्कत होती है", timestamp: daysAgo(30) },
      { questionId: "पूर्व रोग / Past History", question: "क्या आपको पहले से कोई बीमारी है?", answer: "हाँ, मुझे 2 साल से High BP की शिकायत है", timestamp: daysAgo(30) },
      { questionId: "दवाइयाँ / Current Medications", question: "क्या आप BP की कोई दवा ले रहे हैं?", answer: "Amlodipine 5mg रोज़ सुबह लेता हूँ", timestamp: daysAgo(30) },
      { questionId: "नींद / Sleep Quality", question: "क्या नींद ठीक आ रही है?", answer: "नहीं, रात में 4-5 घंटे ही सो पाता हूँ, तनाव रहता है", timestamp: daysAgo(30) },
    ],
    clinicalHistory: {
      chiefComplaint: "Headache with dizziness for 1 week",
      duration: "1 week",
      severity: "Moderate (6/10)",
      symptoms: [
        "Severe Throbbing Headache (Morning predominant)",
        "Dizziness & Vertigo on standing",
        "Insomnia & sleep disturbance (4-5 hrs)",
        "Occasional lightheadedness",
      ],
      existingConditions: [
        "Essential Hypertension (Stage 1) — 2 years on Amlodipine 5mg",
        "Pre-diabetes (Impaired Fasting Glucose, FBS 118 mg/dL)",
      ],
      pastSurgeries: [
        "Appendectomy (Laparoscopic) — 2018 at Apollo Hospital",
      ],
      currentMedications: [
        "Tab. Amlodipine 5mg — 1 tablet once daily (Morning)",
        "Tab. Paracetamol 500mg — SOS for acute headache",
        "Cap. Vitamin D3 60,000 IU — Once weekly",
      ],
      allergies: [
        "Sulfa Drugs (Causes mild cutaneous erythema)",
        "No known food or seasonal allergies",
      ],
      hpiDetails: {
        site: "Head (diffuse)",
        onset: "Gradual, 1 week ago",
        character: "Dull, throbbing",
        timing: "Worse in the morning",
        severity: 6,
        associatedSymptoms: ["Dizziness", "Insomnia"],
        exacerbatingFactors: ["Stress", "Lack of sleep"],
        relievingFactors: ["Rest", "Paracetamol"],
      },
      pastMedicalHistory: [
        {
          condition: "Essential Hypertension",
          duration: "2 years",
          currentMedications: ["Amlodipine 5mg OD"],
          status: "active",
        },
      ],
      pastSurgicalHistory: [
        {
          procedure: "Appendectomy (Laparoscopic)",
          year: "2018",
        },
      ],
      drugHistory: [
        { name: "Amlodipine", dose: "5mg", frequency: "OD", duration: "2 years" },
        { name: "Paracetamol", dose: "500mg", frequency: "SOS", duration: "5 days" },
      ],
      allergyHistory: [
        { allergen: "Sulfa Drugs", reaction: "Skin rash / erythema", severity: "mild" },
      ],
      familyHistory: [
        { relation: "Father", condition: "Hypertension" },
        { relation: "Mother", condition: "Type 2 Diabetes" },
      ],
      personalHistory: {
        diet: "Vegetarian",
        sleep: "Disturbed, 4-5 hours",
        exercise: "Occasional walking",
        smoking: "Never",
        alcohol: "Social, rare",
        occupation: "Software Engineer",
      },
    },
    clinicalSummary: {
      generatedText:
        "35-year-old male software engineer presents with moderate headache and dizziness for 1 week, worse in mornings. Known hypertensive on Amlodipine 5mg for 2 years. Associated insomnia for several days. Family history of hypertension (father) and diabetes (mother). No red flags identified. Likely hypertension-related headache. Recommend BP monitoring, sleep hygiene counseling, and review of antihypertensive dosage.",
      patientSummary:
        "आरव जी, आपको 1 हफ्ते से सिर दर्द और चक्कर आ रहे हैं। आपका BP पहले से है और दवा चल रही है। नींद भी ठीक नहीं आ रही। डॉक्टर आपकी रिपोर्ट देखेंगे।",
      redFlags: [],
      soapNote: {
        subjective: "35M software engineer presents with 1-week history of dull, throbbing morning headaches associated with lightheadedness and poor sleep (4-5 hrs). Known hypertensive on Amlodipine 5mg for 2 years.",
        objective: "BP: 148/94 mmHg (Stage 1 Hypertension), Pulse: 78 bpm, SpO2: 99%, BMI: 26.4 kg/m² (Overweight). CVS: S1/S2 audible, no murmurs. Lungs: Clear bilaterally. Fasting Blood Sugar: 118 mg/dL.",
        assessment: "1. Sub-optimally controlled Essential Hypertension (Stage 1)\n2. Tension-type cephalalgia secondary to hypertension & sleep disturbance\n3. Pre-diabetes (Impaired Fasting Glucose)",
        plan: "1. Review antihypertensive dosage and maintain daily morning BP log\n2. Order baseline investigations: CBC, Lipid Profile, FBS, HbA1c, Serum Creatinine\n3. Recommend DASH low-sodium diet and clinical yoga (Vrikshasana, Bhujangasana)\n4. Follow-up in 2 weeks",
      },
      abnormalValues: [],
      abnormalValues: [],
      drugInteractions: [],
      generatedAt: daysAgo(30),
    },
  });

  // ─── 4. Create Completed Session 2 (15 days ago) ──────────────

  const session2 = await Session.create({
    patient: patient._id,
    sessionType: "allopathic",
    language: "hi",
    status: "completed",
    completionPercentage: 100,
    currentCategory: "closing",
    completedAt: daysAgo(15),
    createdAt: daysAgo(15),
    conversation: [
      {
        role: "ai",
        content: JSON.stringify({
          question: "नमस्ते आरव जी! आज आपको क्या तकलीफ है?",
          options: ["Follow-up visit", "नई तकलीफ है", "दवा के बारे में पूछना है", "रिपोर्ट दिखानी है"],
          category: "chief_complaint",
          completionPercentage: 10,
        }),
        category: "chief_complaint",
        timestamp: daysAgo(15),
      },
      {
        role: "patient",
        content: "Follow-up visit — पिछली बार BP की दवा बदली थी, उसके बाद की स्थिति बताना है",
        inputMode: "text",
        category: "chief_complaint",
        timestamp: daysAgo(15),
      },
      {
        role: "ai",
        content: JSON.stringify({
          question: "दवा बदलने के बाद सिर दर्द में कोई फर्क आया?",
          options: ["हाँ, काफी कम हो गया", "थोड़ा कम हुआ", "कोई फर्क नहीं पड़ा", "और बढ़ गया"],
          category: "hpi",
          completionPercentage: 35,
        }),
        category: "hpi",
        timestamp: daysAgo(15),
      },
      {
        role: "patient",
        content: "हाँ, काफी कम हो गया है। चक्कर भी नहीं आते अब",
        inputMode: "touch",
        category: "hpi",
        timestamp: daysAgo(15),
      },
      {
        role: "ai",
        content: JSON.stringify({
          question: "नींद कैसी आ रही है अब?",
          options: ["अच्छी नींद आती है (6-7 घंटे)", "थोड़ी सुधरी है", "अभी भी ठीक नहीं", "दवा से नींद आती है"],
          category: "hpi",
          completionPercentage: 55,
        }),
        category: "hpi",
        timestamp: daysAgo(15),
      },
      {
        role: "patient",
        content: "थोड़ी सुधरी है, 5-6 घंटे सो लेता हूँ",
        inputMode: "touch",
        category: "hpi",
        timestamp: daysAgo(15),
      },
      {
        role: "ai",
        content: JSON.stringify({
          question: "क्या blood sugar check करवाया? क्या रिपोर्ट लाए हैं?",
          options: ["हाँ, रिपोर्ट है", "नहीं करवाया", "करवाया पर रिपोर्ट नहीं लाया"],
          category: "past_medical",
          completionPercentage: 75,
        }),
        category: "past_medical",
        timestamp: daysAgo(15),
      },
      {
        role: "patient",
        content: "हाँ करवाया — Fasting sugar 118 mg/dL आई है",
        inputMode: "text",
        category: "past_medical",
        timestamp: daysAgo(15),
      },
      {
        role: "ai",
        content: JSON.stringify({
          question: "और कोई बात बताना चाहेंगे डॉक्टर को?",
          options: ["नहीं, बस इतना ही", "हाँ, कभी-कभी पैर सुन्न होते हैं", "हाँ, वजन बढ़ रहा है"],
          category: "closing",
          completionPercentage: 100,
        }),
        category: "closing",
        timestamp: daysAgo(15),
      },
      {
        role: "patient",
        content: "नहीं, बस इतना ही",
        inputMode: "touch",
        category: "closing",
        timestamp: daysAgo(15),
      },
    ],
    responses: [
      { questionId: "आज का मुख्य कारण / Reason for Visit", question: "नमस्ते आरव जी, आज आप फॉलो-अप के लिए आए हैं। अब सिर दर्द और चक्कर में कैसा महसूस हो रहा है?", answer: "सिर दर्द में काफी आराम है, चक्कर भी बंद हो गए हैं", timestamp: daysAgo(15) },
      { questionId: "नींद में सुधार / Sleep Quality", question: "आपकी नींद कैसी है अब?", answer: "सुधार है, अब 5-6 घंटे सो पाता हूँ", timestamp: daysAgo(15) },
      { questionId: "ब्लड टेस्ट / Lab Tests", question: "क्या आपने डॉक्टर द्वारा लिखा Fasting Blood Sugar टेस्ट करवाया?", answer: "हाँ करवाया — Fasting sugar 118 mg/dL आई है", timestamp: daysAgo(15) },
      { questionId: "दवा सेवन / Medication Compliance", question: "दवाइयाँ नियमित ले रहे हैं?", answer: "हाँ, Amlodipine 5mg नियमित ले रहा हूँ", timestamp: daysAgo(15) },
      { questionId: "अतिरिक्त लक्षण / Additional Concerns", question: "और कोई बात बताना चाहेंगे डॉक्टर को?", answer: "नहीं, बस इतना ही", timestamp: daysAgo(15) },
    ],
    clinicalHistory: {
      chiefComplaint: "Follow-up for hypertension & pre-diabetes management",
      duration: "Follow-up visit (2 weeks post-titration)",
      severity: "Mild (3/10)",
      symptoms: [
        "Headache significantly improved (reduced from 6/10 to 2/10)",
        "Dizziness and vertigo completely resolved",
        "Sleep duration improved to 5-6 hours uninterrupted",
        "Fasting blood sugar 118 mg/dL on laboratory check",
      ],
      existingConditions: [
        "Essential Hypertension (Controlled on Amlodipine 5mg OD)",
        "Pre-diabetes (Impaired Fasting Glucose, FBS 118 mg/dL)",
        "Vitamin D Deficiency (Under weekly supplementation)",
      ],
      pastSurgeries: [
        "Appendectomy (Laparoscopic) — 2018",
      ],
      currentMedications: [
        "Tab. Amlodipine 5mg — 1 tablet once daily (Morning)",
        "Tab. Metformin 500mg — 1 tablet twice daily (After meals)",
        "Cap. Vitamin D3 60,000 IU — Once weekly after breakfast",
      ],
      allergies: [
        "Sulfa Drugs (Mild cutaneous reaction)",
        "No known food or environmental allergies",
      ],
      hpiDetails: {
        onset: "Follow-up visit, 2 weeks after medication change",
        severity: 3,
        associatedSymptoms: ["Improved sleep", "No more dizziness"],
        relievingFactors: ["New medication dosage"],
      },
      pastMedicalHistory: [
        {
          condition: "Essential Hypertension",
          duration: "2 years",
          currentMedications: ["Amlodipine 5mg OD"],
          status: "active",
        },
        {
          condition: "Pre-diabetes",
          duration: "Newly detected",
          currentMedications: [],
          status: "active",
        },
      ],
      pastSurgicalHistory: [
        {
          procedure: "Appendectomy (Laparoscopic)",
          year: "2018",
        },
      ],
      drugHistory: [
        { name: "Amlodipine", dose: "5mg", frequency: "OD", duration: "2 years" },
        { name: "Metformin", dose: "500mg", frequency: "BD", duration: "Starting" },
        { name: "Vitamin D3", dose: "60000 IU", frequency: "Weekly", duration: "6 weeks" },
      ],
      allergyHistory: [
        { allergen: "Sulfa Drugs", reaction: "Skin rash", severity: "mild" },
      ],
      personalHistory: {
        diet: "Vegetarian",
        sleep: "Improving, 5-6 hours",
        exercise: "Started morning walks",
        smoking: "Never",
        alcohol: "Stopped",
        occupation: "Software Engineer",
      },
    },
    clinicalSummary: {
      generatedText:
        "Follow-up visit. 35M known hypertensive. Reports significant improvement in headache and dizziness after medication adjustment. Sleep improving (5-6 hours from 4-5). Fasting blood sugar 118 mg/dL — impaired fasting glucose, pre-diabetic range. Recommend initiating lifestyle modifications, Metformin consideration, and repeat FBS in 4 weeks. Continue Amlodipine 5mg OD.",
      patientSummary:
        "आरव जी, दवा बदलने से सिर दर्द और चक्कर में काफी सुधार हुआ है। आपकी fasting sugar 118 आई है जो थोड़ी ज्यादा है (pre-diabetic)। डॉक्टर आपको आगे की सलाह देंगे।",
      redFlags: [],
      soapNote: {
        subjective: "35M follow-up for hypertension and lab test review. Patient reports near-complete resolution of dizziness. Occasional mild tension headache only. Sleep has improved from 4 to 5.5 hours. Compliant with morning Amlodipine 5mg.",
        objective: "BP: 128/82 mmHg (Target reached), Pulse: 72 bpm regular, Weight: 77.4 kg. Fasting blood sugar: 118 mg/dL (Impaired fasting glucose), HbA1c: 5.8%.",
        assessment: "1. Essential Hypertension — Well controlled on Amlodipine 5mg OD\n2. Pre-diabetes (Impaired Fasting Glucose, FBS 118 mg/dL, HbA1c 5.8%)\n3. Resolving tension headache",
        plan: "1. Continue Tab. Amlodipine 5mg OD morning\n2. Initiate Tab. Metformin 500mg BD after meals to halt pre-diabetes progression\n3. Continue weekly Cholecalciferol (Vitamin D3) 60,000 IU\n4. Daily 30-min walk + prescribed Yoga (Tree Pose, Cobra Pose)\n5. Repeat FBS, HbA1c, and Serum Creatinine in 4 weeks",
      },
      abnormalValues: [
        { test: "Fasting Blood Sugar", value: "118 mg/dL", concern: "Pre-diabetic range (100-125 mg/dL)" },
      ],
      drugInteractions: [],
      generatedAt: daysAgo(15),
    },
  });

  // ─── 5. Create an in-progress session (for live demo) ─────────

  const session3 = await Session.create({
    patient: patient._id,
    sessionType: "allopathic",
    language: "hi",
    status: "in_progress",
    completionPercentage: 0,
    currentCategory: "greeting",
    createdAt: new Date(),
    conversation: [],
    clinicalHistory: {
      chiefComplaint: "",
    },
  });

  // Link sessions to patient
  patient.sessions.push(session1._id, session2._id, session3._id);
  await patient.save();

  // ─── 6. Create Prescriptions ──────────────────────────────────

  console.log("Creating prescriptions...");

  const prescription1 = await Prescription.create({
    session: session1._id,
    patient: patient._id,
    doctor: doctor._id,
    diagnosis: "Essential Hypertension (Stage 1) with tension-type headache",
    medications: [
      {
        name: "Amlodipine",
        dosage: "5mg",
        frequency: "Once daily",
        duration: "30 days",
        timing: "Morning, before breakfast",
        instructions: "Take with a glass of water. Monitor BP daily.",
      },
      {
        name: "Paracetamol",
        dosage: "500mg",
        frequency: "As needed",
        duration: "5 days",
        timing: "When headache occurs",
        instructions: "Maximum 3 tablets per day. Do not exceed.",
      },
    ],
    investigations: ["Complete Blood Count (CBC)", "Lipid Profile", "Fasting Blood Sugar", "HbA1c", "Serum Creatinine"],
    advice: [
      "Reduce salt intake to less than 5g per day",
      "Practice 30 minutes of brisk walking daily",
      "Maintain sleep hygiene — avoid screens 1 hour before bed",
      "Monitor BP at home twice daily (morning and evening)",
      "Follow DASH diet for hypertension management",
    ],
    yogaPoses: [
      {
        name: "Tree Pose",
        sanskritName: "Vrikshasana",
        durationMinutes: 5,
        reps: "3 each side",
        timeOfDay: "Morning",
        instructions: "Stand on one leg, place the other foot on inner thigh. Raise arms overhead.",
        benefits: "Improves balance, strengthens legs, calms the mind",
      },
      {
        name: "Cobra Pose",
        sanskritName: "Bhujangasana",
        durationMinutes: 3,
        reps: "5 times",
        timeOfDay: "Morning",
        instructions: "Lie face down, place palms near shoulders, lift chest gently.",
        benefits: "Strengthens spine, opens chest, reduces stress",
      },
    ],
    followUpDate: daysAgo(15),
    notes: "Patient advised lifestyle modifications. Review in 2 weeks with blood reports.",
  });

  const prescription2 = await Prescription.create({
    session: session2._id,
    patient: patient._id,
    doctor: doctor._id,
    diagnosis: "Essential Hypertension (controlled) with Pre-diabetes (IFG)",
    medications: [
      {
        name: "Amlodipine",
        dosage: "5mg",
        frequency: "Once daily",
        duration: "Continued",
        timing: "Morning",
        instructions: "Continue as before. BP well controlled.",
      },
      {
        name: "Metformin",
        dosage: "500mg",
        frequency: "Twice daily",
        duration: "90 days",
        timing: "After breakfast and dinner",
        instructions: "Start with 500mg once daily for 1 week, then increase to twice daily. Take with food to reduce GI upset.",
      },
      {
        name: "Cholecalciferol (Vitamin D3)",
        dosage: "60000 IU",
        frequency: "Once weekly",
        duration: "8 weeks",
        timing: "After breakfast (any day)",
        instructions: "Take with a fatty meal for better absorption.",
      },
    ],
    investigations: ["Fasting Blood Sugar (repeat in 4 weeks)", "HbA1c", "Vitamin D levels", "Thyroid Profile (TSH)"],
    advice: [
      "Continue daily morning walks — increase to 45 minutes",
      "Low glycemic index diet — avoid white rice, maida, sugary drinks",
      "Weight reduction target: 3 kg in next 3 months",
      "Continue BP monitoring twice daily",
      "Practice yoga poses prescribed below for stress management",
    ],
    yogaPoses: [
      {
        name: "Tree Pose",
        sanskritName: "Vrikshasana",
        durationMinutes: 5,
        reps: "3 each side",
        timeOfDay: "Morning",
      },
      {
        name: "Cobra Pose",
        sanskritName: "Bhujangasana",
        durationMinutes: 3,
        reps: "5 times",
        timeOfDay: "Morning",
      },
      {
        name: "Seated Forward Bend",
        sanskritName: "Paschimottanasana",
        durationMinutes: 5,
        reps: "Hold 30 seconds x 4",
        timeOfDay: "Evening",
        instructions: "Sit with legs extended, reach for toes, hold gently.",
        benefits: "Stretches hamstrings, calms nervous system, improves digestion",
      },
    ],
    followUpDate: daysFromNow(15),
    notes: "Pre-diabetes detected. Metformin initiated. Vitamin D supplementation started. Review in 4 weeks with repeat FBS and HbA1c.",
  });

  // Link prescriptions to sessions
  session1.prescription = prescription1._id;
  await session1.save();
  session2.prescription = prescription2._id;
  await session2.save();

  // Add prescription data to patient medical history
  patient.medicalHistory.prescriptions.push(
    {
      prescriptionId: prescription1._id,
      sessionId: session1._id,
      date: daysAgo(30),
      doctorName: "Dr. Priya Mehta",
      specialization: "General Medicine",
      diagnosis: "Essential Hypertension with tension headache",
      medications: prescription1.medications,
      investigations: prescription1.investigations,
      advice: prescription1.advice,
      yogaPoses: prescription1.yogaPoses,
      followUpDate: daysAgo(15),
      source: "prescription",
    },
    {
      prescriptionId: prescription2._id,
      sessionId: session2._id,
      date: daysAgo(15),
      doctorName: "Dr. Priya Mehta",
      specialization: "General Medicine",
      diagnosis: "Hypertension (controlled) + Pre-diabetes",
      medications: prescription2.medications,
      investigations: prescription2.investigations,
      advice: prescription2.advice,
      yogaPoses: prescription2.yogaPoses,
      followUpDate: daysFromNow(15),
      source: "prescription",
    },
  );

  // Add symptom interview data
  patient.medicalHistory.symptomInterviews.push(
    {
      sessionId: session1._id,
      date: daysAgo(30),
      chiefComplaint: "Headache with dizziness",
      symptoms: ["Headache", "Dizziness", "Insomnia"],
      duration: "1 week",
      severity: 6,
      interviewQA: [
        { question: "आपको क्या तकलीफ है?", answer: "सिर में दर्द और चक्कर" },
        { question: "कब से है?", answer: "1 हफ्ते से" },
        { question: "कितना तेज है?", answer: "मध्यम, काम में दिक्कत" },
        { question: "पहले से कोई बीमारी?", answer: "BP 2 साल से" },
        { question: "कुछ और बताना है?", answer: "नींद ठीक नहीं आती" },
      ],
      source: "interview",
    },
    {
      sessionId: session2._id,
      date: daysAgo(15),
      chiefComplaint: "Follow-up for BP medication adjustment",
      symptoms: ["Improved headache", "Blood sugar 118 (pre-diabetic)"],
      duration: "Follow-up",
      severity: 3,
      interviewQA: [
        { question: "आज क्या तकलीफ है?", answer: "Follow-up visit" },
        { question: "सिर दर्द में फर्क?", answer: "काफी कम हो गया" },
        { question: "नींद कैसी?", answer: "5-6 घंटे, सुधरी है" },
        { question: "Blood sugar check?", answer: "Fasting 118 mg/dL" },
      ],
      source: "interview",
    },
  );

  // Add an uploaded document (OCR-processed prescription from another hospital)
  patient.medicalHistory.uploadedDocuments.push({
    docId: new mongoose.Types.ObjectId(),
    date: daysAgo(60),
    type: "prescription",
    hospitalName: "Safdarjung Hospital, Delhi",
    diagnoses: ["Essential Hypertension", "Vitamin D Deficiency"],
    medications: [
      { name: "Amlodipine", dosage: "2.5mg", frequency: "Once daily", duration: "30 days", timing: "Morning" },
      { name: "Vitamin D3", dosage: "60000 IU", frequency: "Once weekly", duration: "6 weeks", timing: "After meals" },
    ],
    labResults: [
      { testName: "Blood Pressure", value: "148/94", unit: "mmHg", referenceRange: "< 130/85", isAbnormal: true },
      { testName: "Vitamin D", value: "12", unit: "ng/mL", referenceRange: "30-100", isAbnormal: true },
      { testName: "Fasting Blood Sugar", value: "105", unit: "mg/dL", referenceRange: "70-100", isAbnormal: true },
      { testName: "HbA1c", value: "5.8", unit: "%", referenceRange: "< 5.7", isAbnormal: true },
    ],
    rawText: "Dr. R.K. Verma, Safdarjung Hospital\nPatient: Aarav Sharma, 35M\nBP: 148/94 mmHg\nDx: Essential Hypertension, Vitamin D Deficiency\nRx: Tab Amlodipine 2.5mg OD morning\n    Cap Vitamin D3 60000 IU weekly x 6 weeks\nAdvice: Low salt diet, exercise, follow-up in 1 month",
    source: "document",
  });

  await patient.save();

  // ─── 7. Create OPD Queue & Appointments for Today and History ───────

  console.log("Creating OPD queue & appointments for today and history...");

  const today = new Date();

  // 1. Aarav Sharma — IN CONSULTATION TODAY (Token 1)
  await Appointment.create({
    patient: patient._id,
    doctor: doctor._id,
    session: session2._id,
    tokenNumber: 1,
    status: "in_progress",
    reason: "Hypertension & dizziness follow-up — BP reading 148/94",
    scheduledDate: today,
    preferredTimeSlot: "morning",
  });

  // Aarav Sharma — Past completed appointment (30 days ago)
  await Appointment.create({
    patient: patient._id,
    doctor: doctor._id,
    session: session1._id,
    tokenNumber: 7,
    status: "completed",
    reason: "Headache and dizziness — new consultation",
    scheduledDate: daysAgo(30),
    preferredTimeSlot: "morning",
    doctorNotes: "BP medication reviewed. Investigations ordered. Follow-up in 2 weeks.",
    completedAt: daysAgo(30),
  });

  // Aarav Sharma — Past completed follow-up (15 days ago)
  await Appointment.create({
    patient: patient._id,
    doctor: doctor._id,
    session: session2._id,
    tokenNumber: 3,
    status: "completed",
    reason: "Follow-up — BP medication review and blood reports",
    scheduledDate: daysAgo(15),
    preferredTimeSlot: "morning",
    doctorNotes: "BP well controlled. Pre-diabetes detected. Metformin started. Next follow-up in 4 weeks.",
    completedAt: daysAgo(15),
  });

  // Aarav Sharma — Future follow-up (15 days from now)
  await Appointment.create({
    patient: patient._id,
    doctor: doctor._id,
    tokenNumber: 8,
    status: "booked",
    reason: "Follow-up — repeat FBS, HbA1c, Vitamin D levels",
    scheduledDate: daysFromNow(15),
    preferredTimeSlot: "morning",
  });

  // 2. Sunita Devi (48F) — WAITING TODAY (Token 2)
  const sunita = await Patient.create({
    name: "Sunita Devi",
    phone: "9812345678",
    abhaId: "98765432109876",
    preferredLanguage: "hi",
    age: 48,
    gender: "Female",
    password: "demo1234",
    height: 158,
    weight: 68,
    bmi: 27.2,
  });

  const sunitaSession = await Session.create({
    patient: sunita._id,
    sessionType: "allopathic",
    language: "hi",
    status: "completed",
    completionPercentage: 100,
    responses: [
      { questionId: "मुख्य शिकायत / Chief Complaint", question: "नमस्ते सुनीता जी, आज आपको क्या परेशानी है?", answer: "दोनों घुटनों में पिछले 3 हफ्तों से काफी दर्द और अकड़न है।", timestamp: today },
      { questionId: "अवधि और समय / Duration & Timing", question: "यह दर्द कब से है और किस समय अधिक होता है?", answer: "लगभग 3 हफ्ते से है, सुबह उठने पर और सीढ़ियां चढ़ते समय ज्यादा होता है।", timestamp: today },
      { questionId: "तीव्रता / Severity", question: "दर्द कितना तेज रहता है? चलने-फिरने में कितनी परेशानी होती है?", answer: "मध्यम दर्द (5/10), सीढ़ियां चढ़ने-उतरने में सहारा लेना पड़ता है।", timestamp: today },
      { questionId: "पिछली बीमारियां / Medical History", question: "क्या पहले से कोई और बीमारी है?", answer: "1 साल से हल्का आर्थराइटिस बताया था डॉक्टर ने, और कोई बड़ी बीमारी नहीं है।", timestamp: today },
      { questionId: "दवाइयां / Current Medications", question: "क्या कोई दर्द की दवा या सप्लीमेंट ले रहे हैं?", answer: "कभी-कभी दर्द में Paracetamol ले लेती हूँ और एक कैल्शियम की गोली।", timestamp: today },
      { questionId: "एलर्जी / Allergies", question: "क्या किसी दवा या खाने से कोई एलर्जी है?", answer: "नहीं, किसी दवा से कोई एलर्जी नहीं है।", timestamp: today },
    ],
    clinicalHistory: {
      chiefComplaint: "Bilateral knee joint pain and morning stiffness for 3 weeks",
      duration: "3 weeks",
      severity: "Moderate (5/10)",
      symptoms: [
        "Bilateral knee joint pain (worse on weight bearing)",
        "Morning stiffness in knees lasting ~20 minutes",
        "Difficulty climbing stairs and squatting",
        "Mild crepitus on knee flexion and extension",
      ],
      existingConditions: [
        "Mild Primary Osteoarthritis (Bilateral knees) — 1 year",
        "Mild Menopausal Osteopenia",
      ],
      pastSurgeries: [
        "Tubal Ligation (1998 at District Hospital)",
      ],
      currentMedications: [
        "Tab. Paracetamol 650mg — SOS for joint pain",
        "Cap. Calcium Carbonate 500mg + Vitamin D3 — Once daily",
      ],
      allergies: [
        "No known drug or environmental allergies",
      ],
      hpiDetails: {
        site: "Bilateral Knee Joints",
        onset: "3 weeks ago, gradual",
        character: "Dull aching with stiffness",
        timing: "Worse in the morning and after exertion",
        severity: 5,
        associatedSymptoms: ["Difficulty climbing stairs", "Morning stiffness ~20 min", "Mild knee crepitus"],
        exacerbatingFactors: ["Climbing stairs", "Prolonged standing", "Squatting"],
        relievingFactors: ["Rest", "Warm fomentation", "Paracetamol"],
      },
      pastMedicalHistory: [
        { condition: "Primary Osteoarthritis (Bilateral knees)", duration: "1 year", currentMedications: ["Calcium D3"], status: "active" },
      ],
      pastSurgicalHistory: [
        { procedure: "Tubal Ligation", year: "1998" },
      ],
      drugHistory: [
        { name: "Paracetamol", dose: "650mg", frequency: "SOS", duration: "3 weeks" },
        { name: "Calcium + Vit D3", dose: "500mg", frequency: "OD", duration: "6 months" },
      ],
      allergyHistory: [],
      familyHistory: [
        { relation: "Mother", condition: "Osteoarthritis & Joint replacement" },
      ],
    },
    clinicalSummary: {
      generatedText: "48F presents with 3-week history of bilateral knee pain and early morning stiffness lasting 20 minutes. Worse on weight-bearing and stairs. Consistent with degenerative joint disease / osteoarthritis. Recommend AP/Lateral knee X-rays, NSAID for pain relief, quadriceps strengthening, and calcium-vitamin D supplementation.",
      patientSummary: "सुनीता जी, आपके दोनों घुटनों में दर्द और अकड़न की समस्या है। डॉक्टर आपके घुटनों का एक्स-रे और दर्द कम करने की दवा लिखेंगे।",
      redFlags: [],
      soapNote: {
        subjective: "48F presents with bilateral knee pain for 3 weeks, aggravated by stair climbing and prolonged standing. Morning joint stiffness lasts ~20 mins. Occasional crepitus. No night pain, fever, or swelling.",
        objective: "Vitals stable. BP: 124/80 mmHg, BMI: 27.2 kg/m² (Overweight). Knees: Mild tenderness along medial joint lines bilaterally. Mild crepitus, no visible effusion. Active ROM intact.",
        assessment: "1. Degenerative Joint Disease / Bilateral Knee Osteoarthritis (Kellgren-Lawrence Grade 1-2)\n2. Mechanical joint stiffness secondary to cartilage wear and overweight BMI",
        plan: "1. AP and Lateral weight-bearing X-rays of both knees\n2. Tab. Aceclofenac 100mg + Paracetamol 325mg BD for 5 days after food\n3. Quadriceps strengthening exercises & Physiotherapy referral\n4. Calcium Carbonate 500mg + Vitamin D3 1 tablet daily\n5. Weight management & low-impact exercise counseling",
      },
      generatedAt: today,
    },
  });

  await Appointment.create({
    patient: sunita._id,
    doctor: doctor._id,
    session: sunitaSession._id,
    tokenNumber: 2,
    status: "booked",
    reason: "Bilateral knee joint pain & morning stiffness",
    scheduledDate: today,
    preferredTimeSlot: "morning",
  });

  // 3. Rajesh Kumar (56M) — RED FLAG / CARDIAC RISK TODAY (Token 3)
  const rajesh = await Patient.create({
    name: "Rajesh Kumar",
    phone: "9876501234",
    abhaId: "55443322110099",
    preferredLanguage: "en",
    age: 56,
    gender: "Male",
    password: "demo1234",
    height: 170,
    weight: 84,
    bmi: 29.1,
  });

  const rajeshSession = await Session.create({
    patient: rajesh._id,
    sessionType: "allopathic",
    language: "en",
    status: "completed",
    completionPercentage: 100,
    responses: [
      { questionId: "Chief Complaint", question: "Hello Mr. Rajesh, what brings you to the clinic today?", answer: "I am having severe chest tightness and heaviness when walking even 100 meters, radiating to my left shoulder.", timestamp: today },
      { questionId: "Onset & Duration", question: "When did this start and how long do episodes last?", answer: "Started 5 days ago. Lasts 5 to 10 minutes and subsides when I sit down and rest.", timestamp: today },
      { questionId: "Severity Level", question: "How intense is the tightness on a scale of 1 to 10?", answer: "Around 7/10. It feels like a heavy weight on my chest, with cold sweat and breathlessness.", timestamp: today },
      { questionId: "Past Medical History", question: "Do you have high cholesterol, diabetes, or smoking history?", answer: "High cholesterol for 3 years. I have been smoking 1 pack per day for 20 years.", timestamp: today },
      { questionId: "Current Medications", question: "Are you currently taking any prescription medications?", answer: "Tab. Atorvastatin 20mg at night, but often miss doses.", timestamp: today },
      { questionId: "Allergies", question: "Any known drug allergies or sensitivities?", answer: "Aspirin gives me severe stomach irritation and acidity.", timestamp: today },
    ],
    clinicalHistory: {
      chiefComplaint: "Substernal chest tightness on mild exertion radiating to left arm",
      duration: "5 days (Crescendo)",
      severity: "Severe (7/10)",
      symptoms: [
        "Substernal crushing chest tightness on mild exertion (walking 100m)",
        "Radiation of discomfort to left shoulder and arm",
        "Associated diaphoresis (cold sweats) during episodes",
        "Exertional dyspnea (shortness of breath)",
        "Resting tachycardia (Pulse 104 bpm)",
      ],
      existingConditions: [
        "Dyslipidemia (Hypercholesterolemia) — 3 years",
        "Chronic Tobacco Dependence (15 pack-years smoker)",
        "Overweight (BMI 29.1)",
      ],
      pastSurgeries: [
        "None reported",
      ],
      currentMedications: [
        "Tab. Atorvastatin 20mg — 1 tablet at night (irregular adherence)",
      ],
      allergies: [
        "Aspirin / NSAIDs (Severe epigastric pain and gastric burning)",
      ],
      hpiDetails: {
        site: "Retrosternal / Substernal",
        onset: "5 days ago",
        character: "Crushing, compressive heaviness",
        timing: "Triggered by minimal physical exertion",
        severity: 7,
        associatedSymptoms: ["Shortness of breath on walking 100 meters", "Diaphoresis / cold sweats", "Left shoulder radiation"],
        exacerbatingFactors: ["Physical exertion", "Climbing stairs", "Cold air"],
        relievingFactors: ["Cessation of activity / rest after 5-10 minutes"],
      },
      pastMedicalHistory: [
        { condition: "Dyslipidemia", duration: "3 years", currentMedications: ["Atorvastatin 20mg"], status: "active" },
        { condition: "Smoker (15 pack-years)", duration: "20 years", status: "active" },
      ],
      pastSurgicalHistory: [],
      drugHistory: [
        { name: "Atorvastatin", dose: "20mg", frequency: "OD (Night)", duration: "3 years" },
      ],
      allergyHistory: [
        { allergen: "Aspirin", reaction: "Severe epigastric gastritis / erosive dyspepsia", severity: "moderate" },
      ],
      familyHistory: [
        { relation: "Father", condition: "Myocardial Infarction at age 52" },
      ],
    },
    clinicalSummary: {
      generatedText: "56M chronic smoker presenting with acute exertional retrosternal chest discomfort radiating to left arm, associated with diaphoresis and breathlessness. HIGH RISK: Suspected unstable angina / Acute Coronary Syndrome. URGENT 12-lead ECG, Troponin-I, and immediate cardiology evaluation indicated.",
      patientSummary: "Mr. Rajesh, your chest tightness and breathing discomfort require urgent medical evaluation. The doctor will immediately perform an ECG and cardiac tests.",
      redFlags: [
        "⚠️ EXERTIONAL CHEST TIGHTNESS — High suspicion of coronary ischemia",
        "⚠️ DIAPHORESIS & BREATHLESSNESS — Rule out Acute Coronary Syndrome",
        "⚠️ ELEVATED RESTING PULSE (104 bpm)",
      ],
      soapNote: {
        subjective: "56M chronic smoker (20 pack-years) presents with 5-day history of crescendo substernal chest tightness radiating to left arm on mild exertion (walking 100m). Episodes last 5-10 mins, relieved by rest. Associated with cold sweating and breathlessness. Known dyslipidemia with poor statin compliance.",
        objective: "Vitals: BP 154/96 mmHg, Pulse: 104 bpm regular, SpO2: 96% on room air, BMI: 29.1 kg/m². CVS: S1/S2 audible, no audible gallop or murmur. Lungs: Clear, no rales. ECG pending.",
        assessment: "1. High Probability Acute Coronary Syndrome (ACS) / Crescendo Unstable Angina — EMERGENCY PRIORITY\n2. Stage 2 Hypertension with resting tachycardia\n3. Dyslipidemia and severe atherosclerotic cardiovascular disease (ASCVD) risk profile",
        plan: "1. STAT 12-lead ECG and High-Sensitivity Troponin-I assay\n2. Sublingual Sorbitrate (Isosorbide Dinitrate) 5mg SOS under medical supervision\n3. Clopidogrel 300mg loading dose (caution: patient has Aspirin-induced gastritis)\n4. Immediate cardiology evaluation and coronary angiography workup\n5. Strict bed rest and continuous cardiac telemetry monitoring",
      },
      generatedAt: today,
    },
  });

  await Appointment.create({
    patient: rajesh._id,
    doctor: doctor._id,
    session: rajeshSession._id,
    tokenNumber: 3,
    status: "booked",
    reason: "Exertional chest tightness & shortness of breath (URGENT)",
    scheduledDate: today,
    preferredTimeSlot: "morning",
  });

  // 4. Priya Nair (29F) — WAITING TODAY (Token 4)
  const priyaNair = await Patient.create({
    name: "Priya Nair",
    phone: "9898765432",
    abhaId: "44332211009988",
    preferredLanguage: "en",
    age: 29,
    gender: "Female",
    password: "demo1234",
    height: 162,
    weight: 55,
    bmi: 21.0,
  });

  const priyaSession = await Session.create({
    patient: priyaNair._id,
    sessionType: "allopathic",
    language: "en",
    status: "completed",
    completionPercentage: 100,
    responses: [
      { questionId: "Chief Complaint", question: "Hello Priya, what symptoms have you been experiencing?", answer: "Severe burning sensation in my upper stomach and chest, acid taste in my mouth, especially after meals and when lying down.", timestamp: today },
      { questionId: "Duration & Frequency", question: "How long have you had this heartburn and acidity?", answer: "About 2 weeks, getting progressively worse after late night dinners at work.", timestamp: today },
      { questionId: "Severity Level", question: "How severe is the burning sensation?", answer: "Moderate (4/10), very distracting during work and wakes me up at night.", timestamp: today },
      { questionId: "Past Medical History", question: "Any past medical issues or previous digestive problems?", answer: "Occasional gastritis during college exam stress, otherwise no chronic illnesses.", timestamp: today },
      { questionId: "Current Medications", question: "Have you taken any antacids or over-the-counter tablets?", answer: "Gelusil liquid syrup occasionally, gives temporary relief for 30 minutes.", timestamp: today },
      { questionId: "Allergies", question: "Any known drug or food allergies?", answer: "No known drug or food allergies.", timestamp: today },
    ],
    clinicalHistory: {
      chiefComplaint: "Severe epigastric burning, nausea, and acid reflux after meals",
      duration: "2 weeks",
      severity: "Moderate (4/10)",
      symptoms: [
        "Epigastric retrosternal burning (heartburn)",
        "Acid regurgitation / sour taste in mouth",
        "Post-prandial bloating & early satiety",
        "Nocturnal coughing and reflux while supine",
      ],
      existingConditions: [
        "Recurrent Dyspepsia / Stress Gastritis (History)",
      ],
      pastSurgeries: [
        "None reported",
      ],
      currentMedications: [
        "Antacid Gel (Gelusil) 10ml SOS — temporary symptomatic relief",
      ],
      allergies: [
        "No known drug or environmental allergies",
      ],
      hpiDetails: {
        site: "Epigastrium & retrosternal area",
        onset: "2 weeks ago",
        character: "Burning, acidic sensation",
        timing: "Worse 30-60 min post meals and at night when lying down",
        severity: 4,
        associatedSymptoms: ["Acid taste in mouth", "Post-prandial fullness", "Nocturnal reflux"],
        exacerbatingFactors: ["Late night meals", "Spicy food", "Coffee / caffeine", "Lying down after dinner"],
        relievingFactors: ["Antacid syrup", "Drinking cold milk", "Sitting upright"],
      },
      pastMedicalHistory: [
        { condition: "Stress Gastritis", duration: "Occasional over 2 years", status: "active" },
      ],
      pastSurgicalHistory: [],
      drugHistory: [
        { name: "Gelusil Syrup", dose: "10ml", frequency: "SOS", duration: "2 weeks" },
      ],
      allergyHistory: [],
    },
    clinicalSummary: {
      generatedText: "29F software engineer presenting with reflux esophagitis / GERD symptoms and epigastric burning exacerbated by irregular meal timings and stress. Recommend oral PPI (Pantoprazole 40mg), dietary counseling, and avoidance of late-night meals.",
      patientSummary: "Priya, your symptoms indicate acid reflux (GERD). Dr. Priya Mehta will prescribe an antacid and dietary recommendations.",
      redFlags: [],
      soapNote: {
        subjective: "29F software professional presents with 2-week history of worsening retrosternal pyrosis and acid regurgitation worse after evening meals and upon reclining. Wakes with sour fluid in throat. No dysphagia, odynophagia, hematemesis, or unintentional weight loss.",
        objective: "Vitals: BP 118/76 mmHg, Pulse 76 bpm, BMI 21.0 kg/m² (Normal). Abdomen: Soft, mild epigastric tenderness on deep palpation, no guarding, normal bowel sounds. Oral cavity clear.",
        assessment: "1. Gastroesophageal Reflux Disease (GERD) with reflux esophagitis\n2. Functional Non-Ulcer Dyspepsia exacerbated by irregular meal timings and caffeine",
        plan: "1. Cap. Pantoprazole 40mg + Domperidone 30mg (Pan-D) once daily 30 minutes before breakfast for 14 days\n2. Syp. Sucralfate 10ml thrice daily 1 hour before meals for mucosal coating\n3. Lifestyle and dietary modifications: elevate head of bed by 15 cm, no food 3 hours before sleeping, avoid coffee, citrus, and fried items\n4. Review after 2 weeks",
      },
      generatedAt: today,
    },
  });

  await Appointment.create({
    patient: priyaNair._id,
    doctor: doctor._id,
    session: priyaSession._id,
    tokenNumber: 4,
    status: "booked",
    reason: "Epigastric burning & acid reflux",
    scheduledDate: today,
    preferredTimeSlot: "afternoon",
  });

  // 5. Mohammad Ali (63M) — COMPLETED TODAY (Token 5)
  const mohammadAli = await Patient.create({
    name: "Mohammad Ali",
    phone: "9834567890",
    abhaId: "77665544332211",
    preferredLanguage: "hi",
    age: 63,
    gender: "Male",
    password: "demo1234",
    height: 168,
    weight: 74,
    bmi: 26.2,
  });

  const aliSession = await Session.create({
    patient: mohammadAli._id,
    sessionType: "allopathic",
    language: "hi",
    status: "completed",
    completionPercentage: 100,
    responses: [
      { questionId: "आज का कारण / Reason for Visit", question: "नमस्ते अली साहब, आज आप किस जांच के लिए आए हैं?", answer: "डायबिटीज की 3 महीने वाली नियमित जांच के लिए आया हूँ, शुगर रिपोर्ट दिखाने।", timestamp: today },
      { questionId: "बीमारी की अवधि / Duration", question: "आपको शुगर की बीमारी कितने समय से है?", answer: "पिछले 5 साल से है, नियमित रूप से दवा लेता हूँ।", timestamp: today },
      { questionId: "लक्षण / Symptoms", question: "क्या कोई कमजोरी, पैर सुन्न होना या बार-बार पेशाब आने जैसी शिकायत है?", answer: "हल्की कमजोरी महसूस होती है शाम को, बाकी कोई बड़ी परेशानी नहीं है।", timestamp: today },
      { questionId: "पिछली बीमारियां / Past History", question: "शुगर के अलावा BP या दिल की कोई बीमारी?", answer: "हल्का BP भी रहता है कभी-कभी, 2 साल से।", timestamp: today },
      { questionId: "वर्तमान दवाइयां / Medications", question: "आप कौन-कौन सी दवाइयाँ रोज़ ले रहे हैं?", answer: "Metformin 1000mg दिन में दो बार और Glimepiride 1mg सुबह लेता हूँ।", timestamp: today },
      { questionId: "एलर्जी / Allergies", question: "किसी दवा से कोई साइड इफेक्ट या एलर्जी?", answer: "कोई एलर्जी नहीं है।", timestamp: today },
    ],
    clinicalHistory: {
      chiefComplaint: "Quarterly follow-up for Type 2 Diabetes & blood sugar review",
      duration: "5-year history (Routine 3-month review)",
      severity: "Controlled / Mild (2/10)",
      symptoms: [
        "Mild evening lethargy and fatigue",
        "Occasional nocturnal polyuria (1-2 times)",
        "No numbness, tingling, or paresthesias in feet",
        "No blurred vision or dizziness",
      ],
      existingConditions: [
        "Type 2 Diabetes Mellitus — 5 years on oral hypoglycemics",
        "Mild Borderline Hypertension — 2 years",
      ],
      pastSurgeries: [
        "Cataract extraction with IOL implant (Left Eye) — 2021",
      ],
      currentMedications: [
        "Tab. Metformin 1000mg — Twice daily after breakfast & dinner",
        "Tab. Glimepiride 1mg — Once daily 15 minutes before breakfast",
        "Tab. Telmisartan 40mg — Once daily in morning",
      ],
      allergies: [
        "No known drug or food allergies",
      ],
      hpiDetails: {
        site: "Systemic / Metabolic",
        onset: "5-year history of diabetes",
        character: "Chronic metabolic condition under management",
        timing: "Stable",
        severity: 2,
        associatedSymptoms: ["Mild evening fatigue"],
        exacerbatingFactors: ["Irregular carbohydrate intake", "Missed walking routines"],
        relievingFactors: ["Timely meals", "Regular medications"],
      },
      pastMedicalHistory: [
        { condition: "Type 2 Diabetes Mellitus", duration: "5 years", currentMedications: ["Metformin 1000mg BD", "Glimepiride 1mg OD"], status: "active" },
        { condition: "Hypertension", duration: "2 years", currentMedications: ["Telmisartan 40mg OD"], status: "active" },
      ],
      pastSurgicalHistory: [
        { procedure: "Cataract extraction with IOL implant (Left Eye)", year: "2021" },
      ],
      drugHistory: [
        { name: "Metformin", dose: "1000mg", frequency: "BD", duration: "5 years" },
        { name: "Glimepiride", dose: "1mg", frequency: "OD", duration: "3 years" },
        { name: "Telmisartan", dose: "40mg", frequency: "OD", duration: "2 years" },
      ],
      allergyHistory: [],
    },
    clinicalSummary: {
      generatedText: "63M known diabetic on oral hypoglycemics for 5 years. Fasting blood sugar 136 mg/dL, post-meal 184 mg/dL. Retinal and foot examination normal. Peripheral pulses palpable. Prescribed continuation of Metformin 1000mg BD and lifestyle modifications.",
      patientSummary: "अली साहब, आपकी शुगर रिपोर्ट ठीक है। दवा जारी रखें और 3 महीने बाद दोबारा HbA1c कराएं।",
      redFlags: [],
      soapNote: {
        subjective: "63M with 5-year history of T2DM on Metformin 1000mg BD + Glimepiride 1mg OD presents for quarterly follow-up. Reports good medication adherence. Occasional mild fatigue in evening. Denies polydipsia, polyphagia, visual disturbances, numbness, or non-healing foot sores.",
        objective: "Vitals: BP 130/82 mmHg, Pulse 74 bpm regular, BMI 26.2 kg/m². Labs: Fasting Blood Sugar: 136 mg/dL, Postprandial: 184 mg/dL, HbA1c: 7.2% (Fair control). Foot exam: Monofilament test normal (10/10 bilaterally), pedal pulses (DP/PT) 2+ bilateral.",
        assessment: "1. Type 2 Diabetes Mellitus — Fair glycemic control (HbA1c 7.2%)\n2. Controlled Essential Hypertension\n3. No clinical signs of diabetic peripheral neuropathy or retinopathy",
        plan: "1. Continue Tab. Metformin 1000mg BD after meals\n2. Continue Tab. Glimepiride 1mg OD before breakfast\n3. Continue Tab. Telmisartan 40mg OD morning\n4. Order fasting lipid profile, urine albumin-creatinine ratio (ACR), and serum creatinine\n5. Advise annual dilated fundus examination\n6. Follow-up in 3 months with repeat HbA1c",
      },
      generatedAt: today,
    },
  });

  await Prescription.create({
    session: aliSession._id,
    patient: mohammadAli._id,
    doctor: doctor._id,
    diagnosis: "Type 2 Diabetes Mellitus (Under fair glycemic control)",
    medications: [
      {
        name: "Metformin",
        dosage: "1000mg",
        frequency: "Twice daily",
        duration: "90 days",
        timing: "After meals",
        instructions: "Take with breakfast and dinner.",
      },
      {
        name: "Glimepiride",
        dosage: "1mg",
        frequency: "Once daily",
        duration: "90 days",
        timing: "Before breakfast",
        instructions: "Monitor for hypoglycemia symptoms.",
      },
    ],
    investigations: ["HbA1c in 3 months", "Lipid Profile", "Serum Creatinine"],
    advice: ["Daily 30-minute brisk walk", "Low-carb, high-fiber diet", "Daily diabetic foot inspection"],
    prescribedAt: today,
  });

  await Appointment.create({
    patient: mohammadAli._id,
    doctor: doctor._id,
    session: aliSession._id,
    tokenNumber: 5,
    status: "completed",
    reason: "Type 2 Diabetes follow-up & blood sugar review",
    scheduledDate: today,
    preferredTimeSlot: "morning",
    doctorNotes: "Blood sugar under fair control. Foot and retinal exam normal. Refilled 90 days Rx. Next review in 3 months.",
    completedAt: today,
  });

  // ─── 8. Create Health Tracker ─────────────────────────────────

  console.log("Creating health tracker with 30 days of data...");

  const healthReadings = [];

  for (let i = 30; i >= 0; i--) {
    const date = daysAgo(i);

    // Blood Pressure (trending down from ~148/94 to ~128/82)
    const systolic = 148 - Math.floor((30 - i) * 0.65) + randomBetween(-3, 3);
    const diastolic = 94 - Math.floor((30 - i) * 0.4) + randomBetween(-2, 2);
    healthReadings.push({
      type: "blood_pressure",
      value: systolic,
      secondaryValue: diastolic,
      unit: "mmHg",
      measuredAt: date,
      mealContext: "not_applicable",
      notes: i === 30 ? "Before starting new medication" : i === 0 ? "Current reading" : undefined,
    });

    // Blood Sugar (trending from ~118 to ~108 after Metformin)
    if (i % 3 === 0) {
      const sugar = i > 15
        ? 115 + randomBetween(-5, 8)
        : 108 + randomBetween(-4, 5);
      healthReadings.push({
        type: "blood_sugar",
        value: sugar,
        unit: "mg/dL",
        measuredAt: date,
        mealContext: "fasting",
      });
    }

    // Weight (slow decline from 78 to ~77)
    if (i % 7 === 0) {
      const weight = 78 - ((30 - i) / 30) * 1.2 + randomBetween(-3, 3) / 10;
      healthReadings.push({
        type: "weight",
        value: parseFloat(weight.toFixed(1)),
        unit: "kg",
        measuredAt: date,
        mealContext: "not_applicable",
      });
    }

    // Heart Rate (morning readings)
    if (i % 2 === 0) {
      healthReadings.push({
        type: "heart_rate",
        value: 72 + randomBetween(-5, 8),
        unit: "bpm",
        measuredAt: date,
        mealContext: "not_applicable",
      });
    }
  }

  await HealthTracker.create({
    patient: patient._id,
    healthReadings,
    medicineReminders: [
      {
        medicineName: "Amlodipine 5mg",
        dosage: "5mg",
        frequency: "once_daily",
        times: ["08:00"],
        startDate: daysAgo(30),
        isActive: true,
        notes: "Take before breakfast with water",
      },
      {
        medicineName: "Metformin 500mg",
        dosage: "500mg",
        frequency: "twice_daily",
        times: ["09:00", "21:00"],
        startDate: daysAgo(15),
        isActive: true,
        notes: "Take after meals to reduce stomach upset",
      },
      {
        medicineName: "Vitamin D3 60000 IU",
        dosage: "60000 IU",
        frequency: "weekly",
        times: ["09:00"],
        startDate: daysAgo(15),
        isActive: true,
        notes: "Take every Sunday after breakfast",
      },
    ],
    exerciseReminders: [
      {
        exerciseName: "Morning Walk",
        exerciseType: "walking",
        duration: 45,
        frequency: "daily",
        preferredTime: "06:00",
        isActive: true,
        notes: "Brisk walking in the park. Target: 5000 steps.",
      },
      {
        exerciseName: "Yoga (Vrikshasana + Bhujangasana)",
        exerciseType: "yoga",
        duration: 20,
        frequency: "daily",
        preferredTime: "06:45",
        isActive: true,
        notes: "After morning walk. Follow prescribed poses.",
      },
      {
        exerciseName: "Pranayama (Anulom Vilom)",
        exerciseType: "pranayama",
        duration: 10,
        frequency: "daily",
        preferredTime: "07:15",
        isActive: true,
        notes: "Alternate nostril breathing. Helps with BP and stress.",
      },
    ],
    medicineLogs: [],
    exerciseLogs: [],
  });

  // ─── Done ─────────────────────────────────────────────────────

  console.log("");
  console.log("============================================");
  console.log("  Demo data seeded successfully!");
  console.log("============================================");
  console.log("");
  console.log("Login credentials:");
  console.log("  Patient:");
  console.log("    ABHA ID:   1234-5678-9012-34");
  console.log("    Password:  demo1234");
  console.log("");
  console.log("  Doctor:");
  console.log("    Email:     priya@hospital.in");
  console.log("    Password:  doctor1234");
  console.log("");
  console.log("What was created:");
  console.log("  - Patient: Aarav Sharma (35M, Hypertension + Pre-diabetes)");
  console.log("  - Doctor: Dr. Priya Mehta (General Medicine, AIIMS Delhi)");
  console.log("  - 2 completed sessions with full Hindi AI conversations");
  console.log("  - 1 in-progress session (for live AI demo)");
  console.log("  - 2 prescriptions with medications, investigations, yoga poses");
  console.log("  - 3 appointments (2 past completed, 1 upcoming)");
  console.log("  - 30 days of health data (BP, sugar, weight, heart rate)");
  console.log("  - 3 medicine reminders + 3 exercise reminders");
  console.log("  - 1 OCR-processed document from Safdarjung Hospital");
  console.log("  - Cumulative diagnoses and active medications");
  console.log("============================================");
  console.log("");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
