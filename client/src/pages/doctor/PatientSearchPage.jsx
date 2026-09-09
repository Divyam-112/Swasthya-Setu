import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, User, CreditCard, ChevronRight, X, Eye, FileEdit, AlertTriangle } from "lucide-react";
import DoctorShell from "../../components/layout/DoctorShell.jsx";
import LoadingState from "../../components/ui/LoadingState.jsx";
import { fetchDoctorQueue } from "../../api/doctor.js";

export default function PatientSearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [allPatients, setAllPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDoctorQueue()
      .then((data) => {
        if (!cancelled) setAllPatients(data.queue || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const results =
    q.length < 2
      ? []
      : allPatients.filter(
          (p) =>
            p.patientName?.toLowerCase().includes(q) ||
            (p.abhaId && p.abhaId.toLowerCase().includes(q)) ||
            (p.phone && p.phone.includes(q)) ||
            (p.chiefComplaint && p.chiefComplaint.toLowerCase().includes(q))
        );

  return (
    <DoctorShell
      pageTitle="Patient Search & Medical Records"
      pageSubtitle="Find patients by Name, ABHA 14-digit ID, or Chief Complaint"
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Search input bar */}
        <div style={{ position: "relative", marginBottom: "1.5rem" }}>
          <Search
            style={{
              position: "absolute",
              left: "14px",
              top: "50%",
              transform: "translateY(-50%)",
              width: 18,
              height: 18,
              color: "var(--ink-faint)",
            }}
          />
          <input
            type="search"
            autoFocus
            placeholder="Type patient name, ABHA number (e.g. 14-...), or symptoms…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "0.85rem 2.75rem 0.85rem 2.75rem",
              borderRadius: "var(--radius)",
              border: "2px solid var(--line)",
              fontSize: "1rem",
              background: "var(--surface)",
              boxShadow: "var(--shadow-sm)",
            }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="btn ghost icon-only"
              style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          ) : null}
        </div>

        {loading ? (
          <div style={{ padding: "4rem 0" }}>
            <LoadingState message="Loading patient index…" />
          </div>
        ) : q.length < 2 ? (
          <div className="report-card" style={{ textAlign: "center", padding: "3.5rem 1.5rem" }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                background: "var(--brand-soft)",
                color: "var(--brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
              }}
            >
              <Search style={{ width: 28, height: 28 }} />
            </div>
            <h3 style={{ justifyContent: "center" }}>Search Patient Records</h3>
            <p style={{ color: "var(--ink-soft)", maxWidth: 450, margin: "0 auto" }}>
              Enter at least 2 characters to look up patients across your registered hospital appointments and triage sessions.
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="report-card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
            <p style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 0.5rem" }}>No matching patients found</p>
            <p style={{ color: "var(--ink-faint)" }}>
              No results for "<strong>{query}</strong>" in today's active records.
            </p>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: "0.85rem", color: "var(--ink-faint)", marginBottom: "0.75rem" }}>
              Found {results.length} patient record{results.length > 1 ? "s" : ""}:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {results.map((patient) => (
                <div
                  key={patient.appointmentId || patient.sessionId}
                  className="report-card"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "1.15rem",
                    marginBottom: 0,
                    borderLeft: patient.hasRedFlags ? "4px solid var(--danger)" : "1px solid var(--line)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: "var(--surface-sunk)",
                        color: "var(--brand)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                      }}
                    >
                      {patient.patientName ? patient.patientName[0].toUpperCase() : "P"}
                    </div>
                    <div>
                      <strong style={{ fontSize: "1rem", color: "var(--ink)" }}>{patient.patientName}</strong>
                      <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.825rem", color: "var(--ink-soft)", marginTop: "2px" }}>
                        <span>{patient.age}y · {patient.gender}</span>
                        {patient.abhaId ? <span>ABHA: {patient.abhaId}</span> : null}
                        {patient.phone ? <span>Phone: {patient.phone}</span> : null}
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--ink)" }}>
                        <strong>Complaint:</strong> {patient.chiefComplaint}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {patient.sessionId ? (
                      <>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                          onClick={() => navigate(`/doctor/session/${patient.sessionId}/report`)}
                        >
                          <Eye style={{ width: 14, height: 14 }} />
                          Report
                        </button>
                        <button
                          type="button"
                          className="btn doctor-btn"
                          style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                          onClick={() => navigate(`/doctor/session/${patient.sessionId}/prescribe`)}
                        >
                          <FileEdit style={{ width: 14, height: 14 }} />
                          Prescribe
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DoctorShell>
  );
}
