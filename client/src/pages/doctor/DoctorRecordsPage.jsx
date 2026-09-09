import { useState, useEffect } from "react";
import {
  FileText,
  Search,
  Loader2,
  AlertTriangle,
  User,
  CreditCard,
  Pill,
  Calendar,
  Printer,
  X,
} from "lucide-react";
import DoctorShell from "../../components/layout/DoctorShell.jsx";
import LoadingState from "../../components/ui/LoadingState.jsx";
import {
  fetchDoctorPrescriptions,
  fetchPatientMedicalHistory,
} from "../../api/doctor.js";

export default function DoctorRecordsPage() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loadingRx, setLoadingRx] = useState(true);
  const [rxError, setRxError] = useState(null);

  // Patient history lookup state
  const [lookupId, setLookupId] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(null);
  const [lookupData, setLookupData] = useState(null);

  // Modal for preview
  const [activePrescription, setActivePrescription] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingRx(true);
    fetchDoctorPrescriptions()
      .then((data) => {
        if (!cancelled) setPrescriptions(data || []);
      })
      .catch((err) => {
        if (!cancelled) setRxError(err?.message || "Failed to load prescriptions archive");
      })
      .finally(() => {
        if (!cancelled) setLoadingRx(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLookup(e) {
    e.preventDefault();
    const trimmed = lookupId.trim();
    if (!trimmed) return;

    setLookupLoading(true);
    setLookupError(null);
    setLookupData(null);

    try {
      const res = await fetchPatientMedicalHistory(trimmed);
      setLookupData(res);
    } catch (err) {
      setLookupError(err?.message || "Patient record not found. Please verify the Patient ID.");
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <DoctorShell
      pageTitle="Clinical Records & Prescriptions Archive"
      pageSubtitle="Past prescriptions issued and unified patient longitudinal medical records"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
        {/* Section 1: Prescriptions Issued by You */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FileText style={{ width: 18, height: 18, color: "var(--brand)" }} />
              Prescriptions Issued by You ({prescriptions.length})
            </h2>
          </div>

          {loadingRx ? (
            <LoadingState message="Loading your prescriptions archive…" />
          ) : rxError ? (
            <div className="report-card" style={{ padding: "1.5rem", color: "var(--ink-soft)" }}>
              <p style={{ margin: 0 }}>{rxError}</p>
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="report-card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
              <FileText style={{ width: 36, height: 36, color: "var(--ink-faint)", margin: "0 auto 1rem" }} />
              <h3>No prescriptions authored yet</h3>
              <p style={{ color: "var(--ink-soft)" }}>
                When you sign and complete a consultation, prescriptions will appear here for reprint and audit.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
              {prescriptions.map((rx) => (
                <div key={rx._id} className="report-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", marginBottom: 0 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                      <div>
                        <strong style={{ fontSize: "1.05rem", color: "var(--ink)" }}>
                          {rx.patient?.name || "Patient"}
                        </strong>
                        <span style={{ fontSize: "0.8rem", color: "var(--ink-faint)", display: "block" }}>
                          {rx.patient?.age}y · {rx.patient?.gender} · ABHA: {rx.patient?.abhaId || "N/A"}
                        </span>
                      </div>
                      <span className="badge" style={{ background: "var(--surface-sunk)", fontSize: "0.75rem" }}>
                        {new Date(rx.createdAt).toLocaleDateString("en-IN")}
                      </span>
                    </div>

                    <div style={{ background: "var(--surface-muted)", padding: "0.65rem 0.85rem", borderRadius: "var(--radius-sm)", margin: "0.5rem 0" }}>
                      <strong style={{ fontSize: "0.8rem", color: "var(--brand-dark)", textTransform: "uppercase" }}>
                        Diagnosis:
                      </strong>
                      <p style={{ margin: "2px 0 0", fontSize: "0.925rem", fontWeight: 600 }}>{rx.diagnosis}</p>
                    </div>

                    {rx.medications && rx.medications.length > 0 ? (
                      <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                        <strong>Rx: </strong>
                        {rx.medications.map((m) => m.drug).slice(0, 3).join(", ")}
                        {rx.medications.length > 3 ? ` +${rx.medications.length - 3} more` : ""}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--line)" }}>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: "0.825rem", padding: "0.35rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                      onClick={() => setActivePrescription(rx)}
                    >
                      <Printer style={{ width: 13, height: 13 }} />
                      View & Print
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Look up Patient Unified Medical History */}
        <div style={{ marginTop: "1rem" }}>
          <h2 style={{ margin: "0 0 0.85rem", fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Search style={{ width: 18, height: 18, color: "var(--brand)" }} />
            Look Up Patient Unified Medical History
          </h2>

          <div className="report-card">
            <form onSubmit={handleLookup} style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Enter Patient MongoDB ObjectId or select from queue…"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: "260px",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--line)",
                  fontSize: "0.9rem",
                }}
              />
              <button
                type="submit"
                className="btn"
                disabled={lookupLoading || !lookupId.trim()}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                {lookupLoading ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Search style={{ width: 15, height: 15 }} />}
                Retrieve History
              </button>
            </form>

            {lookupError ? (
              <div style={{ marginTop: "1rem", color: "var(--danger)", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem" }}>
                <AlertTriangle style={{ width: 16, height: 16 }} />
                {lookupError}
              </div>
            ) : null}

            {lookupData ? (
              <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--line)", paddingTop: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: "var(--brand-soft)",
                      color: "var(--brand-dark)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                    }}
                  >
                    {lookupData.patient?.name ? lookupData.patient.name[0] : "P"}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{lookupData.patient?.name}</h3>
                    <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                      {lookupData.patient?.age} yrs · {lookupData.patient?.gender} · ABHA: {lookupData.patient?.abhaId}
                    </span>
                  </div>
                </div>

                {lookupData.aiContext ? (
                  <div style={{ background: "var(--surface-muted)", padding: "1rem", borderRadius: "var(--radius-sm)", marginBottom: "1rem" }}>
                    <strong style={{ display: "block", marginBottom: "0.4rem", color: "var(--brand-dark)" }}>
                      AI Medical Context Summary
                    </strong>
                    <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                      {lookupData.aiContext}
                    </p>
                  </div>
                ) : null}

                {lookupData.medicalHistory?.prescriptions?.length > 0 ? (
                  <div>
                    <strong style={{ display: "block", marginBottom: "0.5rem" }}>
                      Past Prescriptions on Record ({lookupData.medicalHistory.prescriptions.length})
                    </strong>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {lookupData.medicalHistory.prescriptions.map((p, idx) => (
                        <div key={idx} style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "0.75rem", borderRadius: "var(--radius-sm)" }}>
                          <span style={{ fontSize: "0.75rem", color: "var(--ink-faint)" }}>
                            {new Date(p.date || p.createdAt).toLocaleDateString("en-IN")} · Dr. {p.doctorName || "Physician"}
                          </span>
                          <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: "0.9rem" }}>{p.diagnosis}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Modal for viewing active prescription */}
      {activePrescription && (
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
              maxWidth: "760px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-lg)",
              padding: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: "0.75rem", marginBottom: "1.25rem" }}>
              <strong style={{ fontSize: "1.1rem" }}>Prescription Details</strong>
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
                  onClick={() => setActivePrescription(null)}
                >
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>
            </div>

            <div className="rx-paper">
              <div className="rx-paper-header">
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: "1.4rem", color: "#0f6a50" }}>
                    SwasthyaSetu Digital Clinic
                  </h2>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#555" }}>
                    ABDM Interoperable Health Record
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Prescription Record</h3>
                  <small style={{ color: "#777" }}>
                    Date: {new Date(activePrescription.createdAt).toLocaleDateString("en-IN")}
                  </small>
                </div>
              </div>

              <div style={{ background: "#f6faf7", padding: "0.75rem 1rem", borderRadius: "6px", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
                <strong>Patient:</strong> {activePrescription.patient?.name} ({activePrescription.patient?.age}y / {activePrescription.patient?.gender})<br />
                <strong>ABHA ID:</strong> {activePrescription.patient?.abhaId || "None"}
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <strong style={{ color: "#0f6a50" }}>DIAGNOSIS:</strong>
                <p style={{ margin: "0.2rem 0 0", fontSize: "1.05rem", fontWeight: 600 }}>{activePrescription.diagnosis}</p>
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <strong style={{ color: "#0f6a50" }}>MEDICATIONS (Rx):</strong>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.4rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left", fontSize: "0.85rem" }}>
                      <th style={{ padding: "6px 0" }}>#</th>
                      <th>Drug</th>
                      <th>Dose</th>
                      <th>Frequency</th>
                      <th>Duration</th>
                      <th>Instructions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activePrescription.medications || []).map((m, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>
                        <td style={{ padding: "6px 0" }}>{i + 1}</td>
                        <td><strong>{m.drug}</strong></td>
                        <td>{m.dose}</td>
                        <td>{m.frequency}</td>
                        <td>{m.duration}</td>
                        <td>{m.instructions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {activePrescription.investigations?.length > 0 ? (
                <div style={{ marginBottom: "1rem" }}>
                  <strong style={{ color: "#0f6a50" }}>LAB TESTS ORDERED:</strong>
                  <p style={{ margin: "0.2rem 0 0" }}>{activePrescription.investigations.join(", ")}</p>
                </div>
              ) : null}

              {activePrescription.advice?.length > 0 ? (
                <div style={{ marginBottom: "1rem" }}>
                  <strong style={{ color: "#0f6a50" }}>ADVICE:</strong>
                  <p style={{ margin: "0.2rem 0 0" }}>{activePrescription.advice.join(". ")}</p>
                </div>
              ) : null}

              {activePrescription.followUpDate ? (
                <div style={{ color: "#92400e", fontWeight: 600 }}>
                  Follow-Up Review: {new Date(activePrescription.followUpDate).toLocaleDateString("en-IN", { dateStyle: "long" })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </DoctorShell>
  );
}
