import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { usePreferences } from "../../context/PreferencesContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import Icon from "../ui/Icon.jsx";

const TEXT_SIZES = [
  { value: "normal", label: "A", hint: "Normal text size" },
  { value: "large", label: "A+", hint: "Large text size" },
  { value: "xlarge", label: "A++", hint: "Extra large text size" },
];

export default function AppLayout() {
  const { patient, logout } = useAuth();
  const { textSize, setTextSize, contrast, toggleContrast } = usePreferences();
  const { language, setLanguage, languages, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate("/");
  }

  const navGroups = [
    {
      label: t("care", "Care"),
      links: [
        { to: "/dashboard", label: t("dashboard", "Dashboard"), icon: "dashboard" },
        { to: "/history", label: t("medical_records", "Medical Records"), icon: "history" },
        { to: "/chat", label: t("ai_health_assistant", "AI Health Assistant"), icon: "chat" },
        { to: "/documents", label: t("upload_documents", "Upload Documents"), icon: "document" },
        { to: "/appointments", label: t("book_appointment", "Book Appointment"), icon: "calendar" },
      ],
    },
    {
      label: t("daily_routine", "Daily routine"),
      links: [
        { to: "/tracker", label: t("health_tracker", "Health Tracker"), icon: "tracker" },
        { to: "/exercise", label: t("exercise_yoga", "Exercise & Yoga"), icon: "exercise" },
        { to: "/ayurveda", label: t("ayurvedic_care", "Ayurvedic Care"), icon: "leaf" },
        { to: "/reminders", label: t("reminders", "Reminders"), icon: "bell" },
      ],
    },
    {
      label: t("account", "Account"),
      links: [
        { to: "/profile", label: t("profile", "Profile"), icon: "user" },
      ],
    },
  ];

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      {open ? <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" /> : null}

      <aside className={`sidebar ${open ? "open" : ""}`} id="app-sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Icon name="stethoscope" size={24} />
          </div>
          <div>
            <strong>MediKiosk</strong>
            <p>{t("patient_workspace", "Patient workspace")}</p>
          </div>
        </div>

        <nav aria-label="Main">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              <div className="nav-list">
                {group.links.map((link) => (
                  <NavLink key={link.to} to={link.to} className="nav-link">
                    <Icon name={link.icon} size={19} />
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <strong>{patient?.name || "Patient"}</strong>
            <span>{patient?.abhaId ? `ABHA ${patient.abhaId}` : t("signed_in", "Signed in")}</span>
          </div>
          <button className="btn ghost" type="button" onClick={handleLogout}>
            <Icon name="logout" size={18} />
            {t("logout", "Logout")}
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            className="btn secondary small mobile-toggle"
            type="button"
            aria-controls="app-sidebar"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={open ? "close" : "menu"} size={18} />
            {t("menu", "Menu")}
          </button>

          <div className="topbar-id">
            <strong>{patient?.name || "Patient"}</strong>
            <span className="faint">
              {patient?.abhaId ? `ABHA ${patient.abhaId}` : t("signed_in", "Signed in")}
            </span>
          </div>

          <div className="topbar-tools">
            {/* Language Selector */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <label htmlFor="topbar-lang-select" className="sr-only">
                {t("select_language", "Select Language")}
              </label>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius-sm)",
                  padding: "4px 10px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "var(--ink)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <Icon name="language" size={16} className="muted" />
                <select
                  id="topbar-lang-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "0 2px",
                    minHeight: "auto",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "inherit",
                    cursor: "pointer",
                    outline: "none",
                  }}
                  title="Choose Language / भाषा चुनें"
                >
                  {languages.map((l) => (
                    <option key={l.code} value={l.code} style={{ background: "#fff", color: "#16241f" }}>
                      {l.nativeName} ({l.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pref-group hide-mobile" role="group" aria-label="Text size">
              {TEXT_SIZES.map((size) => (
                <button
                  key={size.value}
                  type="button"
                  className="pref-btn"
                  aria-pressed={textSize === size.value}
                  title={size.hint}
                  onClick={() => setTextSize(size.value)}
                >
                  {size.label}
                  <span className="sr-only"> {size.hint}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn secondary small"
              aria-pressed={contrast === "high"}
              onClick={toggleContrast}
            >
              <Icon name="shield" size={17} />
              {contrast === "high" ? t("standard_view", "Standard view") : t("high_contrast", "High contrast")}
            </button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>

        <nav className="bottom-nav" aria-label="Quick navigation">
          <NavLink to="/dashboard">
            <Icon name="dashboard" size={22} />
            {t("dashboard", "Dashboard")}
          </NavLink>
          <NavLink to="/chat">
            <Icon name="chat" size={22} />
            {t("ai_health_assistant", "Chat")}
          </NavLink>
          <NavLink to="/tracker">
            <Icon name="tracker" size={22} />
            {t("health_tracker", "Tracker")}
          </NavLink>
          <NavLink to="/history">
            <Icon name="history" size={22} />
            {t("medical_records", "Records")}
          </NavLink>
          <NavLink to="/profile">
            <Icon name="user" size={22} />
            {t("profile", "Profile")}
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
