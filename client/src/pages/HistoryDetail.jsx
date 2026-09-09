import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { generateSummary, getSession, verifySession } from "../api/history.js";
import { toUserMessage } from "../api/client.js";
import MedicalHistorySection from "../components/ui/MedicalHistorySection.jsx";
import LoadingState from "../components/ui/LoadingState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";

function listOrNull(items, render) {
  if (!items?.length) return null;
  return <ul className="list">{items.map(render)}</ul>;
}

export default function HistoryDetail() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [complaint, setComplaint] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await getSession(sessionId);
      setSession(response.data);
      setComplaint(response.data.clinicalHistory?.chiefComplaint || "");
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [sessionId]);

  async function handleVerify(event) {
    event.preventDefault();
    const original = session.clinicalHistory?.chiefComplaint || "";
    const corrections = [];
    if (complaint.trim() && complaint.trim() !== original) {
      corrections.push({
        section: "clinicalHistory",
        label: "Chief complaint",
        original,
        corrected: complaint.trim(),
      });
    }
    try {
      await verifySession(sessionId, { corrections });
      setSuccess("History saved and verified.");
      await load();
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  async function handleSummary() {
    try {
      await generateSummary(sessionId);
      setSuccess("Clinical summary generated.");
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

  if (error && !session) {
    return (
      <div className="page">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  const history = session.clinicalHistory || {};
  const personal = history.personalHistory || {};
  const ros = history.reviewOfSystems || {};

  return (
    <div className="page">
      <header>
        <h1 className="page-title">Clinical history</h1>
        <p className="lede">
          {session.sessionType} visit · {session.status} · {session.completionPercentage || 0}% complete
        </p>
      </header>
      {session.status === "in_progress" ? (
        <Link className="btn" to={`/history/${sessionId}/continue`}>Continue recording</Link>
      ) : (
        <button className="btn secondary" type="button" onClick={handleSummary}>
          Refresh / generate summary
        </button>
      )}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {success ? <p className="badge ok">{success}</p> : null}

      <form className="card" onSubmit={handleVerify}>
        <h2>Chief complaint</h2>
        <label>
          You can correct this before it is treated as verified.
          <textarea value={complaint} onChange={(event) => setComplaint(event.target.value)} />
        </label>
        <button className="btn" type="submit">Save and verify</button>
      </form>

      <MedicalHistorySection title="History of present illness">
        {Object.values(history.hpiDetails || {}).some(Boolean) ? (
          <ul className="list">
            {Object.entries(history.hpiDetails || {})
              .filter(([, value]) => value && (!Array.isArray(value) || value.length))
              .map(([key, value]) => (
                <li key={key}>
                  {key}: {Array.isArray(value) ? value.join(", ") : value}
                </li>
              ))}
          </ul>
        ) : null}
      </MedicalHistorySection>

      <MedicalHistorySection title="Past medical history">
        {listOrNull(history.pastMedicalHistory, (item) => (
          <li key={`${item.condition}-${item.duration}`}>
            {item.condition} {item.duration ? `(${item.duration})` : ""} {item.status || ""}
          </li>
        ))}
      </MedicalHistorySection>

      <MedicalHistorySection title="Past surgical history">
        {listOrNull(history.pastSurgicalHistory, (item) => (
          <li key={`${item.procedure}-${item.year}`}>
            {item.procedure} {item.year || ""}
          </li>
        ))}
      </MedicalHistorySection>

      <MedicalHistorySection title="Drug history">
        {listOrNull(history.drugHistory, (item) => (
          <li key={`${item.name}-${item.dose}`}>
            {item.name} {item.dose} {item.frequency}
          </li>
        ))}
      </MedicalHistorySection>

      <MedicalHistorySection title="Allergy history">
        {listOrNull(history.allergyHistory, (item) => (
          <li key={item.allergen}>
            {item.allergen}: {item.reaction} ({item.severity || "severity not set"})
          </li>
        ))}
      </MedicalHistorySection>

      <MedicalHistorySection title="Family history">
        {listOrNull(history.familyHistory, (item) => (
          <li key={`${item.relation}-${item.condition}`}>
            {item.relation}: {item.condition}
          </li>
        ))}
      </MedicalHistorySection>

      <MedicalHistorySection title="Personal history">
        {Object.values(personal).some(Boolean) ? (
          <ul className="list">
            {Object.entries(personal)
              .filter(([, value]) => value)
              .map(([key, value]) => (
                <li key={key}>
                  {key}: {value}
                </li>
              ))}
          </ul>
        ) : null}
      </MedicalHistorySection>

      <MedicalHistorySection title="Review of systems">
        {Object.values(ros).some((value) => value?.length) ? (
          <ul className="list">
            {Object.entries(ros)
              .filter(([, value]) => value?.length)
              .map(([key, value]) => (
                <li key={key}>
                  {key}: {value.join(", ")}
                </li>
              ))}
          </ul>
        ) : null}
      </MedicalHistorySection>

      <MedicalHistorySection title="Current medications">
        {listOrNull(history.drugHistory, (item) => (
          <li key={`med-${item.name}`}>{item.name} {item.dose}</li>
        ))}
      </MedicalHistorySection>

      <MedicalHistorySection title="Investigations / diagnosis">
        {session.clinicalSummary?.generatedText || session.clinicalSummary?.patientSummary ? (
          <div>
            {session.clinicalSummary.patientSummary ? <p>{session.clinicalSummary.patientSummary}</p> : null}
            {session.clinicalSummary.generatedText ? <p>{session.clinicalSummary.generatedText}</p> : null}
            {session.clinicalSummary.redFlags?.length ? (
              <p className="alert">Important flags: {session.clinicalSummary.redFlags.join(", ")}</p>
            ) : null}
          </div>
        ) : null}
      </MedicalHistorySection>
    </div>
  );
}
