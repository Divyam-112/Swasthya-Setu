import { Link } from "react-router-dom";
import { frequencyLabel } from "../../utils/format.js";

export default function ReminderCard({
  title,
  type,
  time,
  frequency,
  status,
  onComplete,
  actionTo,
  actionLabel,
  completeLabel = "Mark as done",
  completed = false,
}) {
  return (
    <article className="card">
      <p className="badge">{type}</p>
      <h3>{title}</h3>
      <p>{time || "Time not set"}</p>
      <p className="muted">{frequencyLabel(frequency)}</p>
      <p>{status}</p>
      {onComplete ? (
        <button className="btn secondary" type="button" onClick={onComplete} disabled={completed}>
          {completed ? "Completed" : completeLabel}
        </button>
      ) : null}
      {!onComplete && actionTo && !completed ? (
        <Link className="btn secondary" to={actionTo}>
          {actionLabel || "Open"}
        </Link>
      ) : null}
    </article>
  );
}
