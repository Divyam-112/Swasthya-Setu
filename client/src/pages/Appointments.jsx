import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { startSession, respondToQuestion, respondVoice } from "../api/history.js";
import { uploadDocument, processDocument } from "../api/documents.js";
import { getAvailableDoctors, bookAppointment, getMyAppointments, cancelAppointment } from "../api/care.js";
import { recordConsent } from "../api/auth.js";
import { toUserMessage } from "../api/client.js";
import { createRecognizer, isSpeechRecognitionSupported, speakText } from "../utils/speech.js";
import { formatDate } from "../utils/format.js";
import { CheckCircle2, Plus, Calendar, Mic, Check } from "lucide-react";
import ChatMessage from "../components/ui/ChatMessage.jsx";
import LoadingState from "../components/ui/LoadingState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";

const STEPS = [
  { n: 1, key: "describe_symptoms", label: "Describe Symptoms" },
  { n: 2, key: "upload_records", label: "Upload Records" },
  { n: 3, key: "select_doctor", label: "Select Doctor" },
  { n: 4, key: "confirm_booking", label: "Confirm Booking" },
];

const SPECIALIZATIONS = [
  "General Medicine", "Cardiology", "Orthopedics", "Dermatology",
  "Pediatrics", "Gynecology", "Neurology", "Ophthalmology",
  "ENT", "Psychiatry", "Ayurveda", "Surgery", "Other",
];

export default function Appointments() {
  const { patient } = useAuth();
  const { language, t } = useLanguage();
  const currentLang = language || patient?.preferredLanguage || "en";
  const navigate = useNavigate();

  // Wizard state
  const [step, setStep] = useState(0); // 0 = show existing, 1-4 = wizard steps
  const [sessionId, setSessionId] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [suggestedSpec, setSuggestedSpec] = useState("General Medicine");

  // Step 1: Interview
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (step === 1) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, sending, step]);

  // Step 2: Upload
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadType, setUploadType] = useState("prescription");
  const [uploading, setUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState([]);

  // Step 3: Doctor selection
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [selectedSlot, setSelectedSlot] = useState("morning");
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  // Step 4: Booking
  const [booking, setBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);

  // Existing appointments
  const [existingAppointments, setExistingAppointments] = useState([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    loadExistingAppointments();
  }, []);

  async function loadExistingAppointments() {
    setLoadingAppointments(true);
    try {
      const res = await getMyAppointments();
      setExistingAppointments(res.data || []);
    } catch {
      // silent fail
    } finally {
      setLoadingAppointments(false);
    }
  }

  // ─── Step 1: Start interview ─────────────────────────────────
  async function startInterview() {
    setError("");
    setSending(true);
    try {
      const res = await startSession({ sessionType: "allopathic", language: currentLang });
      const id = res.data.sessionId;
      setSessionId(id);
      setQuestion(res.data.firstQuestion);
      setMessages([
        { role: "ai", content: res.data.firstQuestion.question, timestamp: new Date().toISOString() },
      ]);
      speakText(res.data.firstQuestion.question, currentLang);
      await recordConsent({ sessionId: id, dataCollection: true, dataSharing: true, method: "touch" });
      setStep(1);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function sendAnswer(answer, inputMode = "text") {
    if (!sessionId || !answer.trim()) return;
    setSending(true);
    setError("");
    setMessages((cur) => [...cur, { role: "patient", content: answer, timestamp: new Date().toISOString() }]);
    try {
      const res = inputMode === "voice"
        ? await respondVoice({ sessionId, transcribedText: answer, language: currentLang })
        : await respondToQuestion({ sessionId, answer, inputMode, language: currentLang });
      const next = res.data.nextQuestion;
      setQuestion(next);
      setMessages((cur) => [...cur, { role: "ai", content: next.question, timestamp: new Date().toISOString() }]);
      speakText(next.question, currentLang);

      // Extract chief complaint from data
      if (next.extractedData?.chiefComplaint || res.data.extractedData?.chiefComplaint) {
        setChiefComplaint(next.extractedData?.chiefComplaint || res.data.extractedData?.chiefComplaint);
      }

      if (next.completionPercentage >= 100) {
        finishInterview(next);
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSending(false);
    }
  }

  function finishInterview(q) {
    // Try to guess specialization from chief complaint
    const complaint = (chiefComplaint || q?.extractedData?.chiefComplaint || "").toLowerCase();
    if (complaint.includes("chest") || complaint.includes("heart") || complaint.includes("bp")) {
      setSuggestedSpec("Cardiology");
    } else if (complaint.includes("bone") || complaint.includes("joint") || complaint.includes("fracture")) {
      setSuggestedSpec("Orthopedics");
    } else if (complaint.includes("skin") || complaint.includes("rash") || complaint.includes("acne")) {
      setSuggestedSpec("Dermatology");
    } else if (complaint.includes("headache") || complaint.includes("brain") || complaint.includes("nerve")) {
      setSuggestedSpec("Neurology");
    } else if (complaint.includes("eye") || complaint.includes("vision")) {
      setSuggestedSpec("Ophthalmology");
    } else if (complaint.includes("ear") || complaint.includes("nose") || complaint.includes("throat")) {
      setSuggestedSpec("ENT");
    } else if (complaint.includes("child") || complaint.includes("kid") || complaint.includes("baby")) {
      setSuggestedSpec("Pediatrics");
    } else {
      setSuggestedSpec("General Medicine");
    }
    setStep(2);
  }

  function handleVoice() {
    if (!isSpeechRecognitionSupported()) {
      setError("Voice input is not supported in this browser.");
      return;
    }
    try {
      const recognition = createRecognizer(
        currentLang,
        (transcript) => { setListening(false); sendAnswer(transcript, "voice"); },
        (reason) => { setListening(false); setError("Voice input failed. Please try again."); },
      );
      setListening(true);
      recognition.start();
    } catch (err) {
      setError(err.message);
    }
  }

  // ─── Step 2: Upload records ──────────────────────────────────
  async function handleUpload(e) {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setError("");
    try {
      const res = await uploadDocument({ file: uploadFile, type: uploadType, sessionId });
      if (res?.data?.docId && (sessionId || res?.data?.sessionId)) {
        processDocument(res.data.docId, sessionId || res.data.sessionId).catch((err) => {
          console.warn("Background OCR warning:", err);
        });
      }
      setUploadedDocs((cur) => [...cur, { name: uploadFile.name, type: uploadType }]);
      setUploadFile(null);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setUploading(false);
    }
  }

  // ─── Step 3: Load doctors ────────────────────────────────────
  async function loadDoctors(spec) {
    setLoadingDoctors(true);
    setError("");
    try {
      const res = await getAvailableDoctors(spec);
      setDoctors(res.data || []);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoadingDoctors(false);
    }
  }

  useEffect(() => {
    if (step === 3) {
      loadDoctors(suggestedSpec);
    }
  }, [step, suggestedSpec]);

  // ─── Step 4: Book ────────────────────────────────────────────
  async function handleBook() {
    if (!selectedDoctor) return;
    setBooking(true);
    setError("");
    try {
      const res = await bookAppointment({
        doctorId: selectedDoctor.doctorId,
        sessionId,
        scheduledDate: selectedDate,
        preferredTimeSlot: selectedSlot,
        reason: chiefComplaint || "General consultation",
      });
      setBookingResult(res.data);
      setStep(4);
      loadExistingAppointments();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBooking(false);
    }
  }

  async function handleCancel(appointmentId) {
    try {
      await cancelAppointment(appointmentId, "Patient cancelled");
      loadExistingAppointments();
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  // ─── RENDER ──────────────────────────────────────────────────

  // Success screen after booking
  if (step === 4 && bookingResult) {
    return (
      <div className="page">
        <div className="card appointment-success">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <CheckCircle2 size={48} color="var(--brand)" />
          </div>
          <h1 className="page-title">{t("appointment_booked", "Appointment Booked!")}</h1>
          <div className="appointment-success-details">
            <p><strong>{t("token_number", "Token Number")}:</strong> #{bookingResult.tokenNumber}</p>
            <p><strong>{t("doctor", "Doctor")}:</strong> {bookingResult.doctor?.name}</p>
            <p><strong>{t("specialization", "Specialization")}:</strong> {bookingResult.doctor?.specialization}</p>
            <p><strong>{t("date", "Date")}:</strong> {formatDate(bookingResult.scheduledDate)}</p>
            <p><strong>{t("time_slot", "Time Slot")}:</strong> {bookingResult.preferredTimeSlot}</p>
            <p><strong>{t("reason", "Reason")}:</strong> {bookingResult.reason}</p>
          </div>
          <button className="btn" type="button" onClick={() => { setStep(0); setBookingResult(null); setSessionId(""); setMessages([]); }}>
            {t("back_to_appointments", "Back to appointments")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header>
        <h1 className="page-title">{t("book_appointment", "Appointments")}</h1>
        <p className="lede">{t("appointments_lede", "Book a new appointment or view your existing ones.")}</p>
      </header>

      {error ? <ErrorState message={error} /> : null}

      {/* ─── Wizard Steps Indicator ─────────────────────────── */}
      {step >= 1 && step <= 3 ? (
        <div className="wizard-steps">
          {STEPS.map((s) => (
            <div key={s.n} className={`wizard-step ${step === s.n ? "active" : step > s.n ? "done" : ""}`}>
              <span className="wizard-step-num">{step > s.n ? <Check size={13} /> : s.n}</span>
              <span>{t(s.key, s.label)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* ─── Step 0: Start / Existing ───────────────────────── */}
      {step === 0 ? (
        <>
          <button className="btn" type="button" onClick={startInterview} disabled={sending} style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
            <Plus size={16} />
            {sending ? t("starting", "Starting…") : t("book_new_appointment", "Book New Appointment")}
          </button>

          <section style={{ marginTop: 24 }}>
            <h2>{t("your_appointments", "Your Appointments")}</h2>
            {loadingAppointments ? <LoadingState /> : existingAppointments.length ? (
              <div className="grid two">
                {existingAppointments.map((apt) => (
                  <article key={apt._id} className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <strong>{apt.doctor?.name || t("doctor", "Doctor")}</strong>
                        <p className="muted">{apt.doctor?.specialization}</p>
                      </div>
                      <span className={`badge ${apt.status === "booked" ? "ok" : apt.status === "cancelled" ? "" : ""}`}>
                        {apt.status}
                      </span>
                    </div>
                    <p style={{ display: "flex", alignItems: "center", gap: 6, margin: "6px 0" }}>
                      <Calendar size={14} color="var(--ink-soft)" />
                      <span>{formatDate(apt.scheduledDate)} · {apt.preferredTimeSlot || "Any"}</span>
                    </p>
                    <p className="muted">{apt.reason || apt.session?.clinicalHistory?.chiefComplaint || "General"}</p>
                    {apt.tokenNumber ? <p><strong>{t("token_number", "Token")} #{apt.tokenNumber}</strong></p> : null}
                    {apt.status === "booked" ? (
                      <button className="btn secondary small" type="button" onClick={() => handleCancel(apt._id)}>
                        {t("cancel", "Cancel")}
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState message={t("no_appointments_yet", "No appointments yet. Book your first one above!")} />
            )}
          </section>
        </>
      ) : null}

      {/* ─── Step 1: Symptom Interview ──────────────────────── */}
      {step === 1 ? (
        <section className="card">
          <h2>{t("describe_symptoms", "Tell us about your symptoms")}</h2>
          <p className="lede">
            Answer the questions below. You can type, tap an option, or speak.
            {question?.completionPercentage != null ? ` · ${question.completionPercentage}% complete` : ""}
          </p>
          {question?.isRedFlag ? <p className="alert" role="alert">{question.redFlagAlert}</p> : null}
          <div className="chat-thread">
            {messages.map((msg, i) => (
              <ChatMessage key={`${msg.timestamp}-${i}`} {...msg} />
            ))}
            {sending ? <p className="muted">Preparing next question…</p> : null}
            <div ref={chatEndRef} />
          </div>
          {question?.options?.length ? (
            <div className="grid two" style={{ marginTop: 16 }}>
              {question.options.map((opt) => (
                <button key={opt} className="btn secondary" type="button" disabled={sending} onClick={() => sendAnswer(opt, "touch")}>
                  {opt}
                </button>
              ))}
            </div>
          ) : null}
          <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); sendAnswer(draft, "text"); setDraft(""); }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type your answer" aria-label="Your answer" />
            <button className="btn secondary" type="button" onClick={handleVoice} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <Mic size={15} />
              {listening ? "Listening…" : "Speak"}
            </button>
            <button className="btn" type="submit" disabled={sending || !draft.trim()}>Send</button>
          </form>
          <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
            <button className="btn secondary" type="button" onClick={() => finishInterview(question)}>
              Skip → Select Doctor
            </button>
          </div>
        </section>
      ) : null}

      {/* ─── Step 2: Upload Records ─────────────────────────── */}
      {step === 2 ? (
        <section>
          <div className="card">
            <h2>Upload past medical records (optional)</h2>
            <p className="lede">Upload relevant prescriptions, lab reports, or discharge summaries. These will be added to your medical history.</p>
            <form className="form-grid" onSubmit={handleUpload}>
              <label>
                Document type
                <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
                  <option value="prescription">Prescription</option>
                  <option value="lab_report">Lab report</option>
                  <option value="discharge_summary">Discharge summary</option>
                  <option value="imaging">Imaging</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                File (image or PDF)
                <input type="file" accept="image/*,application/pdf" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
              </label>
              <button className="btn secondary" type="submit" disabled={uploading || !uploadFile}>
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </form>
            {uploadedDocs.length ? (
              <div style={{ marginTop: 16 }}>
                <p><strong>Uploaded:</strong></p>
                <ul className="list">
                  {uploadedDocs.map((d, i) => <li key={i}>{d.name} ({d.type})</li>)}
                </ul>
              </div>
            ) : null}
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
            <button className="btn" type="button" onClick={() => setStep(3)}>
              Continue → Select Doctor
            </button>
            <button className="btn secondary" type="button" onClick={() => setStep(3)}>
              Skip
            </button>
          </div>
        </section>
      ) : null}

      {/* ─── Step 3: Doctor Selection ───────────────────────── */}
      {step === 3 ? (
        <section>
          <div className="card">
            <h2>Select a doctor</h2>
            {chiefComplaint ? (
              <p className="lede">
                Based on your symptoms (<strong>{chiefComplaint}</strong>), we recommend a <strong>{suggestedSpec}</strong> specialist.
              </p>
            ) : null}
            <label>
              Filter by specialization
              <select value={suggestedSpec} onChange={(e) => { setSuggestedSpec(e.target.value); setSelectedDoctor(null); }}>
                <option value="">All specializations</option>
                {SPECIALIZATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          {loadingDoctors ? <LoadingState /> : doctors.length ? (
            <div className="grid two" style={{ marginTop: 16 }}>
              {doctors.map((doc) => (
                <button
                  key={doc.doctorId}
                  type="button"
                  className={`card doctor-select-card ${selectedDoctor?.doctorId === doc.doctorId ? "selected" : ""}`}
                  onClick={() => setSelectedDoctor(doc)}
                >
                  <strong>Dr. {doc.name}</strong>
                  <p className="muted">{doc.specialization}</p>
                  <p>Queue today: {doc.todayQueueCount} patients</p>
                  {doc.hospitalId ? <p className="muted">Hospital: {doc.hospitalId}</p> : null}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState message="No doctors found for this specialization." />
          )}

          {selectedDoctor ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h3>Select date & time</h3>
              <div className="form-grid">
                <label>
                  Date
                  <input type="date" value={selectedDate} min={new Date().toISOString().split("T")[0]} onChange={(e) => setSelectedDate(e.target.value)} />
                </label>
                <label>
                  Preferred time slot
                  <select value={selectedSlot} onChange={(e) => setSelectedSlot(e.target.value)}>
                    <option value="morning">Morning (9 AM - 12 PM)</option>
                    <option value="afternoon">Afternoon (12 PM - 4 PM)</option>
                    <option value="evening">Evening (4 PM - 7 PM)</option>
                    <option value="any">Any available</option>
                  </select>
                </label>
              </div>
              <button className="btn" type="button" onClick={handleBook} disabled={booking} style={{ marginTop: 12 }}>
                {booking ? "Booking…" : `Book with Dr. ${selectedDoctor.name}`}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
