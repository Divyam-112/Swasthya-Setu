import { useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { updateCurrentPatient } from "../api/auth.js";
import { toUserMessage } from "../api/client.js";
import { CheckCircle2, AlertCircle, Info, Clock } from "lucide-react";
import { languageLabel } from "../utils/format.js";

export default function Profile() {
  const { patient, setPatient } = useAuth();
  const { t, setLanguage } = useLanguage();
  const [form, setForm] = useState({
    name: patient?.name || "",
    phone: patient?.phone || "",
    age: patient?.age || "",
    gender: patient?.gender || "Female",
    height: patient?.height || "",
    weight: patient?.weight || "",
    preferredLanguage: patient?.preferredLanguage || "en",
    consent: {
      aiAnalysis: patient?.consent?.aiAnalysis ?? true,
      dataProcessing: patient?.consent?.dataProcessing ?? true,
      dietYogaPersonalization: patient?.consent?.dietYogaPersonalization ?? true,
    },
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  // Live dynamic BMI calculation
  const bmiInfo = useMemo(() => {
    const h = Number(form.height);
    const w = Number(form.weight);
    if (!h || !w || h <= 0 || w <= 0) return null;

    const heightInMeters = h / 100;
    const bmiVal = Math.round((w / (heightInMeters * heightInMeters)) * 10) / 10;

    let category = "Normal";
    let color = "#10b981"; // emerald
    let bgColor = "#ecfdf5";
    let advice = "Your BMI is in a healthy range. Maintain balanced nutrition and daily yoga.";

    if (bmiVal < 18.5) {
      category = "Underweight";
      color = "#0284c7"; // sky
      bgColor = "#f0f9ff";
      advice = "Aim for a moderate calorie surplus with protein-rich foods and strengthening yoga.";
    } else if (bmiVal < 25) {
      category = "Normal Weight";
      color = "#10b981";
      bgColor = "#ecfdf5";
      advice = "Optimal weight maintenance. Continue consistent daily movement and hydration.";
    } else if (bmiVal < 30) {
      category = "Overweight";
      color = "#f59e0b"; // amber
      bgColor = "#fffbeb";
      advice = "Focus on a mild caloric deficit, high fiber, lean protein, and active asanas.";
    } else {
      category = "Obese";
      color = "#ef4444"; // red
      bgColor = "#fef2f2";
      advice = "Prioritize whole foods, joint-friendly low-impact yoga, and doctor-guided nutrition.";
    }

    const minHealthyWeight = Math.round(18.5 * (heightInMeters ** 2) * 10) / 10;
    const maxHealthyWeight = Math.round(24.9 * (heightInMeters ** 2) * 10) / 10;

    return {
      bmi: bmiVal,
      category,
      color,
      bgColor,
      advice,
      healthyRange: `${minHealthyWeight} – ${maxHealthyWeight} kg`,
    };
  }, [form.height, form.weight]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        gender: form.gender,
        preferredLanguage: form.preferredLanguage,
        consent: form.consent,
      };

      if (form.age !== "" && form.age !== null) {
        payload.age = Number(form.age);
      }
      if (form.height !== "" && form.height !== null) {
        payload.height = Number(form.height);
      }
      if (form.weight !== "" && form.weight !== null) {
        payload.weight = Number(form.weight);
      }

      const response = await updateCurrentPatient(payload);
      setPatient(response.data.patient);
      if (form.preferredLanguage) {
        setLanguage(form.preferredLanguage);
      }
      setSuccess("Profile, BMI metrics, and consent preferences saved successfully!");
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 860, margin: "0 auto" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 className="page-title">{t("profile", "Patient Profile & Biometrics")}</h1>
        <p className="lede">
          {t("profile_subtitle", "Your personal details, biometric parameters, and health data consent.")}
        </p>
      </header>

      {/* Account Info Pill Card */}
      <section className="card" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <span className="muted" style={{ fontSize: "0.8rem" }}>{t("abha_id", "ABHA Health ID")}</span>
          <p style={{ margin: "2px 0 0 0", fontWeight: "700" }}>{patient?.abhaId || "Not linked"}</p>
        </div>
        <div>
          <span className="muted" style={{ fontSize: "0.8rem" }}>{t("language", "Preferred Language")}</span>
          <p style={{ margin: "2px 0 0 0", fontWeight: "600" }}>{languageLabel(patient?.preferredLanguage)}</p>
        </div>
        <div>
          <span className="muted" style={{ fontSize: "0.8rem" }}>{t("consent_status", "Consent Status")}</span>
          <p style={{ margin: "2px 0 0 0", fontWeight: "600", display: "flex", alignItems: "center", gap: 5, color: (patient?.consent?.aiAnalysis || patient?.consent?.dataCollection) ? "#10b981" : "#f59e0b" }}>
            {(patient?.consent?.aiAnalysis || patient?.consent?.dataCollection) ? (
              <>
                <CheckCircle2 size={14} />
                <span>{t("consent_granted", "Consent Granted")}</span>
              </>
            ) : (
              <>
                <AlertCircle size={14} />
                <span>{t("pending_consent", "Pending Consent")}</span>
              </>
            )}
          </p>
        </div>
      </section>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Basic Details */}
        <div className="card">
          <h2 style={{ fontSize: "1.1rem", marginBottom: 14 }}>{t("basic_identification", "1. Basic Identification")}</h2>
          <div className="form-grid">
            <label>
              Full Name
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((curr) => ({ ...curr, name: e.target.value }))}
                placeholder="e.g. Tushar"
              />
            </label>
            <label>
              Mobile Phone
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((curr) => ({ ...curr, phone: e.target.value }))}
                placeholder="10-digit phone number"
              />
            </label>
            <label>
              Age (Years)
              <input
                type="number"
                min="1"
                max="120"
                value={form.age}
                onChange={(e) => setForm((curr) => ({ ...curr, age: e.target.value }))}
                placeholder="e.g. 26"
              />
            </label>
            <label>
              Gender
              <select
                value={form.gender}
                onChange={(e) => setForm((curr) => ({ ...curr, gender: e.target.value }))}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label>
              Interface Language
              <select
                value={form.preferredLanguage}
                onChange={(e) => setForm((curr) => ({ ...curr, preferredLanguage: e.target.value }))}
              >
                <option value="en">English</option>
                <option value="hi">Hindi (हिंदी)</option>
                <option value="bn">Bengali (বাংলা)</option>
                <option value="ta">Tamil (தமிழ்)</option>
                <option value="te">Telugu (తెలుగు)</option>
                <option value="mr">Marathi (मराठी)</option>
                <option value="gu">Gujarati (ગુજરાતી)</option>
                <option value="kn">Kannada (ಕನ್ನಡ)</option>
                <option value="ml">Malayalam (മലയാളം)</option>
                <option value="pa">Punjabi (ਪੰਜਾਬੀ)</option>
              </select>
            </label>
          </div>
        </div>

        {/* Biometrics & Dynamic BMI Calculator */}
        <div className="card">
          <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>2. Biometrics & BMI Calculation</h2>
          <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 16 }}>
            Used to calculate your daily caloric needs, nutrient distribution, and customized yoga routines on the Dashboard.
          </p>

          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Height (cm)
              <input
                type="number"
                step="0.1"
                min="50"
                max="250"
                required
                value={form.height}
                onChange={(e) => setForm((curr) => ({ ...curr, height: e.target.value }))}
                placeholder="e.g. 175"
              />
              <span className="muted" style={{ fontSize: "0.75rem", marginTop: 2, display: "block" }}>
                Measure without shoes
              </span>
            </label>

            <label>
              Weight (kg)
              <input
                type="number"
                step="0.1"
                min="10"
                max="300"
                required
                value={form.weight}
                onChange={(e) => setForm((curr) => ({ ...curr, weight: e.target.value }))}
                placeholder="e.g. 70"
              />
              <span className="muted" style={{ fontSize: "0.75rem", marginTop: 2, display: "block" }}>
                Current body weight in kilograms
              </span>
            </label>
          </div>

          {/* Computed BMI Display */}
          {bmiInfo ? (
            <div
              style={{
                marginTop: 18,
                padding: 16,
                borderRadius: 10,
                background: bmiInfo.bgColor,
                border: `1px solid ${bmiInfo.color}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <span className="muted" style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: "600" }}>
                    Calculated Body Mass Index (BMI)
                  </span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: "2.2rem", fontWeight: "800", color: bmiInfo.color }}>
                      {bmiInfo.bmi}
                    </span>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: 20,
                        fontSize: "0.85rem",
                        fontWeight: "700",
                        background: bmiInfo.color,
                        color: "white",
                      }}
                    >
                      {bmiInfo.category}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>Healthy Weight Range</span>
                  <p style={{ margin: "2px 0 0 0", fontWeight: "700", fontSize: "0.95rem" }}>
                    {bmiInfo.healthyRange}
                  </p>
                </div>
              </div>

              <p style={{ margin: "10px 0 0 0", fontSize: "0.85rem", color: "#334155", display: "flex", alignItems: "center", gap: 6 }}>
                <Info size={15} color="var(--brand)" />
                <span><strong>Clinical Guidance:</strong> {bmiInfo.advice}</span>
              </p>
            </div>
          ) : (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: "#f8fafc", border: "1px dashed #cbd5e1", fontSize: "0.85rem", color: "#64748b", display: "flex", alignItems: "center", gap: 8 }}>
              <Info size={16} color="#64748b" />
              <span>Enter both your <strong>height</strong> and <strong>weight</strong> above to calculate your BMI and unlock personalized daily nutrient and calorie targets.</span>
            </div>
          )}
        </div>

        {/* Informed Consent Section */}
        <div className="card">
          <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>3. Patient Informed Consent</h2>
          <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 14 }}>
            Please review and authorize how your health and biometric information is processed by MediKiosk.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: "0.88rem" }}>
              <input
                type="checkbox"
                style={{ marginTop: 3 }}
                checked={form.consent.aiAnalysis}
                onChange={(e) =>
                  setForm((curr) => ({
                    ...curr,
                    consent: { ...curr.consent, aiAnalysis: e.target.checked },
                  }))
                }
              />
              <div>
                <strong>AI Clinical Assistance & Diagnosis Insights</strong>
                <p className="muted" style={{ margin: "2px 0 0 0", fontSize: "0.8rem" }}>
                  I consent to having AI analyze my symptoms, medical documents, and vital trends to assist my doctor and provide intelligent care summaries.
                </p>
              </div>
            </label>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: "0.88rem" }}>
              <input
                type="checkbox"
                style={{ marginTop: 3 }}
                checked={form.consent.dietYogaPersonalization}
                onChange={(e) =>
                  setForm((curr) => ({
                    ...curr,
                    consent: { ...curr.consent, dietYogaPersonalization: e.target.checked },
                  }))
                }
              />
              <div>
                <strong>Personalized Nutrients, Calories & Yoga Matrix</strong>
                <p className="muted" style={{ margin: "2px 0 0 0", fontSize: "0.8rem" }}>
                  I consent to using my BMI, height, weight, and clinical records to compute personalized daily caloric targets, macronutrient breakdowns, and yoga schedules.
                </p>
              </div>
            </label>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: "0.88rem" }}>
              <input
                type="checkbox"
                style={{ marginTop: 3 }}
                checked={form.consent.dataProcessing}
                onChange={(e) =>
                  setForm((curr) => ({
                    ...curr,
                    consent: { ...curr.consent, dataProcessing: e.target.checked },
                  }))
                }
              />
              <div>
                <strong>Care Continuity & Medicine Reminder Tracking</strong>
                <p className="muted" style={{ margin: "2px 0 0 0", fontSize: "0.8rem" }}>
                  I consent to storing medicine schedules, yoga practice logs, and health readings across my longitudinal medical record.
                </p>
              </div>
            </label>
          </div>

          {patient?.consent?.consentDate && (
            <p className="muted" style={{ fontSize: "0.78rem", marginTop: 14, display: "flex", alignItems: "center", gap: 5 }}>
              <Clock size={13} />
              <span>Last consented on: {new Date(patient.consent.consentDate).toLocaleString()}</span>
            </p>
          )}
        </div>

        {error && <p className="alert" role="alert">{error}</p>}
        {success && <p className="badge ok" style={{ padding: "8px 14px", fontSize: "0.9rem" }}>{success}</p>}

        <button
          className="btn"
          type="submit"
          disabled={saving}
          style={{ padding: "12px 24px", fontSize: "1rem", fontWeight: "700" }}
        >
          {saving ? t("saving", "Saving Profile & Calculating…") : t("save_profile", "Save Profile & Update Biometrics")}
        </button>
      </form>
    </div>
  );
}
