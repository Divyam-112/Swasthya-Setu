export default function LoadingState({ message = "Loading your health information…", rows = 3 }) {
  return (
    <div role="status" aria-live="polite" className="stack">
      <p className="muted">{message}</p>
      <div className="grid three" aria-hidden="true">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="skeleton block" />
        ))}
      </div>
    </div>
  );
}
