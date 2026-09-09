import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  FileEdit,
  Play,
  CheckSquare,
} from "lucide-react";
import DoctorShell from "../../components/layout/DoctorShell.jsx";
import LoadingState from "../../components/ui/LoadingState.jsx";
import { fetchDoctorQueue, updateAppointmentStatus } from "../../api/doctor.js";

function toDateString(d) {
  return d.toISOString().slice(0, 10);
}

function formatDate(d) {
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AppointmentsPage() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dateStr = toDateString(selectedDate);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDoctorQueue(dateStr)
      .then((data) => {
        if (!cancelled) setAppointments(data.queue || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Failed to load appointments");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dateStr]);

  function changeDay(delta) {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + delta);
    setSelectedDate(next);
  }

  async function handleStatusChange(appointmentId, status) {
    try {
      await updateAppointmentStatus(appointmentId, status);
      setAppointments((prev) =>
        prev.map((a) => (a.appointmentId === appointmentId ? { ...a, appointmentStatus: status } : a))
      );
    } catch (err) {
      alert("Could not update status: " + err.message);
    }
  }

  return (
    <DoctorShell
      pageTitle="Doctor Appointments Schedule"
      pageSubtitle={`Schedule for ${formatDate(selectedDate)}`}
    >
      {/* Date Navigation Strip */}
      <div className="report-header-card" style={{ padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn ghost icon-only"
              onClick={() => changeDay(-1)}
              title="Previous Day"
            >
              <ChevronLeft style={{ width: 18, height: 18 }} />
            </button>
            <h2 style={{ margin: 0, fontSize: "1.15rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Calendar style={{ width: 18, height: 18, color: "var(--brand)" }} />
              {formatDate(selectedDate)}
            </h2>
            <button
              type="button"
              className="btn ghost icon-only"
              onClick={() => changeDay(1)}
              title="Next Day"
            >
              <ChevronRight style={{ width: 18, height: 18 }} />
            </button>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}
              onClick={() => setSelectedDate(new Date())}
            >
              Today
            </button>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(new Date(e.target.value));
              }}
              style={{
                padding: "0.35rem 0.6rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--line)",
                fontSize: "0.85rem",
              }}
            />
          </div>
        </div>
      </div>

      {/* Appointments List */}
      {loading ? (
        <div style={{ padding: "4rem 0" }}>
          <LoadingState message="Loading schedule…" />
        </div>
      ) : error ? (
        <div className="report-card" style={{ textAlign: "center", padding: "3rem" }}>
          <AlertTriangle style={{ width: 36, height: 36, color: "var(--danger)", margin: "0 auto 1rem" }} />
          <h3>Failed to load appointments</h3>
          <p style={{ color: "var(--ink-soft)" }}>{error}</p>
        </div>
      ) : appointments.length === 0 ? (
        <div className="report-card" style={{ textAlign: "center", padding: "3.5rem 1.5rem" }}>
          <Clock style={{ width: 36, height: 36, color: "var(--ink-faint)", margin: "0 auto 1rem" }} />
          <h3>No appointments scheduled</h3>
          <p style={{ color: "var(--ink-soft)" }}>
            There are no booked consultations for {formatDate(selectedDate)}.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {appointments.map((apt) => (
            <div
              key={apt.appointmentId}
              className="report-card"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1.15rem",
                marginBottom: 0,
                borderLeft:
                  apt.appointmentStatus === "completed"
                    ? "4px solid var(--ok)"
                    : apt.appointmentStatus === "in_progress"
                    ? "4px solid var(--brand)"
                    : "4px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div className="queue-token">{apt.tokenNumber || "•"}</div>
                <div>
                  <strong style={{ fontSize: "1rem", color: "var(--ink)" }}>{apt.patientName}</strong>
                  <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.825rem", color: "var(--ink-soft)", marginTop: "2px" }}>
                    <span>{apt.age}y · {apt.gender}</span>
                    {apt.abhaId ? <span>ABHA: {apt.abhaId}</span> : null}
                    <span style={{ textTransform: "capitalize" }}>Slot: {apt.preferredTimeSlot || "General"}</span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--ink)" }}>
                    <strong>Reason:</strong> {apt.chiefComplaint}
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                {apt.appointmentStatus === "completed" ? (
                  <span className="badge" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}>
                    Completed
                  </span>
                ) : apt.appointmentStatus === "in_progress" ? (
                  <span className="badge" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)" }}>
                    In Consultation
                  </span>
                ) : (
                  <span className="badge" style={{ background: "var(--surface-sunk)", color: "var(--ink-soft)" }}>
                    Booked
                  </span>
                )}

                {apt.sessionId ? (
                  <>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ padding: "0.35rem 0.75rem", fontSize: "0.825rem" }}
                      onClick={() => navigate(`/doctor/session/${apt.sessionId}/report`)}
                    >
                      Report
                    </button>
                    <button
                      type="button"
                      className="btn doctor-btn"
                      style={{ padding: "0.35rem 0.75rem", fontSize: "0.825rem" }}
                      onClick={() => navigate(`/doctor/session/${apt.sessionId}/prescribe`)}
                    >
                      Prescribe
                    </button>
                  </>
                ) : null}

                {apt.appointmentStatus === "booked" ? (
                  <button
                    type="button"
                    className="btn ghost icon-only"
                    onClick={() => handleStatusChange(apt.appointmentId, "in_progress")}
                    title="Start consultation"
                  >
                    <Play style={{ width: 14, height: 14 }} />
                  </button>
                ) : null}

                {apt.appointmentStatus === "in_progress" ? (
                  <button
                    type="button"
                    className="btn ghost icon-only"
                    style={{ color: "var(--ok)" }}
                    onClick={() => handleStatusChange(apt.appointmentId, "completed")}
                    title="Mark completed"
                  >
                    <CheckSquare style={{ width: 15, height: 15 }} />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </DoctorShell>
  );
}
