export default function MedicalHistorySection({ title, children, empty }) {
  const hasContent = Boolean(children);
  return (
    <section className="card history-section">
      <h3>{title}</h3>
      {hasContent ? children : <p className="muted">{empty || "Nothing recorded in this section yet."}</p>}
    </section>
  );
}
