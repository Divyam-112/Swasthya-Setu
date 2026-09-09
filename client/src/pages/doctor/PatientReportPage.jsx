import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  User,
  Phone,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  FileEdit,
  ClipboardList,
  HeartPulse,
  Pill,
  Sparkles,
  Save,
  Check,
} from "lucide-react";
import DoctorShell from "../../components/layout/DoctorShell.jsx";
import LoadingState from "../../components/ui/LoadingState.jsx";
import {
  fetchPatientDetail,
  submitReview,
} from "../../api/doctor.js";

const TABS = [
  { id: "summary", label: "AI Summary & SOAP" },
  { id: "complaint", label: "Chief Complaint" },
  { id: "symptoms", label: "Symptoms" },
  { id: "history", label: "Past Medical History" },
  { id: "medications", label: "Medications & Allergies" },
  { id: "transcript", label: "Interview Transcript" },
];

export default function PatientReportPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [medicalHistory, setMedicalHistory] = useState(null);
  const [activeTab, setActiveTab] = useState("summary");

  // Review state
  const [reviewStatus, setReviewStatus] = useState("accepted");
  const [modifications, setModifications] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPatientDetail(sessionId)
      .then((data) => {
        if (!cancelled) {
          setSession(data.session);
          setMedicalHistory(data.unifiedMedicalHistory);
          if (data.session?.doctorReview?.status) {
            setReviewStatus(data.session.doctorReview.status);
            setModifications(data.session.doctorReview.modifications || "");
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || "Failed to load clinical report");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function handleSaveReview(e) {
    e.preventDefault();
    setSavingReview(true);
    setReviewSaved(false);
    try {
      await submitReview(sessionId, reviewStatus, modifications);
      setReviewSaved(true);
      setTimeout(() => setReviewSaved(false), 3000);
    } catch (err) {
      alert("Failed to save review: " + (err.message || "Unknown error"));
    } finally {
      setSavingReview(false);
    }
  }

  if (loading) {
    return (
      <DoctorShell pageTitle="Clinical Report" backTo="/doctor/dashboard">
        <div style={{ padding: "5rem 0" }}>
          <LoadingState message="Loading patient clinical report…" />
        </div>
      </DoctorShell>
    );
  }

  if (error || !session) {
    return (
      <DoctorShell pageTitle="Clinical Report" backTo="/doctor/dashboard">
        <div className="report-card" style={{ textAlign: "center", padding: "3rem" }}>
          <AlertTriangle style={{ width: 36, height: 36, color: "var(--danger)", margin: "0 auto 1rem" }} />
          <h3>Could not find session record</h3>
          <p style={{ color: "var(--ink-soft)" }}>{error || "Session not found"}</p>
          <Link to="/doctor/dashboard" className="btn" style={{ marginTop: "1rem" }}>
            Return to OPD Queue
          </Link>
        </div>
      </DoctorShell>
    );
  }

  const patient = session.patient || {};
  const clinical = session.clinicalHistory || {};
  const summary = session.clinicalSummary || {};
  const redFlags = summary.redFlags || [];
  const soap = summary.soapNote || {};

  // 1. Resolve interview transcript responses from session.responses or session.conversation
  let responses = session.responses || [];
  if ((!responses || responses.length === 0) && Array.isArray(session.conversation) && session.conversation.length > 0) {
    const pairs = [];
    let curQ = "";
    session.conversation.forEach((msg) => {
      if (msg.role === "ai") {
        try {
          const parsed = JSON.parse(msg.content);
          curQ = parsed.question || msg.content;
        } catch {
          curQ = msg.content;
        }
      } else if (msg.role === "patient") {
        pairs.push({
          questionId: curQ || "Clinical Question",
          answer: msg.content,
        });
        curQ = "";
      }
    });
    responses = pairs;
  }

  // 2. Symptoms: resolve from clinical.symptoms OR hpiDetails.associatedSymptoms
  const symptomsList =
    clinical.symptoms && clinical.symptoms.length > 0
      ? clinical.symptoms
      : clinical.hpiDetails?.associatedSymptoms || [];

  // 3. Existing conditions: resolve from clinical.existingConditions OR pastMedicalHistory OR medicalHistory
  const conditionsList =
    clinical.existingConditions && clinical.existingConditions.length > 0
      ? clinical.existingConditions
      : Array.isArray(clinical.pastMedicalHistory) && clinical.pastMedicalHistory.length > 0
      ? clinical.pastMedicalHistory.map((c) =>
          typeof c === "string"
            ? c
            : `${c.condition || "Condition"}${c.duration ? ` (${c.duration})` : ""}${c.currentMedications?.length ? ` — on ${c.currentMedications.join(", ")}` : ""}`
        )
      : Array.isArray(medicalHistory?.cumulativeDiagnoses) && medicalHistory.cumulativeDiagnoses.length > 0
      ? medicalHistory.cumulativeDiagnoses.map((d) => d.condition)
      : [];

  // 4. Surgeries: resolve from clinical.pastSurgeries OR pastSurgicalHistory
  const surgeriesList =
    clinical.pastSurgeries && clinical.pastSurgeries.length > 0
      ? clinical.pastSurgeries
      : Array.isArray(clinical.pastSurgicalHistory) && clinical.pastSurgicalHistory.length > 0
      ? clinical.pastSurgicalHistory.map((s) =>
          typeof s === "string" ? s : `${s.procedure || "Surgical Procedure"}${s.year ? ` (${s.year})` : ""}`
        )
      : [];

  // 5. Current medications: resolve from clinical.currentMedications OR drugHistory OR medicalHistory
  const medicationsList =
    clinical.currentMedications && clinical.currentMedications.length > 0
      ? clinical.currentMedications
      : Array.isArray(clinical.drugHistory) && clinical.drugHistory.length > 0
      ? clinical.drugHistory.map((d) =>
          typeof d === "string" ? d : `${d.name} ${d.dose || ""} ${d.frequency || ""}`.trim()
        )
      : Array.isArray(medicalHistory?.activeMedications) && medicalHistory.activeMedications.length > 0
      ? medicalHistory.activeMedications.map((m) => `${m.name} ${m.dosage || ""} — ${m.frequency || ""}`.trim())
      : [];

  // 6. Allergies: resolve from clinical.allergies OR allergyHistory
  const allergiesList =
    clinical.allergies && clinical.allergies.length > 0
      ? clinical.allergies
      : Array.isArray(clinical.allergyHistory) && clinical.allergyHistory.length > 0
      ? clinical.allergyHistory.map((a) =>
          typeof a === "string" ? a : `${a.allergen || "Allergen"}${a.reaction ? ` (${a.reaction})` : ""}`
        )
      : [];


  return (
    <DoctorShell
      pageTitle={`Patient Report — ${patient.name || "Patient"}`}
      pageSubtitle={`Session ID: ${session._id} · ${session.sessionType || "OPD Intake"}`}
      backTo="/doctor/dashboard"
    >
      {/* Patient Demographic Banner */}
      <div className="report-header-card">
        <div className="report-patient-meta">
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "var(--brand-soft)",
                color: "var(--brand-dark)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.2rem",
                fontWeight: 700,
              }}
            >
              {patient.name ? patient.name[0].toUpperCase() : "P"}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.3rem" }}>{patient.name || "Unknown"}</h2>
              <div style={{ display: "flex", gap: "1rem", color: "var(--ink-soft)", fontSize: "0.875rem", marginTop: "0.2rem", flexWrap: "wrap" }}>
                <span>{patient.age} years · {patient.gender}</span>
                {patient.abhaId ? <span>ABHA: <strong>{patient.abhaId}</strong></span> : null}
                {patient.phone ? <span>Phone: {patient.phone}</span> : null}
                {patient.preferredLanguage ? <span>Language: {patient.preferredLanguage}</span> : null}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn doctor-btn"
              onClick={() => navigate(`/doctor/session/${sessionId}/prescribe`)}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <FileEdit style={{ width: 16, height: 16 }} />
              Write Prescription
            </button>
          </div>
        </div>
      </div>

      {/* Red Flags Alert if present */}
      {redFlags.length > 0 ? (
        <div className="report-red-flags-box">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--danger)", fontWeight: 700, marginBottom: "0.5rem" }}>
            <AlertTriangle style={{ width: 20, height: 20 }} />
            Clinical Red Flags / Emergency Warnings Detected
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.5rem", color: "var(--danger)" }}>
            {redFlags.map((flag, idx) => (
              <li key={idx} style={{ marginBottom: "0.25rem", fontWeight: 600 }}>{flag}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Navigation Tabs */}
      <div className="report-tab-strip">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`report-tab-btn ${activeTab === tab.id ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: AI Summary & SOAP */}
      {activeTab === "summary" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {summary.generatedText ? (
            <div className="report-card">
              <h3>
                <Sparkles style={{ width: 18, height: 18, color: "var(--brand)" }} />
                AI Generated Clinical Summary
              </h3>
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, color: "var(--ink)", margin: 0 }}>
                {summary.generatedText}
              </p>
            </div>
          ) : null}

          <div className="report-card">
            <h3>SOAP Clinical Framework</h3>
            <div className="report-soap-grid">
              <div className="soap-box">
                <h4>S — Subjective</h4>
                <p style={{ margin: 0, fontSize: "0.925rem" }}>
                  {soap.subjective || clinical.chiefComplaint || "No subjective complaint recorded."}
                </p>
              </div>
              <div className="soap-box">
                <h4>O — Objective</h4>
                <p style={{ margin: 0, fontSize: "0.925rem" }}>
                  {soap.objective || "Patient presented via Kiosk intake. Vitals and home readings cross-referenced."}
                </p>
              </div>
              <div className="soap-box">
                <h4>A — Assessment</h4>
                <p style={{ margin: 0, fontSize: "0.925rem" }}>
                  {soap.assessment || summary.possibleConditions?.join(", ") || "Under evaluation by attending physician."}
                </p>
              </div>
              <div className="soap-box">
                <h4>P — Plan</h4>
                <p style={{ margin: 0, fontSize: "0.925rem" }}>
                  {soap.plan || "Review intake, compose digital prescription, order necessary lab tests."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Chief Complaint */}
      {activeTab === "complaint" && (
        <div className="report-card">
          <h3>Chief Complaint Details</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
            <div className="soap-box">
              <h4>Primary Complaint</h4>
              <p style={{ margin: 0, fontWeight: 600 }}>{clinical.chiefComplaint || "Not specified"}</p>
            </div>
            <div className="soap-box">
              <h4>Duration</h4>
              <p style={{ margin: 0 }}>{clinical.duration || "Not specified"}</p>
            </div>
            <div className="soap-box">
              <h4>Severity Level</h4>
              <p style={{ margin: 0, textTransform: "capitalize" }}>{clinical.severity || "Moderate"}</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Symptoms */}
      {activeTab === "symptoms" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="report-card">
            <h3>Reported Symptoms & Manifestations</h3>
            {symptomsList && symptomsList.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                {symptomsList.map((s, idx) => (
                  <span
                    key={idx}
                    className="badge"
                    style={{
                      background: "var(--brand-soft)",
                      color: "var(--brand-dark)",
                      padding: "0.5rem 0.9rem",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      borderRadius: "var(--radius-pill)",
                      border: "1px solid var(--brand-light)",
                    }}
                  >
                    • {s}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--ink-faint)" }}>No specific symptoms listed.</p>
            )}
          </div>

          {clinical.hpiDetails && (
            <div className="report-card">
              <h3>History of Present Illness (HPI) Attributes</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                {clinical.hpiDetails.site && (
                  <div className="soap-box">
                    <h4>Anatomical Site / Location</h4>
                    <p style={{ margin: 0, fontWeight: 600 }}>{clinical.hpiDetails.site}</p>
                  </div>
                )}
                {clinical.hpiDetails.onset && (
                  <div className="soap-box">
                    <h4>Onset & Progression</h4>
                    <p style={{ margin: 0 }}>{clinical.hpiDetails.onset}</p>
                  </div>
                )}
                {clinical.hpiDetails.character && (
                  <div className="soap-box">
                    <h4>Character / Nature</h4>
                    <p style={{ margin: 0 }}>{clinical.hpiDetails.character}</p>
                  </div>
                )}
                {clinical.hpiDetails.timing && (
                  <div className="soap-box">
                    <h4>Timing & Diurnal Variation</h4>
                    <p style={{ margin: 0 }}>{clinical.hpiDetails.timing}</p>
                  </div>
                )}
                {clinical.hpiDetails.exacerbatingFactors?.length > 0 && (
                  <div className="soap-box">
                    <h4>Aggravating / Triggers</h4>
                    <p style={{ margin: 0 }}>{clinical.hpiDetails.exacerbatingFactors.join(", ")}</p>
                  </div>
                )}
                {clinical.hpiDetails.relievingFactors?.length > 0 && (
                  <div className="soap-box">
                    <h4>Relieving Factors</h4>
                    <p style={{ margin: 0 }}>{clinical.hpiDetails.relievingFactors.join(", ")}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Past Medical History */}
      {activeTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="report-card">
            <h3>Past Medical & Surgical History</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
              <div className="soap-box">
                <h4>Pre-Existing Chronic Conditions</h4>
                {conditionsList && conditionsList.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {conditionsList.map((c, i) => (
                      <li key={i} style={{ fontWeight: 500, color: "var(--ink)" }}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, color: "var(--ink-faint)" }}>None reported</p>
                )}
              </div>

              <div className="soap-box">
                <h4>Past Surgeries / Procedures</h4>
                {surgeriesList && surgeriesList.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {surgeriesList.map((s, i) => (
                      <li key={i} style={{ fontWeight: 500, color: "var(--ink)" }}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, color: "var(--ink-faint)" }}>None reported</p>
                )}
              </div>
            </div>
          </div>

          {Array.isArray(clinical.familyHistory) && clinical.familyHistory.length > 0 && (
            <div className="report-card">
              <h3>Family History</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                {clinical.familyHistory.map((fam, idx) => (
                  <div key={idx} className="soap-box" style={{ flex: "1 1 200px" }}>
                    <h4>{fam.relation || "Relative"}</h4>
                    <p style={{ margin: 0, fontWeight: 600 }}>{fam.condition}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Medications & Allergies */}
      {activeTab === "medications" && (
        <div className="report-card">
          <h3>Current Medications & Allergies</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
            <div className="soap-box">
              <h4>Current Active Medications</h4>
              {medicationsList && medicationsList.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {medicationsList.map((m, i) => (
                    <li key={i} style={{ fontWeight: 600, color: "var(--ink)" }}>
                      💊 {m}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, color: "var(--ink-faint)" }}>None reported</p>
              )}
            </div>

            <div className="soap-box">
              <h4>Known Allergies & Sensitivities</h4>
              {allergiesList && allergiesList.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {allergiesList.map((a, i) => (
                    <li key={i} style={{ fontWeight: 600, color: "var(--danger)" }}>
                      ⚠️ {a}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, color: "var(--ok)", fontWeight: 600 }}>
                  ✓ No known drug or food allergies
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Interview Transcript */}
      {activeTab === "transcript" && (
        <div className="report-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>Kiosk AI Interview Transcript</h3>
            <span style={{ fontSize: "0.8rem", background: "var(--surface-sunk)", padding: "0.25rem 0.6rem", borderRadius: "var(--radius-pill)", color: "var(--ink-soft)" }}>
              {responses.length} Dialogue Turns Captured
            </span>
          </div>
          {responses.length === 0 ? (
            <p style={{ color: "var(--ink-faint)" }}>No Q&A responses captured during session.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {responses.map((resp, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "var(--surface-muted)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius-sm)",
                    padding: "1rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--brand-dark)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Query {idx + 1}: {resp.questionId || "Clinical Assessment"}
                    </span>
                    {resp.timestamp && (
                      <span style={{ fontSize: "0.7rem", color: "var(--ink-faint)" }}>
                        {new Date(resp.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  {resp.question && resp.question !== resp.questionId && (
                    <p style={{ margin: "0.25rem 0 0.5rem", fontSize: "0.9rem", color: "var(--ink-subtle)", fontStyle: "italic" }}>
                      "{resp.question}"
                    </p>
                  )}
                  <div
                    style={{
                      background: "var(--surface)",
                      borderLeft: "3px solid var(--brand)",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "var(--radius-xs)",
                    }}
                  >
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--ink-faint)", textTransform: "uppercase", display: "block" }}>
                      Patient Response:
                    </span>
                    <p style={{ margin: "0.15rem 0 0", fontWeight: 600, color: "var(--ink)" }}>
                      {resp.answer || resp.text || "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Doctor Review & Sign-Off Section */}
      <div className="report-card" style={{ marginTop: "1.5rem" }}>
        <h3>Doctor Clinical Review & Validation</h3>
        <form onSubmit={handleSaveReview}>
          <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
              <input
                type="radio"
                name="reviewStatus"
                value="accepted"
                checked={reviewStatus === "accepted"}
                onChange={(e) => setReviewStatus(e.target.value)}
              />
              <span style={{ fontWeight: 600, color: "var(--ok)" }}>Accept Clinical Note</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
              <input
                type="radio"
                name="reviewStatus"
                value="modified"
                checked={reviewStatus === "modified"}
                onChange={(e) => setReviewStatus(e.target.value)}
              />
              <span style={{ fontWeight: 600, color: "var(--warn)" }}>Modify / Add Addendum</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
              <input
                type="radio"
                name="reviewStatus"
                value="rejected"
                checked={reviewStatus === "rejected"}
                onChange={(e) => setReviewStatus(e.target.value)}
              />
              <span style={{ fontWeight: 600, color: "var(--danger)" }}>Reject Note</span>
            </label>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.4rem" }}>
              Doctor Addendum / Clinical Modifications
            </label>
            <textarea
              rows={3}
              value={modifications}
              onChange={(e) => setModifications(e.target.value)}
              placeholder="Add clinical observations, exam findings, or specific diagnosis corrections…"
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

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button type="submit" className="btn" disabled={savingReview}>
              <Save style={{ width: 15, height: 15 }} />
              {savingReview ? "Saving review…" : "Save Clinical Review"}
            </button>
            {reviewSaved ? (
              <span style={{ color: "var(--ok)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Check style={{ width: 16, height: 16 }} />
                Review recorded successfully!
              </span>
            ) : null}
          </div>
        </form>
      </div>
    </DoctorShell>
  );
}
