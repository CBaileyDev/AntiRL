import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { invoke } from "@tauri-apps/api/core";
import type { Conversation, Message, ReplayAnalysis, ReplaySummary, Settings } from "../types";

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence_ids?: string[];
  replay_id?: string | null;
  timestamp?: string;
  status?: string;
  legacy_warning?: string;
  context_manifest?: any;
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
    onUpdate?: (text: string) => void
  ) => Promise<{ response: string; conversation_id: string; evidence_ids?: string[]; status?: string; error?: string; context_manifest?: any }>;
  onSelectReplayStudio: (replayId: string) => void;
  onLoadReplay?: (replayId: string) => Promise<ReplayAnalysis>;
  onCancelAi?: () => Promise<void>;
  onRefreshConversations: () => void;
}

function Markdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => /^(https?:|mailto:)/i.test(url) ? url : ""}>{text}</ReactMarkdown>;
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
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let alive = true;
    onLoadReplay?.(replayId)
      .then((r) => alive && r && Array.isArray(r.events) && setReplay(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <button onClick={() => setExpanded((v) => !v)} style={{ ...chipStyle, color: "var(--muted)" }}>
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
  activeConversationId,
  activeReplayId,
  initialPrompt,
  onSendMessage,
  onSelectReplayStudio,
  onLoadReplay,
  onCancelAi,
  onRefreshConversations,
}: CoachProps) {
  const sendingRef = useRef(false);
  const scopeRef = useRef(selectedConvId); scopeRef.current = selectedConvId;
  const requestRef = useRef(0);
  useEffect(()=>()=>{requestRef.current++;onCancelAi?.().catch(()=>{});setLoading(false);},[]);
  const [mode,setMode] = useState("All");
  const [preset,setPreset] = useState("Balanced");
  const [search,setSearch] = useState("");
  const [title,setTitle] = useState("");
  const [notice,setNotice] = useState("");
  const [packQuery,setPackQuery]=useState("");
  const [packs,setPacks]=useState<any[]>([]);
  const [packStatus,setPackStatus]=useState("Live search unavailable; search the source-backed local catalog.");
  const [manifest,setManifest] = useState<any>(null);
  const conversation=conversations.find(c=>c.id===selectedConvId);
  useEffect(()=>{ if(conversation){setMode(conversation.mode || "All");setPreset(conversation.preset || "Balanced");setTitle(conversation.title);} },[selectedConvId,conversation?.title]);
  useEffect(()=>{let alive=true;invoke("get_context_manifest",{mode:conversation?.mode || mode}).then(m=>{if(alive)setManifest(m)}).catch(()=>{});return()=>{alive=false};},[selectedConvId,mode,settings.player_id,replays.length]);
  const selectChat=async(id:string)=>{
    requestRef.current++; if(loading) await onCancelAi?.();
    sendingRef.current=false;setLoading(false);setSelectedConvId(id);scopeRef.current=id;
    const records=await invoke<Message[]>("get_messages",{conversation_id:id});
    if(scopeRef.current!==id) return;
    setMessages(records.filter(m=>m.body.role!=="system").map(m=>({id:m.id,...m.body,role:m.body.role as "user"|"assistant"})));
  };
  const newChat=async()=>{try{
    requestRef.current++; if(loading) await onCancelAi?.();
    const c=await invoke<Conversation>("create_conversation",{mode,preset});
    setSelectedConvId(c.id);scopeRef.current=c.id;setMessages([COACH_INTRO]);setLoading(false);sendingRef.current=false;onRefreshConversations();
  }catch(e){setNotice(String(e));}};
  const exportChat=async(format:string)=>{try{await invoke("export_conversation",{format,snapshot:{title:conversation?.title || "New chat",mode,preset,messages:messages.map(m=>({...m,status:loading&&m===messages.at(-1)?"partial":m.status||"complete"}))}});}catch(e){setNotice(String(e));}};

  const [selectedReplayId, setSelectedReplayId] = useState<string | null>(
    activeReplayId || null
  );

  const [input, setInput] = useState(initialPrompt || "");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef=useRef(true);
  const [following,setFollowing]=useState(true);
  const positionKey=selectedConvId || "new";
  const pauseFollow=()=>{followRef.current=false;setFollowing(false)};
  const resumeFollow=()=>{followRef.current=true;setFollowing(true);const el=scrollRef.current;if(el)el.scrollTop=el.scrollHeight;};
  useLayoutEffect(()=>{
    const el=scrollRef.current;if(!el)return;
    const saved=sessionStorage.getItem(`coach-scroll-${positionKey}`);
    const state=saved?JSON.parse(saved):{top:el.scrollHeight,follow:true};
    followRef.current=state.follow;setFollowing(state.follow);el.scrollTop=state.follow?el.scrollHeight:state.top;
    return()=>{sessionStorage.setItem(`coach-scroll-${positionKey}`,JSON.stringify({top:el.scrollTop,follow:followRef.current}));};
  },[positionKey]);
  useLayoutEffect(()=>{const el=scrollRef.current;if(el&&followRef.current&&!window.getSelection()?.toString())el.scrollTop=el.scrollHeight;},[messages,loading]);
  useEffect(()=>{const el=scrollRef.current;if(!el)return;const observer=new ResizeObserver(()=>{if(followRef.current&&!window.getSelection()?.toString())el.scrollTop=el.scrollHeight;});observer.observe(el);return()=>observer.disconnect();},[]);
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

  const handleSend = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading || sendingRef.current) return;
    sendingRef.current = true;
    setInput("");
    let convAtSend = selectedConvId;
    if(!convAtSend){try{const c=await invoke<Conversation>("create_conversation",{mode,preset});convAtSend=c.id;setSelectedConvId(c.id);scopeRef.current=c.id;onRefreshConversations();}catch(e){sendingRef.current=false;setNotice(String(e));return;}}
    const request=++requestRef.current;
    const active=()=>requestRef.current===request && scopeRef.current===convAtSend;
    const replayAtSend = selectedReplayId;
    const replyId = `asst-${Date.now()}`;

    const userMsg = { id: `user-${Date.now()}`, role: "user" as const, content: text, timestamp:new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await onSendMessage(text, replayAtSend, convAtSend, (content) => {
        if(!active())return;
        setMessages((prev) => prev.some((m) => m.id === replyId)
          ? prev.map((m) => m.id === replyId ? { ...m, content } : m)
          : [...prev, { id: replyId, role: "assistant", content, replay_id: replayAtSend, status:"streaming" }]);
      });
      if(!active())return;
      if (!convAtSend && res.conversation_id) {
        setSelectedConvId(res.conversation_id);
        onRefreshConversations();
      }

      setManifest(res.context_manifest || manifest);
      if(res.error)setNotice(res.error);
      setMessages((prev) => {
        const reply: ChatMsg = { id: replyId, role: "assistant", content: res.response,
          evidence_ids: res.evidence_ids, replay_id: replayAtSend, status:res.status || "complete", timestamp:new Date().toISOString(), context_manifest:res.context_manifest };

        return prev.some((m) => m.id === replyId) ? prev.map((m) => m.id === replyId ? reply : m) : [...prev, reply];
      });
    } catch (e: any) {
      if(!active())return;
      const msg = String(e?.message || e);
      setMessages(prev=>prev.map(m=>m.id===replyId?{...m,status:/cancel/i.test(msg)?"cancelled":"error"}:m));
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: /cancel/i.test(msg)
            ? "Stopped. Ask again whenever you are ready."
            : `Unable to complete coach query: ${msg}`,
        },
      ]);
    } finally {
      if(active()){sendingRef.current = false;setLoading(false);}
    }
  };

  return (
    <div className="content-pane" style={{ height: "calc(100dvh - 132px)", minHeight: 480, paddingBottom: 16 }}>
      <div className="coach-chat-toolbar">
        <input aria-label="Search conversations" placeholder="Search chats" value={search} onChange={e=>setSearch(e.target.value)} />
        <select aria-label="Conversation" value={selectedConvId || ""} onChange={e=>selectChat(e.target.value).catch(e=>setNotice(String(e)))}><option value="">New conversation</option>{conversations.filter(c=>c.title.toLowerCase().includes(search.toLowerCase())).map(c=><option key={c.id} value={c.id}>{c.mode || "All"} · {c.title}{c.prompt_version==="legacy"?" (legacy)":""}</option>)}</select>
        <select aria-label="Mode for new chat" value={mode} onChange={e=>setMode(e.target.value)}>{["All","1v1","2v2","3v3"].map(m=><option key={m}>{m}</option>)}</select>
        <select aria-label="Focus for new chat" value={preset} onChange={e=>setPreset(e.target.value)}>{["Balanced","Mechanics practice","Decision review","Match breakdown"].map(m=><option key={m}>{m}</option>)}</select>
        <button className="btn secondary" onClick={newChat}>New chat</button>
        {conversation&&<><input aria-label="Conversation title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={100}/><button className="btn secondary" onClick={()=>invoke("update_conversation",{id:selectedConvId,title,archived:false}).then(onRefreshConversations).catch(e=>setNotice(String(e)))}>Rename</button><button className="btn secondary" disabled={loading} onClick={()=>invoke("update_conversation",{id:selectedConvId,title:conversation.title,archived:true}).then(()=>{setSelectedConvId(null);setMessages([COACH_INTRO]);onRefreshConversations();}).catch(e=>setNotice(String(e)))}>Archive</button></>}
        <select aria-label="Export conversation" defaultValue="" onChange={e=>{if(e.target.value)exportChat(e.target.value);e.target.value="";}}><option value="">Export…</option><option value="md">Markdown</option><option value="txt">Text</option><option value="json">JSON</option></select>
      </div>
      <small>Current chat: {conversation?.mode || mode} · {conversation?.preset || preset}. Changing the controls applies to a new chat.</small>
      {notice&&<div role="status">{notice}</div>}
      <details><summary>Find a training pack</summary><div className="coach-chat-toolbar"><input aria-label="Training skill" placeholder="shooting, aerials, passing…" value={packQuery} onChange={e=>setPackQuery(e.target.value)}/><button className="btn secondary" onClick={()=>invoke<any>("search_training_packs",{query:packQuery,mode:conversation?.mode || mode}).then(r=>{setPacks(r.records);setPackStatus(r.live_search);}).catch(e=>setNotice(String(e)))}>Search catalog</button></div><small>{packStatus}</small>{packs.map(p=><div key={p.id} style={{marginTop:8}}><strong>{p.title}</strong> · {p.creator} · {p.difficulty} (advisory)<br/><code>{p.code}</code> <button className="btn secondary" onClick={()=>navigator.clipboard.writeText(p.code).catch(e=>setNotice(String(e)))}>Copy pack code</button> <a href={p.source_url} target="_blank" rel="noreferrer">Source</a><small> · {p.verification}, checked {p.last_checked}; not tested in game</small><p>{p.drill_protocol}</p></div>)}</details>
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
            disabled={loading}
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
            {replays.filter(r=>(conversation?.mode || mode)==="All" || r.mode===(conversation?.mode || mode)).map((r) => (
              <option key={r.id} value={r.id}>
                {r.mode} · {r.replay_name || r.file_name} ({r.blue_score ?? "?"}-{r.orange_score ?? "?"})
              </option>
            ))}
          </select>

          {selectedReplayId && (
            <button
              className="btn btn secondary"
              style={{ padding: "5px 10px", fontSize: 12 }}
              onClick={() => onSelectReplayStudio(selectedReplayId)}
            >
              <Play size={12} /> View in Studio
            </button>
          )}
        </div>
      </div>

      <div style={{fontSize:12,color:"var(--muted)"}}>
        {manifest?.modes ? Object.entries(manifest.modes).map(([m,v]:[string,any])=>`${m}: ${v.recent_count} recent / ${v.lifetime_count} lifetime; ${v.unknown_date_count} undated`).join(" · ") || "No eligible personal evidence" : "Evidence scope loading"}
        {manifest?.excluded && ` · excluded: ${JSON.stringify(manifest.excluded)}`} · Grades and rank forecasts unavailable.
      </div>

      {/* Main Chat Conversation Container */}      <div className="chat-container">
        <div ref={scrollRef} className="chat-messages" role="log" aria-live="off" tabIndex={0}
          onWheel={e=>{if(e.deltaY<0)pauseFollow();}}
          onKeyDown={e=>{if(["PageUp","Home","ArrowUp"].includes(e.key))pauseFollow();}}
          onPointerDown={pauseFollow}
          onScroll={()=>{const el=scrollRef.current;if(!el)return;const atBottom=el.scrollHeight-el.clientHeight-el.scrollTop<40;if(!window.getSelection()?.toString()){followRef.current=atBottom;setFollowing(atBottom);}sessionStorage.setItem(`coach-scroll-${positionKey}`,JSON.stringify({top:el.scrollTop,follow:followRef.current}));}}>
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
                  color: m.role === "user" ? "#FFFFFF" : "var(--sage)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
                <span>{m.role === "user" ? "You" : "AntiRL Coach"}</span>
              </div>

              {m.legacy_warning&&<small className="legacy-advice">{m.legacy_warning}</small>}
              {m.status&&m.status!=="complete"&&<small role="status">{m.status} · partial response</small>}
              {m.role==="assistant"&&<button className="btn secondary" style={{float:"right"}} onClick={()=>navigator.clipboard.writeText(m.content).then(()=>setNotice("Response copied")).catch(e=>setNotice(String(e)))}>Copy response</button>}
              <div className="coach-markdown" style={{ lineHeight: 1.55 }}>{m.role === "user" ? <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span> : <Markdown text={m.content} />}</div>

              {m.evidence_ids && m.evidence_ids.length > 0 && m.replay_id && (
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
            <div className="chat-bubble bubble-assistant" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Loader2 size={16} className="spin" color="var(--accent)" />
              <span style={{ color: "var(--muted)", fontSize: 13 }}>
                Grounding coaching advice in replay telemetry... {elapsed}s
              </span>
              {onCancelAi && (
                <button
                  className="btn secondary"
                  style={{ marginLeft: "auto", padding: "4px 12px", fontSize: 12 }}
                  onClick={() => onCancelAi().catch(() => {})}
                >
                  Stop
                </button>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {!following&&<button className="btn secondary" onClick={resumeFollow}>Jump to latest</button>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "8px 14px 0" }}>
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={loading}
              onClick={() => handleSend(q)}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: "var(--radius-pill)",
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--line-strong)",
                cursor: "pointer",
              }}
            >
              {q}
            </button>
          ))}
        </div>

        {/* Chat Input Row */}        <div className="chat-input-row">
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
            className="btn btn primary"
            aria-label="Send message"
            title="Send"
            disabled={!input.trim() || loading}
            onClick={() => handleSend()}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
