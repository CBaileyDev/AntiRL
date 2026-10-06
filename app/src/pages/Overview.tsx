import React, { useMemo } from "react";
import { Play, Shield, Zap, Flame, Award, SlidersHorizontal, ChevronRight } from "lucide-react";
import type { ReplaySummary, Settings, ProgressReport } from "../types";
import { timeLabel } from "../ReplayViewer";
import RankBadge from "../components/RankBadge";

interface OverviewProps {
  replays: ReplaySummary[];
  settings: Settings;
  progress: ProgressReport | null;
  onSelectReplay: (replayId: string) => void;
  onNavigate: (page: string) => void;
  onOpenOnboarding: () => void;
  onAskCoach?: (prompt: string) => void;
}

export default function Overview({
  replays,
  settings,
  progress,
  onSelectReplay,
  onNavigate,
  onOpenOnboarding,
}: OverviewProps) {
  const playerName = settings.player_name || "Unconfirmed Player";
  const primaryRank = settings.rank_2v2 || "Unranked";
  const lastReplay = replays[0];

  const totalMatches = replays.length;
  const isWin = (r: (typeof replays)[0]) => {
    const p = r.players?.find((p) => p.id === settings.player_id) || r.players?.[0];
    const myTeam = p?.team ?? 0;
    return myTeam === 0
      ? (r.blue_score ?? 0) > (r.orange_score ?? 0)
      : (r.orange_score ?? 0) > (r.blue_score ?? 0);
  };
  const { winRate } = useMemo(() => {
    const w = replays.filter(isWin).length;
    return { winRate: totalMatches > 0 ? Math.round((w / totalMatches) * 100) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replays, settings.player_id]);
  const mode = progress?.modes?.["2v2"] ?? Object.values(progress?.modes ?? {})[0];
  const fmt = (v: number | undefined, suffix: string, digits = 1) =>
    v == null || !isFinite(v) || v === 0 ? "—" : `${Number(v.toFixed(digits))}${suffix}`;

  return (
    <div className="content-pane overview-pane">
      {/* Hero Welcome & Profile Card */}
      <div className="overview-hero-card">
        <div className="hero-left-col">
          <div className="hero-rank-emblem">
            <RankBadge rank={primaryRank} size={64} />
          </div>
          <div className="hero-details">
            <div className="hero-title-row">
              <h1 className="hero-player-name">{playerName}</h1>
              <span className="hero-mode-pill">2v2 Competitive</span>
            </div>
            <div className="hero-rank-sub">
              <span className="rank-name-bold">{primaryRank}</span>
              {settings.playstyle && (
                <>
                  <span className="rank-separator">•</span>
                  <span className="playstyle-tag">{settings.playstyle}</span>
                </>
              )}
            </div>
            <p className="hero-tagline">
              {totalMatches} local {totalMatches === 1 ? "match" : "matches"} parsed from full
              replay telemetry. Zero guessed statistics.
            </p>
          </div>
        </div>

        <div className="hero-actions-col">
          {lastReplay && (
            <button
              className="btn primary hero-play-btn"
              onClick={() => onSelectReplay(lastReplay.id)}
              title="Jump directly into 3D Replay Studio for your latest match"
            >
              <Play size={18} fill="currentColor" />
              <span>Review Last Match</span>
            </button>
          )}
          <button
            className="btn secondary hero-calibrate-btn"
            onClick={onOpenOnboarding}
            title="Adjust your ranks, playstyle, and AI coach persona"
          >
            <SlidersHorizontal size={14} />
            <span>Calibrate Profile</span>
          </button>
        </div>
      </div>

      {/* 4 Core Performance KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">OVERALL WIN RATE</span>
            <div className="kpi-icon-wrap trophy">
              <Award size={16} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-number">{winRate}%</span>
          </div>
          <span className="kpi-subtext">Across {totalMatches} tracked matches</span>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">AVERAGE BOOST LEVEL</span>
            <div className="kpi-icon-wrap boost">
              <Zap size={16} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-number">{fmt(mode?.avg_boost, "%")}</span>
            <span className="kpi-trend target">Context dependent</span>
          </div>
          <span className="kpi-subtext">Legacy equal-match mean; weights unavailable</span>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">BOOSTING AT SPEED</span>
            <div className="kpi-icon-wrap waste">
              <Flame size={16} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-number">{fmt(mode?.boost_active_at_supersonic_speed_s, "s")}</span>
          </div>
          <span className="kpi-subtext">Boost-active time at ≥2200 uu/s</span>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">DEFENSIVE HALF SHARE</span>
            <div className="kpi-icon-wrap defense">
              <Shield size={16} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-number">{fmt(mode?.defensive_half_pct, "%")}</span>
          </div>
          <span className="kpi-subtext">Active play behind midfield line</span>
        </div>
      </div>

      {/* Recent Matches Strip with Direct 3D Launcher */}
      <div className="recent-matches-card">
        <div className="recent-header">
          <div>
            <h3 className="section-title">Recent Matches</h3>
            <p className="section-subtitle">
              Click any match to launch the broadcast 3D Replay Studio
            </p>
          </div>
          <button className="btn secondary sm" onClick={() => onNavigate("replays")}>
            View All ({replays.length}) <ChevronRight size={14} />
          </button>
        </div>

        <div className="recent-matches-list">
          {replays.length === 0 && (
            <p className="section-subtitle" style={{ padding: "16px 4px" }}>
              No matches imported yet. Import replays to see them here.
            </p>
          )}
          {replays.slice(0, 4).map((r) => {
            const blueScore = r.blue_score ?? 0;
            const orangeScore = r.orange_score ?? 0;
            const won = isWin(r);

            return (
              <div
                key={r.id}
                className="match-strip-item"
                onClick={() => onSelectReplay(r.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectReplay(r.id);
                  }
                }}
              >
                <div className="match-mode-badge">
                  <span className="mode-text">{r.mode}</span>
                </div>

                <div className="match-info-col">
                  <span className="match-map-title">{r.map_name || "DFH Stadium"}</span>
                  <span className="match-meta-line">
                    Duration: {timeLabel(r.duration_seconds)} • {r.players?.length ?? 4} Players
                  </span>
                </div>

                <div className="match-score-col">
                  <span className={`match-result-tag ${won ? "win" : "loss"}`}>
                    {won ? "VICTORY" : "DEFEAT"}
                  </span>
                  <span className="match-score-nums">
                    {blueScore} - {orangeScore}
                  </span>
                </div>

                <div className="match-action-col">
                  <button
                    className="icon-btn primary"
                    title="Launch 3D Replay Studio"
                    aria-label="Launch 3D Replay Studio"
                    tabIndex={-1}
                  >
                    <Play size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
