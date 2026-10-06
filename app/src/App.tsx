import { errorMessage } from "./errors";
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
} from "./types";

import { ipc, invoke as tauriInvoke, isTauri } from "./ipc";
import type { AiStatusDto, IdentityDto, ImportEntry } from "./bindings";

interface ImportProgress {
  current: number;
  total: number;
  file: string;
  status: string;
  imported?: number;
  new?: number;
  failed?: number;
  skipped?: number;
  already_present?: number;
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
    provider: "none",
    chat_model: "gpt-6-astra",
    analysis_model: "gpt-6-astra",
    auto_import: true,
    cloud_consent: false,
    rank_1v1: null,
    rank_2v2: null,
    rank_3v3: null,
  });
  const [identity, setIdentity] = useState<IdentityDto | null>(null);
  const settings = useMemo<Settings>(
    () => ({
      ...rawSettings,
      player_id: rawSettings.player_id || identity?.player_id || null,
      player_name: rawSettings.player_name || identity?.player_name || null,
    }),
    [rawSettings, identity],
  );
  const highestRank = highestCompetitiveRank([
    settings.rank_1v1,
    settings.rank_2v2,
    settings.rank_3v3,
  ]);
  const [progress, setProgress] = useState<ProgressReport | null>(null);
  const [teammates, setTeammates] = useState<TeammateStats[]>([]);
  const [memoryNotes, setMemoryNotes] = useState<MemoryNote[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [aiStatus, setAiStatus] = useState<AiStatusDto | null>(null);
  const aiConnected = useMemo(() => {
    const provider = aiStatus?.current_provider;
    const p = aiStatus?.providers?.[provider];
    const hasKey = provider === "chatgpt" ? p?.status === "connected" : Boolean(p?.configured);
    return Boolean(aiStatus?.cloud_consent) && hasKey;
  }, [aiStatus]);
  const [identityCandidates, setIdentityCandidates] = useState<
    { player_id: string; name: string; matches: number }[]
  >([]);

  const [notice, setNotice] = useState("");
  const [importRecords, setImportRecords] = useState<ImportEntry[]>([]);
  const manualImportRef = useRef(false);
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
  const onboardingChecked = useRef(false);

  const refreshMemory = async () => {
    const notes = await ipc.getMemory();
    if (Array.isArray(notes)) setMemoryNotes(notes);
  };
  const refreshAiStatus = async () => setAiStatus(await ipc.getAiStatus());
  const refreshImports = async () => {
    const entries = await ipc.getImportStatus();
    if (Array.isArray(entries)) setImportRecords(entries);
  };
  const refreshConversations = async () => {
    const convs = await ipc.getConversations();
    if (!Array.isArray(convs)) return;
    setConversations(convs);
    if (!coachRestored.current && convs.length) {
      coachRestored.current = true;
      const latest = convs[0];
      const msgs = await ipc.getMessages(latest.id);
      if (Array.isArray(msgs) && msgs.length) {
        setCoachConvId((cur) => cur ?? latest.id);
        setCoachMessages((cur) =>
          cur.length > 1
            ? cur
            : msgs
                .filter((m) => m.body.role === "user" || m.body.role === "assistant")
                .map((m) => ({ id: m.id, ...m.body, role: m.body.role as "user" | "assistant" })),
        );
      }
    }
  };
  const refreshLibrary = async (cfg = rawSettings) => {
    const [lib, ident] = await Promise.all([ipc.getLibrary(), ipc.resolveIdentity()]);
    if (Array.isArray(lib?.replays)) setReplays(lib.replays);
    if (Array.isArray(lib?.identity_candidates)) setIdentityCandidates(lib.identity_candidates);
    if (ident && "player_id" in ident) setIdentity(ident);
    const resolvedId = cfg.player_id || ident?.player_id || null;
    const [prog, mates] = await Promise.all([
      ipc.getProgress(resolvedId),
      resolvedId ? ipc.getTeammates(resolvedId) : Promise.resolve([]),
    ]);
    if (prog) setProgress(prog);
    if (Array.isArray(mates)) setTeammates(mates);
  };
  const loadData = async () => {
    try {
      const cfgPromise = ipc.getSettings();
      const independent = Promise.all([
        refreshMemory(),
        refreshConversations(),
        refreshAiStatus(),
        refreshImports(),
      ]);
      const cfg = await cfgPromise;
      if (cfg?.provider) {
        setSettings(cfg as Settings);
        if (!onboardingChecked.current) {
          onboardingChecked.current = true;
          if (!cfg.onboarding_status) setShowOnboarding(true);
        }
      }
      await Promise.all([
        refreshLibrary(cfg?.provider ? (cfg as Settings) : rawSettings),
        independent,
      ]);
    } catch (error) {
      setNotice(
        `Could not load app data: ${error instanceof Error ? error.message : errorMessage(error)}`,
      );
    }
  };

  // Import subscriptions are mounted once; handlers read the latest settings and refresh functions.
  const dataActions = useRef({ loadData, refreshLibrary, refreshImports });
  dataActions.current = { loadData, refreshLibrary, refreshImports };
  useEffect(() => {
    dataActions.current.loadData();

    // Listen for import progress events if in Tauri
    let unlisten: (() => void) | undefined;
    let disposed = false;
    if (isTauri()) {
      import("@tauri-apps/api/event")
        .then(({ listen }) => {
          listen<ImportProgress>("import-progress", (event) => {
            const payload = event.payload;
            setImportProgress(payload);
            if (payload.status === "done") {
              if (!manualImportRef.current) setImporting(false);
              if (!manualImportRef.current && (payload.new ?? payload.imported) > 0)
                dataActions.current.refreshLibrary().catch((e) => setNotice(errorMessage(e)));
              dataActions.current.refreshImports().catch((e) => setNotice(errorMessage(e)));
            }
          }).then((u) => {
            if (disposed) u();
            else unlisten = u;
          });
        })
        .catch(() => {});
    }

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const handleSelectReplay = async (id: string) => {
    try {
      const full = await ipc.getReplay(id);
      if (full && full.summary) {
        setSelectedReplay(full);
        setCurrentPage("studio");
      }
    } catch (e) {
      setNotice(`Could not load replay: ${errorMessage(e)}`);
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
          manualImportRef.current = true;
          setImporting(true);
          const result = await tauriInvoke<{ imported: number; new?: number }>("import_folder", {
            folder: selected,
          });
          if ((result?.new ?? result?.imported ?? 0) > 0) await refreshLibrary();
          await refreshImports();
        }
      } catch (e) {
        setNotice(`Folder import failed: ${errorMessage(e)}`);
      } finally {
        manualImportRef.current = false;
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
          manualImportRef.current = true;
          setImporting(true);
          const files = Array.isArray(selected) ? selected : [selected];
          let newCount = 0;
          for (const file of files) {
            const result = await tauriInvoke<{ imported: number; new?: number }>(
              "import_single_file",
              { file_path: file },
            );
            newCount += result?.new ?? result?.imported ?? 0;
          }
          await Promise.all([...(newCount > 0 ? [refreshLibrary()] : []), refreshImports()]);
        }
      } catch (e) {
        setNotice(`Files import failed: ${errorMessage(e)}`);
      } finally {
        manualImportRef.current = false;
        setImporting(false);
      }
    }
  };

  const handleDeleteReplay = async (id: string, removeSnapshot = true) => {
    try {
      await ipc.deleteReplay(id, removeSnapshot);
      await Promise.all([refreshLibrary(), refreshImports()]);
      if (selectedReplay?.summary.id === id) {
        setSelectedReplay(null);
        setCurrentPage("replays");
      }
    } catch (e) {
      setNotice(`Delete failed: ${errorMessage(e)}`);
    }
  };

  const handleSaveSettings = async (updated: Partial<Settings>) => {
    const res = await tauriInvoke<Settings>("save_settings", { settings: updated });
    if (res?.provider) setSettings(res);
    else if (!isTauri()) setSettings((previous) => ({ ...previous, ...updated }));
    else
      throw new Error(
        "The saved settings response was invalid. Reload Settings to check the saved values.",
      );
    await Promise.all([
      refreshAiStatus(),
      ...(updated.player_id !== undefined ? [refreshLibrary(res)] : []),
    ]);
  };

  const handleSetApiKey = async (provider: string, key: string) => {
    await tauriInvoke("set_api_key", { provider, key });
    await refreshAiStatus();
  };

  const handleLoadModels = async (provider: string) => {
    const res = await ipc.listModels(provider);
    return (res?.models || []).map((m) => m.id);
  };

  const handleSaveMemoryNote = async (name: string, content: string) => {
    await tauriInvoke("save_memory", { name, content });
    await refreshMemory();
  };

  const handleDeleteMemoryNote = async (name: string) => {
    await tauriInvoke("delete_memory", { name });
    await refreshMemory();
  };

  const handleSendMessage = async (
    message: string,
    replayId?: string | null,
    convId?: string | null,
    onUpdate?: (text: string) => void,
  ) => {
    const { Channel } = await import("@tauri-apps/api/core");
    const updates = new Channel<string>();
    let streamed = "";
    updates.onmessage = (delta) => {
      streamed += delta;
      onUpdate?.(streamed);
    };
    return ipc.chat(message, replayId || null, settings.player_id || null, convId || null, updates);
  };

  const handleNavigateToCoach = async (replayId: string, prompt?: string) => {
    if (prompt) setCoachInitialPrompt(prompt);
    if (replayId) {
      try {
        const res = await ipc.getReplay(replayId);
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
                <span className="profile-sub">Highest · {highestRank}</span>
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
              <button
                className="btn secondary"
                style={{ display: currentPage === "replays" ? "none" : undefined }}
                onClick={handleImportFolder}
                disabled={importing}
              >
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
              importRecords={importRecords}
              onRetryFailed={async () => {
                manualImportRef.current = true;
                setImporting(true);
                try {
                  const result = await tauriInvoke<{ new: number; imported: number }>(
                    "retry_failed_imports",
                    { folder: settings.replay_folder },
                  );
                  await Promise.all([
                    ...(result?.new > 0 ? [refreshLibrary()] : []),
                    refreshImports(),
                  ]);
                } catch (e) {
                  setNotice(`Retry failed: ${errorMessage(e)}`);
                } finally {
                  manualImportRef.current = false;
                  setImporting(false);
                }
              }}
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
              onRefreshConversations={() =>
                refreshConversations().catch((e) => setNotice(errorMessage(e)))
              }
            />
          )}

          {currentPage === "progress" && (
            <Progress progress={progress} settings={settings} replays={replays} />
          )}

          {currentPage === "teammates" && <Teammates teammates={teammates} />}

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
              onSelectFolder={handlePickFolder}
            />
          )}
        </main>
      </div>

      {notice && (
        <div className="app-notice" role="alert">
          <span>{notice}</span>
          <button className="btn secondary" onClick={() => setNotice("")}>
            Dismiss
          </button>
        </div>
      )}
      {showOnboarding && (
        <OnboardingModal
          initialSettings={settings}
          identityCandidates={identityCandidates}
          onSave={async (patch) => {
            await handleSaveSettings({ ...patch, onboarding_status: "completed" });
            setShowOnboarding(false);
          }}
          onClose={(completed) => {
            setShowOnboarding(false);
            if (!completed)
              handleSaveSettings({
                onboarding_status: settings.onboarding_status || "skipped",
              }).catch(console.error);
          }}
        />
      )}
    </>
  );
}
