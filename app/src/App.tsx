import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutDashboard,
  Film,
  PlaySquare,
  MessageSquare,
  TrendingUp,
  Users,
  Settings as SettingsIcon,
  FolderOpen,
  Plus,
  RefreshCw,
  Zap,
} from "lucide-react";

import Overview from "./pages/Overview";
import Replays from "./pages/Replays";
import ReplayStudio from "./pages/ReplayStudio";
import Coach, { COACH_INTRO, type ChatMsg } from "./pages/Coach";
import Progress from "./pages/Progress";
import Teammates from "./pages/Teammates";
import SettingsPage from "./pages/Settings";

import TitleBar from "./components/TitleBar";
import OnboardingModal from "./components/OnboardingModal";
import RankBadge from "./components/RankBadge";
import { highestCompetitiveRank } from "./rankMath";

import type {
  ReplaySummary,
  ReplayAnalysis,
  Settings,
  ProgressReport,
  TeammateStats,
  MemoryNote,
  Conversation,
  Message,
} from "./types";

// Tauri API helper with browser fallback
const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function tauriInvoke<T>(cmd: string, args: Record<string, any> = {}): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  // Browser fallback for UI preview/testing
  console.log(`[Browser Fallback] invoke: ${cmd}`);
  return {} as T;
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<string>("overview");
  const [replays, setReplays] = useState<ReplaySummary[]>([]);
  const [selectedReplay, setSelectedReplay] = useState<ReplayAnalysis | null>(null);
  const [rawSettings, setSettings] = useState<Settings>({
    replay_folder: "",
    player_id: null,
    player_name: null,
    modes: ["1v1", "2v2", "3v3"],
    focus: ["boost", "rotations", "defense"],
    provider: "neotoken",
    chat_model: "gpt-6-astra",
    analysis_model: "gpt-6-astra",
    auto_import: true,
    cloud_consent: false,
    rank_1v1: null,
    rank_2v2: null,
    rank_3v3: null,
  });
  const [identity, setIdentity] = useState<{
    player_id: string | null;
    player_name: string | null;
    auto: boolean;
  } | null>(null);
  const settings = useMemo<Settings>(
    () => ({
      ...rawSettings,
      player_id: rawSettings.player_id || identity?.player_id || null,
      player_name: rawSettings.player_name || identity?.player_name || null,
    }),
    [rawSettings, identity]
  );
  const highestRank = highestCompetitiveRank([settings.rank_1v1, settings.rank_2v2, settings.rank_3v3]);
  const [progress, setProgress] = useState<ProgressReport | null>(null);
  const [teammates, setTeammates] = useState<TeammateStats[]>([]);
  const [memoryNotes, setMemoryNotes] = useState<MemoryNote[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [aiStatus, setAiStatus] = useState<any>(null);
  const aiConnected = useMemo(() => {
    const provider = aiStatus?.current_provider;
    const p = aiStatus?.providers?.[provider];
    const hasKey = provider === "chatgpt" ? p?.status === "connected" : Boolean(p?.configured);
    return Boolean(aiStatus?.cloud_consent) && hasKey;
  }, [aiStatus]);
  const [identityCandidates, setIdentityCandidates] = useState<
    { player_id: string; name: string; matches: number }[]
  >([]);

  const [importing, setImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    file: string;
    status: string;
  } | null>(null);

  const [coachMessages, setCoachMessages] = useState<ChatMsg[]>([COACH_INTRO]);
  const [coachConvId, setCoachConvId] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState<boolean>(false);
  const coachRestored = useRef(false);
  const [coachInitialPrompt, setCoachInitialPrompt] = useState<string>("");
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const onboardingChecked=useRef(false);

  // Load initial data from Tauri native backend
  const loadData = async () => {
    try {
      const cfg = await tauriInvoke<Settings>("get_settings");
      if (cfg && cfg.provider) setSettings(cfg);
      if(cfg?.provider&&!onboardingChecked.current){onboardingChecked.current=true;if(!cfg.onboarding_status)setShowOnboarding(true);}

      const lib = await tauriInvoke<any>("get_library");
      if (lib && lib.replays) {
        setReplays(lib.replays);
        if (lib.identity_candidates) {
          setIdentityCandidates(lib.identity_candidates);
        }
      }

      const ident = await tauriInvoke<any>("resolve_identity");
      if (ident && "player_id" in ident) setIdentity(ident);
      const resolvedId: string | null = cfg?.player_id || ident?.player_id || null;

      const prog = await tauriInvoke<ProgressReport>("get_progress", {
        player_id: resolvedId,
      });
      if (prog) setProgress(prog);

      if (resolvedId) {
        const mates = await tauriInvoke<TeammateStats[]>("get_teammates", {
          player_id: resolvedId,
        });
        if (Array.isArray(mates)) setTeammates(mates);
      }

      const mem = await tauriInvoke<MemoryNote[]>("get_memory");
      if (Array.isArray(mem)) setMemoryNotes(mem);

      const convs = await tauriInvoke<Conversation[]>("get_conversations");
      if (Array.isArray(convs)) {
        setConversations(convs);
        if (!coachRestored.current && convs.length > 0) {
          coachRestored.current = true;
          const latest = convs[0];
          const msgs = await tauriInvoke<Message[]>("get_messages", {
            conversation_id: latest.id,
          });
          if (Array.isArray(msgs) && msgs.length > 0) {
            setCoachConvId((cur) => cur ?? latest.id);
            setCoachMessages((cur) =>
              cur.length > 1
                ? cur
                : msgs
                    .filter((m) => m.body?.role === "user" || m.body?.role === "assistant")
                    .map((m) => ({
                      id: m.id,
                      role: m.body.role as "user" | "assistant",
                      content: m.body.content,
                      status:m.body.status,legacy_warning:m.body.legacy_warning,timestamp:m.body.timestamp,context_manifest:m.body.context_manifest,
                      evidence_ids: m.body.evidence_ids,
                      replay_id: m.body.replay_id,
                    }))
            );
          }
        }
      }

      const status = await tauriInvoke<any>("get_ai_status");
      if (status) setAiStatus(status);
    } catch (e) {
      console.warn("Could not load backend data:", e);
    }
  };

  useEffect(() => {
    loadData();

    // Listen for import progress events if in Tauri
    let unlisten: (() => void) | undefined;
    let disposed = false;
    if (isTauri()) {
      import("@tauri-apps/api/event").then(({ listen }) => {
        listen<any>("import-progress", (event) => {
          const payload = event.payload;
          setImportProgress(payload);
          if (payload.status === "done") {
            setImporting(false);
            if (payload.imported > 0 || payload.failed > 0) loadData();
          }
        }).then((u) => {
          if (disposed) u();
          else unlisten = u;
        });
      }).catch(() => {});
    }

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const handleSelectReplay = async (id: string) => {
    try {
      const full = await tauriInvoke<ReplayAnalysis>("get_replay", { id });
      if (full && full.summary) {
        setSelectedReplay(full);
        setCurrentPage("studio");
      }
    } catch (e) {
      alert(`Could not load replay: ${e}`);
    }
  };

  const handlePickFolder = async () => {
    if (isTauri()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: settings.replay_folder || undefined,
      });
      if (selected && typeof selected === "string") {
        return selected;
      }
    }
    return null;
  };

  const handleImportFolder = async () => {
    if (isTauri()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          directory: true,
          multiple: false,
          defaultPath: settings.replay_folder || undefined,
        });
        if (selected && typeof selected === "string") {
          setImporting(true);
          await tauriInvoke("import_folder", { folder: selected });
          await loadData();
        }
      } catch (e) {
        alert(`Folder import failed: ${e}`);
      } finally {
        setImporting(false);
      }
    } else {
      // In dev fallback, trigger mock import
      setImporting(true);
      setTimeout(() => setImporting(false), 2000);
    }
  };

  const handleImportFiles = async () => {
    if (isTauri()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          multiple: true,
          filters: [{ name: "Rocket League Replay", extensions: ["replay"] }],
        });
        if (selected) {
          const files = Array.isArray(selected) ? selected : [selected];
          for (const file of files) {
            await tauriInvoke("import_single_file", { file_path: file });
          }
          await loadData();
        }
      } catch (e) {
        alert(`Files import failed: ${e}`);
      }
    }
  };

  const handleDeleteReplay = async (id: string) => {
    try {
      await tauriInvoke("delete_replay", { id });
      await loadData();
      if (selectedReplay?.summary.id === id) {
        setSelectedReplay(null);
        setCurrentPage("replays");
      }
    } catch (e) {
      alert(`Delete failed: ${e}`);
    }
  };

  const handleSaveSettings = async (updated: Partial<Settings>) => {
    const res = await tauriInvoke<Settings>("save_settings", { settings: updated });
    if (res?.provider) setSettings(res);
    else if (!isTauri()) setSettings(previous => ({ ...previous, ...updated }));
    else throw new Error("The saved settings response was invalid. Reload Settings to check the saved values.");
    await loadData();
  };

  const handleSetApiKey = async (provider: string, key: string) => {
    await tauriInvoke("set_api_key", { provider, key });
    await loadData();
  };

  const handleLoadModels = async (provider: string) => {
    const res = await tauriInvoke<any>("list_models", { provider });
    return (res?.models || []).map((m: any) => m.id);
  };

  const handleSaveMemoryNote = async (name: string, content: string) => {
    await tauriInvoke("save_memory", { name, content });
    await loadData();
  };

  const handleDeleteMemoryNote = async (name: string) => {
    await tauriInvoke("delete_memory", { name });
    await loadData();
  };

  const handleStartChatgptSignIn = async () => {
    await tauriInvoke("start_chatgpt_sign_in");
    await loadData();
  };

  const handleSignOutChatgpt = async () => {
    await tauriInvoke("sign_out_chatgpt");
    await loadData();
  };

  const handleSendMessage = async (
    message: string,
    replayId?: string | null,
    convId?: string | null,
    onUpdate?: (text: string) => void
  ) => {
    const { Channel } = await import("@tauri-apps/api/core");
    const updates = new Channel<string>();
    updates.onmessage = (text) => onUpdate?.(text);
    return tauriInvoke<any>("chat", {
      message,
      replay_id: replayId || null,
      player_id: settings.player_id || null,
      conversation_id: convId || null,
      on_update: updates,
    });
  };

  const handleNavigateToCoach = async (replayId: string, prompt?: string) => {
    if (prompt) setCoachInitialPrompt(prompt);
    if (replayId) {
      try {
        const res = await tauriInvoke<ReplayAnalysis>("get_replay", { id: replayId });
        if (res && res.summary) setSelectedReplay(res);
      } catch (e) {
        console.error("Coach nav: Replay fetch failed", e);
      }
    }
    setCurrentPage("coach");
  };

  return (
    <>
      <TitleBar aiConnected={aiConnected} />
      <div className="app-shell">
      {/* 244px Sidebar Rail */}
      <aside className="sidebar">
        <div className="nav-section">Studio</div>
        <nav className="side-nav">
          <button
            type="button"
            className={`nav-link ${currentPage === "overview" ? "active" : ""}`}
            onClick={() => setCurrentPage("overview")}
          >
            <LayoutDashboard size={16} />
            <span>Overview</span>
          </button>

          <button
            type="button"
            className={`nav-link ${currentPage === "replays" ? "active" : ""}`}
            onClick={() => setCurrentPage("replays")}
          >
            <Film size={16} />
            <span>Replay Library</span>
            {replays.length > 0 && <span className="nav-badge">{replays.length}</span>}
          </button>

          <button
            type="button"
            className={`nav-link ${currentPage === "studio" ? "active" : ""}`}
            onClick={() => {
              if (!selectedReplay && replays.length > 0) {
                handleSelectReplay(replays[0].id);
              } else {
                setCurrentPage("studio");
              }
            }}
          >
            <PlaySquare size={16} />
            <span>Replay Studio</span>
          </button>
        </nav>

        <div className="nav-section">Coaching</div>
        <nav className="side-nav">
          <button
            type="button"
            className={`nav-link ${currentPage === "coach" ? "active" : ""}`}
            onClick={() => setCurrentPage("coach")}
          >
            <MessageSquare size={16} />
            <span>Coach Chat</span>
          </button>

          <button
            type="button"
            className={`nav-link ${currentPage === "progress" ? "active" : ""}`}
            onClick={() => setCurrentPage("progress")}
          >
            <TrendingUp size={16} />
            <span>Progress & Goals</span>
          </button>

          <button
            type="button"
            className={`nav-link ${currentPage === "teammates" ? "active" : ""}`}
            onClick={() => setCurrentPage("teammates")}
          >
            <Users size={16} />
            <span>Teammates</span>
          </button>
        </nav>
        <div className="nav-section">Account</div>
        <nav className="side-nav">
          <button
            type="button"
            className={`nav-link ${currentPage === "settings" ? "active" : ""}`}
            onClick={() => setCurrentPage("settings")}
          >
            <SettingsIcon size={16} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="profile-pill"
            onClick={() => setShowOnboarding(true)}
            title="Edit Player Profile, Ranks & Playstyle"
          >
            <div className="profile-avatar">
              <RankBadge rank={highestRank} size={36} />
            </div>
            <div className="profile-info">
              <span className="profile-name">
                {settings.player_name || settings.player_id || "Unconfirmed Player"}
                {identity?.auto && !rawSettings.player_id ? " (auto)" : ""}
              </span>
              <span className="profile-sub">
                Highest · {highestRank}
              </span>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Workspace Pane */}
      <main className="main-wrapper">
        <header className="top-bar">
          <div className="top-title">
            {currentPage === "overview" && "Overview"}
            {currentPage === "replays" && "Replay Library"}
            {currentPage === "studio" && "Replay Studio"}
            {currentPage === "coach" && "Coach Chat"}
            {currentPage === "progress" && "Progress & Goals"}
            {currentPage === "teammates" && "Teammates"}
            {currentPage === "settings" && "Settings"}
          </div>

          <div className="top-actions">
            <button className="btn secondary" style={{ display: currentPage === "replays" ? "none" : undefined }} onClick={handleImportFolder} disabled={importing}>
              <FolderOpen size={14} /> {importing ? "Importing..." : "Import Replays"}
            </button>
          </div>
        </header>

        {/* View Router */}
        {currentPage === "overview" && (
          <Overview
            replays={replays}
            settings={settings}
            progress={progress}
            onSelectReplay={handleSelectReplay}
            onNavigate={setCurrentPage}
            onOpenOnboarding={() => setShowOnboarding(true)}
            onAskCoach={(prompt) => handleNavigateToCoach("", prompt)}
          />
        )}

        {currentPage === "replays" && (
          <Replays
            replays={replays}
            importing={importing}
            importProgress={importProgress}
            onSelectReplay={handleSelectReplay}
            onImportFolder={handleImportFolder}
            onImportFiles={handleImportFiles}
            onDeleteReplay={handleDeleteReplay}
          />
        )}

        {currentPage === "studio" && selectedReplay && (
          <ReplayStudio
            replay={selectedReplay}
            settings={settings}
            onNavigateToCoach={handleNavigateToCoach}
          />
        )}

        {currentPage === "studio" && !selectedReplay && (
          <div className="content-pane" style={{ textAlign: "center", padding: 60 }}>
            <Film size={48} style={{ margin: "0 auto 16px", opacity: 0.4 }} />
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>No Replay Selected</h3>
            <p style={{ color: "var(--muted)", marginBottom: 16 }}>
              Select a match from your replay library to inspect the reconstructed 3D arena.
            </p>
            <button className="btn primary" onClick={() => setCurrentPage("replays")}>
              Browse Replay Library
            </button>
          </div>
        )}

        {currentPage === "coach" && (
          <Coach
            messages={coachMessages}
            setMessages={setCoachMessages}
            selectedConvId={coachConvId}
            setSelectedConvId={setCoachConvId}
            loading={coachLoading}
            setLoading={setCoachLoading}
            settings={settings}
            replays={replays}
            conversations={conversations}
            activeReplayId={selectedReplay?.summary.id}
            initialPrompt={coachInitialPrompt}
            onSendMessage={handleSendMessage}
            onLoadReplay={(id) => tauriInvoke<ReplayAnalysis>("get_coach_replay", { id })}
            onCancelAi={() => tauriInvoke("cancel_ai").then(() => {})}
            onSelectReplayStudio={handleSelectReplay}
            onRefreshConversations={loadData}
          />
        )}

        {currentPage === "progress" && (
          <Progress progress={progress} settings={settings} replays={replays} />
        )}

        {currentPage === "teammates" && (
          <Teammates teammates={teammates} />
        )}

        {currentPage === "settings" && (
          <SettingsPage
            settings={settings}
            identityCandidates={identityCandidates}
            memoryNotes={memoryNotes}
            aiStatus={aiStatus}
            onSaveSettings={handleSaveSettings}
            onSetApiKey={handleSetApiKey}
            onLoadModels={handleLoadModels}
            onSaveMemoryNote={handleSaveMemoryNote}
            onDeleteMemoryNote={handleDeleteMemoryNote}
            onStartChatgptSignIn={handleStartChatgptSignIn}
            onSignOutChatgpt={handleSignOutChatgpt}
            onSelectFolder={handlePickFolder}
          />
        )}
      </main>
    </div>

    {showOnboarding && (
      <OnboardingModal
        initialSettings={settings}
        onSave={async patch=>{await handleSaveSettings({...patch,onboarding_status:"completed"});setShowOnboarding(false);}}
        onClose={completed => {setShowOnboarding(false);if(!completed)handleSaveSettings({onboarding_status:settings.onboarding_status || "skipped"}).catch(console.error);}}
      />
    )}
  </>
  );
}
