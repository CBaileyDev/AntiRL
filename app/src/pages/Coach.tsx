import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Play,
  RotateCcw,
  ShieldAlert,
  Loader2,
  ChevronDown,
} from "lucide-react";
import type { Conversation, Message, ReplaySummary, Settings } from "../types";

interface CoachProps {
  settings: Settings;
  replays: ReplaySummary[];
  conversations: Conversation[];
  activeConversationId?: string | null;
  activeReplayId?: string | null;
  initialPrompt?: string;
  onSendMessage: (
    message: string,
    replayId?: string | null,
    convId?: string | null
  ) => Promise<{ response: string; conversation_id: string; evidence_ids?: string[] }>;
  onSelectReplayStudio: (replayId: string) => void;
  onRefreshConversations: () => void;
}

export default function Coach({
  settings,
  replays,
  conversations,
  activeConversationId,
  activeReplayId,
  initialPrompt,
  onSendMessage,
  onSelectReplayStudio,
  onRefreshConversations,
}: CoachProps) {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(
    activeConversationId || conversations[0]?.id || null
  );
  const [selectedReplayId, setSelectedReplayId] = useState<string | null>(
    activeReplayId || replays[0]?.id || null
  );

  const [messages, setMessages] = useState<
    { id: string; role: "user" | "assistant"; content: string; evidence_ids?: string[] }[]
  >([
    {
      id: "intro-1",
      role: "assistant",
      content:
        "Hello! I am your AntiRL coach. I analyze genuine Rocket League replay telemetry—including player velocities, boost collection, defensive half depth, and rotation timing. Select a match to ground our discussion, or ask for general mechanical drills and tactical guidance.",
    },
  ]);

  const [input, setInput] = useState(initialPrompt || "");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");

    const userMsg = { id: `user-${Date.now()}`, role: "user" as const, content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await onSendMessage(text, selectedReplayId, selectedConvId);
      if (!selectedConvId && res.conversation_id) {
        setSelectedConvId(res.conversation_id);
        onRefreshConversations();
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `asst-${Date.now()}`,
          role: "assistant",
          content: res.response,
          evidence_ids: res.evidence_ids,
        },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Unable to complete coach query: ${e.message || String(e)}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content-pane" style={{ height: "calc(100vh - 63px)", paddingBottom: 16 }}>
      {/* Top Context Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Sparkles size={18} color="var(--accent)" />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>AI Replay Coach</h2>
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: "var(--radius-pill)",
              background: settings.cloud_consent ? "var(--sage-soft)" : "var(--surface)",
              color: settings.cloud_consent ? "var(--sage)" : "var(--muted)",
              border: "1px solid var(--line-strong)",
            }}
          >
            {settings.cloud_consent ? `${settings.provider} (${settings.chat_model})` : "Local / Offline Analysis"}
          </span>
        </div>

        {/* Replay Context Picker */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ color: "var(--muted)", fontWeight: 500 }}>Match Context:</span>
          <select
            aria-label="Attached Replay Match"
            value={selectedReplayId || ""}
            onChange={(e) => setSelectedReplayId(e.target.value || null)}
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              maxWidth: 300,
            }}
          >
            <option value="">General Coaching (No Match)</option>
            {replays.map((r) => (
              <option key={r.id} value={r.id}>
                {r.mode} · {r.replay_name || r.file_name} ({r.blue_score ?? "?"}-{r.orange_score ?? "?"})
              </option>
            ))}
          </select>

          {selectedReplayId && (
            <button
              className="btn btn-secondary"
              style={{ padding: "5px 10px", fontSize: 12 }}
              onClick={() => onSelectReplayStudio(selectedReplayId)}
            >
              <Play size={12} /> View in Studio
            </button>
          )}
        </div>
      </div>

      {/* Main Chat Conversation Container */}
      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`chat-bubble ${m.role === "user" ? "bubble-user" : "bubble-assistant"}`}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                  color: m.role === "user" ? "var(--accent)" : "var(--sage)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
                <span>{m.role === "user" ? "You" : "AntiRL Coach"}</span>
              </div>

              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{m.content}</div>

              {m.evidence_ids && m.evidence_ids.length > 0 && selectedReplayId && (
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: "1px solid var(--line)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                    Cited Replay Moments:
                  </span>
                  {m.evidence_ids.map((eid) => (
                    <button
                      key={eid}
                      onClick={() => onSelectReplayStudio(selectedReplayId)}
                      style={{
                        fontSize: 10.5,
                        fontFamily: "var(--mono)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "var(--surface-raised)",
                        color: "var(--accent)",
                        border: "1px solid var(--accent-line)",
                        cursor: "pointer",
                      }}
                    >
                      {eid.split(":").slice(-2).join(":")}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="chat-bubble bubble-assistant" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Loader2 size={16} className="spin" color="var(--accent)" />
              <span style={{ color: "var(--muted)", fontSize: 13 }}>
                Grounding coaching advice in replay telemetry...
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input Row */}
        <div className="chat-input-row">
          <input
            type="text"
            className="chat-input"
            placeholder={
              selectedReplayId
                ? "Ask about boost routes, rotation timing, or 50-50 decisions in this match..."
                : "Ask for training drills, mechanics tips, or competitive decision-making..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />

          <button
            className="btn btn-primary"
            disabled={!input.trim() || loading}
            onClick={handleSend}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
