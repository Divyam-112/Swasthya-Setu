import { useEffect, useMemo, useState } from "react";
import { addReading, getReadings } from "../api/health.js";
import { toUserMessage } from "../api/client.js";
import { useLanguage } from "../context/LanguageContext.jsx";
import HealthMetricCard from "../components/ui/HealthMetricCard.jsx";
import MetricChart from "../components/ui/MetricChart.jsx";
import LoadingState from "../components/ui/LoadingState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { trendFromReadings } from "../utils/format.js";

const TYPES = [
  { id: "blood_pressure", key: "blood_pressure", label: "Blood pressure", unit: "mmHg", needsSecondary: true },
  { id: "blood_sugar", key: "blood_sugar", label: "Blood sugar", unit: "mg/dL" },
  { id: "heart_rate", key: "heart_rate", label: "Heart rate", unit: "bpm" },
  { id: "weight", key: "weight", label: "Weight", unit: "kg" },
  { id: "temperature", key: "temperature", label: "Temperature", unit: "°C" },
];

export default function HealthTracker() {
  const { t } = useLanguage();
  const [type, setType] = useState("blood_pressure");
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    value: "",
    secondaryValue: "",
    mealContext: "random",
    notes: "",
  });

  const selected = TYPES.find((item) => item.id === type);

  async function load(nextType = type) {
    setLoading(true);
    setError("");
    try {
      const response = await getReadings({ type: nextType, days: 90 });
      setReadings(response.data || []);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(type);
  }, [type]);

  const latest = readings[0];
  const previous = readings[1];
  const trend = useMemo(() => trendFromReadings(readings), [readings]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSuccess("");
    setError("");
    try {
      await addReading({
        type,
        value: Number(form.value),
        secondaryValue: selected.needsSecondary ? Number(form.secondaryValue) : undefined,
        unit: selected.unit,
        mealContext: type === "blood_sugar" ? form.mealContext : "not_applicable",
        notes: form.notes,
      });
      setForm({ value: "", secondaryValue: "", mealContext: "random", notes: "" });
      setSuccess("Reading saved.");
      await load(type);
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  return (
    <div className="page">
      <header>
        <h1 className="page-title">{t("health_tracker", "Health Tracker")}</h1>
        <p className="lede">{t("tracker_desc", "Add readings from home and see how they change over time.")}</p>
      </header>

      <div className="grid four">
        {TYPES.map((item) => (
          <button
            key={item.id}
            className={`btn ${type === item.id ? "" : "secondary"}`}
            type="button"
            onClick={() => setType(item.id)}
          >
            {t(item.key, item.label)}
          </button>
        ))}
      </div>

      {error ? <ErrorState message={error} onRetry={() => load(type)} /> : null}
      {success ? <p className="badge ok">{success}</p> : null}

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <HealthMetricCard type={type} reading={latest} previous={previous} trend={trend} />
          <section className="card">
            <h2>{t("readings_over_time", "Readings over time")}</h2>
            {readings.length ? (
              <MetricChart readings={readings} type={type} />
            ) : (
              <EmptyState message={t("no_health_readings", "No health readings available yet.")} />
            )}
          </section>
        </>
      )}

      <section className="card">
        <h2>{t("add_reading", "Add a new reading")}</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            {type === "blood_pressure" ? t("systolic", "Systolic") : t(selected.key, selected.label)}
            <input
              type="number"
              step="0.1"
              value={form.value}
              onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
              required
            />
          </label>
          {selected.needsSecondary ? (
            <label>
              Diastolic
              <input
                type="number"
                step="0.1"
                value={form.secondaryValue}
                onChange={(event) => setForm((current) => ({ ...current, secondaryValue: event.target.value }))}
                required
              />
            </label>
          ) : null}
          {type === "blood_sugar" ? (
            <label>
              When was this taken?
              <select
                value={form.mealContext}
                onChange={(event) => setForm((current) => ({ ...current, mealContext: event.target.value }))}
              >
                <option value="fasting">Fasting</option>
                <option value="post_meal">After a meal</option>
                <option value="random">Random</option>
              </select>
            </label>
          ) : null}
          <label>
            Notes
            <input
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
          <button className="btn" type="submit">{t("save_reading", "Save reading")}</button>
        </form>
      </section>
    </div>
  );
}
