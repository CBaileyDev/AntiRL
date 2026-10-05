import React, { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  FolderOpen,
  Key,
  Shield,
  Bot,
  FileText,
  Save,
  Trash2,
  Plus,
  RefreshCw,
  CheckCircle2,
  LogIn,
  LogOut,
  AlertCircle,
} from "lucide-react";
import type { Settings, MemoryNote } from "../types";

interface SettingsProps {
  settings: Settings;
  identityCandidates: { player_id: string; name: string; matches: number }[];
  memoryNotes: MemoryNote[];
  aiStatus: any;
  onSaveSettings: (settings: Partial<Settings>) => Promise<void>;
  onSetApiKey: (provider: string, key: string) => Promise<void>;
  onLoadModels: (provider: string) => Promise<string[]>;
  onSaveMemoryNote: (name: string, content: string) => Promise<void>;
  onDeleteMemoryNote: (name: string) => Promise<void>;
  onStartChatgptSignIn: () => Promise<void>;
  onSignOutChatgpt: () => Promise<void>;
  onSelectFolder: () => void;
}

export default function SettingsPage({
  settings,
  identityCandidates,
  memoryNotes,
  aiStatus,
  onSaveSettings,
  onSetApiKey,
  onLoadModels,
  onSaveMemoryNote,
  onDeleteMemoryNote,
  onStartChatgptSignIn,
  onSignOutChatgpt,
  onSelectFolder,
}: SettingsProps) {
  // Local form states
  const [folder, setFolder] = useState(settings.replay_folder);
  const [autoImport, setAutoImport] = useState(settings.auto_import);
  const [playerId, setPlayerId] = useState(settings.player_id || "");
  const [playerName, setPlayerName] = useState(settings.player_name || "");
  const [provider, setProvider] = useState(settings.provider);
  const [chatModel, setChatModel] = useState(settings.chat_model);
  const [cloudConsent, setCloudConsent] = useState(settings.cloud_consent);
  const [rank1v1, setRank1v1] = useState(settings.rank_1v1 || "");
  const [rank2v2, setRank2v2] = useState(settings.rank_2v2 || "Diamond 2");
  const [rank3v3, setRank3v3] = useState(settings.rank_3v3 || "Diamond 2");

  // API Key input
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [modelsList, setModelsList] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Memory note editor state
  const [selectedNote, setSelectedNote] = useState<MemoryNote | null>(
    memoryNotes[0] || null
  );
  const [noteContent, setNoteContent] = useState(memoryNotes[0]?.content || "");
  const [newNoteName, setNewNoteName] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    if (selectedNote) {
      setNoteContent(selectedNote.content);
    }
  }, [selectedNote]);

  const handleFetchModels = async () => {
    setLoadingModels(true);
    try {
      const models = await onLoadModels(provider);
      setModelsList(models);
      if (models.length > 0 && !models.includes(chatModel)) {
        setChatModel(models[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSaveGeneral = async () => {
    await onSaveSettings({
      replay_folder: folder,
      auto_import: autoImport,
      player_id: playerId || null,
      player_name: playerName || null,
      provider,
      chat_model: chatModel,
      analysis_model: chatModel,
      cloud_consent: cloudConsent,
      rank_1v1: rank1v1 || null,
      rank_2v2: rank2v2,
      rank_3v3: rank3v3,
    });
    setSaveStatus("Settings saved successfully.");
    setTimeout(() => setSaveStatus(""), 3000);
  };

  const handleStoreKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      await onSetApiKey(provider, apiKeyInput.trim());
      setApiKeyInput("");
      setSaveStatus("API key securely stored in Windows Credential Vault.");
      setTimeout(() => setSaveStatus(""), 3000);
    } finally {
      setSavingKey(false);
    }
  };

  const handleSaveNote = async () => {
    if (!selectedNote) return;
    await onSaveMemoryNote(selectedNote.name, noteContent);
    setSaveStatus(`Note ${selectedNote.name} saved.`);
    setTimeout(() => setSaveStatus(""), 3000);
  };

  return (
    <div className="content-pane" style={{ maxWidth: 1000 }}>
      {/* Page Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>Application Settings</h2>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            Configure replay discovery, profile identity, AI providers, and coaching memory.
          </span>
        </div>

        {saveStatus && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--sage)",
              background: "var(--sage-soft)",
              padding: "4px 10px",
              borderRadius: "var(--radius-pill)",
            }}
          >
            {saveStatus}
          </span>
        )}
      </div>

      {/* Replay Source & File Discovery */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FolderOpen size={18} color="var(--accent)" />
            <h3 className="card-title">Replay Discovery & Auto-Import</h3>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>
              Rocket League Replay Folder Path
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                className="chat-input"
                style={{ flex: 1 }}
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
              />
              <button className="btn btn-secondary" onClick={onSelectFolder}>
                Browse
              </button>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 4, display: "block" }}>
              Standard Epic path: Documents\My Games\Rocket League\TAGame\DemosEpic
            </span>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoImport}
              onChange={(e) => setAutoImport(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
            />
            <span style={{ fontSize: 13.5, color: "var(--text)" }}>
              Enable background folder watcher to auto-import newly saved matches
            </span>
          </label>
        </div>
      </div>

      {/* Player Identity Confirmation */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={18} color="var(--sage)" />
            <h3 className="card-title">Player Identity & Ranks</h3>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {identityCandidates.length > 0 && (
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>
                Detected Players in Your Replays:
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {identityCandidates.slice(0, 6).map((c) => (
                  <button
                    key={c.player_id}
                    onClick={() => {
                      setPlayerId(c.player_id);
                      setPlayerName(c.name);
                    }}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      background: playerId === c.player_id ? "var(--accent)" : "var(--surface-raised)",
                      color: playerId === c.player_id ? "var(--accent-ink)" : "var(--text)",
                      border: "1px solid var(--line-strong)",
                      cursor: "pointer",
                    }}
                  >
                    {c.name} ({c.matches} matches)
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid-2">
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>
                Player Name
              </label>
              <input
                type="text"
                className="chat-input"
                style={{ width: "100%" }}
                value={playerName}
                placeholder="e.g. yoitzjerm"
                onChange={(e) => setPlayerName(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>
                Platform Account ID
              </label>
              <input
                type="text"
                className="chat-input"
                style={{ width: "100%", fontFamily: "var(--mono)", fontSize: 12 }}
                value={playerId}
                placeholder="e.g. psn:7323469927272844526"
                onChange={(e) => setPlayerId(e.target.value)}
              />
            </div>
          </div>

          <div className="grid-3">
            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                1v1 Rank
              </label>
              <input
                type="text"
                className="chat-input"
                style={{ width: "100%" }}
                value={rank1v1}
                placeholder="Unranked / Diamond 1"
                onChange={(e) => setRank1v1(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                2v2 Rank
              </label>
              <input
                type="text"
                className="chat-input"
                style={{ width: "100%" }}
                value={rank2v2}
                placeholder="Diamond 2"
                onChange={(e) => setRank2v2(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                3v3 Rank
              </label>
              <input
                type="text"
                className="chat-input"
                style={{ width: "100%" }}
                value={rank3v3}
                placeholder="Diamond 2"
                onChange={(e) => setRank3v3(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* AI Provider & Models */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bot size={18} color="var(--accent)" />
            <h3 className="card-title">AI Provider & Model Integration</h3>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Cloud Consent Toggle */}
          <div
            style={{
              padding: "12px",
              background: cloudConsent ? "var(--sage-soft)" : "var(--surface-raised)",
              borderRadius: "var(--radius-sm)",
              border: `1px solid ${cloudConsent ? "var(--sage-line)" : "var(--line)"}`,
            }}
          >
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={cloudConsent}
                onChange={(e) => setCloudConsent(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "var(--accent)", marginTop: 2 }}
              />
              <div>
                <strong style={{ fontSize: 13.5, color: "var(--text)", display: "block" }}>
                  Cloud AI Processing Consent
                </strong>
                <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45, display: "block" }}>
                  When enabled, match summary metrics and detected tactical event IDs are transmitted to the
                  configured AI provider to generate natural language coaching findings. Original replay
                  files are never uploaded.
                </span>
              </div>
            </label>
          </div>

          <div className="grid-2">
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>
                Active Provider
              </label>
              <select
                className="chat-input"
                style={{ width: "100%" }}
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as any);
                  setModelsList([]);
                }}
              >
                <option value="neotoken">NeoToken V2 (api.v2.neokens.com)</option>
                <option value="openai">OpenAI Direct API (api.openai.com)</option>
                <option value="chatgpt">ChatGPT Plan OAuth (SIWC Loopback)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>
                Chat & Analysis Model
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {modelsList.length > 0 ? (
                  <select
                    className="chat-input"
                    style={{ flex: 1 }}
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value)}
                  >
                    {modelsList.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="chat-input"
                    style={{ flex: 1 }}
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value)}
                  />
                )}
                <button
                  className="btn btn-secondary"
                  title="Query live model catalog"
                  disabled={loadingModels}
                  onClick={handleFetchModels}
                >
                  <RefreshCw size={14} className={loadingModels ? "spin" : ""} />
                </button>
              </div>
            </div>
          </div>

          {/* Provider Authentication Section */}
          {provider === "chatgpt" ? (
            <div style={{ padding: "12px", background: "var(--surface-raised)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <strong style={{ fontSize: 13.5, color: "var(--text)" }}>ChatGPT Plan OAuth Flow</strong>
                  <span style={{ fontSize: 12, color: "var(--muted)", display: "block" }}>
                    Status: {aiStatus?.providers?.chatgpt?.status === "connected" ? "Connected" : "Signed Out"}
                  </span>
                </div>
                {aiStatus?.providers?.chatgpt?.status === "connected" ? (
                  <button className="btn btn-secondary" onClick={onSignOutChatgpt}>
                    <LogOut size={14} /> Sign Out
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={onStartChatgptSignIn}>
                    <LogIn size={14} /> Continue with ChatGPT
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>
                Update API Key (Stored in Windows Credential Vault)
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="password"
                  className="chat-input"
                  style={{ flex: 1 }}
                  placeholder={`Enter ${provider} API Key (sk-...)`}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  disabled={!apiKeyInput.trim() || savingKey}
                  onClick={handleStoreKey}
                >
                  <Key size={14} /> Save Key
                </button>
              </div>
              <span style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 4, display: "block" }}>
                Keys are never logged, exported, or serialized into Markdown notes.
              </span>
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleSaveGeneral}>
              <Save size={14} /> Save Application Settings
            </button>
          </div>
        </div>
      </div>

      {/* Coaching Memory Manager (Editable Markdown Notes) */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={18} color="var(--accent)" />
            <h3 className="card-title">Durable Coaching Memory</h3>
          </div>
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>
            Editable Markdown files in coach-memory/
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
          {/* Note List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {memoryNotes.map((note) => (
              <button
                key={note.name}
                onClick={() => setSelectedNote(note)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: "left",
                  background: selectedNote?.name === note.name ? "var(--surface-raised)" : "transparent",
                  color: selectedNote?.name === note.name ? "var(--accent)" : "var(--muted)",
                  border: selectedNote?.name === note.name ? "1px solid var(--accent-line)" : "1px solid transparent",
                  cursor: "pointer",
                }}
              >
                {note.name}
              </button>
            ))}

            <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
              <input
                type="text"
                className="chat-input"
                placeholder="new_note.md"
                value={newNoteName}
                onChange={(e) => setNewNoteName(e.target.value)}
                style={{ padding: "4px 8px", fontSize: 12 }}
              />
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px" }}
                disabled={!newNoteName.endsWith(".md")}
                onClick={async () => {
                  await onSaveMemoryNote(newNoteName, `# ${newNoteName}\n\n`);
                  setNewNoteName("");
                }}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Note Editor */}
          {selectedNote ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ fontSize: 14, color: "var(--text)" }}>
                  {selectedNote.name}
                </strong>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={handleSaveNote}>
                    <Save size={13} /> Save Note
                  </button>
                  {selectedNote.name !== "profile.md" && (
                    <button
                      className="icon-btn"
                      title="Delete Note"
                      style={{ width: 28, height: 28 }}
                      onClick={async () => {
                        if (confirm(`Delete ${selectedNote.name}?`)) {
                          await onDeleteMemoryNote(selectedNote.name);
                        }
                      }}
                    >
                      <Trash2 size={13} color="var(--danger)" />
                    </button>
                  )}
                </div>
              </div>

              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 240,
                  background: "var(--surface-raised)",
                  color: "var(--text)",
                  border: "1px solid var(--line-strong)",
                  borderRadius: "var(--radius-sm)",
                  padding: 12,
                  fontFamily: "var(--mono)",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  resize: "vertical",
                }}
              />
            </div>
          ) : (
            <div style={{ color: "var(--muted)", padding: 20 }}>Select a note to view or edit.</div>
          )}
        </div>
      </div>
    </div>
  );
}
