import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { toUserMessage } from "../api/client.js";

export default function DoctorLogin() {
  const { loginDoctor } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await loginDoctor(email, password);
      navigate("/doctor/dashboard", { replace: true });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen" style={{
      background: "linear-gradient(135deg, #0a1e2e 0%, #0e2a3a 35%, #0f4a5a 65%, #1a6a7a 100%)",
    }}>
      <div className="auth-main">
        <div className="auth-card">
          {/* Logo / Brand */}
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "60px",
              height: "60px",
              borderRadius: "18px",
              background: "linear-gradient(135deg, #1d5c74, #0f6a50)",
              marginBottom: "16px",
              boxShadow: "0 8px 24px rgba(29,92,116,0.35)",
            }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <div style={{
              display: "inline-block",
              background: "linear-gradient(90deg, #e5eff4, #e3f2ea)",
              color: "#0a3a4d",
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "4px 12px",
              borderRadius: "100px",
              border: "1px solid #c9dde4",
              marginBottom: "12px",
            }}>Doctor Portal</div>
            <h1 style={{
              fontSize: "1.65rem",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "#0f1e1a",
              margin: "0 0 6px",
              lineHeight: 1.2,
            }}>Welcome, Doctor</h1>
            <p style={{ color: "#5a7068", fontSize: "0.92rem", margin: 0 }}>
              Sign in to access your clinical portal
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Email */}
            <div>
              <label style={{
                display: "block",
                fontSize: "0.82rem",
                fontWeight: 700,
                color: "#1c3028",
                marginBottom: "7px",
                letterSpacing: "0.01em",
              }}>
                Email Address
              </label>
              <div style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)",
                  color: "#8fa89f", pointerEvents: "none",
                }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@hospital.com"
                  autoComplete="email"
                  required
                  style={{
                    width: "100%",
                    height: "50px",
                    paddingLeft: "42px",
                    paddingRight: "14px",
                    border: "1.5px solid #c9dde4",
                    borderRadius: "12px",
                    fontSize: "0.93rem",
                    background: "#f5f9fb",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={e => { e.target.style.borderColor = "#1d5c74"; e.target.style.boxShadow = "0 0 0 3px rgba(29,92,116,0.12)"; e.target.style.background = "#fff"; }}
                  onBlur={e => { e.target.style.borderColor = "#c9dde4"; e.target.style.boxShadow = "none"; e.target.style.background = "#f5f9fb"; }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{
                display: "block",
                fontSize: "0.82rem",
                fontWeight: 700,
                color: "#1c3028",
                marginBottom: "7px",
                letterSpacing: "0.01em",
              }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)",
                  color: "#8fa89f", pointerEvents: "none",
                }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  autoComplete="current-password"
                  required
                  style={{
                    width: "100%",
                    height: "50px",
                    paddingLeft: "42px",
                    paddingRight: "46px",
                    border: "1.5px solid #c9dde4",
                    borderRadius: "12px",
                    fontSize: "0.93rem",
                    background: "#f5f9fb",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={e => { e.target.style.borderColor = "#1d5c74"; e.target.style.boxShadow = "0 0 0 3px rgba(29,92,116,0.12)"; e.target.style.background = "#fff"; }}
                  onBlur={e => { e.target.style.borderColor = "#c9dde4"; e.target.style.boxShadow = "none"; e.target.style.background = "#f5f9fb"; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  style={{
                    position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "#8fa89f", padding: "4px",
                    display: "flex", alignItems: "center",
                  }}
                  tabIndex={-1}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                display: "flex", alignItems: "center", gap: "10px",
                background: "#fff1f4", border: "1px solid #f4c9d4",
                borderRadius: "10px", padding: "10px 14px",
                color: "#9f1239", fontSize: "0.86rem", fontWeight: 500,
              }} role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              style={{
                height: "52px",
                borderRadius: "12px",
                border: "none",
                background: submitting
                  ? "#7da8b8"
                  : "linear-gradient(135deg, #1d5c74 0%, #0f6a50 100%)",
                color: "white",
                fontWeight: 700,
                fontSize: "0.97rem",
                cursor: submitting ? "not-allowed" : "pointer",
                letterSpacing: "0.01em",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "opacity 0.2s, transform 0.15s",
                transform: "scale(1)",
                boxShadow: submitting ? "none" : "0 6px 20px rgba(29,92,116,0.35)",
                marginTop: "4px",
              }}
              onMouseEnter={e => { if (!submitting) e.currentTarget.style.transform = "scale(1.01)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              {submitting ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Signing in…
                </>
              ) : "Sign in to Portal"}
            </button>
          </form>

          {/* Footer links */}
          <div style={{
            marginTop: "24px",
            paddingTop: "20px",
            borderTop: "1px solid #eef4f0",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}>
            <p style={{ margin: 0, fontSize: "0.88rem", color: "#5a7068" }}>
              New doctor?{" "}
              <Link to="/doctor/register" style={{ color: "#1d5c74", fontWeight: 700, textDecoration: "none" }}>
                Create an account →
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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
