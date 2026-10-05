import React, { useState, useEffect } from "react";
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
import Coach from "./pages/Coach";
import Progress from "./pages/Progress";
import Teammates from "./pages/Teammates";
import SettingsPage from "./pages/Settings";

import type {
  ReplaySummary,
  ReplayAnalysis,
  Settings,
  ProgressReport,
  TeammateStats,
  MemoryNote,
  Conversation,
} from "./types";

// Tauri API helper with browser fallback
const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function tauriInvoke<T>(cmd: string, args: Record<string, any> = {}): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  // Browser fallback for UI preview/testing
  console.log(`[Browser Fallback] invoke: ${cmd}`, args);
  return {} as T;
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<string>("overview");
  const [replays, setReplays] = useState<ReplaySummary[]>([]);
  const [selectedReplay, setSelectedReplay] = useState<ReplayAnalysis | null>(null);
  const [settings, setSettings] = useState<Settings>({
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
    rank_2v2: "Diamond 2",
    rank_3v3: "Diamond 2",
  });
  const [progress, setProgress] = useState<ProgressReport | null>(null);
  const [teammates, setTeammates] = useState<TeammateStats[]>([]);
  const [memoryNotes, setMemoryNotes] = useState<MemoryNote[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [aiStatus, setAiStatus] = useState<any>(null);
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

  const [coachInitialPrompt, setCoachInitialPrompt] = useState<string>("");

  // Load initial data from Tauri native backend
  const loadData = async () => {
    try {
      const cfg = await tauriInvoke<Settings>("get_settings");
      if (cfg && cfg.provider) setSettings(cfg);

      const lib = await tauriInvoke<any>("get_library");
      if (lib && lib.replays) {
        setReplays(lib.replays);
        if (lib.identity_candidates) {
          setIdentityCandidates(lib.identity_candidates);
        }
      }

      const prog = await tauriInvoke<ProgressReport>("get_progress", {
        player_id: cfg?.player_id,
      });
      if (prog) setProgress(prog);

      if (cfg?.player_id) {
        const mates = await tauriInvoke<TeammateStats[]>("get_teammates", {
          player_id: cfg.player_id,
        });
        if (mates) setTeammates(mates);
      }

      const mem = await tauriInvoke<MemoryNote[]>("get_memory");
      if (mem) setMemoryNotes(mem);

      const convs = await tauriInvoke<Conversation[]>("get_conversations");
      if (convs) setConversations(convs);

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
    if (isTauri()) {
      import("@tauri-apps/api/event").then(({ listen }) => {
        listen<any>("import-progress", (event) => {
          const payload = event.payload;
          setImportProgress(payload);
          if (payload.status === "done") {
            setImporting(false);
            loadData();
          } else {
            setImporting(true);
          }
        }).then((u) => {
          unlisten = u;
        });
      });
    }

    return () => {
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
    if (res) setSettings(res);
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
    convId?: string | null
  ) => {
    return tauriInvoke<any>("chat", {
      message,
      replay_id: replayId || null,
      player_id: settings.player_id || null,
      conversation_id: convId || null,
    });
  };

  const handleNavigateToCoach = (replayId: string, prompt?: string) => {
    if (prompt) setCoachInitialPrompt(prompt);
    setCurrentPage("coach");
  };

  return (
    <div className="app-shell">
      {/* 244px Sidebar Rail */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-glyph">A</div>
          <span className="brand-word">
            AntiRL<span className="brand-period">.</span>
          </span>
          <span className="brand-badge">Coach</span>
        </div>

        <div className="nav-section">Studio</div>
        <nav className="side-nav">
          <button
            className={`nav-link ${currentPage === "overview" ? "active" : ""}`}
            onClick={() => setCurrentPage("overview")}
          >
            <LayoutDashboard size={16} />
            <span>Overview</span>
          </button>

          <button
            className={`nav-link ${currentPage === "replays" ? "active" : ""}`}
            onClick={() => setCurrentPage("replays")}
          >
            <Film size={16} />
            <span>Replay Library</span>
            {replays.length > 0 && <span className="nav-badge">{replays.length}</span>}
          </button>

          <button
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

        <div className="nav-section">Coaching & Evidence</div>
        <nav className="side-nav">
          <button
            className={`nav-link ${currentPage === "coach" ? "active" : ""}`}
            onClick={() => setCurrentPage("coach")}
          >
            <MessageSquare size={16} />
            <span>Coach Chat</span>
          </button>

          <button
            className={`nav-link ${currentPage === "progress" ? "active" : ""}`}
            onClick={() => setCurrentPage("progress")}
          >
            <TrendingUp size={16} />
            <span>Progress & Goals</span>
          </button>

          <button
            className={`nav-link ${currentPage === "teammates" ? "active" : ""}`}
            onClick={() => setCurrentPage("teammates")}
          >
            <Users size={16} />
            <span>Teammates</span>
          </button>
        </nav>

        <div className="nav-section">Settings</div>
        <nav className="side-nav">
          <button
            className={`nav-link ${currentPage === "settings" ? "active" : ""}`}
            onClick={() => setCurrentPage("settings")}
          >
            <SettingsIcon size={16} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="profile-pill">
            <div className="profile-avatar">
              {(settings.player_name || "P").slice(0, 1).toUpperCase()}
            </div>
            <div className="profile-info">
              <span className="profile-name">
                {settings.player_name || settings.player_id || "Unconfirmed Player"}
              </span>
              <span className="profile-sub">
                2v2: {settings.rank_2v2 || "Diamond 2"}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Workspace Pane */}
      <main className="main-wrapper">
        <header className="top-bar">
          <div className="top-title">
            {currentPage === "overview" && "Dashboard Overview"}
            {currentPage === "replays" && "Replay Library"}
            {currentPage === "studio" && "3D Replay Studio"}
            {currentPage === "coach" && "Evidence-Grounded AI Coach"}
            {currentPage === "progress" && "Performance & Analytics"}
            {currentPage === "teammates" && "Teammates Roster"}
            {currentPage === "settings" && "Application Settings"}
          </div>

          <div className="top-actions">
            <button className="btn btn-secondary" onClick={handleImportFolder} disabled={importing}>
              <FolderOpen size={14} /> Import Replays
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
            onImportFolder={handleImportFolder}
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
            <button className="btn btn-primary" onClick={() => setCurrentPage("replays")}>
              Browse Replay Library
            </button>
          </div>
        )}

        {currentPage === "coach" && (
          <Coach
            settings={settings}
            replays={replays}
            conversations={conversations}
            activeReplayId={selectedReplay?.summary.id}
            initialPrompt={coachInitialPrompt}
            onSendMessage={handleSendMessage}
            onSelectReplayStudio={handleSelectReplay}
            onRefreshConversations={loadData}
          />
        )}

        {currentPage === "progress" && (
          <Progress progress={progress} settings={settings} />
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
            onSelectFolder={handleImportFolder}
          />
        )}
      </main>
    </div>
  );
}
