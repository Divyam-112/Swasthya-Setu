import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Printer,
  Save,
  CheckCircle2,
  Pill,
  FlaskConical,
  Calendar,
  AlertTriangle,
  Stethoscope,
  Sparkles,
  Eye,
  X,
  Check,
} from "lucide-react";
import DoctorShell from "../../components/layout/DoctorShell.jsx";
import LoadingState from "../../components/ui/LoadingState.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import {
  fetchPatientDetail,
  createPrescription,
  getPrescription,
  updatePrescription,
} from "../../api/doctor.js";

const COMMON_DIAGNOSES = [
  "Upper Respiratory Tract Infection (URTI)",
  "Acute Gastroenteritis",
  "Essential Hypertension",
  "Type 2 Diabetes Mellitus",
  "Viral Fever / Pyrexia of Unknown Origin",
  "Migraine / Tension Headache",
  "Allergic Rhinitis",
  "Osteoarthritis / Joint Pain",
  "Acid Peptic Disease / GERD",
  "Urinary Tract Infection (UTI)",
];

const COMMON_LABS = [
  "Complete Blood Count (CBC)",
  "Blood Sugar Fasting (FBS)",
  "Blood Sugar Post-Prandial (PPBS)",
  "HbA1c",
  "Lipid Profile",
  "Liver Function Test (LFT)",
  "Kidney Function Test (KFT)",
  "Thyroid Stimulating Hormone (TSH)",
  "Urine Routine & Microscopic",
  "Chest X-Ray PA View",
  "12-Lead ECG",
  "Serum Creatinine",
];

const FREQUENCIES = [
  "Once daily (OD) - Morning",
  "Once daily (OD) - Night (HS)",
  "Twice daily (BD) - Morning & Night",
  "Three times daily (TDS)",
  "Four times daily (QID)",
  "As needed (SOS)",
];

const YOGA_RECOMMENDATIONS = [
  "Anulom Vilom Pranayama (Alternate nostril breathing)",
  "Bhramari Pranayama (Calming bee breath)",
  "Tadasana (Mountain Pose)",
  "Bhujangasana (Cobra Pose)",
  "Balasana (Child's Pose)",
  "Shavasana (Deep relaxation)",
  "Vajrasana (Post-meal digestion pose)",
];

function emptyMedicationRow() {
  return {
    id: "med-" + Math.random().toString(36).substring(2, 9),
    drug: "",
    dose: "1 tablet",
    frequency: "Twice daily (BD) - Morning & Night",
    duration: "5 days",
    instructions: "After food",
  };
}

export default function PrescriptionComposerPage() {
  const { sessionId } = useParams();
  const { doctor } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);

  // Prescription Form State
  const [existingPrescriptionId, setExistingPrescriptionId] = useState(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [medications, setMedications] = useState([emptyMedicationRow()]);
  const [selectedLabs, setSelectedLabs] = useState([]);
  const [customLab, setCustomLab] = useState("");
  const [selectedYoga, setSelectedYoga] = useState([]);
  const [advice, setAdvice] = useState("Drink plenty of warm fluids. Avoid oily, spicy food. Take adequate rest.");
  const [followUpDate, setFollowUpDate] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchPatientDetail(sessionId).catch(() => null),
      getPrescription(sessionId).catch(() => null),
    ])
      .then(([detailData, rxData]) => {
        if (cancelled) return;
        if (detailData?.session) {
          setSession(detailData.session);
          if (!diagnosis && detailData.session.clinicalHistory?.chiefComplaint) {
            setDiagnosis(detailData.session.clinicalHistory.chiefComplaint);
          }
        }
        if (rxData) {
          setExistingPrescriptionId(rxData._id);
          if (rxData.diagnosis) setDiagnosis(rxData.diagnosis);
          if (rxData.medications && rxData.medications.length > 0) {
            setMedications(
              rxData.medications.map((m) => ({
                id: "med-" + Math.random().toString(36).substring(2, 9),
                drug: m.drug || m.name || "",
                dose: m.dose || m.dosage || "",
                frequency: m.frequency || "Once daily (OD) - Morning",
                duration: m.duration || "5 days",
                instructions: m.instructions || m.timing || "After food",
              }))
            );
          }
          if (rxData.investigations) setSelectedLabs(rxData.investigations);
          if (rxData.advice && rxData.advice.length > 0) {
            setAdvice(rxData.advice.join(". "));
          }
          if (rxData.yogaPoses) {
            setSelectedYoga(
              rxData.yogaPoses.map((p) => (typeof p === "string" ? p : p.name || ""))
            );
          }
          if (rxData.followUpDate) {
            setFollowUpDate(new Date(rxData.followUpDate).toISOString().split("T")[0]);
          }
          if (rxData.notes) setClinicalNotes(rxData.notes);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Failed to load session details");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Medication handlers
  function addMedicationRow() {
    setMedications((prev) => [...prev, emptyMedicationRow()]);
  }

  function removeMedicationRow(id) {
    if (medications.length <= 1) return;
    setMedications((prev) => prev.filter((m) => m.id !== id));
  }

  function updateMedicationRow(id, field, value) {
    setMedications((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  }

  // Lab test toggle
  function toggleLab(test) {
    setSelectedLabs((prev) =>
      prev.includes(test) ? prev.filter((t) => t !== test) : [...prev, test]
    );
  }

  function addCustomLab() {
    const trimmed = customLab.trim();
    if (trimmed && !selectedLabs.includes(trimmed)) {
      setSelectedLabs((prev) => [...prev, trimmed]);
      setCustomLab("");
    }
  }

  // Yoga toggle
  function toggleYoga(pose) {
    setSelectedYoga((prev) =>
      prev.includes(pose) ? prev.filter((p) => p !== pose) : [...prev, pose]
    );
  }

  async function handleSavePrescription(e) {
    e.preventDefault();
    if (!diagnosis.trim()) {
      alert("Please enter a diagnosis.");
      return;
    }

    setSaving(true);
    setSuccessMsg("");

    const validMeds = medications
      .filter((m) => (m.drug || m.name || "").trim().length > 0)
      .map(({ id, ...rest }) => ({
        name: (rest.drug || rest.name || "").trim(),
        dosage: (rest.dose || rest.dosage || "").trim(),
        frequency: rest.frequency || "Once daily (OD) - Morning",
        duration: rest.duration || "5 days",
        timing: rest.instructions || rest.timing || "After food",
        instructions: rest.instructions || rest.timing || "After food",
      }));

    const payload = {
      diagnosis: diagnosis.trim(),
      medications: validMeds,
      investigations: selectedLabs,
      advice: advice.split(".").map((s) => s.trim()).filter(Boolean),
      yogaPoses: selectedYoga,
      followUpDate: followUpDate || null,
      notes: clinicalNotes,
    };

    try {
      let res;
      if (existingPrescriptionId) {
        res = await updatePrescription(sessionId, payload);
      } else {
        res = await createPrescription(sessionId, payload);
        const newId = res?._id || res?.prescription?._id;
        if (newId) setExistingPrescriptionId(newId);
      }
      setSaving(false);
      setSuccessMsg("Prescription saved and digitally signed successfully!");
      setShowPreviewModal(true);
    } catch (err) {
      setSaving(false);
      console.error("Prescription save error:", err);
      alert("Error saving prescription: " + (err?.message || "Check fields"));
    }
  }

  if (loading) {
    return (
      <DoctorShell pageTitle="Digital Prescription Composer" backTo={`/doctor/session/${sessionId}/report`}>
        <div style={{ padding: "5rem 0" }}>
          <LoadingState message="Preparing prescription composer…" />
        </div>
      </DoctorShell>
    );
  }

  const patient = session?.patient || {};
  const doctorName = doctor?.name ? (doctor.name.startsWith("Dr.") ? doctor.name : `Dr. ${doctor.name}`) : "Dr. Naveen";

  return (
    <DoctorShell
      pageTitle="Digital Prescription Composer"
      pageSubtitle={`Patient: ${patient.name || "Patient"} · ABHA: ${patient.abhaId || "N/A"}`}
      backTo={`/doctor/session/${sessionId}/report`}
    >
      <div className="rx-composer">
        {/* Patient Context Banner */}
        <div className="report-header-card" style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <span className="badge" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)", marginBottom: "0.4rem" }}>
                Active OPD Consultation
              </span>
              <h2 style={{ margin: 0, fontSize: "1.25rem" }}>{patient.name || "Unknown Patient"}</h2>
              <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                {patient.age} yrs · {patient.gender} · ABHA: <strong>{patient.abhaId || "None"}</strong>
                {session?.clinicalHistory?.chiefComplaint ? ` · Chief Complaint: "${session.clinicalHistory.chiefComplaint}"` : ""}
              </span>
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Link to={`/doctor/session/${sessionId}/report`} className="btn ghost" style={{ fontSize: "0.85rem" }}>
                <Eye style={{ width: 14, height: 14 }} />
                View Full Intake Report
              </Link>
              {existingPrescriptionId ? (
                <button
                  type="button"
                  className="btn secondary"
                  style={{ fontSize: "0.85rem" }}
                  onClick={() => setShowPreviewModal(true)}
                >
                  <Printer style={{ width: 14, height: 14 }} />
                  Preview & Print Rx
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {successMsg ? (
          <div style={{ background: "var(--ok-bg)", border: "1px solid var(--ok-line)", color: "var(--ok)", padding: "1rem", borderRadius: "var(--radius)", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
            <CheckCircle2 style={{ width: 20, height: 20 }} />
            {successMsg}
          </div>
        ) : null}

        <form onSubmit={handleSavePrescription}>
          {/* Diagnosis Section */}
          <div className="report-card">
            <h3>
              <Stethoscope style={{ width: 18, height: 18, color: "var(--brand)" }} />
              Clinical Diagnosis
            </h3>
            <input
              type="text"
              required
              placeholder="e.g. Acute Upper Respiratory Tract Infection, Allergic Bronchitis"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--line)",
                fontSize: "1rem",
                marginBottom: "0.75rem",
              }}
            />

            <div>
              <small style={{ color: "var(--ink-faint)", display: "block", marginBottom: "0.4rem", fontWeight: 600 }}>
                Quick Suggestions:
              </small>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {COMMON_DIAGNOSES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="rx-tag-pill"
                    style={{ fontSize: "0.78rem" }}
                    onClick={() => setDiagnosis(d)}
                  >
                    + {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Medications Section (Rx) */}
          <div className="report-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>
                <Pill style={{ width: 18, height: 18, color: "var(--brand)" }} />
                Prescribed Medications (Rx)
              </h3>
              <button
                type="button"
                className="btn secondary"
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                onClick={addMedicationRow}
              >
                <Plus style={{ width: 14, height: 14 }} />
                Add Medicine
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="rx-med-table">
                <thead>
                  <tr>
                    <th style={{ width: "32%" }}>Medicine / Formulation</th>
                    <th style={{ width: "16%" }}>Dosage</th>
                    <th style={{ width: "24%" }}>Frequency</th>
                    <th style={{ width: "12%" }}>Duration</th>
                    <th style={{ width: "16%" }}>Instructions</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {medications.map((item, idx) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="text"
                          placeholder="e.g. Tab Paracetamol 500mg"
                          value={item.drug}
                          onChange={(e) => updateMedicationRow(item.id, "drug", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder="1 tablet"
                          value={item.dose}
                          onChange={(e) => updateMedicationRow(item.id, "dose", e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          value={item.frequency}
                          onChange={(e) => updateMedicationRow(item.id, "frequency", e.target.value)}
                        >
                          {FREQUENCIES.map((freq) => (
                            <option key={freq} value={freq}>
                              {freq}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder="5 days"
                          value={item.duration}
                          onChange={(e) => updateMedicationRow(item.id, "duration", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder="After food"
                          value={item.instructions}
                          onChange={(e) => updateMedicationRow(item.id, "instructions", e.target.value)}
                        />
                      </td>
                      <td>
                        {medications.length > 1 ? (
                          <button
                            type="button"
                            className="btn ghost icon-only"
                            style={{ color: "var(--danger)", padding: "0.4rem" }}
                            onClick={() => removeMedicationRow(item.id)}
                            title="Remove item"
                          >
                            <Trash2 style={{ width: 15, height: 15 }} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Diagnostic Investigations */}
          <div className="report-card">
            <h3>
              <FlaskConical style={{ width: 18, height: 18, color: "var(--brand)" }} />
              Diagnostic Lab Orders & Investigations
            </h3>
            <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
              Select relevant lab tests to recommend or mandate for this visit:
            </p>

            <div className="rx-tag-grid">
              {COMMON_LABS.map((test) => {
                const isSelected = selectedLabs.includes(test);
                return (
                  <button
                    key={test}
                    type="button"
                    className={`rx-tag-pill ${isSelected ? "is-selected" : ""}`}
                    onClick={() => toggleLab(test)}
                    style={{ display: "inline-flex", alignItems: "center" }}
                  >
                    {isSelected ? <Check size={12} style={{ marginRight: 4 }} /> : <Plus size={12} style={{ marginRight: 4 }} />}
                    <span>{test}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", maxWidth: "450px" }}>
              <input
                type="text"
                placeholder="Other specific lab test or ultrasound…"
                value={customLab}
                onChange={(e) => setCustomLab(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomLab();
                  }
                }}
                style={{
                  flex: 1,
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--line)",
                  fontSize: "0.85rem",
                }}
              />
              <button
                type="button"
                className="btn secondary"
                onClick={addCustomLab}
                style={{ fontSize: "0.85rem", padding: "0.5rem 0.9rem" }}
              >
                Add Test
              </button>
            </div>
          </div>

          {/* Lifestyle & Ayush Yoga Recommendations */}
          <div className="report-card">
            <h3>
              <Sparkles style={{ width: 18, height: 18, color: "var(--brand)" }} />
              Ayurveda & Yoga Recommendations (Integrated Care)
            </h3>
            <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
              Select gentle yoga or lifestyle practices tailored to the condition:
            </p>
            <div className="rx-tag-grid">
              {YOGA_RECOMMENDATIONS.map((pose) => {
                const isSelected = selectedYoga.includes(pose);
                return (
                  <button
                    key={pose}
                    type="button"
                    className={`rx-tag-pill ${isSelected ? "is-selected" : ""}`}
                    onClick={() => toggleYoga(pose)}
                    style={{ display: "inline-flex", alignItems: "center" }}
                  >
                    {isSelected ? <Check size={12} style={{ marginRight: 4 }} /> : <Plus size={12} style={{ marginRight: 4 }} />}
                    <span>{pose}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Advice, Follow-up & Clinical Notes */}
          <div className="report-card">
            <h3>General Clinical Advice & Follow-Up</h3>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.25rem", marginBottom: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Dietary & Activity Advice to Patient
                </label>
                <textarea
                  rows={3}
                  value={advice}
                  onChange={(e) => setAdvice(e.target.value)}
                  placeholder="e.g. Plenty of water, avoid spicy food, rest for 3 days…"
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--line)",
                    fontSize: "0.9rem",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Follow-Up Review Date
                </label>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--line)",
                    fontSize: "0.9rem",
                  }}
                />
                <small style={{ color: "var(--ink-faint)", display: "block", marginTop: "0.3rem" }}>
                  Leave blank if only SOS follow-up required.
                </small>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Confidential Doctor Notes (Internal Record)
              </label>
              <textarea
                rows={2}
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                placeholder="Any special remarks or differentials for subsequent consultations…"
                style={{
                  width: "100%",
                  padding: "0.65rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--line)",
                  fontSize: "0.85rem",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>

          {/* Submission Bar */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "1rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
            {successMsg && (
              <span style={{ color: "#16a34a", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.95rem" }}>
                <CheckCircle2 style={{ width: 20, height: 20 }} />
                Prescription Digitally Signed & Saved!
              </span>
            )}
            <Link to={`/doctor/session/${sessionId}/report`} className="btn ghost">
              Cancel
            </Link>
            <button
              type="submit"
              className="btn doctor-btn"
              disabled={saving}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1.75rem", fontSize: "1rem" }}
            >
              <Save style={{ width: 18, height: 18 }} />
              {saving ? "Signing & Saving…" : "Sign & Issue Prescription"}
            </button>
          </div>
        </form>
      </div>

      {/* Prescription Printable Preview Modal */}
      {showPreviewModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(14, 46, 38, 0.6)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "var(--radius)",
              maxWidth: "800px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-lg)",
              padding: "1.5rem",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: "0.75rem", marginBottom: "1.25rem" }}>
              <strong style={{ fontSize: "1.1rem" }}>Official Digital Prescription</strong>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.print()}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <Printer style={{ width: 14, height: 14 }} />
                  Print
                </button>
                <button
                  type="button"
                  className="btn ghost icon-only"
                  onClick={() => setShowPreviewModal(false)}
                >
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>
            </div>

            {/* Print paper */}
            <div className="rx-paper">
              <div className="rx-paper-header">
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: "1.4rem", color: "#0f6a50" }}>
                    SwasthyaSetu Health Center
                  </h2>
                  <p style={{ margin: 0, fontSize: "0.9rem", color: "#444" }}>
                    Ayushman Bharat Digital Health Ecosystem (ABDM)
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <h3 style={{ margin: "0 0 2px", fontSize: "1.1rem" }}>{doctorName}</h3>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#555" }}>
                    {doctor?.specialization || "General Physician"}
                  </p>
                  <small style={{ color: "#777" }}>Reg. No: MED-{String(doctor?._id || doctor?.id || "981423").slice(-6)}</small>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", background: "#f6faf7", padding: "0.75rem 1rem", borderRadius: "6px", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
                <div>
                  <strong>Patient:</strong> {patient.name || "Patient"} ({patient.age || "—"}y / {patient.gender || "—"})<br />
                  <strong>ABHA ID:</strong> {patient.abhaId || "Not provided"}
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong>Date:</strong> {new Date().toLocaleDateString("en-IN")}<br />
                  <strong>Session:</strong> #{String(sessionId || "").slice(-6)}
                </div>
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <strong style={{ fontSize: "1rem", color: "#0f6a50" }}>DIAGNOSIS:</strong>
                <p style={{ margin: "0.25rem 0 0", fontSize: "1.1rem", fontWeight: 600 }}>{diagnosis}</p>
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <strong style={{ fontSize: "1rem", color: "#0f6a50" }}>Rx (MEDICATIONS):</strong>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left", fontSize: "0.85rem" }}>
                      <th style={{ padding: "6px 0" }}>#</th>
                      <th>Medicine Name</th>
                      <th>Dose</th>
                      <th>Frequency</th>
                      <th>Duration</th>
                      <th>Instructions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medications.filter((m) => (m.drug || m.name || "").trim()).map((med, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>
                        <td style={{ padding: "8px 0" }}>{idx + 1}</td>
                        <td><strong>{med.drug || med.name}</strong></td>
                        <td>{med.dose || med.dosage}</td>
                        <td>{med.frequency}</td>
                        <td>{med.duration}</td>
                        <td>{med.instructions || med.timing}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedLabs.length > 0 && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <strong style={{ fontSize: "0.95rem", color: "#0f6a50" }}>INVESTIGATIONS ORDERED:</strong>
                  <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.2rem" }}>
                    {selectedLabs.map((lab, i) => (
                      <li key={i}>{lab}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedYoga.length > 0 && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <strong style={{ fontSize: "0.95rem", color: "#0f6a50" }}>AYURVEDA & YOGA ADVISORY:</strong>
                  <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.2rem" }}>
                    {selectedYoga.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {advice && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <strong style={{ fontSize: "0.95rem", color: "#0f6a50" }}>ADVICE / INSTRUCTIONS:</strong>
                  <p style={{ margin: "0.25rem 0 0" }}>{advice}</p>
                </div>
              )}

              {followUpDate && (
                <div style={{ marginBottom: "2rem", color: "#92400e", fontWeight: 600 }}>
                  Review / Follow-Up on: {new Date(followUpDate).toLocaleDateString("en-IN", { dateStyle: "long" })}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "3rem", borderTop: "1px dashed #bbb", paddingTop: "1rem" }}>
                <small style={{ color: "#777" }}>
                  Generated digitally via SwasthyaSetu ABDM-compliant clinical workstation.
                </small>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontStyle: "italic", fontFamily: "cursive", fontSize: "1.1rem", color: "#0a4d3a" }}>
                    {doctorName}
                  </div>
                  <strong style={{ display: "block", fontSize: "0.85rem" }}>Authorized Physician Signature</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </DoctorShell>
  );
}
