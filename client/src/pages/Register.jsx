import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { toUserMessage } from "../api/client.js";

const LANGUAGES = [
  ["en", "English"],
  ["hi", "Hindi"],
  ["bn", "Bengali"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["mr", "Marathi"],
  ["gu", "Gujarati"],
  ["kn", "Kannada"],
  ["ml", "Malayalam"],
  ["pa", "Punjabi"],
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    abhaId: "",
    phone: "",
    age: "",
    gender: "Female",
    preferredLanguage: "en",
    password: "",
    confirmPassword: "",
  });
  const [consent, setConsent] = useState({
    agreed: true,
    dataCollection: true,
    dataSharing: true,
    aiAnalysis: true,
    dietYogaPersonalization: true,
    dataProcessing: true,
  });
  const [showConsentDetails, setShowConsentDetails] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!consent.agreed || !consent.dataCollection) {
      setError("Please review and accept the informed consent terms to create your account.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { confirmPassword, ...payload } = form;
      await register({
        ...payload,
        age: Number(payload.age),
        consent: {
          dataCollection: consent.dataCollection,
          dataSharing: consent.dataSharing,
          aiAnalysis: consent.aiAnalysis,
          dataProcessing: consent.dataProcessing,
          dietYogaPersonalization: consent.dietYogaPersonalization,
          consentDate: new Date().toISOString(),
        },
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-main">
      <div className="auth-card" style={{ width: "min(600px, 100%)", maxHeight: "92vh", overflowY: "auto" }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "52px", height: "52px", borderRadius: "16px",
            background: "linear-gradient(135deg, #0f6a50, #1d5c74)",
            marginBottom: "14px",
            boxShadow: "0 8px 20px rgba(15,106,80,0.28)",
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <div style={{
            display: "inline-block",
            background: "linear-gradient(90deg, #e3f2ea, #e5eff4)",
            color: "#0a4d3a", fontSize: "0.72rem", fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
            padding: "4px 12px", borderRadius: "100px",
            border: "1px solid #cbe4d7", marginBottom: "10px", display: "block",
          }}>New Patient</div>
          <h1 style={{
            fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.03em",
            color: "#0f1e1a", margin: "0 0 5px", lineHeight: 1.25,
          }}>Create your account</h1>
          <p style={{ color: "#5a7068", fontSize: "0.88rem", margin: 0 }}>
            Register with ABDM interoperability and informed consent
          </p>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Full name
            <input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Rahul Sharma" required />
          </label>
          <label>
            ABHA ID / Address
            <input value={form.abhaId} onChange={(e) => update("abhaId", e.target.value)} placeholder="14-digit number or name@abdm" required />
          </label>
          <label>
            Mobile number
            <input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="10-digit mobile number" required />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <label>
              Password
              <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="Min 6 chars" autoComplete="new-password" minLength={6} required />
            </label>
            <label>
              Confirm password
              <input type="password" value={form.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} placeholder="Re-enter password" autoComplete="new-password" minLength={6} required />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
            <label>
              Age
              <input type="number" min="1" max="120" value={form.age} onChange={(e) => update("age", e.target.value)} required />
            </label>
            <label>
              Gender
              <select value={form.gender} onChange={(e) => update("gender", e.target.value)}>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              Preferred language
              <select value={form.preferredLanguage} onChange={(e) => update("preferredLanguage", e.target.value)}>
                {LANGUAGES.map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Patient Informed Consent Form Section */}
          <div
            style={{
              marginTop: "0.75rem",
              background: "#f6faf7",
              border: "1px solid #cbe4d7",
              borderRadius: "var(--radius-sm)",
              padding: "1.1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
              <div>
                <h3 style={{ margin: "0 0 2px", fontSize: "1.02rem", color: "#0f6a50", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  📋 Patient Informed Consent Notice
                </h3>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--ink-soft)" }}>
                  Required once at registration for digital care & ABDM data processing
                </p>
              </div>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setShowConsentDetails((prev) => !prev)}
                style={{ fontSize: "0.76rem", padding: "3px 8px", minHeight: "auto" }}
              >
                {showConsentDetails ? "Hide terms ▲" : "View terms ▼"}
              </button>
            </div>

            {/* Mandatory Master Consent */}
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.6rem",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.9rem",
                color: "#16241f",
                padding: "0.4rem 0",
              }}
            >
              <input
                type="checkbox"
                checked={consent.agreed}
                onChange={(e) => {
                  const val = e.target.checked;
                  setConsent({
                    agreed: val,
                    dataCollection: val,
                    dataSharing: val,
                    aiAnalysis: val,
                    dietYogaPersonalization: val,
                    dataProcessing: val,
                  });
                }}
                style={{ marginTop: "2px", width: "18px", height: "18px", accentColor: "var(--brand)" }}
                required
              />
              <span>
                I agree to the <strong>Patient Informed Consent Terms</strong> for digital healthcare delivery, AI triage assistance, and ABDM interoperability. <span style={{ color: "#e11d48" }}>*</span>
              </span>
            </label>

            {/* Granular breakdown */}
            <div
              style={{
                marginTop: "0.5rem",
                paddingTop: "0.5rem",
                borderTop: "1px dashed #cbe4d7",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
              }}
            >
              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.82rem", color: "var(--ink-soft)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={consent.dataCollection}
                  onChange={(e) => setConsent((prev) => ({ ...prev, dataCollection: e.target.checked, agreed: e.target.checked && prev.agreed }))}
                  style={{ marginTop: "2px", width: "15px", height: "15px", accentColor: "var(--brand)" }}
                />
                <span>
                  <strong>Data Collection & Storage:</strong> I consent to securely storing my clinical records, vitals, and medical documents in my digital health locker.
                </span>
              </label>

              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.82rem", color: "var(--ink-soft)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={consent.dataSharing}
                  onChange={(e) => setConsent((prev) => ({ ...prev, dataSharing: e.target.checked }))}
                  style={{ marginTop: "2px", width: "15px", height: "15px", accentColor: "var(--brand)" }}
                />
                <span>
                  <strong>Doctor & Clinical Team Sharing:</strong> I authorize sharing my medical history with treating doctors and ABDM healthcare providers.
                </span>
              </label>

              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.82rem", color: "var(--ink-soft)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={consent.aiAnalysis}
                  onChange={(e) => setConsent((prev) => ({ ...prev, aiAnalysis: e.target.checked }))}
                  style={{ marginTop: "2px", width: "15px", height: "15px", accentColor: "var(--brand)" }}
                />
                <span>
                  <strong>AI Clinical Assistance:</strong> I agree to AI-powered symptom interview triage and preliminary clinical summaries for physician review.
                </span>
              </label>

              <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.82rem", color: "var(--ink-soft)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={consent.dietYogaPersonalization}
                  onChange={(e) => setConsent((prev) => ({ ...prev, dietYogaPersonalization: e.target.checked }))}
                  style={{ marginTop: "2px", width: "15px", height: "15px", accentColor: "var(--brand)" }}
                />
                <span>
                  <strong>Ayurvedic & Yoga Personalization:</strong> I permit generating personalized wellness diets and yoga schedules based on my health profile.
                </span>
              </label>
            </div>

            {/* Expandable full legal disclaimer & rights */}
            {showConsentDetails && (
              <div
                style={{
                  marginTop: "0.65rem",
                  padding: "0.65rem",
                  background: "#fff",
                  border: "1px solid #dbe6df",
                  borderRadius: "4px",
                  fontSize: "0.76rem",
                  color: "#4a5c55",
                  lineHeight: 1.45,
                  maxHeight: "140px",
                  overflowY: "auto",
                }}
              >
                <strong>Digital Personal Data Protection (DPDP) & ABDM Patient Rights:</strong>
                <p style={{ margin: "4px 0" }}>
                  1. <em>Voluntary Participation:</em> You have the right to review or modify your consent preferences at any time in your Patient Profile.
                </p>
                <p style={{ margin: "4px 0" }}>
                  2. <em>Confidentiality:</em> All health records are encrypted in transit and at rest, accessible only by you and licensed medical practitioners attending your care.
                </p>
                <p style={{ margin: "4px 0" }}>
                  3. <em>Decision Support:</em> AI triage summaries assist medical professionals and do not replace direct consultation with a qualified doctor.
                </p>
              </div>
            )}
          </div>

          {error ? <p className="alert" role="alert">{error}</p> : null}

          <button className="btn" type="submit" disabled={submitting || !consent.agreed}>
            {submitting ? "Creating account…" : "Create account & Agree to Consent"}
          </button>
        </form>

        <div style={{
          marginTop: "20px", paddingTop: "18px",
          borderTop: "1px solid #eef4f0",
          textAlign: "center", display: "flex", flexDirection: "column", gap: "8px",
        }}>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "#5a7068" }}>
            Already registered?{" "}
            <Link to="/login" style={{ color: "#0f6a50", fontWeight: 700, textDecoration: "none" }}>
              Sign in →
            </Link>
          </p>
          <p style={{ margin: 0 }}>
            <Link to="/" style={{ color: "#8fa89f", fontSize: "0.82rem", textDecoration: "none" }}>
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
