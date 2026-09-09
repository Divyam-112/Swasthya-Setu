import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { toUserMessage } from "../api/client.js";

const SPECIALIZATIONS = [
  "General Medicine",
  "Cardiology",
  "Orthopedics",
  "Dermatology",
  "Pediatrics",
  "Gynecology",
  "Neurology",
  "Ophthalmology",
  "ENT",
  "Psychiatry",
  "Ayurveda",
  "Homeopathy",
  "Other",
];

export default function DoctorRegister() {
  const { registerDoctor } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    specialization: "General Medicine",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await registerDoctor(form);
      navigate("/doctor/dashboard", { replace: true });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <p className="badge doctor-badge">New Doctor</p>
        <h1 className="page-title">Create your doctor account</h1>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Full name
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Dr. Your Name"
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="you@hospital.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="Min 6 characters"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          <label>
            Specialization
            <select
              value={form.specialization}
              onChange={(e) => update("specialization", e.target.value)}
            >
              {SPECIALIZATIONS.map((spec) => (
                <option key={spec} value={spec}>{spec}</option>
              ))}
            </select>
          </label>
          {error ? <p className="alert" role="alert">{error}</p> : null}
          <button className="btn doctor-btn" type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p>
          Already registered? <Link to="/doctor/login">Sign in</Link>
        </p>
        <p>
          <Link to="/">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
