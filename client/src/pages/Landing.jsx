import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { UserCheck, Stethoscope } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { getApiBase } from "../api/client.js";

const GREETINGS = [
  { line: "Namaste", note: "Hindi" },
  { line: "Hello", note: "English" },
  { line: "வணக்கம்", note: "Tamil" },
  { line: "নমস্কার", note: "Bengali" },
  { line: "నమస్కారం", note: "Telugu" },
  { line: "नमस्कार", note: "Marathi" },
];

const STEPS = [
  { n: "01", title: "Sign in with ABHA", text: "Use your 14-digit number or ABHA address. No extra hospital password.", icon: "🔑" },
  { n: "02", title: "Tell your story once", text: "Speak, tap, or type. The kiosk turns it into a clear clinical history.", icon: "💬" },
  { n: "03", title: "Walk in prepared", text: "Take readings, documents, and reminders with you to the doctor.", icon: "✅" },
];

const FEATURES = [
  {
    id: "history",
    title: "Voice & tap history",
    kicker: "Before the OPD",
    text: "One question at a time. Large choices. Hindi, English and more. Your doctor sees a structured note, not a blank form.",
    icon: "🎙️",
    preview: {
      label: "History taking",
      title: "What is troubling you today?",
      lines: ["Stomach pain", "Headache", "Fever", "Something else"],
    },
  },
  {
    id: "chat",
    title: "Health assistant",
    kicker: "Ask anytime",
    text: "Everyday questions, in plain language. Always with a clear note: this is guidance, not a diagnosis.",
    icon: "🤖",
    preview: {
      label: "Assistant",
      title: "What does high BP mean?",
      lines: ["It means the heart is pushing harder than usual.", "Keep recording your readings.", "See a doctor if it stays high."],
    },
  },
  {
    id: "tracker",
    title: "Home readings",
    kicker: "BP, sugar, pulse",
    text: "Save a reading in seconds. See the last value, the one before it, and the line over time.",
    icon: "📊",
    preview: {
      label: "Tracker",
      title: "Blood pressure",
      lines: ["Latest reading ready to save", "Compare with your previous value", "Chart appears after two entries"],
    },
  },
  {
    id: "care",
    title: "Ayurveda & yoga",
    kicker: "From your record",
    text: "Lifestyle and yoga tips only after a condition is already in your history or prescription — never assigned at random.",
    icon: "🧘",
    preview: {
      label: "Care plan",
      title: "Matched to your record",
      lines: ["Explanation in simple words", "Gentle yoga with safety notes", "When to stop and call a doctor"],
    },
  },
];

const STATS = [
  { value: "10+", label: "Indian languages" },
  { value: "ABDM", label: "Interoperable" },
  { value: "AI", label: "Clinical assistant" },
  { value: "Zero", label: "Data sold, ever" },
];

// Floating orb config
const ORBS = [
  { w: 500, h: 500, top: "-15%", left: "-8%", color: "rgba(15,106,80,0.12)", dur: "14s", delay: "0s" },
  { w: 380, h: 380, top: "10%", right: "-10%", color: "rgba(29,92,116,0.11)", dur: "18s", delay: "-4s" },
  { w: 300, h: 300, top: "55%", left: "5%", color: "rgba(15,106,80,0.09)", dur: "20s", delay: "-7s" },
  { w: 420, h: 420, top: "70%", right: "-8%", color: "rgba(29,92,116,0.10)", dur: "16s", delay: "-2s" },
  { w: 200, h: 200, top: "35%", left: "42%", color: "rgba(15,106,80,0.07)", dur: "22s", delay: "-10s" },
];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// Hook to detect when element enters viewport
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, visible];
}

// Parallax scroll hook
function useParallax(speed = 0.3) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const onScroll = () => setOffset(window.scrollY * speed);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [speed]);
  return offset;
}

// Click-ripple: every click on a [data-ripple] element spawns an expanding water ripple
function useClickRipple(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function spawnRipple(e) {
      const target = e.target.closest("[data-ripple]");
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top  - size / 2;
      const span = document.createElement("span");
      span.className = "ripple";
      span.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;position:absolute;pointer-events:none;border-radius:50%;background:rgba(15,106,80,0.22);transform:scale(0);animation:rippleOut 0.7s linear forwards;z-index:2`;
      target.appendChild(span);
      span.addEventListener("animationend", () => span.remove(), { once: true });
    }
    el.addEventListener("click", spawnRipple);
    return () => el.removeEventListener("click", spawnRipple);
  }, [ref]);
}

export default function Landing() {
  const { isAuthenticated, patient, doctor, role } = useAuth();
  const location = useLocation();
  const next = location.state?.from;
  const now = useClock();
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [activeFeature, setActiveFeature] = useState(FEATURES[0].id);
  const [apiState, setApiState] = useState("checking");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const parallaxY = useParallax(0.25);

  const [stepsRef, stepsVisible] = useReveal();
  const [featuresRef, featuresVisible] = useReveal();
  const [statsRef, statsVisible] = useReveal();
  const [ctaRef, ctaVisible] = useReveal();
  const [roleRef, roleVisible] = useReveal();
  const pageRef = useRef(null);
  useClickRipple(pageRef);

  useEffect(() => {
    const id = setInterval(() => {
      setGreetingIndex((current) => (current + 1) % GREETINGS.length);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  // Mouse tracking for subtle parallax on hero
  useEffect(() => {
    const onMove = (e) => {
      setMousePos({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const response = await fetch(`${getApiBase()}/health`);
        const payload = await response.json();
        if (!cancelled) setApiState(payload.success ? "live" : "down");
      } catch {
        if (!cancelled) setApiState("down");
      }
    }
    ping();
    const id = setInterval(ping, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const greeting = GREETINGS[greetingIndex];
  const feature = FEATURES.find((item) => item.id === activeFeature) || FEATURES[0];
  const timeLabel = useMemo(
    () => now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    [now],
  );

  const loginState = next ? { from: next } : undefined;
  const dashboardPath = role === "doctor" ? "/doctor/dashboard" : "/dashboard";
  const userName =
    role === "doctor"
      ? `Dr. ${doctor?.name?.split(" ")[0] || "Doctor"}`
      : patient?.name?.split(" ")[0] || "patient";

  return (
    <div ref={pageRef} className="landing" style={{ background: "#f0f6f3", overflow: "hidden" }}>

      {/* ── Floating Orbs (parallax) ── */}
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        {ORBS.map((orb, i) => (
          <div key={i} style={{
            position: "absolute",
            width: orb.w,
            height: orb.h,
            top: orb.top,
            left: orb.left,
            right: orb.right,
            borderRadius: "50%",
            background: orb.color,
            filter: "blur(60px)",
            animation: `orbFloat ${orb.dur} ease-in-out infinite alternate`,
            animationDelay: orb.delay,
            transform: `translateY(${parallaxY * (i % 2 === 0 ? 1 : -0.6)}px)`,
            transition: "transform 0.1s linear",
          }} />
        ))}

        {/* Subtle grid lines */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `
            linear-gradient(rgba(15,106,80,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(15,106,80,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }} />
      </div>

      {/* ── Navbar ── */}
      <header className="landing-nav" style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(240,246,243,0.85)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(15,106,80,0.1)" }}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"
            style={{ background: "linear-gradient(150deg, #1c8062, #0c4a38)", boxShadow: "0 4px 14px rgba(15,106,80,0.3)" }}>S</div>
          <div>
            <strong>SwasthyaSetu</strong>
            <p>Bridging health, digitally</p>
          </div>
        </div>
        <nav className="landing-nav-links">
          <span className={`landing-status ${apiState}`} aria-live="polite">
            <span className="landing-dot" />
            {apiState === "live" ? "Server online" : apiState === "down" ? "Server offline" : "Checking…"}
          </span>
          {role === "patient" ? (
            <Link className="btn" to="/dashboard">Patient Dashboard</Link>
          ) : (
            <Link className="btn ghost" to="/login" state={loginState}>Patient Login</Link>
          )}
          {role === "doctor" ? (
            <Link className="btn doctor-btn" to="/doctor/dashboard">Doctor Dashboard</Link>
          ) : (
            <Link className="btn doctor-btn" to="/doctor/login">Doctor Login</Link>
          )}
        </nav>
      </header>

      {/* ── Hero Section ── */}
      <section className="landing-hero" style={{ position: "relative", zIndex: 1, paddingTop: "60px", paddingBottom: "60px" }}>
        <div style={{
          transform: `translate(${mousePos.x * 0.3}px, ${mousePos.y * 0.3}px)`,
          transition: "transform 0.4s ease",
        }}>
          <p className="badge" style={{
            background: "linear-gradient(90deg, #e3f2ea, #e5eff4)",
            border: "1px solid #cbe4d7",
            display: "inline-block",
          }}>SwasthyaSetu — स्वास्थ्य सेतु</p>

          <p className="landing-hello" aria-live="polite">
            <span key={greeting.line} style={{ animation: "slideUp 0.4s ease" }}>{greeting.line}</span>
            <small>{greeting.note}</small>
          </p>

          <h1 className="landing-hero-h1" style={{
            background: "linear-gradient(135deg, #0e2a22 0%, #0f6a50 60%, #1d5c74 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            lineHeight: 1.15,
          }}>
            Your health story, in one place. Always ready for the doctor.
          </h1>

          <p className="lede" style={{ color: "#4a6860", maxWidth: "52ch" }}>
            SwasthyaSetu is a calm place to record symptoms, readings, medicines and
            documents — in your language, with large type, before you meet the doctor.
          </p>

          <div className="landing-cta" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", marginTop: "28px" }}>
            <Link
              className="btn"
              to={role === "patient" ? "/dashboard" : "/login"}
              state={loginState}
              style={{
                padding: "0.9rem 1.8rem", fontSize: "1rem",
                background: "linear-gradient(135deg, #0f6a50, #1d5c74)",
                boxShadow: "0 8px 24px rgba(15,106,80,0.3)",
                borderRadius: "12px", border: "none",
                display: "inline-flex", alignItems: "center", gap: "0.5rem",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(15,106,80,0.4)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(15,106,80,0.3)"; }}
            >
              <UserCheck size={18} />
              {role === "patient" ? "Go to Patient Dashboard" : "Patient Login / Portal"}
            </Link>

            <Link
              className="btn doctor-btn"
              to={role === "doctor" ? "/doctor/dashboard" : "/doctor/login"}
              style={{
                padding: "0.9rem 1.8rem", fontSize: "1rem",
                borderRadius: "12px",
                display: "inline-flex", alignItems: "center", gap: "0.5rem",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <Stethoscope size={18} />
              {role === "doctor" ? `Doctor Dashboard (${userName})` : "Doctor Login / Portal"}
            </Link>
          </div>

          <div className="landing-meta" style={{ marginTop: "24px" }}>
            <span>{timeLabel}</span>
            <span>Voice, tap, or text</span>
            <span>10 Indian languages</span>
          </div>
        </div>

        {/* Feature Preview Card */}
        <aside className="landing-stage" aria-label="Live preview" style={{
          transform: `translate(${mousePos.x * 0.15}px, ${mousePos.y * 0.15}px)`,
          transition: "transform 0.5s ease",
          background: "linear-gradient(145deg, #0a2e22 0%, #0e3a2f 100%)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.05) inset",
        }}>
          <div className="landing-stage-bar">
            <span>Patient kiosk</span>
            <strong>{feature.preview.label}</strong>
          </div>
          <p className="landing-stage-kicker">{feature.kicker}</p>
          <h2 style={{ color: "#f0f7f3" }}>{feature.preview.title}</h2>
          <div className="landing-stage-lines">
            {feature.preview.lines.map((line, index) => (
              <button key={line} className="landing-chip" type="button"
                style={{
                  animationDelay: `${index * 80}ms`,
                  backdropFilter: "blur(8px)",
                  transition: "background 0.2s, transform 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; e.currentTarget.style.transform = "translateX(4px)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.transform = "translateX(0)"; }}
              >
                {line}
              </button>
            ))}
          </div>
          <p className="muted">Preview of the flow — your real answers stay in your account.</p>
        </aside>
      </section>

      {/* ── Animated Stats ── */}
      <section ref={statsRef} style={{
        position: "relative", zIndex: 1,
        padding: "60px 0",
        background: "linear-gradient(135deg, #0a2e22 0%, #0e3a2f 50%, #0f5a3f 100%)",
        overflow: "hidden",
      }}>
        {/* wave divider top */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden", lineHeight: 0 }}>
          <svg viewBox="0 0 1200 60" preserveAspectRatio="none" style={{ display: "block", width: "100%", height: "60px" }}>
            <path d="M0,60 C300,0 900,60 1200,0 L1200,0 L0,0 Z" fill="#f0f6f3" />
          </svg>
        </div>
        <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "0 18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px", marginTop: "20px" }}>
            {STATS.map((stat, i) => (
              <div key={stat.label} style={{
                textAlign: "center", color: "white",
                opacity: statsVisible ? 1 : 0,
                transform: statsVisible ? "translateY(0)" : "translateY(30px)",
                transition: `opacity 0.6s ease ${i * 120}ms, transform 0.6s ease ${i * 120}ms`,
              }}>
                <div style={{
                  fontSize: "2.5rem", fontWeight: 800,
                  background: "linear-gradient(135deg, #6ed3ab, #a8d8ea)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  backgroundClip: "text", marginBottom: "6px",
                }}>{stat.value}</div>
                <div style={{ color: "#a9c7bb", fontSize: "0.9rem", letterSpacing: "0.05em" }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
        {/* wave divider bottom */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, overflow: "hidden", lineHeight: 0 }}>
          <svg viewBox="0 0 1200 60" preserveAspectRatio="none" style={{ display: "block", width: "100%", height: "60px" }}>
            <path d="M0,0 C300,60 900,0 1200,60 L1200,60 L0,60 Z" fill="#f0f6f3" />
          </svg>
        </div>
      </section>

      {/* ── Role Selection ── */}
      <section ref={roleRef} className="landing-panel role-panel" aria-label="Choose your role" style={{ position: "relative", zIndex: 1 }}>
        <div className="landing-section-head" style={{
          opacity: roleVisible ? 1 : 0,
          transform: roleVisible ? "translateY(0)" : "translateY(24px)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
        }}>
          <h2 style={{ background: "linear-gradient(135deg, #0e2a22, #0f6a50)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Select Your Portal
          </h2>
          <p className="muted">Choose your role to get started with the right experience.</p>
        </div>
        <div className="role-picker">
          {[
            {
              cls: "role-patient",
              icon: <UserCheck size={36} color="var(--brand)" />,
              title: "Patient Portal",
              desc: "Record your symptoms, health readings, and documents. Chat with an AI assistant and prepare for your visit.",
              delay: 100,
              actions: (
                <>
                  <Link className="btn" to={role === "patient" ? "/dashboard" : "/login"} state={loginState}
                    style={{ background: "linear-gradient(135deg, #0f6a50, #1a7a55)", borderRadius: "10px", boxShadow: "0 4px 14px rgba(15,106,80,0.25)" }}>
                    {role === "patient" ? "Open Patient Dashboard" : "Patient Sign in"}
                  </Link>
                  <Link className="btn secondary" to="/register" style={{ borderRadius: "10px" }}>Create new account</Link>
                </>
              ),
            },
            {
              cls: "role-doctor",
              icon: <Stethoscope size={36} color="#0f766e" />,
              title: "Doctor Portal",
              desc: "Access patient histories, write digital prescriptions, manage OPD queue, and review clinical summaries.",
              delay: 200,
              actions: (
                <>
                  <Link className="btn doctor-btn" to={role === "doctor" ? "/doctor/dashboard" : "/doctor/login"}
                    style={{ borderRadius: "10px", boxShadow: "0 4px 14px rgba(29,92,116,0.25)" }}>
                    {role === "doctor" ? "Open Doctor Dashboard" : "Doctor Sign in"}
                  </Link>
                  <Link className="btn secondary" to="/doctor/register" style={{ borderRadius: "10px" }}>Register as doctor</Link>
                </>
              ),
            },
          ].map(({ cls, icon, title, desc, delay, actions }) => (
            <div key={cls} data-ripple className={`role-card ${cls}`} style={{
              opacity: roleVisible ? 1 : 0,
              transform: roleVisible ? "translateY(0) scale(1)" : "translateY(32px) scale(0.97)",
              transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
              borderRadius: "20px",
              boxShadow: "0 8px 32px rgba(15,106,80,0.08)",
              border: "1px solid rgba(15,106,80,0.12)",
              overflow: "hidden",
            }}>
              <div className="role-icon" style={{
                background: "linear-gradient(135deg, #e3f2ea, #e5eff4)",
                borderRadius: "14px", padding: "16px",
                width: "64px", height: "64px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{icon}</div>
              <h3 style={{ marginTop: "16px" }}>{title}</h3>
              <p>{desc}</p>
              <div className="role-actions">{actions}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features Section ── */}
      <section ref={featuresRef} className="landing-panel" aria-label="Features" style={{ position: "relative", zIndex: 1 }}>
        <div className="landing-section-head" style={{
          opacity: featuresVisible ? 1 : 0,
          transform: featuresVisible ? "translateY(0)" : "translateY(24px)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
        }}>
          <h2 style={{ background: "linear-gradient(135deg, #0e2a22, #0f6a50)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Choose a path. See how it feels.
          </h2>
          <p className="muted">Tap a card. The kiosk preview updates with that flow.</p>
        </div>
        <div className="landing-feature-grid">
          {FEATURES.map((item, i) => (
            <button
              key={item.id}
              type="button"
              data-ripple
              className={`landing-feature ${activeFeature === item.id ? "is-active" : ""}`}
              onClick={() => setActiveFeature(item.id)}
              aria-pressed={activeFeature === item.id}
              style={{
                opacity: featuresVisible ? 1 : 0,
                transform: featuresVisible ? "translateY(0)" : "translateY(32px)",
                transition: `opacity 0.5s ease ${i * 100}ms, transform 0.5s ease ${i * 100}ms, border-color 0.2s, box-shadow 0.2s`,
                borderRadius: "16px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ fontSize: "1.8rem", marginBottom: "4px" }}>{item.icon}</div>
              <span className="landing-feature-kicker">{item.kicker}</span>
              <strong>{item.title}</strong>
              <span style={{ color: "#5a7068" }}>{item.text}</span>
              {activeFeature === item.id && (
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0, height: "3px",
                  background: "linear-gradient(90deg, #0f6a50, #1d5c74)",
                  animation: "slideIn 0.3s ease",
                }} />
              )}
            </button>
          ))}
        </div>

        {/* Live Preview */}
        <div style={{
          marginTop: "24px",
          background: "linear-gradient(145deg, #0a2e22, #0e3a2f)",
          borderRadius: "20px",
          padding: "32px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "32px",
          alignItems: "center",
          opacity: featuresVisible ? 1 : 0,
          transform: featuresVisible ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 0.7s ease 0.4s, transform 0.7s ease 0.4s",
        }}>
          <div>
            <p className="landing-stage-kicker">{feature.kicker}</p>
            <h3 style={{ color: "#f0f7f3", fontSize: "1.5rem", margin: "8px 0 16px" }}>{feature.title}</h3>
            <p style={{ color: "#a9c7bb", lineHeight: 1.6 }}>{feature.text}</p>
          </div>
          <div>
            <div style={{ color: "#7fbfa5", fontSize: "0.8rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>
              {feature.preview.label}
            </div>
            <p style={{ color: "#f0f7f3", fontSize: "1.1rem", fontWeight: 700, marginBottom: "14px" }}>{feature.preview.title}</p>
            <div style={{ display: "grid", gap: "10px" }}>
              {feature.preview.lines.map((line, index) => (
                <div key={line} style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  backdropFilter: "blur(8px)",
                  color: "#e8f3ee",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  fontSize: "0.93rem",
                  animation: "slideUp 0.4s ease both",
                  animationDelay: `${index * 80}ms`,
                  cursor: "default",
                }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Steps Section ── */}
      <section ref={stepsRef} className="landing-panel" style={{ position: "relative", zIndex: 1 }}>
        <div className="landing-section-head" style={{
          opacity: stepsVisible ? 1 : 0,
          transform: stepsVisible ? "translateY(0)" : "translateY(24px)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
        }}>
          <h2 style={{ background: "linear-gradient(135deg, #0e2a22, #0f6a50)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Three quiet steps
          </h2>
        </div>
        <div className="landing-steps">
          {STEPS.map((step, i) => (
            <article key={step.n} data-ripple className="landing-step" style={{
              opacity: stepsVisible ? 1 : 0,
              transform: stepsVisible ? "translateY(0) scale(1)" : "translateY(40px) scale(0.95)",
              transition: `opacity 0.6s ease ${i * 150}ms, transform 0.6s ease ${i * 150}ms`,
              borderRadius: "20px",
              border: "1px solid rgba(15,106,80,0.12)",
              boxShadow: "0 4px 20px rgba(15,106,80,0.06)",
              background: "white",
              padding: "28px",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, right: 0, width: "80px", height: "80px",
                background: "linear-gradient(135deg, rgba(15,106,80,0.06), rgba(29,92,116,0.04))",
                borderRadius: "0 0 0 80px",
              }} />
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>{step.icon}</div>
              <span style={{ fontFamily: "var(--serif)", fontSize: "1.7rem", color: "var(--brand)", fontWeight: 700 }}>{step.n}</span>
              <h3 style={{ marginTop: "8px" }}>{step.title}</h3>
              <p className="muted" style={{ marginTop: "6px" }}>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section ref={ctaRef} style={{
        position: "relative", zIndex: 1,
        maxWidth: "1180px", margin: "0 auto 48px",
        padding: "0 18px",
      }}>
        <div style={{
          background: "linear-gradient(135deg, #0a2e22 0%, #0e3a2f 50%, #0f5a3f 100%)",
          borderRadius: "24px",
          padding: "56px 48px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "32px",
          flexWrap: "wrap",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          opacity: ctaVisible ? 1 : 0,
          transform: ctaVisible ? "translateY(0)" : "translateY(32px)",
          transition: "opacity 0.7s ease, transform 0.7s ease",
        }}>
          {/* decorative blobs */}
          <div style={{
            position: "absolute", width: "300px", height: "300px",
            top: "-100px", right: "-80px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(29,92,116,0.3) 0%, transparent 70%)",
          }} />
          <div style={{
            position: "absolute", width: "200px", height: "200px",
            bottom: "-60px", left: "10%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(15,106,80,0.25) 0%, transparent 70%)",
          }} />

          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 style={{ color: "white", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
              Ready when you are.
            </h2>
            <p style={{ color: "#a9c7bb", margin: 0, fontSize: "1.05rem", maxWidth: "48ch" }}>
              Create an account with your ABHA ID, or sign in if you already started a record.
            </p>
          </div>

          <div className="landing-cta" style={{ position: "relative", zIndex: 1, gap: "12px" }}>
            {isAuthenticated ? (
              <Link className="btn" to={dashboardPath}
                style={{ background: "white", color: "#0f6a50", fontWeight: 700, borderRadius: "12px", boxShadow: "0 4px 14px rgba(0,0,0,0.2)" }}>
                Go to your health workspace
              </Link>
            ) : (
              <>
                <Link className="btn" to="/register"
                  style={{ background: "white", color: "#0f6a50", fontWeight: 700, borderRadius: "12px" }}>
                  Patient — Create account
                </Link>
                <Link className="btn secondary" to="/login" state={loginState}
                  style={{ background: "rgba(255,255,255,0.12)", color: "white", border: "1px solid rgba(255,255,255,0.25)", borderRadius: "12px" }}>
                  Patient — Sign in
                </Link>
                <Link className="btn" to="/doctor/login"
                  style={{ background: "rgba(29,92,116,0.6)", color: "white", border: "1px solid rgba(29,92,116,0.5)", borderRadius: "12px" }}>
                  Doctor — Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-foot" style={{ position: "relative", zIndex: 1, textAlign: "center", paddingBottom: "36px", color: "#6a8a7e" }}>
        <p>SwasthyaSetu supports clinical intake. It does not replace emergency care or a doctor's advice.</p>
      </footer>

      <style>{`
        @keyframes orbFloat {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(20px, 30px) scale(1.05); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { width: 0; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
