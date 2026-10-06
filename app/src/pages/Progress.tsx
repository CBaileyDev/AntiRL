import React, { useMemo, useState } from "react";
import { Trophy, Zap, Gauge, Flame } from "lucide-react";
import type { ProgressReport, ReplaySummary, Settings } from "../types";
import IntelligencePanel from "../components/IntelligencePanel";
import PracticePanel from "../components/PracticePanel";
import { formatStat } from "../formatStat";

interface ProgressProps {
  progress: ProgressReport | null;
  settings: Settings;
  replays?: ReplaySummary[];
  onOpenReplay?: (id: string, time?: number) => void;
  onAskCoach?: (question: string) => void;
}

export default function Progress({
  progress,
  settings,
  replays = [],
  onOpenReplay,
  onAskCoach,
}: ProgressProps) {
  const [practiceRevision, setPracticeRevision] = useState(0);
  const [selectedMode, setSelectedMode] = useState<string>("2v2");

  const modeData = {
    matches: 0,
    wins: 0,
    win_rate: 0,
    avg_boost: null,
    avg_speed: null,
    defensive_half_pct: 0,
    low_boost_pct: 0,
    boost_active_at_supersonic_speed_s: null,
    ...(progress?.modes?.[selectedMode] ?? {}),
  };
  const clampPct = (n: number) => Math.min(100, Math.max(0, n || 0));

  const form = useMemo(() => {
    const pid = settings.player_id;
    return replays
      .filter((r) => r.mode === selectedMode && r.blue_score != null && r.orange_score != null)
      .map((r) => {
        const me = pid ? r.players?.find((p) => p.id === pid) : undefined;
        if (!me) return null;
        const mine = me.team === 0 ? r.blue_score! : r.orange_score!;
        const theirs = me.team === 0 ? r.orange_score! : r.blue_score!;
        return {
          id: r.id,
          at: r.played_at || "",
          mine,
          theirs,
          res: mine > theirs ? "win" : mine < theirs ? "loss" : "draw",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 12);
  }, [replays, settings.player_id, selectedMode]);
  const formWins = form.filter((f) => f.res === "win").length;

  return (
    <div className="content-pane">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          Player: <b>{settings.player_name || settings.player_id || "Primary Account"}</b> · Sample:{" "}
          <b>{progress?.matches_analyzed ?? 0}</b> total matches analyzed
        </span>

        <div
          style={{
            display: "flex",
            background: "var(--surface)",
            borderRadius: "var(--radius-sm)",
            padding: 3,
            border: "1px solid var(--line)",
          }}
        >
          {["1v1", "2v2", "3v3"].map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={selectedMode === mode}
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

      <div className="pg-stats">
        <div className="pg-stat">
          <div className="pg-stat-head">
            <Trophy size={16} color="var(--sage)" aria-hidden="true" />
            <span className="pg-label">Win Rate ({selectedMode})</span>
          </div>
          <span className="pg-value" style={{ color: "var(--sage)" }}>
            {modeData.matches && modeData.win_rate != null
              ? `${formatStat(modeData.win_rate, 0)}%`
              : "N/A"}
          </span>
          <span className="pg-sub">
            {modeData.wins} wins in {modeData.matches} matches
          </span>
        </div>
        <div className="pg-stat">
          <div className="pg-stat-head">
            <Zap size={16} color="var(--accent)" />
            <span className="pg-label">Avg Boost Level</span>
          </div>
          <span className="pg-value" style={{ color: "var(--accent)" }}>
            {modeData.avg_boost != null ? `${formatStat(modeData.avg_boost)}%` : "N/A"}
          </span>
          <span className="pg-sub">
            Aggregation uses valid observation duration where available; legacy means are labelled
            in Coach
          </span>
        </div>
        <div className="pg-stat">
          <div className="pg-stat-head">
            <Gauge size={16} color="var(--blue-team)" />
            <span className="pg-label">Average Speed</span>
          </div>
          <span className="pg-value" style={{ color: "var(--blue-team)" }}>
            {modeData.avg_speed != null ? `${formatStat(modeData.avg_speed, 0)} uu/s` : "N/A"}
          </span>
          <span className="pg-sub">Linear velocity during live play</span>
        </div>
        <div className="pg-stat">
          <div className="pg-stat-head">
            <Flame size={16} color="var(--danger)" />
            <span className="pg-label">Boosting at Speed</span>
          </div>
          <span className="pg-value" style={{ color: "var(--danger)" }}>
            {modeData.boost_active_at_supersonic_speed_s != null
              ? `${formatStat(modeData.boost_active_at_supersonic_speed_s)}s`
              : "N/A"}
          </span>
          <span className="pg-sub">Equal-match mean at &gt;=2200 uu/s; not proven waste</span>
        </div>
      </div>

      <div className="pg-card">
        <div className="pg-card-head">
          <h3 className="pg-card-title">Recent Form ({selectedMode})</h3>
          <span className="pg-card-meta">
            {form.length > 0
              ? `${formWins}W - ${form.filter((f) => f.res === "loss").length}L - ${form.filter((f) => f.res === "draw").length}D in last ${form.length}`
              : "No results yet"}
          </span>
        </div>
        {form.length === 0 ? (
          <span className="pg-empty">
            Import {selectedMode} matches that include your player profile to see your recent
            results here.
          </span>
        ) : (
          <div className="pg-form">
            {form.map((f) => (
              <div key={f.id} className={`pg-form-item ${f.res}`} title={f.at}>
                <b>{f.res === "win" ? "W" : f.res === "loss" ? "L" : "D"}</b>
                <span>
                  {f.mine}-{f.theirs}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <IntelligencePanel
        mode={selectedMode}
        playerId={settings.player_id}
        libraryRevision={replays}
        onOpenReplay={onOpenReplay}
        onPracticeCreated={() => setPracticeRevision((v) => v + 1)}
        onAskCoach={onAskCoach}
      />
      <PracticePanel
        libraryRevision={replays}
        key={`${selectedMode}:${settings.player_id || ""}:${practiceRevision}`}
        onOpenReplay={onOpenReplay}
        mode={selectedMode}
        playerId={settings.player_id}
      />
      <div className="pg-grid">
        <div className="pg-card">
          <div className="pg-card-head">
            <h3 className="pg-card-title">Telemetry Efficiency Breakdown</h3>
            <span className="pg-card-meta">Sample: {modeData.matches} matches</span>
          </div>
          <div className="pg-list" style={{ gap: 20 }}>
            <div className="pg-bar-row">
              <div className="pg-bar-top">
                <span style={{ color: "var(--text)", fontWeight: 600 }}>
                  Defensive Half Presence
                </span>
                <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                  {formatStat(modeData.defensive_half_pct)}%
                </span>
              </div>
              <div className="pg-bar">
                <div
                  style={{
                    width: `${clampPct(modeData.defensive_half_pct)}%`,
                    background: "var(--accent)",
                  }}
                />
              </div>
              <span className="pg-sub">
                Time-weighted Y position behind the halfway line relative to your defending goal.
              </span>
            </div>
            <div className="pg-bar-row">
              <div className="pg-bar-top">
                <span style={{ color: "var(--text)", fontWeight: 600 }}>
                  Low Boost Exposure (&lt;10 Boost)
                </span>
                <span style={{ color: "var(--orange-team)", fontWeight: 700 }}>
                  {formatStat(modeData.low_boost_pct)}%
                </span>
              </div>
              <div className="pg-bar">
                <div
                  style={{
                    width: `${clampPct(modeData.low_boost_pct)}%`,
                    background: "var(--orange-team)",
                  }}
                />
              </div>
              <span className="pg-sub">
                Portion of active match time spent in a resource-compromised state.
              </span>
            </div>
          </div>
        </div>

        <div className="pg-card">
          <div className="pg-card-head">
            <h3 className="pg-card-title">Coaching Goals</h3>
            <span className="pg-card-meta">Progress Tracker</span>
          </div>
          <div className="pg-list">
            {[
              {
                title: "Review a resource decision",
                sub: "No universal boost target. Inspect pressure, space and recovery.",
                ok: false,
              },
              {
                title: "Practice one useful recovery",
                sub: "Choose a short drill and check transfer in later same-mode matches.",
                ok: false,
              },
              {
                title: "Reassess with new matches",
                sub: "Grades and promotion forecasts await validated evidence.",
                ok: false,
              },
            ].map((g) => (
              <div className="pg-row" key={g.title}>
                <div>
                  <span className="pg-row-title">{g.title}</span>
                  <span className="pg-sub">{g.sub}</span>
                </div>
                <span className={`pg-chip ${modeData.matches && g.ok ? "good" : "progress"}`}>
                  {!modeData.matches ? "No data" : g.ok ? "On Track" : "In Progress"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="pg-grid">
        <div className="pg-card">
          <div className="pg-card-head">
            <h3 className="pg-card-title">Recurring Strengths</h3>
            <span className="pg-card-meta">Across analyzed matches</span>
          </div>
          {progress?.recurring_strengths?.length ? (
            <ul className="pg-bullets">
              {progress.recurring_strengths.slice(0, 5).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : (
            <span className="pg-empty">Strengths appear once enough matches are analyzed.</span>
          )}
        </div>
        <div className="pg-card">
          <div className="pg-card-head">
            <h3 className="pg-card-title">Recurring Priorities</h3>
            <span className="pg-card-meta">Focus next</span>
          </div>
          {progress?.recurring_priorities?.length ? (
            <ul className="pg-bullets">
              {progress.recurring_priorities.slice(0, 5).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : (
            <span className="pg-empty">Priorities appear once enough matches are analyzed.</span>
          )}
        </div>
      </div>
    </div>
  );
}
