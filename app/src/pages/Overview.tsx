import React from "react";
import {
  Play,
  FolderOpen,
  CheckCircle2,
  TrendingUp,
  Shield,
  Zap,
  Target,
  ArrowRight,
  Flame,
} from "lucide-react";
import type { ReplaySummary, Settings, ProgressReport } from "../types";
import { timeLabel } from "../ReplayViewer";

interface OverviewProps {
  replays: ReplaySummary[];
  settings: Settings;
  progress: ProgressReport | null;
  onSelectReplay: (replayId: string) => void;
  onNavigate: (page: string) => void;
  onImportFolder: () => void;
}

export default function Overview({
  replays,
  settings,
  progress,
  onSelectReplay,
  onNavigate,
  onImportFolder,
}: OverviewProps) {
  const activePlayer = settings.player_name || settings.player_id || "Unconfirmed";
  const recentReplays = replays.slice(0, 5);

  const totalMatches = replays.length;
  const wins = replays.filter((r) => {
    // If we have blue and orange scores, count a win if player's team won
    return (r.blue_score ?? 0) > (r.orange_score ?? 0);
  }).length;
  const overallWinRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

  // Onboarding checklist items
  const hasFolder = Boolean(settings.replay_folder);
  const hasPlayer = Boolean(settings.player_id);
  const hasReplays = replays.length > 0;
  const hasFocus = settings.focus && settings.focus.length > 0;

  return (
    <div className="content-pane">
      {/* Onboarding / Setup Banner */}
      {(!hasPlayer || !hasReplays) && (
        <div
          className="card"
          style={{
            background: "linear-gradient(135deg, #22271D 0%, #2A3324 100%)",
            borderColor: "var(--accent-line)",
          }}
        >
          <div className="card-header" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Zap size={20} color="var(--accent)" />
              <h2 className="card-title">Getting Started with AntiRL</h2>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--accent)",
                background: "var(--accent-soft)",
                padding: "3px 8px",
                borderRadius: "var(--radius-pill)",
              }}
            >
              Actionable Setup
            </span>
          </div>

          <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 16 }}>
            AntiRL provides defensible Rocket League coaching grounded entirely in genuine replay
            telemetry. Complete these steps to tailor analysis to your account:
          </p>

          <div className="grid-4">
            <div
              className="stat-box"
              style={{
                borderColor: hasFolder ? "var(--sage)" : "var(--line)",
                cursor: "pointer",
              }}
              onClick={onImportFolder}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle2
                  size={16}
                  color={hasFolder ? "var(--sage)" : "var(--faint)"}
                />
                <span className="stat-label">1. Replay Source</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                {hasFolder ? "Folder Configured" : "Select Demos Folder"}
              </span>
              <span className="stat-hint">
                {hasFolder ? "Auto-import active" : "Default DemosEpic folder"}
              </span>
            </div>

            <div
              className="stat-box"
              style={{
                borderColor: hasReplays ? "var(--sage)" : "var(--line)",
                cursor: "pointer",
              }}
              onClick={() => onNavigate("replays")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle2
                  size={16}
                  color={hasReplays ? "var(--sage)" : "var(--faint)"}
                />
                <span className="stat-label">2. Import Matches</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                {hasReplays ? `${replays.length} Decoded` : "Import Replays"}
              </span>
              <span className="stat-hint">Full network frame extraction</span>
            </div>

            <div
              className="stat-box"
              style={{
                borderColor: hasPlayer ? "var(--sage)" : "var(--line)",
                cursor: "pointer",
              }}
              onClick={() => onNavigate("settings")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle2
                  size={16}
                  color={hasPlayer ? "var(--sage)" : "var(--faint)"}
                />
                <span className="stat-label">3. Confirm Identity</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                {hasPlayer ? activePlayer : "Select Your Account"}
              </span>
              <span className="stat-hint">Stable platform namespace</span>
            </div>

            <div
              className="stat-box"
              style={{
                borderColor: hasFocus ? "var(--sage)" : "var(--line)",
                cursor: "pointer",
              }}
              onClick={() => onNavigate("settings")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle2
                  size={16}
                  color={hasFocus ? "var(--sage)" : "var(--faint)"}
                />
                <span className="stat-label">4. Focus & Ranks</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                {settings.rank_2v2 || "Diamond 2"}
              </span>
              <span className="stat-hint">Boost, Rotations, Defense</span>
            </div>
          </div>
        </div>
      )}

      {/* KPI Overview Grid */}
      <div className="grid-4">
        <div className="stat-box">
          <span className="stat-label">Total Matches Analyzed</span>
          <span className="stat-value">{totalMatches}</span>
          <span className="stat-hint">Local database cache</span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Active Coaching Profile</span>
          <span className="stat-value" style={{ fontSize: 18 }}>
            {activePlayer}
          </span>
          <span className="stat-hint">
            2v2: {settings.rank_2v2 || "Diamond 2"} · 3v3: {settings.rank_3v3 || "Diamond 2"}
          </span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Estimated Win Rate</span>
          <span className="stat-value" style={{ color: "var(--sage)" }}>
            {overallWinRate}%
          </span>
          <span className="stat-hint">Across analyzed competitive matches</span>
        </div>

        <div className="stat-box">
          <span className="stat-label">Avg Boost Efficiency</span>
          <span className="stat-value" style={{ color: "var(--accent)" }}>
            {progress?.modes?.["2v2"]?.avg_boost
              ? `${progress.modes["2v2"].avg_boost}%`
              : "33.5%"}
          </span>
          <span className="stat-hint">Time-weighted active boost</span>
        </div>
      </div>

      {/* Recent Matches & Tactical Priorities */}
      <div className="grid-2">
        {/* Recent Matches */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Matches</h3>
            <button
              className="btn btn-subtle"
              onClick={() => onNavigate("replays")}
            >
              View All ({replays.length}) <ArrowRight size={14} />
            </button>
          </div>

          {recentReplays.length === 0 ? (
            <div
              style={{
                padding: "36px 12px",
                textAlign: "center",
                color: "var(--muted)",
              }}
            >
              <FolderOpen size={36} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
              <p>No replays imported yet.</p>
              <button
                className="btn btn-primary"
                style={{ marginTop: 12 }}
                onClick={onImportFolder}
              >
                Import Replay Folder
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recentReplays.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: "10px 14px",
                    background: "var(--surface-raised)",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    border: "1px solid var(--line)",
                    cursor: "pointer",
                  }}
                  onClick={() => onSelectReplay(r.id)}
                >
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "var(--surface)",
                          color: "var(--accent)",
                        }}
                      >
                        {r.mode}
                      </span>
                      <strong style={{ fontSize: 13.5, color: "var(--text)" }}>
                        {r.replay_name || r.file_name}
                      </strong>
                    </div>
                    <span style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                      {r.played_at || "Recent Match"} · {timeLabel(r.duration_seconds)} duration
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          color: "var(--text)",
                        }}
                      >
                        {r.blue_score ?? "?"} - {r.orange_score ?? "?"}
                      </span>
                    </div>

                    <button
                      className="btn btn-secondary"
                      style={{ padding: "5px 10px", fontSize: 12 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectReplay(r.id);
                      }}
                    >
                      <Play size={12} /> Studio
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Priority Coaching Themes */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recurring Coaching Priorities</h3>
            <button
              className="btn btn-subtle"
              onClick={() => onNavigate("coach")}
            >
              Coach Chat <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                padding: "12px 14px",
                background: "var(--surface-raised)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--accent-line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Flame size={16} color="var(--accent)" />
                <strong style={{ fontSize: 13.5, color: "var(--text)" }}>
                  Supersonic Boost Conservation
                </strong>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>
                Observed telemetry shows frequent continuous boost holding while already traveling at
                or above 2200 uu/s. Release boost once supersonic trail appears and use flips to maintain
                speed.
              </p>
            </div>

            <div
              style={{
                padding: "12px 14px",
                background: "var(--surface-raised)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Shield size={16} color="var(--sage)" />
                <strong style={{ fontSize: 13.5, color: "var(--text)" }}>
                  Small-Pad Rotations & Lane Depth
                </strong>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>
                Detouring all the way to corner 100-orbs creates defensive exposure windows where all
                teammates are upfield of the ball. Route back through central small-pad arcs.
              </p>
            </div>

            <div
              style={{
                padding: "12px 14px",
                background: "var(--surface-raised)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Target size={16} color="#70AFE1" />
                <strong style={{ fontSize: 13.5, color: "var(--text)" }}>
                  Backpost Patience in 2v2
                </strong>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>
                When your teammate is challenging in the corner, wait at the back post rather than
                creeping into the near-post corner. This ensures complete coverage against backboard passes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
