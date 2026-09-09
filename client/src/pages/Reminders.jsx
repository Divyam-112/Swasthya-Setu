import { useEffect, useMemo, useState } from "react";
import {
  addExerciseLog,
  addMedicineLog,
  addMedicineReminder,
  getExerciseLogs,
  getExerciseReminders,
  getMedicineLogs,
  getMedicineReminders,
  getReadings,
} from "../api/health.js";
import { getMyAppointments } from "../api/care.js";
import { toUserMessage } from "../api/client.js";
import { useLanguage } from "../context/LanguageContext.jsx";
import { settleAll } from "../utils/async.js";
import ReminderCard from "../components/ui/ReminderCard.jsx";
import LoadingState from "../components/ui/LoadingState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { formatDate, sameId, todayKey } from "../utils/format.js";

export default function Reminders() {
  const { t } = useLanguage();
  const [medicines, setMedicines] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [medicineLogs, setMedicineLogs] = useState([]);
  const [exerciseLogs, setExerciseLogs] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    medicineName: "",
    dosage: "",
    frequency: "once_daily",
    times: "08:00",
  });
  const today = todayKey();

  async function load() {
    setLoading(true);
    const { values, error: failure } = await settleAll([
      getMedicineReminders(true),
      getExerciseReminders(true),
      getMedicineLogs(7),
      getExerciseLogs(7),
      getMyAppointments(),
      getReadings({ days: 2 }),
    ]);
    const [meds, ex, medLogs, exLogs, apts, recentReadings] = values;
    setMedicines(meds?.data || []);
    setExercises(ex?.data || []);
    setMedicineLogs(medLogs?.data || []);
    setExerciseLogs(exLogs?.data || []);
    setAppointments(apts?.data || []);
    setReadings(recentReadings?.data || []);
    setError(failure);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const items = useMemo(() => {
    const medicineItems = medicines.flatMap((item) =>
      (item.times?.length ? item.times : [""]).map((time) => {
        const completed = medicineLogs.some(
          (log) =>
            sameId(log.reminderId, item._id) &&
            log.dateKey === today &&
            (!time || log.scheduledTime === time),
        );
        return {
          id: `${item._id}-${time}`,
          reminderId: item._id,
          title: item.medicineName,
          type: "Medicine",
          time,
          frequency: item.frequency,
          completed,
          kind: "medicine",
          scheduledTime: time,
        };
      }),
    );
    const exerciseItems = exercises.map((item) => ({
      id: item._id,
      reminderId: item._id,
      title: item.exerciseName,
      type: "Exercise",
      time: item.preferredTime,
      frequency: item.frequency,
      completed: exerciseLogs.some((log) => sameId(log.reminderId, item._id) && log.dateKey === today),
      kind: "exercise",
    }));
    const measureItem = {
      id: "measure",
      title: "Record today’s health reading",
      type: "Health measurement",
      time: "Any time",
      frequency: "daily",
      completed: readings.some(
        (reading) => todayKey(new Date(reading.measuredAt)) === today,
      ),
      kind: "measure",
    };
    return [...medicineItems, ...exerciseItems, measureItem];
  }, [medicines, exercises, medicineLogs, exerciseLogs, readings, today]);

  const upcoming = items.filter((item) => !item.completed);
  const completed = items.filter((item) => item.completed);

  async function complete(item) {
    try {
      if (item.kind === "medicine") {
        await addMedicineLog({
          reminderId: item.reminderId,
          scheduledTime: item.scheduledTime,
          dateKey: today,
        });
      } else if (item.kind === "exercise") {
        await addExerciseLog({ reminderId: item.reminderId, dateKey: today });
      }
      await load();
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  async function handleAdd(event) {
    event.preventDefault();
    try {
      await addMedicineReminder({
        ...form,
        times: form.times.split(",").map((time) => time.trim()).filter(Boolean),
      });
      setForm({ medicineName: "", dosage: "", frequency: "once_daily", times: "08:00" });
      await load();
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="page">
      <header>
        <h1 className="page-title">{t("reminders", "Reminders")}</h1>
        <p className="lede">{t("reminders_desc", "Today’s medicines, exercises, measurements and visits. Alerts stay on this page; browser push is not enabled.")}</p>
      </header>
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      <section>
        <h2>{t("todays_reminders", "Today’s reminders")}</h2>
        <div className="grid three">
          {upcoming.length ? (
            upcoming.map((item) => (
              <ReminderCard
                key={item.id}
                title={item.title}
                type={item.type}
                time={item.time}
                frequency={item.frequency}
                status={t("due_today", "Due today")}
                completed={false}
                completeLabel={item.kind === "medicine" ? t("mark_taken", "Mark as taken") : t("mark_done", "Mark as completed")}
                onComplete={item.kind === "measure" ? undefined : () => complete(item)}
                actionTo={item.kind === "measure" ? "/tracker" : undefined}
                actionLabel={t("add_reading", "Add a reading")}
              />
            ))
          ) : (
            <EmptyState message={t("nothing_pending_today", "Nothing pending for today.")} />
          )}
        </div>
      </section>

      <section>
        <h2>{t("completed_today", "Completed today")}</h2>
        <div className="grid three">
          {completed.length ? (
            completed.map((item) => (
              <ReminderCard
                key={item.id}
                title={item.title}
                type={item.type}
                time={item.time}
                frequency={item.frequency}
                status={t("completed", "Completed")}
                completed
              />
            ))
          ) : (
            <p className="muted">{t("no_completed_reminders", "No completed reminders yet today.")}</p>
          )}
        </div>
      </section>

      <section className="card">
        <h2>{t("upcoming_appointments", "Upcoming appointments")}</h2>
        {appointments.filter((item) => ["booked", "in_progress"].includes(item.status)).length ? (
          <ul className="list">
            {appointments
              .filter((item) => ["booked", "in_progress"].includes(item.status))
              .map((item) => (
                <li key={item._id}>
                  {item.doctor?.name || t("doctor", "Doctor")} · {item.status} · {formatDate(item.scheduledDate)}
                </li>
              ))}
          </ul>
        ) : (
          <p className="muted">{t("no_appointments", "No booked appointments.")}</p>
        )}
      </section>

      <section className="card">
        <h2>{t("add_medicine_reminder", "Add a medicine reminder")}</h2>
        <form className="form-grid" onSubmit={handleAdd}>
          <label>
            {t("medicines", "Medicine")}
            <input
              value={form.medicineName}
              onChange={(event) => setForm((current) => ({ ...current, medicineName: event.target.value }))}
              required
            />
          </label>
          <label>
            {t("dosage", "Dosage")}
            <input
              value={form.dosage}
              onChange={(event) => setForm((current) => ({ ...current, dosage: event.target.value }))}
            />
          </label>
          <label>
            {t("times", "Times (comma separated)")}
            <input
              value={form.times}
              onChange={(event) => setForm((current) => ({ ...current, times: event.target.value }))}
            />
          </label>
          <button className="btn" type="submit">{t("save_reminder", "Save reminder")}</button>
        </form>
      </section>
    </div>
  );
}
