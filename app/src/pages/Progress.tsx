import React, { useState } from "react";
import {
  TrendingUp,
  Award,
  Zap,
  Shield,
  Gauge,
  CheckCircle,
  Clock,
  Flame,
  Target,
} from "lucide-react";
import type { ProgressReport, Settings } from "../types";

interface ProgressProps {
  progress: ProgressReport | null;
  settings: Settings;
}

export default function Progress({ progress, settings }: ProgressProps) {
  const [selectedMode, setSelectedMode] = useState<string>("2v2");

  const modeData = progress?.modes?.[selectedMode] || {
    matches: 0,
    wins: 0,
    win_rate: 0,
    avg_boost: 0,
    avg_speed: 0,
    defensive_half_pct: 0,
    low_boost_pct: 0,
    supersonic_waste_seconds: 0,
  };

  return (
    <div className="content-pane">
      {/* Mode Selector and Profile Context */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
            Long-term Progress & Analytics
          </h2>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            Player: <b>{settings.player_name || settings.player_id || "Primary Account"}</b> · Sample:{" "}
            <b>{progress?.matches_analyzed ?? 0}</b> total matches analyzed
          </span>
        </div>

        {/* Playlist Filter */}
        <div style={{ display: "flex", background: "var(--surface)", borderRadius: "var(--radius-sm)", padding: 3, border: "1px solid var(--line)" }}>
          {["1v1", "2v2", "3v3"].map((mode) => (
            <button
              key={mode}
              onClick={() => setSelectedMode(mode)}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 6,
                color: selectedMode === mode ? "var(--accent-ink)" : "var(--muted)",
                background: selectedMode === mode ? "var(--accent)" : "transparent",
                transition: "all 0.15s ease",
              }}
            >
              Competitive {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Mode-specific Metric Cards */}
      <div className="grid-4">
        <div className="stat-box">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Award size={16} color="var(--sage)" />
            <span className="stat-label">Win Rate ({selectedMode})</span>
          </div>
          <span className="stat-value" style={{ color: "var(--sage)" }}>
            {modeData.win_rate}%
          </span>
          <span className="stat-hint">
            {modeData.wins} wins in {modeData.matches} matches
          </span>
        </div>

        <div className="stat-box">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={16} color="var(--accent)" />
            <span className="stat-label">Avg Boost Level</span>
          </div>
          <span className="stat-value" style={{ color: "var(--accent)" }}>
            {modeData.avg_boost ? `${modeData.avg_boost}%` : "N/A"}
          </span>
          <span className="stat-hint">Time-weighted active boost</span>
        </div>

        <div className="stat-box">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Gauge size={16} color="var(--blue-team)" />
            <span className="stat-label">Average Speed</span>
          </div>
          <span className="stat-value" style={{ color: "var(--blue-team)" }}>
            {modeData.avg_speed ? `${modeData.avg_speed} uu/s` : "N/A"}
          </span>
          <span className="stat-hint">Linear velocity during live play</span>
        </div>

        <div className="stat-box">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Flame size={16} color="var(--danger)" />
            <span className="stat-label">Supersonic Waste</span>
          </div>
          <span className="stat-value" style={{ color: "var(--danger)" }}>
            {modeData.supersonic_waste_seconds ? `${modeData.supersonic_waste_seconds}s` : "0.0s"}
          </span>
          <span className="stat-hint">Avg seconds boosting at &gt;=2200 uu/s</span>
        </div>
      </div>

      {/* Detailed Positioning & Resource Efficiency Breakdown */}
      <div className="grid-2">
        {/* Resource & Field Presence */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Telemetry Efficiency Breakdown</h3>
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
              Sample: {modeData.matches} matches
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>Defensive Half Presence</span>
                <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                  {modeData.defensive_half_pct}%
                </span>
              </div>
              <div style={{ height: 6, background: "var(--surface-raised)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${modeData.defensive_half_pct}%`,
                    height: "100%",
                    background: "var(--accent)",
                  }}
                />
              </div>
              <span style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 4, display: "block" }}>
                Time-weighted Y position behind the halfway line relative to your defending goal.
              </span>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>Low Boost Exposure (&lt;10 Boost)</span>
                <span style={{ color: "var(--orange-team)", fontWeight: 700 }}>
                  {modeData.low_boost_pct}%
                </span>
              </div>
              <div style={{ height: 6, background: "var(--surface-raised)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${modeData.low_boost_pct}%`,
                    height: "100%",
                    background: "var(--orange-team)",
                  }}
                />
              </div>
              <span style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 4, display: "block" }}>
                Portion of active match time spent in a resource-compromised state.
              </span>
            </div>
          </div>
        </div>

        {/* Active Coaching Objectives / Goals */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Coaching Goals</h3>
            <span style={{ fontSize: 11.5, color: "var(--sage)" }}>Progress Tracker</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                padding: "10px 12px",
                background: "var(--surface-raised)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <strong style={{ fontSize: 13, color: "var(--text)" }}>
                  Reduce Supersonic Waste under 1.5s
                </strong>
                <span style={{ fontSize: 11.5, color: "var(--muted)", display: "block" }}>
                  Target: &lt; 1.5s per match · Current: {modeData.supersonic_waste_seconds}s
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-pill)",
                  background:
                    modeData.supersonic_waste_seconds <= 1.5
                      ? "var(--sage-soft)"
                      : "var(--accent-soft)",
                  color:
                    modeData.supersonic_waste_seconds <= 1.5
                      ? "var(--sage)"
                      : "var(--accent)",
                }}
              >
                {modeData.supersonic_waste_seconds <= 1.5 ? "On Track" : "In Progress"}
              </span>
            </div>

            <div
              style={{
                padding: "10px 12px",
                background: "var(--surface-raised)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <strong style={{ fontSize: 13, color: "var(--text)" }}>
                  Maintain Average Boost &gt; 35%
                </strong>
                <span style={{ fontSize: 11.5, color: "var(--muted)", display: "block" }}>
                  Target: &gt; 35% · Current: {modeData.avg_boost}%
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-pill)",
                  background:
                    modeData.avg_boost >= 35
                      ? "var(--sage-soft)"
                      : "var(--accent-soft)",
                  color:
                    modeData.avg_boost >= 35 ? "var(--sage)" : "var(--accent)",
                }}
              >
                {modeData.avg_boost >= 35 ? "Achieved" : "In Progress"}
              </span>
            </div>

            <div
              style={{
                padding: "10px 12px",
                background: "var(--surface-raised)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <strong style={{ fontSize: 13, color: "var(--text)" }}>
                  Small-Pad Rotations in 2v2
                </strong>
                <span style={{ fontSize: 11.5, color: "var(--muted)", display: "block" }}>
                  Limit zero-boost windows to less than 10% of game
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--sage-soft)",
                  color: "var(--sage)",
                }}
              >
                Active Focus
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
