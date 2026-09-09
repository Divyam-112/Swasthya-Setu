import { formatDateTime } from "../../utils/format.js";

export default function ChatMessage({ role, content, timestamp }) {
  const isPatient = role === "patient";
  return (
    <div className={`bubble ${isPatient ? "patient" : "ai"}`}>
      <p style={{ margin: 0 }}>{content}</p>
      {timestamp ? (
        <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.85rem", color: isPatient ? "#dceee4" : undefined }}>
          {isPatient ? "You" : "Health assistant"} · {formatDateTime(timestamp)}
        </p>
      ) : null}
    </div>
  );
}
