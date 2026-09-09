import { useEffect, useState } from "react";
import { getPatientDocuments, processDocument, uploadDocument, deleteDocument } from "../api/documents.js";
import { toUserMessage } from "../api/client.js";
import DocumentCard from "../components/ui/DocumentCard.jsx";
import LoadingState from "../components/ui/LoadingState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";

const TYPES = [
  ["prescription", "Prescription"],
  ["lab_report", "Lab report"],
  ["discharge_summary", "Discharge summary"],
  ["imaging", "Imaging"],
  ["other", "Other"],
];

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [type, setType] = useState("prescription");
  const [file, setFile] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await getPatientDocuments();
      setDocuments(response.data || []);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload(event) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setError("");
    setSuccess("");
    try {
      await uploadDocument({ file, type });
      setFile(null);
      setSuccess("Document uploaded.");
      await load();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleProcess(doc) {
    setProcessingId(doc._id);
    setError("");
    try {
      await processDocument(doc._id, doc.sessionId);
      setSuccess("Document processed successfully.");
      await load();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setProcessingId("");
    }
  }

  async function handleDelete(doc) {
    const typeLabel = doc.type ? doc.type.replace(/_/g, " ") : "medical";
    const confirmed = window.confirm(
      `Are you sure you want to delete this ${typeLabel} document? This action cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(doc._id);
    setError("");
    setSuccess("");
    try {
      await deleteDocument(doc._id, doc.sessionId);
      setSuccess("Document deleted successfully.");
      setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="page">
      <header>
        <h1 className="page-title">Medical documents</h1>
        <p className="lede">Upload images or PDFs. Extracted text appears only if the document service is running.</p>
      </header>
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {success ? <p className="badge ok">{success}</p> : null}

      <form className="card form-grid" onSubmit={handleUpload}>
        <label>
          Document type
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          File (image or PDF)
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            required
          />
        </label>
        <button className="btn" type="submit" disabled={uploading}>
          {uploading ? "Uploading…" : "Upload document"}
        </button>
      </form>

      {loading ? (
        <LoadingState />
      ) : documents.length ? (
        <div className="grid two">
          {documents.map((doc) => (
            <DocumentCard
              key={doc._id}
              document={doc}
              processing={processingId === doc._id}
              deleting={deletingId === doc._id}
              onProcess={() => handleProcess(doc)}
              onDelete={() => handleDelete(doc)}
            />
          ))}
        </div>
      ) : (
        <EmptyState message="No documents uploaded yet." />
      )}
    </div>
  );
}
