import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getConversation, respondToQuestion, respondVoice, startSession } from "../api/history.js";
import { toUserMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import ChatMessage from "../components/ui/ChatMessage.jsx";
import LoadingState from "../components/ui/LoadingState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import { createRecognizer, isSpeechRecognitionSupported, speakText } from "../utils/speech.js";

export default function HistoryTaking() {
  const { sessionId: existingId } = useParams();
  const { patient } = useAuth();
  const { language, t } = useLanguage();
  const currentLang = language || patient?.preferredLanguage || "en";
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState(existingId || "");
  const [sessionType, setSessionType] = useState("allopathic");
  const [question, setQuestion] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(Boolean(existingId));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function begin(type = sessionType) {
    setLoading(true);
    setError("");
    try {
      const response = await startSession({ sessionType: type, language: currentLang });
      const id = response.data.sessionId;
      setSessionId(id);
      setQuestion(response.data.firstQuestion);
      setMessages([
        { role: "ai", content: response.data.firstQuestion.question, timestamp: new Date().toISOString() },
      ]);
      speakText(response.data.firstQuestion.question, currentLang);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!existingId) return;
    let cancelled = false;
    async function resume() {
      setLoading(true);
      try {
        const response = await getConversation(existingId);
        if (cancelled) return;
        setSessionId(existingId);
        setMessages(response.data.conversation || []);
        const lastAi = [...(response.data.conversation || [])].reverse().find((msg) => msg.role === "ai");
        if (lastAi) {
          setQuestion({
            question: lastAi.content,
            category: response.data.currentCategory,
            completionPercentage: response.data.completionPercentage,
            options: [],
          });
        }
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    resume();
    return () => {
      cancelled = true;
    };
  }, [existingId]);

  async function sendAnswer(answer, inputMode = "text") {
    if (!sessionId || !answer.trim()) return;
    setSending(true);
    setError("");
    setMessages((current) => [
      ...current,
      { role: "patient", content: answer, timestamp: new Date().toISOString() },
    ]);
    try {
      const response =
        inputMode === "voice"
          ? await respondVoice({
              sessionId,
              transcribedText: answer,
              language: currentLang,
            })
          : await respondToQuestion({ sessionId, answer, inputMode, language: currentLang });
      const next = response.data.nextQuestion;
      setQuestion(next);
      setMessages((current) => [
        ...current,
        { role: "ai", content: next.question, timestamp: new Date().toISOString() },
      ]);
      speakText(next.question, currentLang);
      if (next.completionPercentage >= 100) {
        navigate(`/history/${sessionId}`);
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSending(false);
    }
  }

  function handleVoice() {
    if (!isSpeechRecognitionSupported()) {
      setError("Voice input is not supported in this browser. Please type your answer.");
      return;
    }
    try {
      const recognition = createRecognizer(
        currentLang,
        (transcript) => {
          setListening(false);
          sendAnswer(transcript, "voice");
        },
        (reason) => {
          setListening(false);
          setError(reason === "not-allowed" ? "Microphone permission is needed for voice answers." : "Voice input failed. Please try again.");
        },
      );
      setListening(true);
      recognition.start();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!sessionId && !existingId) {
    return (
      <div className="page">
        <h1 className="page-title">Record medical history</h1>
        <p className="lede">Answer one question at a time. You can tap, type, or speak.</p>
        <form
          className="card form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            begin();
          }}
        >
          <label>
            Type of history
            <select value={sessionType} onChange={(event) => setSessionType(event.target.value)}>
              <option value="allopathic">General medical history</option>
              <option value="ayush">Ayurvedic history</option>
            </select>
          </label>
          <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: "0.45rem", background: "var(--surface-muted)", padding: "10px 14px", borderRadius: "var(--radius-sm)" }}>
            <span style={{ color: "var(--ok)", fontWeight: 700 }}>✓</span>
            <span>Informed consent active (verified at account registration).</span>
          </div>
          {error ? <ErrorState message={error} /> : null}
          <button className="btn" type="submit" disabled={loading}>
            Start Recording
          </button>
        </form>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState message="Preparing your history questions…" />
      </div>
    );
  }

  return (
    <div className="page">
      <header>
        <h1 className="page-title">History conversation</h1>
        <p className="lede">
          {question?.category || "In progress"} · {question?.completionPercentage || 0}% complete
        </p>
      </header>
      {question?.isRedFlag ? <p className="alert" role="alert">{question.redFlagAlert}</p> : null}
      {error ? <ErrorState message={error} /> : null}
      <section className="card">
        <div className="chat-thread">
          {messages.map((message, index) => (
            <ChatMessage key={`${message.timestamp}-${index}`} {...message} />
          ))}
          {sending ? <p className="muted">Preparing the next question…</p> : null}
          <div ref={chatEndRef} />
        </div>
        {question?.options?.length ? (
          <div className="grid two" style={{ marginTop: 16 }}>
            {question.options.map((option) => (
              <button key={option} className="btn secondary" type="button" disabled={sending} onClick={() => sendAnswer(option, "touch")}>
                {option}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            sendAnswer(draft, "text");
            setDraft("");
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type your answer"
            aria-label="Your answer"
          />
          <button className="btn secondary" type="button" onClick={handleVoice}>
            {listening ? "Listening…" : "Speak"}
          </button>
          <button className="btn" type="submit" disabled={sending || !draft.trim()}>
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
