import { useEffect, useRef, useState } from "react";
import { getAllChats, getChatHistory, sendChatMessage, startChat } from "../api/chat.js";
import { toUserMessage } from "../api/client.js";
import { MessageSquare, Sparkles, Plus } from "lucide-react";
import { useLanguage } from "../context/LanguageContext.jsx";
import ChatMessage from "../components/ui/ChatMessage.jsx";
import LoadingState from "../components/ui/LoadingState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { hasEmergencyKeywords } from "../utils/format.js";

export default function Chat() {
  const { language, t } = useLanguage();
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatId, setChatId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [emergency, setEmergency] = useState(false);
  const endRef = useRef(null);

  async function loadChats() {
    const response = await getAllChats();
    setChats(response.data || []);
    return response.data || [];
  }

  async function openChat(id) {
    const response = await getChatHistory(id);
    setChatId(id);
    setMessages(response.data.messages || []);
  }

  async function bootstrap() {
    setLoading(true);
    setError("");
    try {
      const list = await loadChats();
      if (list[0]?.chatId) {
        await openChat(list[0].chatId);
      } else {
        await handleStart();
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleStart() {
    setSending(true);
    setError("");
    try {
      const response = await startChat({ language });
      setChatId(response.data.chatId);
      setMessages(response.data.messages || []);
      await loadChats();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function handleSend(textToSend) {
    const text = (typeof textToSend === "string" ? textToSend : draft).trim();
    if (!text) return;
    let activeId = chatId;
    setSending(true);
    setError("");
    setEmergency(hasEmergencyKeywords(text));
    try {
      if (!activeId) {
        const started = await startChat({ language });
        activeId = started.data.chatId;
        setChatId(activeId);
        setMessages(started.data.messages || []);
      }
      setDraft("");
      setMessages((current) => [
        ...current,
        { role: "patient", content: text, timestamp: new Date().toISOString() },
      ]);
      const response = await sendChatMessage({ chatId: activeId, message: text, language });
      setMessages((current) => [
        ...current,
        { role: "ai", content: response.data.aiResponse, timestamp: new Date().toISOString() },
      ]);
      await loadChats();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSending(false);
    }
  }

  const suggestions = [
    t("suggestion_rx", "Explain my prescription in simple words"),
    t("suggestion_remedies", "Ayurvedic home remedies for cold & cough"),
    t("suggestion_exercise", "Recommend safe morning yoga for me"),
    t("suggestion_diet", "What healthy foods should I eat today?"),
  ];

  if (loading) {
    return (
      <div className="page">
        <LoadingState message={t("loading", "Loading your health assistant…")} />
      </div>
    );
  }

  return (
    <div className="page">
      <header>
        <h1 className="page-title">{t("chat_title", "AI Health Assistant")}</h1>
        <p className="lede">{t("chat_subtitle", "Ask everyday health questions in your preferred language.")}</p>
      </header>

      <p className="disclaimer">
        {t("chat_disclaimer", "This assistant does not replace a doctor. For urgent or worsening symptoms, seek in-person or emergency care.")}
      </p>

      {emergency ? (
        <p className="alert" role="alert">
          {t("emergency_detected", "These symptoms can be serious. If someone has chest pain, sudden weakness, severe bleeding, or trouble breathing, call emergency services now.")}
        </p>
      ) : null}

      {error ? <ErrorState message={error} onRetry={bootstrap} /> : null}

      <div className="chat-wrap">
        <aside className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{t("conversations", "Conversations")}</h2>
          </div>
          <button className="btn secondary" type="button" onClick={handleStart} disabled={sending} style={{ width: "100%", marginBottom: "0.75rem", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Plus size={14} />
            <span>{t("new_chat", "New chat")}</span>
          </button>
          <div className="table-like" style={{ maxHeight: "50vh", overflowY: "auto" }}>
            {chats.length ? (
              chats.map((item) => (
                <button
                  key={item.chatId}
                  className={`btn ghost ${item.chatId === chatId ? "secondary" : ""}`}
                  type="button"
                  onClick={() => openChat(item.chatId)}
                  style={{
                    textAlign: "left",
                    justifyContent: "flex-start",
                    width: "100%",
                    fontSize: "0.85rem",
                    padding: "8px 10px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <MessageSquare size={13} style={{ flexShrink: 0, color: "var(--brand)" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.lastMessage || t("conversations", "Conversation")}
                  </span>
                </button>
              ))
            ) : (
              <p className="muted" style={{ fontSize: "0.85rem" }}>{t("no_previous_chats", "No previous chats.")}</p>
            )}
          </div>
        </aside>

        <section className="card" style={{ display: "flex", flexDirection: "column", minHeight: "65vh" }}>
          <div className="chat-thread" style={{ flex: 1 }}>
            {messages.length ? (
              messages.map((message, index) => (
                <ChatMessage
                  key={`${message.timestamp}-${index}`}
                  role={message.role}
                  content={message.content}
                  timestamp={message.timestamp}
                />
              ))
            ) : (
              <EmptyState
                title={t("start_first_chat", "Start a conversation")}
                message={t("chat_subtitle", "Ask anything about your health, diet, or medications.")}
                action={<button className="btn" type="button" onClick={handleStart}>{t("start", "Start chat")}</button>}
              />
            )}
            {sending ? <p className="muted" style={{ fontSize: "0.85rem", padding: "0.5rem" }}>{t("thinking", "The assistant is typing…")}</p> : null}
            <div ref={endRef} />
          </div>

          {/* Quick Suggestions */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", padding: "0.75rem 0", borderTop: "1px solid var(--line)" }}>
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                className="badge neutral"
                onClick={() => handleSend(s)}
                disabled={sending}
                style={{ cursor: "pointer", fontSize: "0.8rem", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 20 }}
              >
                <Sparkles size={12} color="var(--brand)" />
                <span>{s}</span>
              </button>
            ))}
          </div>

          <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("type_message", "Ask a health question in your language…")}
              aria-label="Health question"
              disabled={sending}
            />
            <button className="btn" type="submit" disabled={sending || !draft.trim()}>
              {t("send", "Send")}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
