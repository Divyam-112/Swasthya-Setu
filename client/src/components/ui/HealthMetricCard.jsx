import { classifyReading, formatReadingValue, formatRelativeDay, readingLabel } from "../../utils/format.js";

export default function HealthMetricCard({ reading, type, previous, trend }) {
  const status = classifyReading(reading);
  return (
    <article className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h3>{readingLabel(type)}</h3>
        <span className={`badge ${status.tone === "ok" ? "ok" : status.tone === "warn" ? "warn" : ""}`}>
          {reading ? status.label : "No data"}
        </span>
      </div>
      <p className="metric-value">{reading ? formatReadingValue(reading) : "—"}</p>
      <p className="muted">
        Last updated: {reading ? formatRelativeDay(reading.measuredAt) : "No readings yet"}
      </p>
      {previous ? (
        <p className="muted">Previous: {formatReadingValue(previous)}</p>
      ) : null}
      {reading?.mealContext && reading.mealContext !== "not_applicable" ? (
        <p className="muted" style={{ textTransform: "capitalize" }}>Context: {reading.mealContext.replace("_", " ")}</p>
      ) : null}
      {reading?.notes ? (
        <p className="muted" style={{ fontSize: "0.82rem", color: "var(--brand)" }}>
          ℹ️ {reading.notes}
        </p>
      ) : null}
      {trend ? <p>{trend.label}</p> : null}
    </article>
  );
}
