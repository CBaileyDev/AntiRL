import React, { useState, useEffect, useRef } from "react";
import {
  Target,
  Trophy,
  TrendingUp,
  Sparkles,
  Plus,
  Check,
  ChevronRight,
  Zap,
  Shield,
  Gauge,
} from "lucide-react";
import type { ReplaySummary } from "../types";

export interface GoalItem {
  id: string;
  title: string;
  category: "boost" | "speed" | "positioning" | "aerials" | "defense";
  metric: string;
  current: number;
  target: number;
  unit: string;
  direction: "higher" | "lower";
  status: "in_progress" | "achieved";
  drills: string;
}

const DEFAULT_GOALS: GoalItem[] = [];

interface GoalTrackerProps {
  onAskCoach?: (prompt: string) => void;
  recentSummaries?: ReplaySummary[];
}

export default function GoalTracker({ onAskCoach, recentSummaries = [] }: GoalTrackerProps) {
  const [goals, setGoals] = useState<GoalItem[]>(DEFAULT_GOALS);
  const [generating, setGenerating] = useState(false);
  const [showNewGoalModal, setShowNewGoalModal] = useState(false);

  // New goal state
  const [newTitle, setNewTitle] = useState("");
  const [newTarget, setNewTarget] = useState(45);
  const [newUnit, setNewUnit] = useState("%");

  const timerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
  }, []);

  const handleGenerateAiGoals = () => {
    onAskCoach?.("Help me choose one evidence-backed practice priority, one drill and a next-match cue. Do not invent telemetry or universal numerical targets.");
  };

  const getProgressPct = (goal: GoalItem) => {
    if (goal.direction === "higher") {
      if (!goal.target) return 100;
      return Math.min(100, Math.max(0, Math.round((goal.current / goal.target) * 100)));
    } else {
      // Lower is better: baseline could be 2x target
      const baseline = goal.target * 2.5;
      if (baseline === goal.target) return goal.current <= goal.target ? 100 : 0;
      const progress = ((baseline - goal.current) / (baseline - goal.target)) * 100;
      return Math.min(100, Math.max(0, Math.round(progress)));
    }
  };

  return (
    <div className="goal-tracker-card">
      <div className="goal-tracker-header">
        <div className="goal-title-wrap">
          <div className="goal-icon-badge">
            <Target size={18} color="#38BDF8" />
          </div>
          <div>
            <h3 className="section-title">Telemetry Training Goals</h3>
            <p className="section-subtitle">
              Choose a practice goal with the coach; grades and forecasts require validation.
            </p>
          </div>
        </div>

        <div className="goal-header-actions">
          <button
            className="btn secondary sm"
            onClick={handleGenerateAiGoals}
            disabled={generating}
            title="Have AI Coach inspect your telemetry leaks and calibrate new targets"
          >
            <Sparkles size={14} className={generating ? "spinning" : ""} color="#A855F7" />
            <span>{generating ? "Analyzing Telemetry..." : "AI Suggest Goals"}</span>
          </button>
        </div>
      </div>

      <div className="goal-grid">
        {goals.map((g) => {
          const pct = getProgressPct(g);
          const isDone = g.status === "achieved" || pct >= 100;

          return (
            <div key={g.id} className={`goal-card ${isDone ? "completed" : ""}`}>
              <div className="goal-card-top">
                <div className="goal-badge-row">
                  <span className={`goal-category-tag ${g.category}`}>{g.category.toUpperCase()}</span>
                  <span className="goal-pct-badge">{pct}% Progress</span>
                </div>
                <h4 className="goal-name">{g.title}</h4>
              </div>

              <div className="goal-metrics-row">
                <div className="metric-col">
                  <span className="metric-label">CURRENT</span>
                  <span className="metric-val current">
                    {g.current}
                    {g.unit}
                  </span>
                </div>
                <div className="metric-arrow">
                  <TrendingUp size={16} />
                </div>
                <div className="metric-col">
                  <span className="metric-label">TARGET</span>
                  <span className="metric-val target">
                    {g.target}
                    {g.unit}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="goal-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <div
                  className={`goal-progress-fill ${isDone ? "done" : ""}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="goal-drill-box">
                <span className="drill-label">COACH ADVICE:</span> {g.drills}
              </div>

              {onAskCoach && (
                <button
                  className="goal-coach-btn"
                  onClick={() =>
                    onAskCoach(
                      `Give me 3 specific drills and training packs to improve my '${g.title}'. My current telemetry is ${g.current}${g.unit} and target is ${g.target}${g.unit}.`
                    )
                  }
                >
                  <span>Ask Coach for Custom Drills</span>
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
