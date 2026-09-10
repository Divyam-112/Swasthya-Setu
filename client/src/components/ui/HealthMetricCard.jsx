import { useLanguage } from "../../context/LanguageContext.jsx";
import { classifyReading, formatReadingValue, formatRelativeDay, readingLabel } from "../../utils/format.js";

export default function HealthMetricCard({ reading, type, previous, trend }) {
  const { t } = useLanguage();
  const status = classifyReading(reading, t);

  const getContextLabel = (mealContext) => {
    if (!mealContext) return "";
    if (mealContext === "fasting") return t("fasting", "Fasting");
    if (mealContext === "post_meal") return t("post_meal", "Post meal");
    if (mealContext === "random") return t("random", "Random");
    return mealContext.replace("_", " ");
  };

  return (
    <article className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h3>{readingLabel(type, t)}</h3>
        <span className={`badge ${status.tone === "ok" ? "ok" : status.tone === "warn" ? "warn" : ""}`}>
          {reading ? status.label : t("no_data", "No data")}
        </span>
      </div>
      <p className="metric-value">{reading ? formatReadingValue(reading) : "—"}</p>
      <p className="muted">
        {t("last_updated", "Last updated")}: {reading ? formatRelativeDay(reading.measuredAt, t) : t("no_readings_yet", "No readings yet")}
      </p>
      {previous ? (
        <p className="muted">{t("previous", "Previous")}: {formatReadingValue(previous)}</p>
      ) : null}
      {reading?.mealContext && reading.mealContext !== "not_applicable" ? (
        <p className="muted" style={{ textTransform: "capitalize" }}>
          {t("context", "Context")}: {getContextLabel(reading.mealContext)}
        </p>
      ) : null}
      {reading?.notes ? (
        <p className="muted" style={{ fontSize: "0.82rem", color: "var(--brand)" }}>
          ℹ️ {reading.notes === "Current reading" ? t("current_reading", "Current reading") : reading.notes}
        </p>
      ) : null}
      {trend ? <p>{trend.label}</p> : null}
    </article>
  );
}
