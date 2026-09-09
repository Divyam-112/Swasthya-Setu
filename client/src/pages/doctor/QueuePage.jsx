import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Timer,
  Eye,
  FileEdit,
  CheckSquare,
  RefreshCw,
  Search,
  Play,
} from "lucide-react";
import DoctorShell from "../../components/layout/DoctorShell.jsx";
import LoadingState from "../../components/ui/LoadingState.jsx";
import {
  fetchDoctorQueue,
  updateAppointmentStatus,
} from "../../api/doctor.js";

const FILTER_TABS = [
  { id: "all", label: "All Patients" },
  { id: "waiting", label: "Waiting" },
  { id: "in_progress", label: "In Consultation" },
  { id: "flagged", label: "Red Flags" },
  { id: "completed", label: "Completed" },
];

export default function QueuePage() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDoctorQueue()
      .then((data) => {
        if (!cancelled) {
          setQueue(data.queue || []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || "Failed to load OPD queue");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Derived metrics
  const total = queue.length;
  const completed = queue.filter((p) => p.appointmentStatus === "completed").length;
  const waiting = queue.filter((p) => p.appointmentStatus === "booked").length;
  const inProgress = queue.filter((p) => p.appointmentStatus === "in_progress").length;
  const flagged = queue.filter((p) => p.hasRedFlags).length;

  // Filtered queue
  const filtered = queue.filter((item) => {
    // Status filter
    if (activeFilter === "waiting" && item.appointmentStatus !== "booked") return false;
    if (activeFilter === "in_progress" && item.appointmentStatus !== "in_progress") return false;
    if (activeFilter === "completed" && item.appointmentStatus !== "completed") return false;
    if (activeFilter === "flagged" && !item.hasRedFlags) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = item.patientName?.toLowerCase().includes(q);
      const abhaMatch = item.abhaId?.toLowerCase().includes(q);
      const complaintMatch = item.chiefComplaint?.toLowerCase().includes(q);
      if (!nameMatch && !abhaMatch && !complaintMatch) return false;
    }

    return true;
  });

  async function handleStatusChange(appointmentId, newStatus) {
    try {
      await updateAppointmentStatus(appointmentId, newStatus);
      setQueue((prev) =>
        prev.map((p) =>
          p.appointmentId === appointmentId ? { ...p, appointmentStatus: newStatus } : p
        )
      );
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  }

  return (
    <DoctorShell pageTitle="Today's OPD Queue" pageSubtitle="Real-time patient intake and clinical consultation queue">
      {/* Metrics Row */}
      <div className="doctor-stats-grid">
        <div className="doctor-stat-card">
          <div className="doctor-stat-head">
            <Users style={{ width: 16, height: 16, color: "var(--brand)" }} />
            <span>Total Today</span>
          </div>
          <span className="doctor-stat-num">{total}</span>
        </div>

        <div className="doctor-stat-card">
          <div className="doctor-stat-head">
            <Clock style={{ width: 16, height: 16, color: "var(--ink-faint)" }} />
            <span>Waiting</span>
          </div>
          <span className="doctor-stat-num" style={{ color: "var(--warn)" }}>{waiting}</span>
        </div>

        <div className="doctor-stat-card">
          <div className="doctor-stat-head">
            <Timer style={{ width: 16, height: 16, color: "var(--accent)" }} />
            <span>In Consultation</span>
          </div>
          <span className="doctor-stat-num" style={{ color: "var(--brand-dark)" }}>{inProgress}</span>
        </div>

        <div className="doctor-stat-card">
          <div className="doctor-stat-head">
            <CheckCircle2 style={{ width: 16, height: 16, color: "var(--ok)" }} />
            <span>Completed</span>
          </div>
          <span className="doctor-stat-num" style={{ color: "var(--ok)" }}>{completed}</span>
        </div>

        {flagged > 0 ? (
          <div className="doctor-stat-card" style={{ borderLeft: "4px solid var(--danger)" }}>
            <div className="doctor-stat-head">
              <AlertTriangle style={{ width: 16, height: 16, color: "var(--danger)" }} />
              <span style={{ color: "var(--danger)" }}>Red Flags</span>
            </div>
            <span className="doctor-stat-num" style={{ color: "var(--danger)" }}>{flagged}</span>
          </div>
        ) : null}
      </div>

      {/* Control Bar: Tabs, Search, Refresh */}
      <div className="queue-filter-bar">
        <div className="queue-tabs">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`queue-tab ${activeFilter === tab.id ? "is-active" : ""}`}
              onClick={() => setActiveFilter(tab.id)}
            >
              {tab.label}
              {tab.id === "flagged" && flagged > 0 ? (
                <span
                  style={{
                    marginLeft: "6px",
                    background: "var(--danger-bg)",
                    color: "var(--danger)",
                    padding: "2px 6px",
                    borderRadius: "10px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                  }}
                >
                  {flagged}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <div style={{ position: "relative", minWidth: "220px" }}>
            <Search
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                width: 15,
                height: 15,
                color: "var(--ink-faint)",
              }}
            />
            <input
              type="text"
              placeholder="Search queue…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "0.45rem 0.75rem 0.45rem 2rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--line)",
                fontSize: "0.85rem",
                background: "var(--surface)",
              }}
            />
          </div>

          <button
            type="button"
            className="btn ghost"
            onClick={() => setRefreshKey((k) => k + 1)}
            style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 0.8rem", fontSize: "0.85rem" }}
            title="Refresh queue"
          >
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: "4rem 0" }}>
          <LoadingState message="Loading today's patient queue…" />
        </div>
      ) : error ? (
        <div className="report-card" style={{ textAlign: "center", padding: "3rem" }}>
          <AlertTriangle style={{ width: 36, height: 36, color: "var(--danger)", margin: "0 auto 1rem" }} />
          <h3 style={{ justifyContent: "center" }}>Could not load queue</h3>
          <p style={{ color: "var(--ink-soft)", maxWidth: 400, margin: "0 auto 1.5rem" }}>{error}</p>
          <button type="button" className="btn" onClick={() => setRefreshKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      ) : (
        <div className="queue-table-wrap">
          <table className="queue-table">
            <thead>
              <tr>
                <th style={{ width: 60, textAlign: "center" }}>Token</th>
                <th>Patient Details</th>
                <th>Chief Complaint</th>
                <th>Red Flags</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3rem", color: "var(--ink-faint)" }}>
                    No patients match the current view.
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr key={entry.appointmentId || entry.sessionId}>
                    <td style={{ textAlign: "center" }}>
                      <span className="queue-token">{entry.tokenNumber || "—"}</span>
                    </td>
                    <td>
                      <strong style={{ display: "block", color: "var(--ink)" }}>
                        {entry.patientName}
                      </strong>
                      <span style={{ fontSize: "0.8rem", color: "var(--ink-faint)" }}>
                        {entry.age} yrs · {entry.gender}
                        {entry.abhaId ? ` · ABHA: ${entry.abhaId}` : ""}
                      </span>
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--ink)", fontWeight: 500 }}>
                        {entry.chiefComplaint}
                      </p>
                      {entry.preferredTimeSlot ? (
                        <small style={{ color: "var(--ink-faint)", textTransform: "capitalize" }}>
                          Slot: {entry.preferredTimeSlot}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      {entry.hasRedFlags && entry.redFlags?.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          <span className="queue-red-flag">
                            <AlertTriangle style={{ width: 12, height: 12 }} />
                            {entry.redFlags.length} Warning{entry.redFlags.length > 1 ? "s" : ""}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--danger)" }}>
                            {entry.redFlags[0]}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: "0.8rem", color: "var(--ok)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <CheckCircle2 style={{ width: 13, height: 13 }} />
                          Normal
                        </span>
                      )}
                    </td>
                    <td>
                      {entry.appointmentStatus === "completed" ? (
                        <span className="badge" style={{ background: "var(--ok-bg)", color: "var(--ok)", border: "1px solid var(--ok-line)" }}>
                          Completed
                        </span>
                      ) : entry.appointmentStatus === "in_progress" ? (
                        <span className="badge" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)" }}>
                          In Progress
                        </span>
                      ) : (
                        <span className="badge" style={{ background: "var(--surface-sunk)", color: "var(--ink-soft)" }}>
                          Waiting
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                        {entry.sessionId ? (
                          <>
                            <button
                              type="button"
                              className="btn secondary"
                              style={{ padding: "0.35rem 0.7rem", fontSize: "0.825rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                              onClick={() => navigate(`/doctor/session/${entry.sessionId}/report`)}
                              title="View structured clinical intake & SOAP summary"
                            >
                              <Eye style={{ width: 13, height: 13 }} />
                              Report
                            </button>
                            <button
                              type="button"
                              className="btn doctor-btn"
                              style={{ padding: "0.35rem 0.7rem", fontSize: "0.825rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                              onClick={() => navigate(`/doctor/session/${entry.sessionId}/prescribe`)}
                              title="Write digital prescription"
                            >
                              <FileEdit style={{ width: 13, height: 13 }} />
                              Prescribe
                            </button>
                          </>
                        ) : null}

                        {entry.appointmentStatus === "booked" && entry.appointmentId ? (
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ padding: "0.35rem 0.6rem", fontSize: "0.825rem" }}
                            onClick={() => handleStatusChange(entry.appointmentId, "in_progress")}
                            title="Start consultation"
                          >
                            <Play style={{ width: 13, height: 13 }} />
                          </button>
                        ) : null}

                        {entry.appointmentStatus === "in_progress" && entry.appointmentId ? (
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ padding: "0.35rem 0.6rem", fontSize: "0.825rem", color: "var(--ok)" }}
                            onClick={() => handleStatusChange(entry.appointmentId, "completed")}
                            title="Mark as completed"
                          >
                            <CheckSquare style={{ width: 14, height: 14 }} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </DoctorShell>
  );
}
