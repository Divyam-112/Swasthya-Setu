import { useEffect, useMemo, useState } from "react";
import {
  addExerciseLog,
  deleteExerciseLog,
  getExerciseLogs,
} from "../api/health.js";
import { getRecommendations } from "../api/care.js";
import { toUserMessage } from "../api/client.js";
import {
  Sun,
  Feather,
  Activity,
  Wind,
  Flame,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
  Check
} from "lucide-react";
import LoadingState from "../components/ui/LoadingState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import YogaPoseCheckerModal from "../components/yoga/YogaPoseCheckerModal.jsx";
import { mapPoseNameToKey } from "../services/pose/pose_definitions.js";
import { todayKey } from "../utils/format.js";

// Helper to get tomorrow date and key
function getTomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

function formatDateLabel(date) {
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Quadrant configurations for the To-Do Matrix
const QUADRANTS = [
  {
    id: "morning",
    title: "1. Morning Activation & Balance",
    timeOfDay: "Morning",
    icon: Sun,
    subtitle: "Wake up the spine, balance & energy flow",
    badgeColor: "rgba(245, 158, 11, 0.15)",
    textColor: "#d97706",
  },
  {
    id: "core",
    title: "2. Core & Spine Mobility",
    timeOfDay: "Core",
    icon: Feather,
    subtitle: "Flexibility, gentle back care & posture",
    badgeColor: "rgba(16, 185, 129, 0.15)",
    textColor: "#059669",
  },
  {
    id: "restorative",
    title: "3. Restorative & Tension Relief",
    timeOfDay: "Afternoon",
    icon: Activity,
    subtitle: "Relieve muscle fatigue & open joints",
    badgeColor: "rgba(99, 102, 241, 0.15)",
    textColor: "#4f46e5",
  },
  {
    id: "evening",
    title: "4. Evening Breathwork & Wind-Down",
    timeOfDay: "Evening",
    icon: Wind,
    subtitle: "Calm the mind, deep breathing & sleep prep",
    badgeColor: "rgba(139, 92, 246, 0.15)",
    textColor: "#7c3aed",
  },
];

export default function Exercise() {
  const [selectedDay, setSelectedDay] = useState("today"); // "today" | "tomorrow"
  const [yogaPoses, setYogaPoses] = useState([]);
  const [isDoctorPrescribed, setIsDoctorPrescribed] = useState(false);
  const [prescribedBy, setPrescribedBy] = useState("");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [localCompleted, setLocalCompleted] = useState({});
  const [activeCheckerPose, setActiveCheckerPose] = useState(null);

  const todayStr = useMemo(() => todayKey(new Date()), []);
  const tomorrowStr = useMemo(() => todayKey(getTomorrowDate()), []);
  const activeDateKey = selectedDay === "today" ? todayStr : tomorrowStr;

  // Load completion state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("swasthya_yoga_checklist");
      if (stored) {
        setLocalCompleted(JSON.parse(stored));
      }
    } catch {}
  }, []);

  // Save completion state to localStorage
  const saveLocalCompleted = (updater) => {
    setLocalCompleted((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try {
        localStorage.setItem("swasthya_yoga_checklist", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [recRes, logRes] = await Promise.all([
        getRecommendations(),
        getExerciseLogs(14),
      ]);

      const recData = recRes.data || {};
      const poses = recData.activeYogaPoses || recData.lightYogaPoses || [];
      setYogaPoses(poses);
      setIsDoctorPrescribed(Boolean(recData.isDoctorPrescribed));

      if (recData.isDoctorPrescribed && poses.length > 0) {
        setPrescribedBy(poses[0]?.prescribedBy || "Doctor");
      }

      setLogs(logRes.data || []);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Check if a pose is completed on the active date
  const isPoseCompleted = (poseId, poseName) => {
    const daySet = localCompleted[activeDateKey] || [];
    if (daySet.includes(poseId) || daySet.includes(poseName)) return true;

    // Check backend exercise logs for today
    if (selectedDay === "today") {
      return logs.some(
        (log) =>
          log.dateKey === todayStr &&
          (log.exerciseName === poseName || log.exerciseName === poseId),
      );
    }
    return false;
  };

  // Toggle pose completion status
  const handleTogglePose = async (pose) => {
    const poseId = pose.id || pose._id || pose.name;
    const poseName = pose.name;
    const currentlyDone = isPoseCompleted(poseId, poseName);

    // Update local state
    saveLocalCompleted((prev) => {
      const currentList = prev[activeDateKey] || [];
      const updatedList = currentlyDone
        ? currentList.filter((id) => id !== poseId && id !== poseName)
        : [...currentList, poseId];
      return { ...prev, [activeDateKey]: updatedList };
    });

    // If toggling for today, also sync with backend exercise logs
    if (selectedDay === "today") {
      try {
        if (currentlyDone) {
          const matchingLog = logs.find(
            (l) => l.dateKey === todayStr && l.exerciseName === poseName,
          );
          if (matchingLog) {
            await deleteExerciseLog(matchingLog._id);
            setLogs((prev) => prev.filter((l) => l._id !== matchingLog._id));
          }
        } else {
          const res = await addExerciseLog({
            exerciseName: poseName,
            exerciseType: "yoga",
            duration: pose.durationMinutes || 10,
            dateKey: todayStr,
            notes: pose.benefits || "",
          });
          if (res.data) {
            setLogs((prev) => [res.data, ...prev]);
          }
        }
      } catch (err) {
        console.warn("Could not sync exercise log to server:", err.message);
      }
    }
  };

  // Categorize poses into quadrants
  const categorizedPoses = useMemo(() => {
    const map = {
      morning: [],
      core: [],
      restorative: [],
      evening: [],
    };

    yogaPoses.forEach((pose, idx) => {
      const cat = (pose.category || "").toLowerCase();
      const time = (pose.timeOfDay || "").toLowerCase();

      if (time.includes("evening") || cat.includes("breath") || cat.includes("pranayama")) {
        map.evening.push(pose);
      } else if (cat.includes("rest") || cat.includes("relax") || time.includes("afternoon")) {
        map.restorative.push(pose);
      } else if (cat.includes("core") || cat.includes("back") || cat.includes("mobility") || cat.includes("spine")) {
        map.core.push(pose);
      } else if (time.includes("morning") || cat.includes("balance") || cat.includes("warm")) {
        map.morning.push(pose);
      } else {
        // Fallback distribute cyclically
        const keys = ["morning", "core", "restorative", "evening"];
        map[keys[idx % 4]].push(pose);
      }
    });

    return map;
  }, [yogaPoses]);

  // Daily statistics
  const totalPosesCount = yogaPoses.length;
  const completedTodayCount = yogaPoses.filter((p) =>
    isPoseCompleted(p.id || p._id || p.name, p.name),
  ).length;
  const progressPercent = totalPosesCount > 0
    ? Math.round((completedTodayCount / totalPosesCount) * 100)
    : 0;

  // Streak calculation from backend logs
  const streakDays = useMemo(() => {
    if (!logs.length) return completedTodayCount > 0 ? 1 : 0;
    const uniqueDates = Array.from(new Set(logs.map((l) => l.dateKey))).sort().reverse();
    let count = 0;
    const checkDate = new Date();

    for (let i = 0; i < 14; i++) {
      const dKey = todayKey(checkDate);
      if (uniqueDates.includes(dKey) || (i === 0 && completedTodayCount > 0)) {
        count++;
      } else if (i > 0) {
        break;
      }
      checkDate.setDate(checkDate.getDate() - 1);
    }
    return Math.max(count, completedTodayCount > 0 ? 1 : 0);
  }, [logs, completedTodayCount]);

  if (loading) {
    return (
      <div className="page">
        <LoadingState message="Loading your personalized yoga matrix…" />
      </div>
    );
  }

  return (
    <div className="page exercise-page">
      {/* Header Banner */}
      <header className="exercise-header">
        <div>
          <div className="exercise-source-pill">
            {isDoctorPrescribed ? (
              <span className="badge ok" style={{ fontSize: "0.85rem", padding: "4px 12px", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <ShieldCheck size={14} />
                Prescribed by {prescribedBy ? `Dr. ${prescribedBy}` : "Doctor"} · Saved in Medical History
              </span>
            ) : (
              <span className="badge" style={{ fontSize: "0.85rem", padding: "4px 12px", background: "#e0f2fe", color: "#0369a1", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Activity size={14} />
                Daily Yoga Routine · Gentle Wellness Plan
              </span>
            )}
          </div>
          <h1 className="page-title" style={{ marginTop: 8 }}>Exercise & Yoga Matrix</h1>
          <p className="lede" style={{ marginBottom: 0 }}>
            {isDoctorPrescribed
              ? "Your doctor-prescribed yoga regimen. Complete each pose and check it off for the day."
              : "No custom doctor prescription yet. Follow this light, balanced daily routine and mark your daily progress."}
          </p>
        </div>

        {/* Streak Pill */}
        <div className="streak-badge card" style={{ padding: "10px 18px", textAlign: "center", display: "inline-flex", alignItems: "center", gap: 10, margin: 0 }}>
          <Flame size={26} color="#ea580c" />
          <div style={{ textAlign: "left" }}>
            <strong style={{ fontSize: "1.1rem", display: "block", lineHeight: 1 }}>
              {streakDays} Day{streakDays === 1 ? "" : "s"}
            </strong>
            <span className="muted" style={{ fontSize: "0.75rem" }}>Active Streak</span>
          </div>
        </div>
      </header>

      {error ? <ErrorState message={error} onRetry={loadData} /> : null}

      {/* Date Switcher: Today vs Following Day */}
      <section className="card date-switch-card" style={{ padding: "14px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className={`btn ${selectedDay === "today" ? "" : "ghost"}`}
              style={{
                borderRadius: "20px",
                padding: "8px 18px",
                fontWeight: selectedDay === "today" ? "700" : "500",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
              onClick={() => setSelectedDay("today")}
            >
              <Calendar size={14} />
              Today ({formatDateLabel(new Date())})
            </button>
            <button
              type="button"
              className={`btn ${selectedDay === "tomorrow" ? "" : "ghost"}`}
              style={{
                borderRadius: "20px",
                padding: "8px 18px",
                fontWeight: selectedDay === "tomorrow" ? "700" : "500",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
              onClick={() => setSelectedDay("tomorrow")}
            >
              <Calendar size={14} />
              Following Day ({formatDateLabel(getTomorrowDate())})
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              style={{
                padding: "8px 16px",
                borderRadius: "20px",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#047857",
                fontWeight: "600",
              }}
              onClick={() => {
                const firstPose = yogaPoses[0];
                setActiveCheckerPose({
                  key: firstPose ? mapPoseNameToKey(firstPose.name) : "tree_pose",
                  name: firstPose ? firstPose.name : "Tree Pose",
                  poseObject: firstPose || null,
                });
              }}
            >
              <Camera size={14} />
              <span>Check My Pose (AI Camera)</span>
            </button>

            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {selectedDay === "today"
                ? "Mark poses as you complete them today"
                : "Preview and prepare tomorrow's routine"}
            </span>
          </div>
        </div>
      </section>

      {/* Daily Progress Tracker */}
      <section className="card progress-tracker-card" style={{ padding: "18px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <strong>
              {selectedDay === "today" ? "Today's Checklist" : "Tomorrow's Checklist"}
            </strong>
            <span className="muted" style={{ marginLeft: 8 }}>
              {completedTodayCount} of {totalPosesCount} poses completed ({progressPercent}%)
            </span>
          </div>
          {progressPercent === 100 && (
            <span className="badge ok" style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <CheckCircle2 size={14} />
              All Poses Completed!
            </span>
          )}
        </div>

        <div className="progress" style={{ height: 10, borderRadius: 6, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <div
            style={{
              width: `${progressPercent}%`,
              height: "100%",
              background: progressPercent === 100 ? "#10b981" : "var(--color-primary, #047857)",
              borderRadius: 6,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </section>

      {/* ─── 4-Quadrant To-Do Matrix ─── */}
      <div className="yoga-matrix-grid">
        {QUADRANTS.map((quad) => {
          const posesInQuad = categorizedPoses[quad.id] || [];
          const QuadIcon = quad.icon;

          return (
            <div key={quad.id} className="card matrix-quadrant-card">
              <div className="quadrant-header">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: quad.badgeColor,
                      color: quad.textColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <QuadIcon size={20} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: "1.02rem", margin: 0, fontWeight: "600" }}>{quad.title}</h2>
                    <p className="muted" style={{ fontSize: "0.78rem", margin: "2px 0 0 0" }}>{quad.subtitle}</p>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "3px 8px",
                    borderRadius: 12,
                    background: quad.badgeColor,
                    color: quad.textColor,
                    fontWeight: 600,
                  }}
                >
                  {posesInQuad.length} pose{posesInQuad.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="quadrant-pose-list">
                {posesInQuad.length === 0 ? (
                  <p className="muted" style={{ fontSize: "0.85rem", padding: "12px 0" }}>
                    No poses scheduled in this slot.
                  </p>
                ) : (
                  posesInQuad.map((pose) => {
                    const poseId = pose.id || pose._id || pose.name;
                    const done = isPoseCompleted(poseId, pose.name);
                    const isExpanded = expandedId === poseId;

                    return (
                      <div
                        key={poseId}
                        className={`matrix-todo-item ${done ? "completed" : ""}`}
                      >
                        <div className="todo-item-main">
                          {/* Checkbox */}
                          <button
                            type="button"
                            className={`todo-checkbox ${done ? "checked" : ""}`}
                            onClick={() => handleTogglePose(pose)}
                            aria-label={done ? `Mark ${pose.name} incomplete` : `Mark ${pose.name} completed`}
                            title={done ? "Completed! Click to uncheck" : "Click to mark done"}
                          >
                            {done ? <Check size={14} /> : ""}
                          </button>

                          {/* Info */}
                          <div
                            className="todo-content"
                            style={{ flex: 1, cursor: "pointer" }}
                            onClick={() => handleTogglePose(pose)}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <strong className={`pose-title ${done ? "strikethrough" : ""}`}>
                                {pose.name}
                              </strong>
                              {pose.sanskritName && (
                                <span className="muted" style={{ fontSize: "0.82rem" }}>
                                  ({pose.sanskritName})
                                </span>
                              )}
                              {pose.isDoctorPrescribed && (
                                <span className="badge ok" style={{ fontSize: "0.68rem", padding: "2px 6px" }}>
                                  Prescribed
                                </span>
                              )}
                            </div>

                            <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                              <Clock size={12} />
                              <span>{pose.durationMinutes || 10} mins · {pose.reps || "Hold with steady breathing"}</span>
                            </p>

                            {pose.benefits && (
                              <p style={{ fontSize: "0.82rem", margin: "4px 0 0 0", color: "#065f46", display: "flex", alignItems: "center", gap: 4 }}>
                                <Sparkles size={12} />
                                <span>{pose.benefits}</span>
                              </p>
                            )}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button
                              type="button"
                              className="btn ghost"
                              style={{
                                padding: "4px 8px",
                                fontSize: "0.78rem",
                                borderColor: "#047857",
                                color: "#047857",
                                fontWeight: "600",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                height: "auto",
                                borderRadius: "6px",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveCheckerPose({
                                  key: mapPoseNameToKey(pose.name),
                                  name: pose.name,
                                  poseObject: pose,
                                });
                              }}
                            >
                              <Camera size={12} />
                              <span>Check Pose</span>
                            </button>

                            {/* Expand details button */}
                            <button
                              type="button"
                              className="btn ghost"
                              style={{ padding: "4px 8px", fontSize: "0.78rem", height: "auto", borderRadius: "6px" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedId(isExpanded ? null : poseId);
                              }}
                            >
                              {isExpanded ? "Hide" : "Details"}
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Instructions Drawer */}
                        {isExpanded && (
                          <div className="pose-instruction-box">
                            {pose.instructions && (
                              <div style={{ marginBottom: 8 }}>
                                <strong style={{ fontSize: "0.85rem" }}>How to practice:</strong>
                                <p style={{ fontSize: "0.85rem", margin: "3px 0 0 0", lineHeight: 1.4 }}>
                                  {pose.instructions}
                                </p>
                              </div>
                            )}

                            {pose.precautions && (
                              <div style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                                <AlertTriangle size={13} color="#b45309" />
                                <strong style={{ fontSize: "0.85rem", color: "#b45309" }}>Precaution:</strong>
                                <span style={{ fontSize: "0.85rem", marginLeft: 4 }}>
                                  {pose.precautions}
                                </span>
                              </div>
                            )}

                            {pose.prescribedBy && (
                              <p className="muted" style={{ fontSize: "0.78rem", margin: "6px 0 0 0" }}>
                                Prescribed by: Dr. {pose.prescribedBy}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Safety Guideline */}
      <footer className="card safety-card" style={{ marginTop: 20, padding: "16px 20px", background: "rgba(240, 253, 250, 0.7)" }}>
        <h3 style={{ fontSize: "0.95rem", margin: "0 0 4px 0", display: "flex", alignItems: "center", gap: 6 }}>
          <ShieldCheck size={16} color="var(--brand)" />
          Gentle Practice Guidelines
        </h3>
        <p className="muted" style={{ fontSize: "0.82rem", margin: 0, lineHeight: 1.5 }}>
          Practice at a gentle, comfortable pace. Never strain or force any posture. If you feel any sharp pain, dizziness, or shortness of breath, gently ease out of the pose and rest in Balasana or Shavasana. Always consult your doctor before modifying any clinical plan.
        </p>
      </footer>

      {/* Real-time AI Pose Coach & Correction Modal */}
      {activeCheckerPose && (
        <YogaPoseCheckerModal
          initialPoseKey={activeCheckerPose.key}
          initialPoseName={activeCheckerPose.name}
          onClose={() => setActiveCheckerPose(null)}
          onCompletePose={(completedPoseName) => {
            if (activeCheckerPose.poseObject) {
              handleTogglePose(activeCheckerPose.poseObject);
            } else {
              const matched = yogaPoses.find(
                (p) =>
                  p.name.toLowerCase().includes(completedPoseName.toLowerCase()) ||
                  completedPoseName.toLowerCase().includes(p.name.toLowerCase()),
              );
              if (matched) handleTogglePose(matched);
            }
          }}
        />
      )}

      {/* Scoped CSS for the Matrix & Checklist */}
      <style>{`
        .exercise-page {
          max-width: 1060px;
          margin: 0 auto;
        }
        .exercise-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 20px;
        }
        .yoga-matrix-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
          gap: 18px;
          margin-top: 20px;
        }
        .matrix-quadrant-card {
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(0,0,0,0.07);
          border-radius: 12px;
          background: #ffffff;
        }
        .quadrant-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(0,0,0,0.06);
          margin-bottom: 12px;
        }
        .quadrant-pose-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex: 1;
        }
        .matrix-todo-item {
          border: 1px solid rgba(0,0,0,0.07);
          border-radius: 8px;
          padding: 12px 14px;
          transition: all 0.2s ease;
          background: #fafafa;
        }
        .matrix-todo-item:hover {
          border-color: rgba(4, 120, 87, 0.3);
          background: #ffffff;
        }
        .matrix-todo-item.completed {
          background: rgba(16, 185, 129, 0.06);
          border-color: rgba(16, 185, 129, 0.25);
        }
        .todo-item-main {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .todo-checkbox {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 2px solid #cbd5e1;
          background: white;
          color: white;
          font-size: 14px;
          font-weight: bold;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          margin-top: 2px;
          transition: all 0.2s ease;
          padding: 0;
        }
        .todo-checkbox:hover {
          border-color: #047857;
        }
        .todo-checkbox.checked {
          background: #10b981;
          border-color: #10b981;
        }
        .pose-title {
          font-size: 0.95rem;
          color: #1e293b;
          transition: all 0.2s ease;
        }
        .pose-title.strikethrough {
          text-decoration: line-through;
          color: #64748b;
        }
        .pose-instruction-box {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px dashed rgba(0,0,0,0.1);
        }
      `}</style>
    </div>
  );
}
