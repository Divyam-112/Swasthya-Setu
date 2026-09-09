import { useState } from "react";
import { NavLink, useNavigate, Link } from "react-router-dom";
import {
  Activity,
  Users,
  Search,
  Calendar,
  FileText,
  LogOut,
  Menu,
  X,
  Stethoscope,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";

const NAV_ITEMS = [
  { to: "/doctor/dashboard", icon: Users, label: "OPD Queue" },
  { to: "/doctor/search", icon: Search, label: "Patient Search" },
  { to: "/doctor/appointments", icon: Calendar, label: "Appointments" },
  { to: "/doctor/records", icon: FileText, label: "Medical Records" },
];

export default function DoctorShell({ children, pageTitle, pageSubtitle, backTo }) {
  const { doctor, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const todayStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  function handleLogout() {
    logout();
    navigate("/");
  }

  const doctorName = doctor?.name ? (doctor.name.startsWith("Dr.") ? doctor.name : `Dr. ${doctor.name}`) : "Dr. On Duty";
  const doctorInitials = doctor?.name
    ? doctor.name
        .replace(/^Dr\.\s*/i, "")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "DR";

  return (
    <div className="doctor-shell">
      {/* Mobile backdrop */}
      <div
        className={`doctor-sidebar-backdrop ${sidebarOpen ? "is-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside className={`doctor-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="doctor-brand">
          <div className="doctor-brand-mark">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <h2>SwasthyaSetu</h2>
            <span>Doctor Clinical Portal</span>
          </div>
          <button
            type="button"
            className="btn ghost icon-only"
            style={{ marginLeft: "auto", display: sidebarOpen ? "flex" : "none" }}
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="doctor-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/doctor/dashboard"}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `doctor-nav-item ${isActive ? "is-active" : ""}`
                }
              >
                <Icon />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="doctor-profile-card">
          <div className="doctor-profile-info">
            <div className="doctor-avatar">{doctorInitials}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <strong style={{ display: "block", fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {doctorName}
              </strong>
              <small style={{ color: "var(--ink-faint)", fontSize: "0.75rem", display: "block" }}>
                {doctor?.specialization || "General Medicine"}
              </small>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link to="/" className="btn ghost" style={{ flex: 1, padding: "0.4rem", fontSize: "0.8rem", textAlign: "center" }}>
              Home
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="btn ghost"
              style={{ flex: 1, padding: "0.4rem", fontSize: "0.8rem", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
            >
              <LogOut style={{ width: 14, height: 14 }} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="doctor-main">
        <header className="doctor-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              type="button"
              className="btn ghost icon-only"
              style={{ display: "flex" }}
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            {backTo ? (
              <Link to={backTo} className="btn ghost" style={{ padding: "0.35rem 0.6rem", display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.85rem" }}>
                ← Back
              </Link>
            ) : null}
            <div className="doctor-topbar-title">
              <h1>{pageTitle}</h1>
              <p>{pageSubtitle || todayStr}</p>
            </div>
          </div>

          <div className="doctor-topbar-actions">
            <span className="badge" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)", display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem" }}>
              <ShieldCheck style={{ width: 14, height: 14 }} />
              Verified Doctor
            </span>
          </div>
        </header>

        <main className="doctor-content">{children}</main>
      </div>
    </div>
  );
}
