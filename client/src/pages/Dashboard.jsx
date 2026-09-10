import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { 
  Activity, 
  Settings, 
  Clock, 
  Pill, 
  Camera, 
  CheckCircle2, 
  Calendar, 
  Plus, 
  ChevronRight 
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { getHealthDashboard, addExerciseLog } from "../api/health.js";
import { getPatientSessions, getPatientPrescriptions } from "../api/history.js";
import { getMyAppointments, getRecommendations } from "../api/care.js";
import { settleAll } from "../utils/async.js";
import LoadingState from "../components/ui/LoadingState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import HealthMetricCard from "../components/ui/HealthMetricCard.jsx";
import YogaPoseCheckerModal from "../components/yoga/YogaPoseCheckerModal.jsx";
import { mapPoseNameToKey } from "../services/pose/pose_definitions.js";
import {
  formatDate,
  formatReadingValue,
  languageLabel,
  sameId,
  todayKey,
} from "../utils/format.js";

const ACTIONS = [
  { to: "/chat", titleKey: "talk_to_ai", defaultTitle: "Start AI Health Chat", textKey: "chat_subtitle_short", defaultText: "Ask a clinical question" },
  { to: "/exercise", titleKey: "exercise_yoga", defaultTitle: "Exercise & Yoga Matrix", textKey: "exercise_desc", defaultText: "Daily to-do checklist & CV pose coach" },
  { to: "/history/new", titleKey: "record_history", defaultTitle: "Record Medical History", textKey: "record_history_desc", defaultText: "Answer questions by voice or text" },
  { to: "/documents", titleKey: "upload_documents", defaultTitle: "Upload Medical Document", textKey: "upload_docs_desc", defaultText: "Add a prescription or lab report" },
  { to: "/tracker", titleKey: "health_tracker", defaultTitle: "View Health Tracker", textKey: "tracker_desc", defaultText: "Blood pressure, sugar & vitals" },
  { to: "/reminders", titleKey: "reminders", defaultTitle: "Manage Reminders", textKey: "reminders_desc", defaultText: "Set custom medicine & lifestyle alarms" },
];

/**
 * Calculates daily caloric targets, macronutrient split, hydration,
 * and key micronutrients according to patient's height, weight, BMI, age & gender.
 */
function calculateNutrientNeeds(patient) {
  const height = Number(patient?.height);
  const weight = Number(patient?.weight);
  const age = Number(patient?.age) || 28;
  const gender = patient?.gender || "Male";

  if (!height || !weight || height <= 0 || weight <= 0) {
    return null;
  }

  const heightInMeters = height / 100;
  const bmi = Math.round((weight / (heightInMeters * heightInMeters)) * 10) / 10;

  let bmiCategory = "Normal Weight";
  let bmiCategoryKey = "normal_weight";
  let bmiColor = "#10b981"; // emerald
  let bmiBg = "#ecfdf5";
  let goalText = "Optimal Maintenance & Vitality";
  let goalKey = "goal_maintenance";

  if (bmi < 18.5) {
    bmiCategory = "Underweight";
    bmiCategoryKey = "underweight";
    bmiColor = "#0284c7"; // sky
    bmiBg = "#f0f9ff";
    goalText = "Calorie Surplus & Muscle Building";
    goalKey = "goal_surplus";
  } else if (bmi < 25) {
    bmiCategory = "Normal Weight";
    bmiCategoryKey = "normal_weight";
    bmiColor = "#10b981";
    bmiBg = "#ecfdf5";
    goalText = "Balanced Maintenance & Metabolic Health";
    goalKey = "goal_balanced";
  } else if (bmi < 30) {
    bmiCategory = "Overweight";
    bmiCategoryKey = "overweight";
    bmiColor = "#f59e0b"; // amber
    bmiBg = "#fffbeb";
    goalText = "Moderate Deficit & Active Fat Loss";
    goalKey = "goal_deficit";
  } else {
    bmiCategory = "Obese";
    bmiCategoryKey = "obese";
    bmiColor = "#ef4444"; // red
    bmiBg = "#fef2f2";
    goalText = "Metabolic Reset & Anti-Inflammatory Deficit";
    goalKey = "goal_reset";
  }

  // Mifflin-St Jeor Equation for Basal Metabolic Rate (BMR)
  let bmr = 10 * weight + 6.25 * height - 5 * age;
  if (gender.toLowerCase() === "female") {
    bmr -= 161;
  } else if (gender.toLowerCase() === "male") {
    bmr += 5;
  } else {
    bmr -= 78;
  }

  // Daily Caloric Target based on clinical goal
  let targetCalories;
  if (bmi < 18.5) {
    targetCalories = Math.round(bmr * 1.35 + 320);
  } else if (bmi < 25) {
    targetCalories = Math.round(bmr * 1.4);
  } else if (bmi < 30) {
    targetCalories = Math.round(bmr * 1.35 - 320);
  } else {
    targetCalories = Math.round(bmr * 1.3 - 480);
  }

  // Protein targets
  let proteinGrams;
  if (bmi < 18.5) {
    proteinGrams = Math.round(weight * 1.8);
  } else if (bmi < 25) {
    proteinGrams = Math.round(weight * 1.5);
  } else {
    proteinGrams = Math.round(weight * 1.6);
  }

  const proteinCalories = proteinGrams * 4;
  const fatCalories = Math.round(targetCalories * 0.28);
  const fatGrams = Math.round(fatCalories / 9);

  const carbCalories = Math.max(targetCalories - proteinCalories - fatCalories, 350);
  const carbGrams = Math.round(carbCalories / 4);

  const fiberGrams = Math.round((targetCalories / 1000) * 14);
  const waterLiters = Math.round(((weight * 35) / 1000) * 10) / 10;

  // Micronutrients customized to BMI
  let keyMicronutrients = [];
  if (bmi < 18.5) {
    keyMicronutrients = [
      { name: "Vitamin B12", target: "2.6 mcg", reason: "Energy metabolism and red blood cells" },
      { name: "Iron", target: "18 mg", reason: "Prevents fatigue & supports cellular respiration" },
      { name: "Zinc", target: "11 mg", reason: "Tissue synthesis & immune response" },
      { name: "Omega-3", target: "1,200 mg", reason: "Calorie density & joint health" },
    ];
  } else if (bmi < 25) {
    keyMicronutrients = [
      { name: "Vitamin D3", target: "1,000 IU", reason: "Bone architecture & immune balance" },
      { name: "Calcium", target: "1,000 mg", reason: "Neuromuscular signaling & bone density" },
      { name: "Magnesium", target: "380 mg", reason: "Cardiovascular rhythm & cellular energy" },
      { name: "Potassium", target: "3,200 mg", reason: "Electrolyte balance and vascular tone" },
    ];
  } else {
    keyMicronutrients = [
      { name: "Magnesium", target: "420 mg", reason: "Enhances insulin sensitivity & reduces tension" },
      { name: "Vitamin D3", target: "2,000 IU", reason: "Counteracts adiposity-related deficiency" },
      { name: "Omega-3 EPA/DHA", target: "1,500 mg", reason: "Triglyceride lowering & cardiac protection" },
      { name: "Antioxidants / Zinc", target: "15 mg", reason: "Combats metabolic stress & inflammation" },
    ];
  }

  return {
    bmi,
    bmiCategory,
    bmiCategoryKey,
    bmiColor,
    bmiBg,
    goalText,
    goalKey,
    bmr: Math.round(bmr),
    targetCalories,
    proteinGrams,
    proteinPct: Math.round((proteinCalories / targetCalories) * 100),
    fatGrams,
    fatPct: Math.round((fatCalories / targetCalories) * 100),
    carbGrams,
    carbPct: Math.round((carbCalories / targetCalories) * 100),
    fiberGrams,
    waterLiters,
    keyMicronutrients,
  };
}

export default function Dashboard() {
  const { patient } = useAuth();
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [partialError, setPartialError] = useState("");
  const [health, setHealth] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [yogaPoses, setYogaPoses] = useState([]);
  const [activePoseChecker, setActivePoseChecker] = useState(null);

  const today = todayKey();

  // Completed poses today (synced with localStorage & exercise page)
  const [completedPosesToday, setCompletedPosesToday] = useState(() => {
    try {
      const saved = localStorage.getItem(`yoga_completed_${today}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Taken medicines state
  const [takenMedicines, setTakenMedicines] = useState({});

  async function load() {
    setLoading(true);
    setError("");
    const { values, error: failure, allFailed } = await settleAll([
      getHealthDashboard(),
      getPatientSessions(),
      getPatientPrescriptions(),
      getMyAppointments(),
      getRecommendations(),
    ]);

    const [healthRes, sessionRes, rxRes, aptRes, recRes] = values;
    setHealth(healthRes?.data || null);
    setSessions(sessionRes?.data || []);
    setPrescriptions(rxRes?.data || []);
    setAppointments(aptRes?.data || []);

    // Yoga recommendations
    const recs = recRes?.data?.recommendations?.yoga || [];
    setYogaPoses(recs);

    setError(allFailed ? failure : "");
    setPartialError(!allFailed ? failure : "");
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Compute nutrition & calories based on patient height & weight
  const nutrientNeeds = useMemo(() => {
    return calculateNutrientNeeds(patient);
  }, [patient]);

  // Combine medicines from health reminders & latest prescription
  const activeMedicines = useMemo(() => {
    const fromReminders = (health?.activeMedicineReminders || []).map((m) => ({
      id: m._id,
      name: m.medicineName,
      dosage: m.dosage || "As advised",
      times: m.times || ["Morning"],
      instructions: m.instructions || "",
    }));

    if (fromReminders.length > 0) return fromReminders;

    // Fallback to active prescription medications
    const latestRx = prescriptions[0];
    if (latestRx?.medications?.length > 0) {
      return latestRx.medications.map((med, idx) => ({
        id: `rx-${idx}`,
        name: med.name,
        dosage: med.dosage || "1 tablet",
        times: [med.frequency || med.timing || "Morning"],
        instructions: med.instructions || med.timing || "After meals",
      }));
    }

    return [];
  }, [health, prescriptions]);

  // Handle marking pose complete
  const handleCompletePose = async (poseName) => {
    const updated = [...new Set([...completedPosesToday, poseName])];
    setCompletedPosesToday(updated);
    try {
      localStorage.setItem(`yoga_completed_${today}`, JSON.stringify(updated));
    } catch {}

    try {
      await addExerciseLog({
        exerciseName: `Yoga: ${poseName}`,
        category: "yoga",
        duration: 15,
        intensity: "moderate",
        date: new Date().toISOString(),
        notes: "Completed via AI Pose Coach from Dashboard",
      });
    } catch {}
  };

  const handleToggleMedicineTaken = (medId) => {
    setTakenMedicines((prev) => ({
      ...prev,
      [medId]: !prev[medId],
    }));
  };

  const latestReadings = health?.latestReadings || {};
  const recentHistory = sessions.slice(0, 3);
  const latestDiagnosis = prescriptions[0]?.diagnosis;
  const chiefComplaint = sessions[0]?.clinicalHistory?.chiefComplaint;

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="page">
      {partialError && (
        <p className="alert" role="status">
          Some information could not be loaded. {partialError}
        </p>
      )}

      {/* Top Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{t("hello", "Hello")}, {patient?.name || t("patient", "Patient")}</h1>
          <p className="lede" style={{ margin: "4px 0 0 0" }}>
            {patient?.age ? `${patient.age} ${t("yrs", "yrs")}` : t("age_not_set", "Age not set")} ·{" "}
            {patient?.gender
              ? patient.gender.toLowerCase() === "male"
                ? t("gender_male", "Male")
                : patient.gender.toLowerCase() === "female"
                ? t("gender_female", "Female")
                : t("gender_other", "Other")
              : t("gender_not_set", "Gender not set")} ·{" "}
            {patient?.height ? `${patient.height} cm` : t("height_not_set", "Height not set")} ·{" "}
            {patient?.weight ? `${patient.weight} kg` : t("weight_not_set", "Weight not set")} ·{" "}
            {languageLabel(patient?.preferredLanguage, language)}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/exercise" className="btn" style={{ fontSize: "0.85rem", padding: "7px 14px" }}>
            <Activity size={15} />
            {t("exercise_yoga", "Exercise & Yoga Matrix")}
          </Link>
          <Link to="/profile" className="btn ghost" style={{ fontSize: "0.85rem", padding: "7px 14px" }}>
            <Settings size={15} />
            {t("profile", "Edit Profile & BMI")}
          </Link>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 1. TOP REMINDERS ROW: MEDICINE & DAILY YOGA SCHEDULE                   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ fontSize: "1.15rem", margin: 0, fontWeight: "700", display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={18} style={{ color: "var(--brand)" }} /> {t("daily_health_routine", "Daily Health Reminders & Routine")}
          </h2>
          <span className="muted" style={{ fontSize: "0.8rem" }}>{t("today", "Today")}: {formatDate(new Date())}</span>
        </div>

        <div className="grid two" style={{ gap: 16 }}>
          {/* Medicine Reminders Card */}
          <article className="card" style={{ borderTop: "4px solid #3b82f6", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "#eff6ff", display: "grid", placeItems: "center" }}>
                  <Pill size={20} color="#2563eb" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: "700" }}>{t("medicine_reminders", "Medicine Reminders")}</h3>
                  <span className="muted" style={{ fontSize: "0.76rem" }}>{t("prescriptions_doses", "Prescriptions & Scheduled Doses")}</span>
                </div>
              </div>
              <span className="badge" style={{ background: "#dbeafe", color: "#1e40af", fontSize: "0.75rem", fontWeight: "600" }}>
                {activeMedicines.length} {t("active", "Active")}
              </span>
            </div>

            {activeMedicines.length > 0 ? (
              <ul className="list" style={{ flex: 1, margin: 0 }}>
                {activeMedicines.map((med) => {
                  const isTaken = takenMedicines[med.id] || false;
                  return (
                    <li
                      key={med.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 0",
                        borderBottom: "1px solid rgba(0,0,0,0.05)",
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: "0.92rem", color: isTaken ? "#64748b" : "#0f172a", textDecoration: isTaken ? "line-through" : "none" }}>
                          {med.name}
                        </strong>
                        <div className="muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>
                          {med.dosage} · {(med.times || []).join(", ")} {med.instructions ? `(${med.instructions})` : ""}
                        </div>
                      </div>

                      <button
                        type="button"
                        className={`btn ${isTaken ? "ghost" : ""}`}
                        style={{
                          fontSize: "0.78rem",
                          padding: "4px 10px",
                          background: isTaken ? "#dcfce7" : undefined,
                          color: isTaken ? "#15803d" : undefined,
                          borderColor: isTaken ? "#10b981" : undefined,
                        }}
                        onClick={() => handleToggleMedicineTaken(med.id)}
                      >
                        {isTaken ? t("taken", "Taken") : t("take_dose", "Take Dose")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div style={{ padding: "16px 0", textAlign: "center", color: "#64748b", fontSize: "0.88rem" }}>
                <p style={{ margin: "0 0 6px 0" }}>{t("no_meds_scheduled", "No medicines scheduled for today.")}</p>
                <Link to="/documents" style={{ fontSize: "0.8rem", color: "#0284c7" }}>
                  {t("upload_rx_import", "Upload prescription to import medicines →")}
                </Link>
              </div>
            )}

            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="muted" style={{ fontSize: "0.75rem" }}>{t("track_logs_reminders", "Track logs in Reminders")}</span>
              <Link to="/reminders" style={{ fontSize: "0.8rem", fontWeight: "600", color: "#2563eb" }}>
                {t("manage_reminders", "Manage All Reminders →")}
              </Link>
            </div>
          </article>

          {/* Yoga & Pose Correction Routine Card */}
          <article className="card" style={{ borderTop: "4px solid #10b981", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "#ecfdf5", display: "grid", placeItems: "center" }}>
                  <Activity size={20} color="#059669" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: "700" }}>{t("todays_yoga", "Today's Yoga Matrix")}</h3>
                  <span className="muted" style={{ fontSize: "0.76rem" }}>{t("yoga_subtitle", "Doctor-Prescribed & AI Form Coach")}</span>
                </div>
              </div>
              <span className="badge" style={{ background: "#dcfce7", color: "#15803d", fontSize: "0.75rem", fontWeight: "600" }}>
                {completedPosesToday.length}/{yogaPoses.length || 3} {t("done", "Done")}
              </span>
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {(yogaPoses.length > 0 ? yogaPoses.slice(0, 3) : [
                { name: "Cobra (Bhujangasana)", sanskritName: "Bhujangasana", durationMinutes: 10, timeOfDay: "Morning", benefits: "Spinal flexibility & chest expansion" },
                { name: "Tree Pose (Vrksasana)", sanskritName: "Vrksasana", durationMinutes: 10, timeOfDay: "Morning", benefits: "Balance & core stability" },
                { name: "Warrior II", sanskritName: "Virabhadrasana II", durationMinutes: 10, timeOfDay: "Evening", benefits: "Hip opener & leg strength" },
              ]).map((pose, idx) => {
                const isDone = completedPosesToday.includes(pose.name);
                const poseKey = mapPoseNameToKey(pose.name);

                return (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: isDone ? "#f0fdf4" : "#f8fafc",
                      border: `1px solid ${isDone ? "#86efac" : "rgba(0,0,0,0.06)"}`,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle2 size={15} color={isDone ? "#16a34a" : "#cbd5e1"} />
                        <strong style={{ fontSize: "0.88rem", color: isDone ? "#166534" : "#0f172a" }}>
                          {pose.name}
                        </strong>
                      </div>
                      <div className="muted" style={{ fontSize: "0.74rem", marginLeft: 21 }}>
                        {pose.timeOfDay ? t(pose.timeOfDay.toLowerCase(), pose.timeOfDay) : t("daily", "Daily")} · {pose.durationMinutes || 10} {t("min", "min")} {pose.benefits ? `· ${pose.benefits}` : ""}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6 }}>
                      {/* Check My Pose Trigger */}
                      <button
                        type="button"
                        className="btn"
                        style={{
                          fontSize: "0.75rem",
                          padding: "4px 8px",
                          background: "#047857",
                          whiteSpace: "nowrap",
                        }}
                        onClick={() => setActivePoseChecker({ key: poseKey, name: pose.name })}
                        title="Launch live camera CV body pointer & pose correction"
                      >
                        <Camera size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                        {t("check_pose", "Check Pose")}
                      </button>

                      <button
                        type="button"
                        className={`btn ${isDone ? "ghost" : ""}`}
                        style={{
                          fontSize: "0.75rem",
                          padding: "4px 8px",
                          background: isDone ? "#dcfce7" : undefined,
                          color: isDone ? "#15803d" : undefined,
                        }}
                        onClick={() => handleCompletePose(pose.name)}
                      >
                        {isDone ? t("done", "Done") : t("mark_done", "Mark Done")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="muted" style={{ fontSize: "0.75rem" }}>{t("body_pointer_hint", "Hold postures with body pointer feedback")}</span>
              <Link to="/exercise" style={{ fontSize: "0.8rem", fontWeight: "600", color: "#047857" }}>
                {t("full_yoga_routine", "Full Yoga Matrix & Routine →")}
              </Link>
            </div>
          </article>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 2. PERSONALIZED NUTRIENT & CALORIC INTELLIGENCE (PER BMI & HEIGHT)     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ fontSize: "1.15rem", margin: 0, fontWeight: "700", display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={18} style={{ color: "var(--brand)" }} /> {t("nutrition_needs", "Personalized Nutrition & Caloric Needs")}
          </h2>
          <span className="muted" style={{ fontSize: "0.8rem" }}>{t("nutrition_subtitle", "Computed from your Height, Weight & BMI")}</span>
        </div>

        {nutrientNeeds ? (
          <div className="card" style={{ padding: 20 }}>
            {/* Top Bar: BMI Score + Daily Caloric Target */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 20 }}>
              {/* BMI Card */}
              <div style={{ padding: 14, borderRadius: 10, background: nutrientNeeds.bmiBg, border: `1px solid ${nutrientNeeds.bmiColor}` }}>
                <span className="muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: "600" }}>
                  {t("bmi_label", "Body Mass Index (BMI)")}
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
                  <span style={{ fontSize: "2rem", fontWeight: "800", color: nutrientNeeds.bmiColor }}>
                    {nutrientNeeds.bmi}
                  </span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 12,
                      fontSize: "0.8rem",
                      fontWeight: "700",
                      background: nutrientNeeds.bmiColor,
                      color: "white",
                    }}
                  >
                    {t(nutrientNeeds.bmiCategoryKey, nutrientNeeds.bmiCategory)}
                  </span>
                </div>
                <p className="muted" style={{ fontSize: "0.78rem", margin: "6px 0 0 0" }}>
                  {t("height", "Height")}: <strong>{patient.height} cm</strong> · {t("weight", "Weight")}: <strong>{patient.weight} kg</strong>
                </p>
              </div>

              {/* Daily Caloric Target Card */}
              <div style={{ padding: 14, borderRadius: 10, background: "#f8fafc", border: "1px solid rgba(0,0,0,0.08)" }}>
                <span className="muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: "600" }}>
                  {t("target_calories", "Target Daily Calories")}
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: "2rem", fontWeight: "800", color: "#0f172a" }}>
                    {nutrientNeeds.targetCalories.toLocaleString()}
                  </span>
                  <span className="muted" style={{ fontSize: "0.9rem", fontWeight: "600" }}>{t("kcal_day", "kcal / day")}</span>
                </div>
                <p style={{ fontSize: "0.78rem", margin: "6px 0 0 0", color: "#047857", fontWeight: "600" }}>
                  {t("clinical_goal", "Clinical Goal")}: {t(nutrientNeeds.goalKey, nutrientNeeds.goalText)}
                </p>
              </div>

              {/* BMR & Hydration Card */}
              <div style={{ padding: 14, borderRadius: 10, background: "#f8fafc", border: "1px solid rgba(0,0,0,0.08)" }}>
                <span className="muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: "600" }}>
                  {t("hydration_fiber", "Daily Hydration & Fiber")}
                </span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
                  <div>
                    <span style={{ fontSize: "1.4rem", fontWeight: "700", color: "#0284c7" }}>
                      {nutrientNeeds.waterLiters}L
                    </span>
                    <span className="muted" style={{ fontSize: "0.75rem", display: "block" }}>{t("water_intake", "Water intake")}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: "1.4rem", fontWeight: "700", color: "#15803d" }}>
                      {nutrientNeeds.fiberGrams}g
                    </span>
                    <span className="muted" style={{ fontSize: "0.75rem", display: "block" }}>{t("dietary_fiber", "Dietary fiber")}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Macronutrient Distribution Bars */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: "0.9rem", margin: "0 0 10px 0", fontWeight: "700" }}>
                {t("macronutrient_split", "Macronutrient Target Split (Based on Body Composition):")}
              </h4>
              <div className="grid three" style={{ gap: 14 }}>
                {/* Protein */}
                <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <strong style={{ fontSize: "0.85rem", color: "#991b1b" }}>{t("protein", "Protein")}</strong>
                    <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "#991b1b" }}>
                      {nutrientNeeds.proteinGrams}g ({nutrientNeeds.proteinPct}%)
                    </span>
                  </div>
                  <div style={{ height: 6, background: "rgba(0,0,0,0.08)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${nutrientNeeds.proteinPct}%`, height: "100%", background: "#ef4444" }} />
                  </div>
                  <span className="muted" style={{ fontSize: "0.72rem", marginTop: 4, display: "block" }}>
                    {t("protein_desc", "Lean muscle repair & metabolic satiety")}
                  </span>
                </div>

                {/* Complex Carbs */}
                <div style={{ padding: 12, borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <strong style={{ fontSize: "0.85rem", color: "#92400e" }}>{t("complex_carbs", "Complex Carbs")}</strong>
                    <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "#92400e" }}>
                      {nutrientNeeds.carbGrams}g ({nutrientNeeds.carbPct}%)
                    </span>
                  </div>
                  <div style={{ height: 6, background: "rgba(0,0,0,0.08)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${nutrientNeeds.carbPct}%`, height: "100%", background: "#f59e0b" }} />
                  </div>
                  <span className="muted" style={{ fontSize: "0.72rem", marginTop: 4, display: "block" }}>
                    {t("carbs_desc", "Whole grains, pulses & sustained yoga energy")}
                  </span>
                </div>

                {/* Healthy Fats */}
                <div style={{ padding: 12, borderRadius: 8, background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <strong style={{ fontSize: "0.85rem", color: "#065f46" }}>{t("healthy_fats", "Healthy Fats")}</strong>
                    <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "#065f46" }}>
                      {nutrientNeeds.fatGrams}g ({nutrientNeeds.fatPct}%)
                    </span>
                  </div>
                  <div style={{ height: 6, background: "rgba(0,0,0,0.08)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${nutrientNeeds.fatPct}%`, height: "100%", background: "#10b981" }} />
                  </div>
                  <span className="muted" style={{ fontSize: "0.72rem", marginTop: 4, display: "block" }}>
                    {t("fats_desc", "Hormone production & joint lubrication")}
                  </span>
                </div>
              </div>
            </div>

            {/* Key Micronutrients Tailored for Patient's BMI */}
            <div>
              <h4 style={{ fontSize: "0.9rem", margin: "0 0 10px 0", fontWeight: "700" }}>
                {t("key_micronutrients", "Key Micronutrients Required for Your BMI Profile:")}
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                {nutrientNeeds.keyMicronutrients.map((micro, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: "#f8fafc",
                      border: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brand)", marginTop: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <strong style={{ fontSize: "0.85rem", color: "#0f172a" }}>{micro.name}</strong>
                        <span className="badge" style={{ fontSize: "0.7rem", padding: "1px 6px", background: "#e2e8f0" }}>
                          {micro.target}
                        </span>
                      </div>
                      <p className="muted" style={{ margin: "2px 0 0 0", fontSize: "0.74rem" }}>
                        {micro.reason}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 28, textAlign: "center", background: "#f8fafc", border: "1px dashed #cbd5e1" }}>
            <Activity size={32} style={{ color: "var(--brand)", margin: "0 auto 8px" }} />
            <h3 style={{ margin: "8px 0 4px 0", fontSize: "1.05rem" }}>{t("height_weight_prompt_title", "Set Your Height & Weight to Calculate Nutrients")}</h3>
            <p className="muted" style={{ fontSize: "0.85rem", maxWidth: 500, margin: "0 auto 14px auto" }}>
              {t("height_weight_prompt_desc", "Enter your biometric parameters in your profile to view your exact Body Mass Index (BMI), personalized daily caloric target, macronutrient distribution, and micronutrient checklist.")}
            </p>
            <Link to="/profile" className="btn" style={{ padding: "8px 18px", fontSize: "0.88rem" }}>
              {t("enter_height_weight_btn", "Enter Height & Weight in Profile →")}
            </Link>
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 3. CLINICAL SUMMARY & VITALS READINGS                                 */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section className="card" style={{ marginBottom: 20 }}>
        <h2>{t("clinical_summary", "Current Clinical Summary")}</h2>
        {latestDiagnosis || chiefComplaint ? (
          <p>
            {latestDiagnosis ? <strong>{t("latest_diagnosis", "Latest diagnosis")}: {latestDiagnosis}. </strong> : null}
            {chiefComplaint ? `${t("recent_concern", "Recent concern")}: ${chiefComplaint}.` : null}
          </p>
        ) : (
          <p className="muted">{t("no_clinical_summary", "No clinical summary yet. Record your medical history to build one.")}</p>
        )}
      </section>

      <section className="grid three" style={{ marginBottom: 24 }}>
        {["blood_pressure", "blood_sugar", "heart_rate"].map((type) => (
          <HealthMetricCard key={type} type={type} reading={latestReadings[type]?.latest} />
        ))}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 4. QUICK ACTIONS & RECENT HISTORY                                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: 24 }}>
        <h2>{t("quick_actions", "Quick Actions")}</h2>
        <div className="quick-actions">
          {ACTIONS.map((action) => (
            <Link key={action.to} className="quick-action" to={action.to}>
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} style={{ color: "var(--brand)" }} />
                {t(action.titleKey, action.defaultTitle)}
              </strong>
              <span className="muted">{t(action.textKey, action.defaultText)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid two">
        <article className="card">
          <h2>{t("recent_medical_history", "Recent Medical History")}</h2>
          {recentHistory.length ? (
            <ul className="list">
              {recentHistory.map((session) => (
                <li key={session._id}>
                  <Link to={`/history/${session._id}`}>
                    {session.clinicalHistory?.chiefComplaint || t("history_session", "History session")} · {formatDate(session.createdAt)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t("no_medical_history", "No medical history recorded yet.")}</p>
          )}
        </article>

        <article className="card">
          <h2>{t("recent_health_readings", "Recent Health Readings")}</h2>
          {(health?.recentReadings || []).length ? (
            <ul className="list">
              {health.recentReadings.slice(-4).reverse().map((reading) => (
                <li key={reading._id}>
                  {formatReadingValue(reading)} · {formatDate(reading.measuredAt)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t("no_health_readings", "No health readings available yet.")}</p>
          )}
        </article>
      </section>

      {appointments.length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <h2>{t("upcoming_appointments", "Upcoming Doctor Appointments")}</h2>
          <ul className="list">
            {appointments.slice(0, 3).map((item) => {
              const statusLabel =
                item.status === "booked"
                  ? t("status_booked", "Booked")
                  : item.status === "in_progress"
                  ? t("status_in_progress", "In Consultation")
                  : item.status === "completed"
                  ? t("status_completed", "Completed")
                  : item.status === "cancelled"
                  ? t("status_cancelled", "Cancelled")
                  : item.status;

              return (
                <li key={item._id}>
                  {item.doctor?.name || t("doctor", "Doctor")} · {statusLabel} · {formatDate(item.scheduledDate)}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Modal for Live Pose Correction Launched from Dashboard */}
      {activePoseChecker && (
        <YogaPoseCheckerModal
          initialPoseKey={activePoseChecker.key}
          initialPoseName={activePoseChecker.name}
          onClose={() => setActivePoseChecker(null)}
          onCompletePose={(poseName) => {
            handleCompletePose(poseName);
            setActivePoseChecker(null);
          }}
        />
      )}
    </div>
  );
}
