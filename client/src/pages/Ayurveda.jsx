import { useEffect, useState } from "react";
import { getRecommendations } from "../api/care.js";
import { toUserMessage } from "../api/client.js";
import LoadingState from "../components/ui/LoadingState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import RecommendationCard from "../components/ui/RecommendationCard.jsx";

export default function Ayurveda() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await getRecommendations();
      setData(response.data);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="page">
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  const recommendations = data?.recommendations || [];

  return (
    <div className="page">
      <header>
        <h1 className="page-title">Recommended Ayurvedic & Yoga Care</h1>
        <p className="lede">
          Shown only from conditions already in your prescriptions or medical history.
        </p>
      </header>

      {data?.sourceConditions?.length ? (
        <p className="muted">Based on: {data.sourceConditions.join(", ")}</p>
      ) : null}

      {!recommendations.length ? (
        <EmptyState
          title="No matching recommendations yet"
          message="Record your medical history or wait for a doctor’s diagnosis so guidance can be matched to your condition."
        />
      ) : (
        recommendations.map((item) => (
          <section key={item.id} className="grid two">
            <RecommendationCard title={item.conditionName}>
              <p>{item.ayurveda.explanation}</p>
              <h4>Lifestyle</h4>
              <ul className="list">
                {item.ayurveda.lifestyle.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <h4>Diet</h4>
              <ul className="list">
                {item.ayurveda.diet.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {item.ayurveda.references?.length ? (
                <p>
                  {item.ayurveda.references.map((ref) => (
                    <a key={ref.url} href={ref.url} target="_blank" rel="noopener noreferrer">
                      {ref.title}
                    </a>
                  ))}
                </p>
              ) : null}
            </RecommendationCard>
            <RecommendationCard title="Yoga exercises">
              {item.yoga.map((yoga) => (
                <div key={yoga.name} className="history-section">
                  <h4>{yoga.name}</h4>
                  <p>{yoga.duration} min · {yoga.frequency}</p>
                  <p>{yoga.explanation}</p>
                  <p>{yoga.instructions}</p>
                  <p className="muted">Avoid when: {yoga.avoidWhen}</p>
                </div>
              ))}
            </RecommendationCard>
          </section>
        ))
      )}

      <section className="card">
        <h2>Safety information</h2>
        <p>{data?.safety?.general}</p>
        <ul className="list">
          {(data?.safety?.avoidWhen || []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>{data?.safety?.consultPhysician}</p>
      </section>
    </div>
  );
}
