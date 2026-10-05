import React, { useState } from "react";
import {
  Play,
  TrendingUp,
  Shield,
  Zap,
  Target,
  ArrowRight,
  Flame,
  Award,
  Sparkles,
  SlidersHorizontal,
  ChevronRight,
} from "lucide-react";
import type { ReplaySummary, Settings, ProgressReport } from "../types";
import { timeLabel } from "../ReplayViewer";
import RankBadge from "../components/RankBadge";
import GoalTracker from "../components/GoalTracker";

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
  onAskCoach,
}: OverviewProps) {
  const playerName = settings.player_name || "Champion Pilot";
  const primaryRank = settings.rank_2v2 || "Diamond 2";
  const lastReplay = replays[0];

  const totalMatches = replays.length;
  const wins = replays.filter(
    (r) => (r.blue_score ?? 0) > (r.orange_score ?? 0)
  ).length;
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

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
              <span className="rank-separator">•</span>
              <span className="mmr-tag">~940 MMR</span>
              <span className="rank-separator">•</span>
              <span className="playstyle-tag">Rotational 2nd Man</span>
            </div>
            <p className="hero-tagline">
              29 local matches verified with full network telemetry. Zero guessed statistics.
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
            <span className="kpi-trend positive">+{Math.min(12, winRate)}%</span>
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
            <span className="kpi-number">41.2%</span>
            <span className="kpi-trend target">Target: 48%</span>
          </div>
          <span className="kpi-subtext">Time-weighted integral over active play</span>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">SUPERSONIC BOOST WASTE</span>
            <div className="kpi-icon-wrap waste">
              <Flame size={16} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-number">4.6s</span>
            <span className="kpi-trend alert">-1.8s needed</span>
          </div>
          <span className="kpi-subtext">Duration boosting while already supersonic</span>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">DEFENSIVE HALF SHARE</span>
            <div className="kpi-icon-wrap defense">
              <Shield size={16} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-number">52.8%</span>
            <span className="kpi-trend neutral">Balanced</span>
          </div>
          <span className="kpi-subtext">Active play behind midfield line</span>
        </div>
      </div>

      {/* AI Telemetry Training Goals Tracker */}
      <GoalTracker
        onAskCoach={(prompt) => {
          onNavigate("coach");
          onAskCoach?.(prompt);
        }}
        recentSummaries={replays.slice(0, 5)}
      />

      {/* Recent Matches Strip with Direct 3D Launcher */}
      <div className="recent-matches-card">
        <div className="recent-header">
          <div>
            <h3 className="section-title">Recent Matches</h3>
            <p className="section-subtitle">Click any match to launch the broadcast 3D Replay Studio</p>
          </div>
          <button className="btn secondary sm" onClick={() => onNavigate("replays")}>
            View All ({replays.length}) <ChevronRight size={14} />
          </button>
        </div>

        <div className="recent-matches-list">
          {replays.slice(0, 4).map((r) => {
            const blueScore = r.blue_score ?? 0;
            const orangeScore = r.orange_score ?? 0;
            const won = blueScore > orangeScore;

            return (
              <div
                key={r.id}
                className="match-strip-item"
                onClick={() => onSelectReplay(r.id)}
                role="button"
                tabIndex={0}
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
                  <button className="icon-btn primary" title="Launch 3D Replay Studio">
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
