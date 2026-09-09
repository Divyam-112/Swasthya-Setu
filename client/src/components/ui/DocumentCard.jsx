import { formatDateTime } from "../../utils/format.js";

const TYPE_LABELS = {
  prescription: "Prescription",
  lab_report: "Lab report",
  discharge_summary: "Discharge summary",
  imaging: "Imaging",
  other: "Other document",
};

export default function DocumentCard({ document, onProcess, processing, onDelete, deleting }) {
  const extracted = document.extractedData || {};
  const hasExtracted =
    extracted.diagnoses?.length ||
    extracted.medications?.length ||
    extracted.labResults?.length ||
    document.ocrText;

  return (
    <article className="card" style={{ position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p className="badge" style={{ margin: 0 }}>{TYPE_LABELS[document.type] || document.type}</p>
        {onDelete ? (
          <button
            className="btn ghost"
            type="button"
            style={{
              padding: "4px 8px",
              fontSize: "0.78rem",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: "6px",
              cursor: "pointer",
            }}
            onClick={onDelete}
            disabled={deleting}
            title="Delete this document record"
          >
            {deleting ? "Deleting…" : "🗑️ Delete"}
          </button>
        ) : null}
      </div>
      {document.imageUrl ? (
        <img className="doc-preview" src={document.imageUrl} alt={`${TYPE_LABELS[document.type] || "Medical"} document`} />
      ) : null}
      <p className="muted" style={{ fontSize: "0.82rem", margin: "6px 0" }}>{formatDateTime(document.uploadedAt)}</p>
      {hasExtracted ? (
        <div style={{ fontSize: "0.85rem" }}>
          {extracted.diagnoses?.length ? <p><strong>Findings:</strong> {extracted.diagnoses.join(", ")}</p> : null}
          {extracted.medications?.length ? (
            <p><strong>Medicines:</strong> {extracted.medications.map((med) => med.name || med).join(", ")}</p>
          ) : null}
          {extracted.labResults?.length ? (
            <p><strong>Lab Results:</strong> {extracted.labResults.length} test{extracted.labResults.length > 1 ? "s" : ""}{extracted.labResults.some((r) => r.isAbnormal) ? ` (${extracted.labResults.filter((r) => r.isAbnormal).length} abnormal)` : ""}</p>
          ) : null}
          {document.ocrText ? <p className="muted" style={{ fontSize: "0.8rem" }}>{document.ocrText.slice(0, 180)}…</p> : null}
        </div>
      ) : (
        <p className="muted" style={{ fontSize: "0.85rem" }}>Uploaded. Extracted text appears after processing.</p>
      )}
      {onProcess ? (
        <div style={{ marginTop: 12 }}>
          <button className="btn secondary" type="button" onClick={onProcess} disabled={processing} style={{ width: "100%" }}>
            {processing ? "Processing with AI…" : "⚡ Process document with AI"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

