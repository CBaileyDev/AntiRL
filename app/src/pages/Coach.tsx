import { errorMessage, errorCode } from "../errors";
import React, { useState, useEffect, useRef, useLayoutEffect } from "react";

import {
  Send,
  Bot,
  User,
  Play,
  ShieldAlert,
  Loader2,
  ChevronDown,
  Copy,
  Search,
  Plus,
  X,
  Dumbbell,
} from "lucide-react";

import ReactMarkdown from "react-markdown";

import remarkGfm from "remark-gfm";

import { invoke, ipc } from "../ipc";
import type { CloudPreviewDto, ChatResultDto, JsonValue, TrainingPackDto } from "../bindings";

import { ExternalLink } from "../externalLinks";

import { EvidenceHistory } from "../components/EvidenceHistory";

import type { Conversation, Message, ReplayAnalysis, ReplaySummary, Settings } from "../types";

interface ManifestView {
  modes?: Record<
    string,
    { recent_count: number; lifetime_count: number; unknown_date_count: number }
  >;
  excluded?: Record<string, number>;
}
function manifestView(value: unknown): ManifestView | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as ManifestView;
}

export type ChatMsg = {
  id: string;

  role: "user" | "assistant";

  content: string;

  evidence_ids?: string[];

  replay_id?: string | null;

  timestamp?: string;

  status?: string;

  legacy_warning?: string;

  context_manifest?: JsonValue;
};

export const COACH_INTRO: ChatMsg = {
  id: "intro-1",

  role: "assistant",

  content:
    "Hello! I am your AntiRL coach. I review observed Rocket League replay telemetry, with coverage limits. Select a match to ground our discussion, or ask for general mechanical drills and tactical guidance.",
};

interface CoachProps {
  messages: ChatMsg[];

  setMessages: React.Dispatch<React.SetStateAction<ChatMsg[]>>;

  selectedConvId: string | null;

  setSelectedConvId: (id: string | null) => void;

  loading: boolean;

  setLoading: (v: boolean) => void;

  settings: Settings;

  replays: ReplaySummary[];

  conversations: Conversation[];

  activeConversationId?: string | null;

  activeReplayId?: string | null;

  initialPrompt?: string;

  onSendMessage: (
    message: string,

    replayId?: string | null,

    convId?: string | null,

    onUpdate?: (text: string) => void,
  ) => Promise<ChatResultDto>;

  onSelectReplayStudio: (replayId: string) => void;

  onLoadReplay?: (replayId: string) => Promise<ReplayAnalysis>;

  onCancelAi?: () => Promise<void>;

  onRefreshConversations: () => void;
}

const markdownComponents = { a: ExternalLink };

function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={markdownComponents}
      urlTransform={(url) => (/^(https?:|mailto:)/i.test(url) ? url : "")}
    >
      {text}
    </ReactMarkdown>
  );
}

const CAT_LABEL: Record<string, string> = {
  boost: "boost",

  rotation: "rotation",

  demo: "demo",

  goal: "goal",
};

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);

  const sec = Math.floor(t % 60);

  return `${m}:${String(sec).padStart(2, "0")}`;
}

interface Chip {
  key: string;

  label: string;

  time: number;
}

function buildChips(ids: string[], replay: ReplayAnalysis | null): Chip[] {
  const events = replay?.events ?? [];

  const goals = events

    .filter((e) => e.category === "goal")

    .sort((a, b) => a.time - b.time);

  const seen = new Set<string>();

  const chips: Chip[] = [];

  for (const id of ids) {
    const ev = events.find((e) => e.id === id);

    const parts = id.split(":");

    const cat = ev?.category ?? parts[1] ?? "moment";

    const last = parts[parts.length - 1];

    const parsed = /^\d+(\.\d+)?$/.test(last) && last.includes(".") ? parseFloat(last) : NaN;

    const time = ev ? ev.time : parsed;

    let label: string;

    if (cat === "goal") {
      const idx = ev ? goals.findIndex((g) => g.id === ev.id) : -1;

      const n = idx >= 0 ? idx + 1 : /^\d+$/.test(last) ? parseInt(last, 10) + 1 : 0;

      label = n > 0 ? `Goal ${n}` : "Goal";

      if (!Number.isNaN(time)) label += ` · ${fmtTime(time)}`;
    } else {
      const name = CAT_LABEL[cat] ?? cat;

      label = Number.isNaN(time) ? name : `${fmtTime(time)} · ${name}`;
    }

    if (seen.has(label)) continue;

    seen.add(label);

    chips.push({ key: id, label, time: Number.isNaN(time) ? 0 : time });
  }

  chips.sort((a, b) => a.time - b.time);

  return chips;
}

function CitedMoments({
  ids,

  replayId,

  onLoadReplay,

  onOpen,
}: {
  ids: string[];

  replayId: string;

  onLoadReplay?: (id: string) => Promise<ReplayAnalysis>;

  onOpen: () => void;
}) {
  const [replay, setReplay] = useState<ReplayAnalysis | null>(null);
  const loadReplayRef = useRef(onLoadReplay);
  loadReplayRef.current = onLoadReplay;

  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;

    loadReplayRef
      .current?.(replayId)

      .then((r) => alive && r && Array.isArray(r.events) && setReplay(r))

      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [replayId]);

  const chips = buildChips(ids, replay);

  const shown = expanded ? chips : chips.slice(0, 8);

  const more = chips.length - 8;

  const chipStyle: React.CSSProperties = {
    fontSize: 11,

    padding: "2px 8px",

    borderRadius: 999,

    background: "var(--surface-raised)",

    color: "var(--accent)",

    border: "1px solid var(--accent-line)",

    cursor: "pointer",
  };

  return (
    <>
      {shown.map((c) => (
        <button key={c.key} onClick={onOpen} style={chipStyle} title="Open in Replay Studio">
          {c.label}
        </button>
      ))}

      {more > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ ...chipStyle, color: "var(--muted)" }}
        >
          {expanded ? "Show less" : `+${more} more`}
        </button>
      )}
    </>
  );
}

const QUICK_PROMPTS = [
  "Review my last match",

  "What are my biggest weaknesses across matches?",

  "Give me a 3-drill practice plan for this week",

  "How is my boost management compared to my teammates?",
];

export default function Coach({
  messages,

  setMessages,

  selectedConvId,

  setSelectedConvId,

  loading,

  setLoading,

  settings,

  replays,

  conversations,

  activeReplayId,

  initialPrompt,

  onSendMessage,

  onSelectReplayStudio,

  onLoadReplay,

  onCancelAi,

  onRefreshConversations,
}: CoachProps) {
  const sendingRef = useRef(false);

  const scopeRef = useRef(selectedConvId);
  scopeRef.current = selectedConvId;

  const requestRef = useRef(0);

  const cleanupActions = useRef({ onCancelAi, setLoading });
  cleanupActions.current = { onCancelAi, setLoading };
  useEffect(
    () => () => {
      requestRef.current++;
      cleanupActions.current.onCancelAi?.().catch(() => {});
      cleanupActions.current.setLoading(false);
    },
    [],
  );

  const [mode, setMode] = useState("All");

  const [preset, setPreset] = useState("Balanced");

  const [search, setSearch] = useState("");

  const [title, setTitle] = useState("");

  const [notice, setNotice] = useState("");

  const [packQuery, setPackQuery] = useState("");

  const [packs, setPacks] = useState<TrainingPackDto[]>([]);

  const [packStatus, setPackStatus] = useState(
    "Live search unavailable; search the source-backed local catalog.",
  );

  const [manifest, setManifest] = useState<ManifestView | null>(null);

  const conversation = conversations.find((c) => c.id === selectedConvId);

  useEffect(() => {
    if (conversation) {
      setMode(conversation.mode || "All");
      setPreset(conversation.preset || "Balanced");
      setTitle(conversation.title);
    }
  }, [conversation]);

  useEffect(() => {
    let alive = true;
    invoke("get_context_manifest", { mode: conversation?.mode || mode })
      .then((m) => {
        if (alive) setManifest(manifestView(m));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [selectedConvId, mode, settings.player_id, replays.length, conversation?.mode]);

  const selectChat = async (id: string) => {
    if (!id) {
      await newChat();
      return;
    }

    requestRef.current++;
    if (loading) await onCancelAi?.();

    sendingRef.current = false;
    setLoading(false);
    setSelectedConvId(id);
    scopeRef.current = id;

    const records = await invoke<Message[]>("get_messages", { conversation_id: id });

    if (scopeRef.current !== id) return;

    setMessages(
      records
        .filter((m) => m.body.role !== "system")
        .map((m) => ({ id: m.id, ...m.body, role: m.body.role as "user" | "assistant" })),
    );
  };

  const newChat = async () => {
    try {
      requestRef.current++;
      if (loading) await onCancelAi?.();

      const c = await invoke<Conversation>("create_conversation", { mode, preset });

      setSelectedConvId(c.id);
      scopeRef.current = c.id;
      setMessages([COACH_INTRO]);
      setLoading(false);
      sendingRef.current = false;
      onRefreshConversations();
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  const exportChat = async (format: string) => {
    try {
      await invoke("export_conversation", {
        format,
        snapshot: {
          title: conversation?.title || "New chat",
          mode: conversation?.mode || mode,
          preset: conversation?.preset || preset,
          messages: messages.map((m) => {
            const bubble = Array.from(
              scrollRef.current?.querySelectorAll<HTMLElement>("[data-message-id]") || [],
            ).find((b) => b.dataset.messageId === m.id);
            return {
              ...m,
              content:
                format === "txt"
                  ? bubble?.querySelector<HTMLElement>(".coach-markdown")?.innerText || m.content
                  : m.content,
              status: loading && m === messages.at(-1) ? "partial" : m.status || "complete",
            };
          }),
        },
      });
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  const [selectedReplayId, setSelectedReplayId] = useState<string | null>(activeReplayId || null);

  const [previewing, setPreviewing] = useState(false);
  const [cloudPreview, setCloudPreview] = useState<{ text: string; data: CloudPreviewDto } | null>(
    null,
  );
  const previewScopeRef = useRef("");
  previewScopeRef.current = JSON.stringify([
    settings.provider,
    settings.cloud_consent,
    settings.player_id,
    selectedReplayId,
    selectedConvId,
    mode,
    preset,
    replays.length,
  ]);
  useEffect(
    () => setCloudPreview(null),
    [
      settings.provider,
      settings.cloud_consent,
      settings.player_id,
      selectedReplayId,
      selectedConvId,
      mode,
      preset,
      replays.length,
    ],
  );
  const [input, setInput] = useState(initialPrompt || "");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const contentRef = useRef<HTMLDivElement>(null);

  const readingAnchor = useRef<{ id: string; offset: number } | null>(null);

  const captureAnchor = () => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;

    const bubble = Array.from(el.querySelectorAll<HTMLElement>("[data-message-id]")).find(
      (b) => b.getBoundingClientRect().bottom > top,
    );

    if (bubble)
      readingAnchor.current = {
        id: bubble.dataset.messageId!,
        offset: bubble.getBoundingClientRect().top - top,
      };
  };

  const restoreAnchor = () => {
    const el = scrollRef.current;
    const a = readingAnchor.current;
    if (!el || !a) return;

    const bubble = Array.from(el.querySelectorAll<HTMLElement>("[data-message-id]")).find(
      (b) => b.dataset.messageId === a.id,
    );

    if (bubble)
      el.scrollTop +=
        bubble.getBoundingClientRect().top - el.getBoundingClientRect().top - a.offset;
  };

  const followRef = useRef(true);

  const [following, setFollowing] = useState(true);

  const positionKey = selectedConvId || "new";

  const pauseFollow = () => {
    followRef.current = false;
    setFollowing(false);
    captureAnchor();
  };

  const resumeFollow = () => {
    followRef.current = true;
    setFollowing(true);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const saved = sessionStorage.getItem(`coach-scroll-${positionKey}`);

    let state: { top: number; follow: boolean; anchor?: { id: string; offset: number } } = {
      top: el.scrollHeight,
      follow: true,
    };

    try {
      if (saved) state = JSON.parse(saved);
    } catch {
      /* Ignore stale browser session metadata. */
    }

    readingAnchor.current = state.anchor || null;

    followRef.current = state.follow;
    setFollowing(state.follow);
    el.scrollTop = state.follow ? el.scrollHeight : state.top;

    return () => {
      sessionStorage.setItem(
        `coach-scroll-${positionKey}`,
        JSON.stringify({
          top: el.scrollTop,
          follow: followRef.current,
          anchor: readingAnchor.current,
        }),
      );
    };
  }, [positionKey]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (followRef.current && !window.getSelection()?.toString()) el.scrollTop = el.scrollHeight;
    else restoreAnchor();
  }, [messages, loading]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (followRef.current && !window.getSelection()?.toString()) el.scrollTop = el.scrollHeight;
      else restoreAnchor();
    });
    observer.observe(el);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!loading) {
      setElapsed(0);

      return;
    }

    const start = Date.now();

    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);

    return () => clearInterval(t);
  }, [loading]);

  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt);
    }
  }, [initialPrompt]);

  const handleSend = async (override?: string, approved = false) => {
    const text = (override ?? input).trim();

    if (!text || loading || sendingRef.current || previewing) return;
    if (settings.cloud_consent && settings.provider !== "none" && !approved) {
      setPreviewing(true);
      const scope = previewScopeRef.current;
      try {
        const data = await ipc.getCloudPreview(
          text,
          selectedReplayId,
          settings.player_id || null,
          selectedConvId,
        );
        if (scope === previewScopeRef.current) setCloudPreview({ text, data });
      } catch (error) {
        setNotice(`Could not prepare cloud preview: ${errorMessage(error)}`);
      } finally {
        setPreviewing(false);
      }
      return;
    }
    setCloudPreview(null);

    sendingRef.current = true;

    setInput("");

    let convAtSend = selectedConvId;

    if (!convAtSend) {
      try {
        const c = await invoke<Conversation>("create_conversation", { mode, preset });
        convAtSend = c.id;
        setSelectedConvId(c.id);
        scopeRef.current = c.id;
        onRefreshConversations();
      } catch (e) {
        sendingRef.current = false;
        setNotice(errorMessage(e));
        return;
      }
    }

    const request = ++requestRef.current;

    const active = () => requestRef.current === request && scopeRef.current === convAtSend;

    const replayAtSend = selectedReplayId;

    const replyId = `asst-${Date.now()}`;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: "user" as const,
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);

    setLoading(true);

    try {
      const res = await onSendMessage(text, replayAtSend, convAtSend, (content) => {
        if (!active()) return;

        setMessages((prev) =>
          prev.some((m) => m.id === replyId)
            ? prev.map((m) => (m.id === replyId ? { ...m, content } : m))
            : [
                ...prev,
                {
                  id: replyId,
                  role: "assistant",
                  content,
                  replay_id: replayAtSend,
                  status: "streaming",
                },
              ],
        );
      });

      if (!active()) return;

      if (!convAtSend && res.conversation_id) {
        setSelectedConvId(res.conversation_id);

        onRefreshConversations();
      }

      setManifest(manifestView(res.context_manifest) || manifest);

      if (res.error) setNotice(res.error);

      setMessages((prev) => {
        const reply: ChatMsg = {
          id: replyId,
          role: "assistant",
          content: res.response,

          evidence_ids: res.evidence_ids,
          replay_id: replayAtSend,
          status: res.status || "complete",
          timestamp: new Date().toISOString(),
          context_manifest: res.context_manifest,
        };

        return prev.some((m) => m.id === replyId)
          ? prev.map((m) => (m.id === replyId ? reply : m))
          : [...prev, reply];
      });
    } catch (e: unknown) {
      if (!active()) return;

      const msg = errorMessage(e);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === replyId
            ? { ...m, status: errorCode(e) === "cancelled" ? "cancelled" : "error" }
            : m,
        ),
      );

      setMessages((prev) => [
        ...prev,

        {
          id: `err-${Date.now()}`,

          role: "assistant",

          content:
            errorCode(e) === "cancelled"
              ? "Stopped. Ask again whenever you are ready."
              : `Unable to complete coach query: ${msg}`,
        },
      ]);
    } finally {
      if (active()) {
        sendingRef.current = false;
        setLoading(false);
      }
    }
  };

  const activeMode = conversation?.mode || mode;

  const modeStats = manifest?.modes ? Object.entries(manifest.modes) : [];

  const excludedCount = manifest?.excluded
    ? Object.values(manifest.excluded as Record<string, number>).reduce(
        (n, v) => n + (Number(v) || 0),
        0,
      )
    : 0;

  const visibleChats = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="content-pane coach-page">
      <header className="coach-header">
        <div className="coach-header-main">
          <label className="coach-field coach-field-grow">
            <span>Conversation</span>

            <select
              aria-label="Conversation"
              value={selectedConvId || ""}
              onChange={(e) => selectChat(e.target.value).catch((e) => setNotice(errorMessage(e)))}
            >
              <option value="">New conversation</option>

              {visibleChats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.mode || "All"} · {c.title}
                  {c.prompt_version === "legacy" ? " (legacy)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="coach-field coach-field-search">
            <span>Search</span>

            <span className="coach-search">
              <Search size={13} />
              <input
                aria-label="Search conversations"
                placeholder="Search chats"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </span>
          </label>

          <label className="coach-field">
            <span>Mode</span>

            <select
              aria-label="Mode for new chat"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              {["All", "1v1", "2v2", "3v3"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className="coach-field">
            <span>Focus</span>

            <select
              aria-label="Focus for new chat"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
            >
              {["Balanced", "Mechanics practice", "Decision review", "Match breakdown"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>

          <button className="btn primary coach-new" onClick={newChat}>
            <Plus size={14} /> New chat
          </button>
        </div>

        <div className="coach-header-sub">
          <span className="coach-hint">
            Current chat: {activeMode} · {conversation?.preset || preset}. Mode and focus apply to a
            new chat.
          </span>

          <div className="coach-header-actions">
            {conversation && (
              <>
                <input
                  className="coach-title-input"
                  aria-label="Conversation title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                />

                <button
                  className="btn secondary sm"
                  onClick={() =>
                    invoke("update_conversation", { id: selectedConvId, title, archived: false })
                      .then(onRefreshConversations)
                      .catch((e) => setNotice(errorMessage(e)))
                  }
                >
                  Rename
                </button>

                <button
                  className="btn secondary sm"
                  disabled={loading}
                  onClick={() =>
                    invoke("update_conversation", {
                      id: selectedConvId,
                      title: conversation.title,
                      archived: true,
                    })
                      .then(() => {
                        setSelectedConvId(null);
                        setMessages([COACH_INTRO]);
                        onRefreshConversations();
                      })
                      .catch((e) => setNotice(errorMessage(e)))
                  }
                >
                  Archive
                </button>
              </>
            )}

            <select
              className="coach-export"
              aria-label="Export conversation"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) exportChat(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">Export…</option>
              <option value="md">Markdown</option>
              <option value="txt">Text</option>
              <option value="json">JSON</option>
            </select>
          </div>
        </div>
      </header>
      {notice && (
        <div className="coach-notice" role="status">
          <span>{notice}</span>
          <button className="icon-btn" aria-label="Dismiss notice" onClick={() => setNotice("")}>
            <X size={13} />
          </button>
        </div>
      )}
      <div className="coach-tools">
        <EvidenceHistory mode={activeMode} onOpen={onSelectReplayStudio} />

        <details className="coach-drawer">
          <summary>
            <Dumbbell size={14} /> Find a training pack
          </summary>

          <div className="coach-drawer-body">
            <div className="coach-drawer-row">
              <input
                aria-label="Training skill"
                placeholder="shooting, aerials, passing…"
                value={packQuery}
                onChange={(e) => setPackQuery(e.target.value)}
              />

              <button
                className="btn secondary sm"
                onClick={() =>
                  ipc
                    .searchTrainingPacks(packQuery, activeMode)
                    .then((r) => {
                      setPacks(r.records);
                      setPackStatus(r.live_search);
                    })
                    .catch((e) => setNotice(errorMessage(e)))
                }
              >
                Search catalog
              </button>
            </div>

            <small className="coach-hint">{packStatus}</small>

            {packs.map((p) => (
              <div key={p.id} className="coach-pack">
                <strong>{p.title}</strong>

                <span className="coach-hint">
                  {p.creator} · {p.difficulty} (advisory)
                </span>

                <div className="coach-pack-code">
                  <code>{p.code}</code>{" "}
                  <button
                    className="btn secondary sm"
                    onClick={() =>
                      navigator.clipboard.writeText(p.code).catch((e) => setNotice(errorMessage(e)))
                    }
                  >
                    Copy pack code
                  </button>{" "}
                  <ExternalLink href={p.source_url}>Source</ExternalLink>
                </div>

                <small className="coach-hint">
                  {p.verification}, checked {p.last_checked}; not tested in game
                </small>

                <p>{p.drill_protocol}</p>
              </div>
            ))}
          </div>
        </details>
      </div>
      <div className="coach-context">
        <div className="coach-context-left">
          <span className={`coach-model-pill ${settings.cloud_consent ? "on" : ""}`}>
            {settings.cloud_consent
              ? `${settings.provider} (${settings.chat_model})`
              : "Offline coach · stays on this device"}
          </span>

          <div
            className="coach-scope"
            title="Evidence available to the coach for this chat. Grades and rank forecasts are unavailable."
          >
            {manifest?.modes ? (
              modeStats.length ? (
                modeStats.map(([m, v]) => (
                  <span key={m} className="coach-chip">
                    <b>{m}</b> {v.recent_count} recent · {v.lifetime_count} lifetime
                    {v.unknown_date_count ? ` · ${v.unknown_date_count} undated` : ""}
                  </span>
                ))
              ) : (
                <span className="coach-chip">No eligible personal evidence</span>
              )
            ) : (
              <span className="coach-chip">Evidence scope loading</span>
            )}

            {excludedCount > 0 && (
              <span className="coach-chip muted">{excludedCount} excluded</span>
            )}
          </div>
        </div>

        <div className="coach-context-right">
          <label htmlFor="coach-match-ctx">Match Context</label>

          <select
            id="coach-match-ctx"
            disabled={loading}
            aria-label="Attached Replay Match"
            value={selectedReplayId || ""}
            onChange={(e) => setSelectedReplayId(e.target.value || null)}
          >
            <option value="">General Coaching (No Match)</option>

            {replays
              .filter((r) => activeMode === "All" || r.mode === activeMode)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.mode} · {r.replay_name || r.file_name} ({r.blue_score ?? "?"}-
                  {r.orange_score ?? "?"})
                </option>
              ))}
          </select>

          {selectedReplayId && (
            <button
              className="btn secondary sm"
              onClick={() => onSelectReplayStudio(selectedReplayId)}
            >
              <Play size={12} /> View in Studio
            </button>
          )}
        </div>
      </div>
      {/* Main Chat Conversation Container */}{" "}
      <div className="chat-container">
        <div
          ref={scrollRef}
          className="chat-messages"
          role="log"
          aria-live="off"
          tabIndex={0}

          onWheel={(e) => {
            if (e.deltaY < 0) pauseFollow();
          }}

          onKeyDown={(e) => {
            if (["PageUp", "Home", "ArrowUp"].includes(e.key)) pauseFollow();
          }}

          onPointerDown={pauseFollow}

          onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            captureAnchor();
            const atBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 40;
            if (!window.getSelection()?.toString()) {
              followRef.current = atBottom;
              setFollowing(atBottom);
            }
            sessionStorage.setItem(
              `coach-scroll-${positionKey}`,
              JSON.stringify({ top: el.scrollTop, follow: followRef.current }),
            );
          }}
        >
          <div ref={contentRef} className="chat-message-list">
            {messages.map((m) => (
              <div
                key={m.id}

                data-message-id={m.id}

                className={`chat-bubble ${m.role === "user" ? "bubble-user" : "bubble-assistant"}`}
              >
                <div className="bubble-head">
                  <span className="bubble-who">
                    {m.role === "user" ? <User size={13} /> : <Bot size={13} />}
                    {m.role === "user" ? "You" : "AntiRL Coach"}
                  </span>

                  {m.role === "assistant" && (
                    <button
                      className="bubble-copy"
                      aria-label="Copy response"
                      title="Copy response"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(m.content)
                          .then(() => setNotice("Response copied"))
                          .catch((e) => setNotice(errorMessage(e)))
                      }
                    >
                      <Copy size={12} /> Copy response
                    </button>
                  )}
                </div>

                {m.legacy_warning && (
                  <small className="legacy-advice">
                    <ShieldAlert size={12} /> {m.legacy_warning}
                  </small>
                )}

                {m.status && m.status !== "complete" && (
                  <small className="bubble-status" role="status">
                    {m.status === "offline_fallback"
                      ? "Local fallback · cloud request failed"
                      : `${m.status} · partial response`}
                  </small>
                )}

                <div className="coach-markdown">
                  {m.role === "user" ? (
                    <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
                  ) : (
                    <Markdown text={m.content} />
                  )}
                </div>

                {m.evidence_ids && m.evidence_ids.length > 0 && m.replay_id && (
                  <div className="bubble-citations">
                    <span className="bubble-citations-label">Cited Replay Moments:</span>

                    <CitedMoments
                      ids={m.evidence_ids}

                      replayId={m.replay_id}

                      onLoadReplay={onLoadReplay}

                      onOpen={() => onSelectReplayStudio(m.replay_id!)}
                    />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="chat-bubble bubble-assistant bubble-loading">
                <Loader2 size={16} className="spin" color="var(--accent)" />

                <span>Grounding coaching advice in replay telemetry… {elapsed}s</span>

                {onCancelAi && (
                  <button
                    className="btn secondary sm"
                    style={{ marginLeft: "auto" }}
                    onClick={() => onCancelAi().catch(() => {})}
                  >
                    Stop
                  </button>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {!following && (
          <button className="btn secondary coach-jump" onClick={resumeFollow}>
            <ChevronDown size={14} /> Jump to latest
          </button>
        )}

        <div className="coach-quick">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              className="coach-quick-chip"
              disabled={loading}
              onClick={() => handleSend(q)}
            >
              {q}
            </button>
          ))}
        </div>

        {cloudPreview && (
          <section className="cloud-preview" aria-label="Cloud data and cost preview">
            <strong>
              Send this message to {String(cloudPreview.data.provider || settings.provider)}?
            </strong>
            <blockquote style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {cloudPreview.text}
            </blockquote>
            <p>
              Destination: {String(cloudPreview.data.endpoint || "configured provider")}. Model:{" "}
              {settings.chat_model}.
            </p>
            <p>
              {Number(cloudPreview.data.characters || 0).toLocaleString()} estimated input
              characters before optional retrieval.{" "}
              {Array.isArray(cloudPreview.data.categories)
                ? cloudPreview.data.categories.join(", ")
                : "Includes your message, chat history, player profile, coaching memory and selected match evidence."}
            </p>
            {Number(cloudPreview.data.upper_bound_characters) > 0 && (
              <p>
                With optional evidence retrieval and planning: up to approximately{" "}
                {Number(cloudPreview.data.upper_bound_characters).toLocaleString()} input
                characters. Generated output adds usage.
              </p>
            )}
            <p>
              {String(
                cloudPreview.data.cost_label ||
                  "Cost depends on your provider's current model pricing. Exact charges are unavailable; this may incur API usage fees.",
              )}
            </p>
            <button className="btn primary" onClick={() => handleSend(cloudPreview.text, true)}>
              Send to {String(cloudPreview.data.provider || settings.provider)}
            </button>{" "}
            <button className="btn secondary" onClick={() => setCloudPreview(null)}>
              Keep editing
            </button>
          </section>
        )}
        {previewing && <p role="status">Preparing cloud data preview…</p>}
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

            aria-label="Message the coach"

            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();

                handleSend();
              }
            }}
          />

          <button
            className="btn primary chat-send"
            aria-label="Send message"
            title="Send"
            disabled={!input.trim() || loading || previewing}
            onClick={() => handleSend()}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
