import Icon from "./Icon.jsx";

export default function EmptyState({ title, message, action, icon = "info" }) {
  return (
    <div className="state-box">
      <span className="state-icon">
        <Icon name={icon} size={24} />
      </span>
      {title ? <h3>{title}</h3> : null}
      <p className="muted">{message}</p>
      {action}
    </div>
  );
}
