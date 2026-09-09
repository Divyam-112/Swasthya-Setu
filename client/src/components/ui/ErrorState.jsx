import Icon from "./Icon.jsx";

export default function ErrorState({ message, onRetry }) {
  return (
    <div className="state-box error" role="alert">
      <span className="state-icon" style={{ background: "#fff", color: "var(--danger)" }}>
        <Icon name="alert" size={24} />
      </span>
      <h3>Something went wrong</h3>
      <p>{message || "Unable to load your health information. Please try again."}</p>
      {onRetry ? (
        <button className="btn secondary" type="button" onClick={onRetry}>
          <Icon name="refresh" size={18} />
          Try again
        </button>
      ) : null}
    </div>
  );
}
