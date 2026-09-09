import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Printer,
  Download,
  X,
  FileText,
  CheckCircle2,
  Pill,
  FlaskConical,
  Building2,
  Eye,
  Plus,
  Stethoscope,
  UploadCloud,
  Calendar,
  Activity,
  Check
} from "lucide-react";
import { getPatientSessions, getPatientPrescriptions } from "../api/history.js";
import { getPatientDocuments } from "../api/documents.js";
import { toUserMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import LoadingState from "../components/ui/LoadingState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { formatDate, formatDateTime } from "../utils/format.js";

function formatDoctorName(name) {
  if (!name) return "Dr. Treating Physician";
  return name.startsWith("Dr.") ? name : `Dr. ${name}`;
}

const DOC_TYPE_LABELS = {
  prescription: "Prescription",
  lab_report: "Lab Report",
  discharge_summary: "Discharge Summary",
  imaging: "Imaging",
  other: "Document",
};

function renderDocTypeIcon(type, size = 15) {
  switch (type) {
    case "prescription":
      return <Pill size={size} color="#059669" />;
    case "lab_report":
      return <FlaskConical size={size} color="#2563eb" />;
    case "discharge_summary":
      return <Building2 size={size} color="#7c3aed" />;
    case "imaging":
      return <Eye size={size} color="#0891b2" />;
    default:
      return <FileText size={size} color="#475569" />;
  }
}

const SESSION_STATUS_COLORS = {
  completed: "ok",
  reviewed: "ok",
  in_progress: "warn",
  cancelled: "",
};

function groupByMonth(items) {
  const groups = {};
  for (const item of items) {
    const date = new Date(item._sortDate);
    const key = date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

export default function MedicalHistory() {
  const { patient } = useAuth();
  const { t } = useLanguage();
  const [sessions, setSessions] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [selectedRx, setSelectedRx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddMenu, setShowAddMenu] = useState(false);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [sessRes, docRes, rxRes] = await Promise.all([
        getPatientSessions(),
        getPatientDocuments(),
        getPatientPrescriptions().catch(() => ({ data: [] })),
      ]);
      setSessions(sessRes.data || []);
      setDocuments(docRes.data || []);
      setPrescriptions(rxRes?.data || []);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="page">
        <LoadingState message="Loading your health records…" />
      </div>
    );
  }

  // Build unified timeline
  const sessionItems = sessions.map((s) => ({
    _id: s._id,
    _type: "session",
    _sortDate: s.createdAt,
    status: s.status,
    sessionType: s.sessionType,
    chiefComplaint: s.clinicalHistory?.chiefComplaint,
    completionPercentage: s.completionPercentage,
    createdAt: s.createdAt,
  }));

  const docItems = documents.map((d) => ({
    _id: d._id,
    _type: "document",
    _sortDate: d.uploadedAt || d.sessionCreatedAt,
    docType: d.type,
    imageUrl: d.imageUrl,
    extractedData: d.extractedData,
    sessionId: d.sessionId,
    uploadedAt: d.uploadedAt,
  }));

  const rxItems = prescriptions.map((r) => ({
    _id: r._id,
    _type: "prescription",
    _sortDate: r.createdAt,
    diagnosis: r.diagnosis,
    doctorName: r.doctor?.name,
    specialization: r.doctor?.specialization,
    hospitalId: r.doctor?.hospitalId,
    medications: r.medications || [],
    investigations: r.investigations || [],
    advice: r.advice || [],
    yogaPoses: r.yogaPoses || [],
    followUpDate: r.followUpDate,
    notes: r.notes || "",
    patient: r.patient,
    sessionId: r.session?._id || r.session || "",
    createdAt: r.createdAt,
  }));

  const allItems = [...sessionItems, ...docItems, ...rxItems].sort(
    (a, b) => new Date(b._sortDate) - new Date(a._sortDate),
  );

  const groups = groupByMonth(allItems);
  const months = Object.keys(groups);

  return (
    <div className="page">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-title">{t("records_title", "Medical Records")}</h1>
          <p className="lede">{t("records_subtitle", "Your complete health history — sessions, reports, and uploads.")}</p>
        </div>
        <div style={{ position: "relative" }}>
          <button
            className="btn"
            type="button"
            onClick={() => setShowAddMenu((v) => !v)}
            aria-expanded={showAddMenu}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Plus size={15} />
            {t("add_medical_data", "Add medical data")}
          </button>
          {showAddMenu ? (
            <div className="add-menu" role="menu">
              <button
                role="menuitem"
                className="add-menu-item"
                type="button"
                onClick={() => { setShowAddMenu(false); navigate("/history/new"); }}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <Stethoscope size={15} color="var(--brand)" />
                {t("record_new_history", "Record new history")}
              </button>
              <button
                role="menuitem"
                className="add-menu-item"
                type="button"
                onClick={() => { setShowAddMenu(false); navigate("/documents"); }}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <UploadCloud size={15} color="var(--brand)" />
                {t("upload_a_document", "Upload a document")}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {allItems.length === 0 ? (
        <EmptyState message="No health records yet. Start by recording your first history or uploading a document." />
      ) : (
        <div className="timeline">
          {months.map((month) => (
            <section key={month} className="timeline-group">
              <h2 className="timeline-month">{month}</h2>
              <div className="timeline-entries">
                {groups[month].map((item) =>
                  item._type === "session" ? (
                    <Link
                      key={item._id}
                      className="timeline-entry session-entry"
                      to={`/history/${item._id}`}
                    >
                      <div className="timeline-dot session-dot" />
                      <div className="timeline-content">
                        <div className="timeline-entry-header">
                          <span className="timeline-icon" style={{ display: "inline-flex", alignItems: "center", color: "var(--brand)" }}>
                            <Stethoscope size={16} />
                          </span>
                          <strong>{item.chiefComplaint || "History session"}</strong>
                          <span className={`badge ${SESSION_STATUS_COLORS[item.status] || ""}`}>
                            {item.status === "in_progress" ? "In progress" : item.status}
                          </span>
                        </div>
                        <p className="muted timeline-meta">
                          {formatDateTime(item.createdAt)} ·{" "}
                          {item.sessionType === "ayush" ? "Ayurvedic" : "General"} ·{" "}
                          {item.completionPercentage || 0}% complete
                        </p>
                        {item.status === "in_progress" ? (
                          <span className="timeline-cta">{t("continue_recording", "Continue recording →")}</span>
                        ) : (
                          <span className="timeline-cta">{t("view_full_history", "View full history →")}</span>
                        )}
                      </div>
                    </Link>
                  ) : item._type === "document" ? (
                    <div key={`${item._id}-${item._sortDate}`} className="timeline-entry doc-entry">
                      <div className="timeline-dot doc-dot" />
                      <div className="timeline-content">
                        <div className="timeline-entry-header">
                          <span className="timeline-icon" style={{ display: "inline-flex", alignItems: "center" }}>
                            {renderDocTypeIcon(item.docType, 16)}
                          </span>
                          <strong>{DOC_TYPE_LABELS[item.docType] || t("upload_a_document", "Document")}</strong>
                          <span className="badge">{item.docType?.replace("_", " ")}</span>
                        </div>
                        <p className="muted timeline-meta">{formatDate(item.uploadedAt)}</p>
                        {item.extractedData?.diagnoses?.length ? (
                          <p className="muted">Diagnoses: {item.extractedData.diagnoses.join(", ")}</p>
                        ) : null}
                        {item.extractedData?.medications?.length ? (
                          <p className="muted">
                            {t("medicines", "Medications")}: {item.extractedData.medications.map((m) => m.name).join(", ")}
                          </p>
                        ) : null}
                        {item.imageUrl ? (
                          <a
                            href={item.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="timeline-cta"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {t("view_document", "View document →")}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : item._type === "prescription" ? (
                    <div
                      key={`rx-${item._id}`}
                      className="timeline-entry rx-entry"
                      style={{ borderLeft: "3px solid #16a34a", cursor: "pointer" }}
                      onClick={() => setSelectedRx(item)}
                    >
                      <div className="timeline-dot" style={{ background: "#16a34a" }} />
                      <div className="timeline-content">
                        <div className="timeline-entry-header">
                          <span className="timeline-icon" style={{ display: "inline-flex", alignItems: "center", color: "#16a34a" }}>
                            <Pill size={16} />
                          </span>
                          <strong>Prescription: {item.diagnosis}</strong>
                          <span className="badge ok">{t("official_rx", "Official Rx")}</span>
                        </div>
                        <p className="muted timeline-meta">
                          {formatDateTime(item.createdAt)} · {t("prescribed_by", "Prescribed by")} {formatDoctorName(item.doctorName)}
                          {item.specialization ? ` (${item.specialization})` : ""}
                        </p>
                        {item.medications?.length > 0 && (
                          <div style={{ marginTop: "0.4rem", fontSize: "0.85rem" }}>
                            <strong>{t("medicines", "Medicines")}: </strong>
                            {item.medications
                              .map((m) => `${m.name || m.drug || "Medicine"}${m.dosage || m.dose ? ` (${m.dosage || m.dose})` : ""}`)
                              .join(", ")}
                          </div>
                        )}
                        {item.advice?.length > 0 && (
                          <div style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                            <strong>{t("advice", "Advice")}: </strong> {item.advice.join(". ")}
                          </div>
                        )}
                        {item.yogaPoses?.length > 0 && (
                          <div style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                            <strong>{t("yoga_lifestyle", "Yoga / Lifestyle")}: </strong>
                            {item.yogaPoses.map((p) => p.name || p).join(", ")}
                          </div>
                        )}
                        <div
                          style={{
                            marginTop: "0.85rem",
                            display: "flex",
                            gap: "0.6rem",
                            flexWrap: "wrap",
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => setSelectedRx(item)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.4rem",
                              fontSize: "0.85rem",
                              padding: "6px 14px",
                            }}
                          >
                            <FileText style={{ width: 14, height: 14 }} />
                            {t("view_read_rx", "View & Read Prescription")}
                          </button>
                          <button
                            type="button"
                            className="btn small secondary"
                            onClick={() => {
                              setSelectedRx(item);
                              setTimeout(() => window.print(), 250);
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.4rem",
                              fontSize: "0.85rem",
                              padding: "6px 14px",
                            }}
                          >
                            <Printer style={{ width: 14, height: 14 }} />
                            {t("download_print_pdf", "Download / Print PDF")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {selectedRx && (
        <div
          className="rx-modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(14, 46, 38, 0.65)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.25rem",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setSelectedRx(null)}
        >
          <div
            className="rx-modal-container"
            style={{
              background: "#fff",
              borderRadius: "var(--radius)",
              maxWidth: "820px",
              width: "100%",
              maxHeight: "92vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-lg)",
              padding: "1.75rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Actions Bar (hidden in print) */}
            <div
              className="no-print"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid var(--line)",
                paddingBottom: "0.85rem",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <strong style={{ fontSize: "1.15rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <FileText style={{ width: 20, height: 20, color: "var(--brand)" }} />
                  Official Medical Prescription
                </strong>
                <span style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                  Verified ABDM e-Prescription Document
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.print()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "7px 16px",
                    fontSize: "0.9rem",
                  }}
                >
                  <Printer style={{ width: 16, height: 16 }} />
                  Download / Print PDF
                </button>
                <button
                  type="button"
                  className="btn ghost icon-only"
                  onClick={() => setSelectedRx(null)}
                  title="Close"
                  style={{ width: "36px", height: "36px", borderRadius: "50%" }}
                >
                  <X style={{ width: 20, height: 20 }} />
                </button>
              </div>
            </div>

            {/* The Printable Rx Paper */}
            <div className="rx-paper">
              {/* Prescription Header */}
              <div className="rx-paper-header">
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: "1.5rem", color: "#0f6a50", fontWeight: 700 }}>
                    SwasthyaSetu Digital Health Clinic
                  </h2>
                  <p style={{ margin: "0 0 2px", fontSize: "0.9rem", color: "#333", fontWeight: 600 }}>
                    {formatDoctorName(selectedRx.doctorName)}
                    {selectedRx.specialization ? ` — ${selectedRx.specialization}` : ""}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "#666" }}>
                    {selectedRx.hospitalId ? `Clinic/Hospital ID: ${selectedRx.hospitalId} · ` : ""}
                    ABDM National Health Provider Registry
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span
                    style={{
                      display: "inline-block",
                      background: "#ecfdf3",
                      color: "#15803d",
                      border: "1px solid #bfe6cd",
                      padding: "3px 10px",
                      borderRadius: "999px",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      marginBottom: "4px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <CheckCircle2 size={13} />
                    ABDM Digitally Verified
                  </span>
                  <h3 style={{ margin: "2px 0 2px", fontSize: "1.05rem" }}>e-Prescription</h3>
                  <small style={{ color: "#666", display: "block", fontSize: "0.8rem" }}>
                    Date: {new Date(selectedRx.createdAt).toLocaleDateString("en-IN", { dateStyle: "long" })}
                  </small>
                  <small style={{ color: "#888", fontSize: "0.75rem" }}>
                    Rx ID: {selectedRx._id?.slice(-8).toUpperCase()}
                  </small>
                </div>
              </div>

              {/* Patient Details Strip */}
              <div
                style={{
                  background: "#f6faf7",
                  border: "1px solid #dbe6df",
                  padding: "0.85rem 1.15rem",
                  borderRadius: "6px",
                  marginBottom: "1.25rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "0.75rem",
                  fontSize: "0.88rem",
                }}
              >
                <div>
                  <span style={{ color: "#666", display: "block", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    Patient Name
                  </span>
                  <strong>{selectedRx.patient?.name || patient?.name || "Patient"}</strong>
                </div>
                <div>
                  <span style={{ color: "#666", display: "block", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    Age / Gender
                  </span>
                  <strong>
                    {(selectedRx.patient?.age || patient?.age) ? `${selectedRx.patient?.age || patient?.age} yrs` : "N/A"} /{" "}
                    {selectedRx.patient?.gender || patient?.gender || "N/A"}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "#666", display: "block", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    ABHA Address
                  </span>
                  <strong style={{ color: "#0f6a50" }}>
                    {selectedRx.patient?.abhaId || patient?.abhaId || "ABHA Registered"}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "#666", display: "block", fontSize: "0.75rem", textTransform: "uppercase" }}>
                    Contact
                  </span>
                  <strong>{selectedRx.patient?.phone || patient?.phone || "N/A"}</strong>
                </div>
              </div>

              {/* Diagnosis */}
              <div style={{ marginBottom: "1.25rem" }}>
                <strong style={{ color: "#0f6a50", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Clinical Diagnosis
                </strong>
                <p style={{ margin: "0.25rem 0 0", fontSize: "1.1rem", fontWeight: 700, color: "#16241f" }}>
                  {selectedRx.diagnosis}
                </p>
              </div>

              {/* Medications Table (Rx) */}
              <div style={{ marginBottom: "1.5rem" }}>
                <strong style={{ color: "#0f6a50", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Prescribed Medications (Rx)
                </strong>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    marginTop: "0.5rem",
                    border: "1px solid #dbe6df",
                  }}
                >
                  <thead>
                    <tr style={{ background: "#eef4f0", borderBottom: "2px solid #0f6a50", textAlign: "left", fontSize: "0.82rem" }}>
                      <th style={{ padding: "8px 10px" }}>#</th>
                      <th style={{ padding: "8px 10px" }}>Medicine / Drug Name</th>
                      <th style={{ padding: "8px 10px" }}>Dosage</th>
                      <th style={{ padding: "8px 10px" }}>Frequency</th>
                      <th style={{ padding: "8px 10px" }}>Duration</th>
                      <th style={{ padding: "8px 10px" }}>Instructions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRx.medications?.length > 0 ? (
                      selectedRx.medications.map((m, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #eee", fontSize: "0.88rem" }}>
                          <td style={{ padding: "8px 10px", color: "#666" }}>{i + 1}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <strong style={{ color: "#0a4d3a" }}>{m.name || m.drug}</strong>
                          </td>
                          <td style={{ padding: "8px 10px" }}>{m.dosage || m.dose || "-"}</td>
                          <td style={{ padding: "8px 10px" }}>{m.frequency || "Twice daily"}</td>
                          <td style={{ padding: "8px 10px" }}>{m.duration || "-"}</td>
                          <td style={{ padding: "8px 10px" }}>
                            {m.instructions || m.timing || "After food"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ padding: "12px", textAlign: "center", color: "#888" }}>
                          No oral medications prescribed.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Investigations */}
              {selectedRx.investigations?.length > 0 && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <strong style={{ color: "#0f6a50", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Lab Investigations & Tests Ordered
                  </strong>
                  <ul style={{ margin: "0.3rem 0 0 1.25rem", padding: 0, fontSize: "0.9rem" }}>
                    {selectedRx.investigations.map((inv, i) => (
                      <li key={i} style={{ marginBottom: "0.2rem" }}>{inv}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Advice & Dietary Guidelines */}
              {selectedRx.advice?.length > 0 && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <strong style={{ color: "#0f6a50", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Medical & Dietary Advice
                  </strong>
                  <ul style={{ margin: "0.3rem 0 0 1.25rem", padding: 0, fontSize: "0.9rem" }}>
                    {selectedRx.advice.map((adv, i) => (
                      <li key={i} style={{ marginBottom: "0.2rem" }}>{adv}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Yoga & Ayurvedic Lifestyle */}
              {selectedRx.yogaPoses?.length > 0 && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <strong style={{ color: "#0f6a50", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Ayurvedic & Yoga Lifestyle Therapy
                  </strong>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.65rem", marginTop: "0.4rem" }}>
                    {selectedRx.yogaPoses.map((p, i) => (
                      <div
                        key={i}
                        style={{
                          background: "#f0f7f3",
                          border: "1px solid #cbe4d7",
                          borderRadius: "6px",
                          padding: "0.6rem 0.85rem",
                          fontSize: "0.85rem",
                        }}
                      >
                        <strong style={{ color: "#0a4d3a", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <Activity size={13} /> {p.name || p}
                        </strong>
                        {p.sanskritName && (
                          <span style={{ fontSize: "0.75rem", fontStyle: "italic", color: "#555" }}>
                            ({p.sanskritName})
                          </span>
                        )}
                        {p.durationMinutes && (
                          <span style={{ display: "block", fontSize: "0.78rem", color: "#666", marginTop: "2px" }}>
                            Duration: {p.durationMinutes} mins · {p.timeOfDay || "Morning"}
                          </span>
                        )}
                        {p.instructions && (
                          <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#444" }}>
                            {p.instructions}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Follow up & Notes */}
              {selectedRx.followUpDate && (
                <div
                  style={{
                    background: "#fff9eb",
                    border: "1px solid #f3d5b5",
                    color: "#92400e",
                    padding: "0.75rem 1rem",
                    borderRadius: "6px",
                    marginBottom: "1.25rem",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <Calendar size={16} />
                  <span>Follow-Up Consultation: {new Date(selectedRx.followUpDate).toLocaleDateString("en-IN", { dateStyle: "full" })}</span>
                </div>
              )}

              {/* Footer & Digital Signatures */}
              <div
                style={{
                  marginTop: "2rem",
                  paddingTop: "1.25rem",
                  borderTop: "2px solid #0f6a50",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  fontSize: "0.82rem",
                  color: "#555",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 600, color: "#16241f" }}>
                    SwasthyaSetu Universal Health Records
                  </p>
                  <p style={{ margin: 0 }}>Integrated with Ayushman Bharat Digital Mission (ABDM)</p>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "#888" }}>
                    Document Ref: {selectedRx._id}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      border: "1px dashed #15803d",
                      background: "#ecfdf3",
                      color: "#15803d",
                      padding: "6px 12px",
                      borderRadius: "4px",
                      fontWeight: 600,
                      fontSize: "0.8rem",
                      marginBottom: "4px",
                    }}
                  >
                    <CheckCircle2 size={13} />
                    Digitally Signed & Issued
                  </div>
                  <strong style={{ display: "block", color: "#16241f" }}>
                    {formatDoctorName(selectedRx.doctorName)}
                  </strong>
                  <span style={{ fontSize: "0.75rem", color: "#777" }}>
                    Registered Medical Practitioner
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
