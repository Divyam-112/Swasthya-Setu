export default function RecommendationCard({ title, children }) {
  return (
    <article className="card">
      <h3>{title}</h3>
      {children}
    </article>
  );
}
