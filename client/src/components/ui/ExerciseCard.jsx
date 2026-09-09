import { frequencyLabel } from "../../utils/format.js";

export default function ExerciseCard({
  name,
  duration,
  frequency,
  completed,
  explanation,
  onToggle,
}) {
  return (
    <article className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h3>{name}</h3>
        <span className={`badge ${completed ? "ok" : "warn"}`}>
          {completed ? "Completed" : "Pending"}
        </span>
      </div>
      <p>
        {duration ? `${duration} min` : "Duration not set"} · {frequencyLabel(frequency)}
      </p>
      {explanation ? <p className="muted">{explanation}</p> : null}
      {onToggle ? (
        <button className="btn secondary" type="button" onClick={onToggle}>
          {completed ? "Undo" : "Mark as completed"}
        </button>
      ) : null}
    </article>
  );
}
