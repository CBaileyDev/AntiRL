import React, { useState } from "react";
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

const DEFAULT_GOALS: GoalItem[] = [
  {
    id: "g1",
    title: "Boost Conservation Mastery",
    category: "boost",
    metric: "avg_boost",
    current: 41.2,
    target: 48.0,
    unit: "%",
    direction: "higher",
    status: "in_progress",
    drills: "Rotate over central mini-pad arcs instead of driving to 100-boost corner pills.",
  },
  {
    id: "g2",
    title: "Cut Supersonic Boost Waste",
    category: "speed",
    metric: "supersonic_waste",
    current: 4.6,
    target: 2.0,
    unit: "s",
    direction: "lower",
    status: "in_progress",
    drills: "Release boost the instant supersonic wheel trails ignite. Use flips to sustain speed.",
  },
  {
    id: "g3",
    title: "Eliminate Zero-Boost Windows",
    category: "boost",
    metric: "low_boost_pct",
    current: 11.4,
    target: 5.0,
    unit: "%",
    direction: "lower",
    status: "in_progress",
    drills: "Never drop below 12 boost while shadowing. Tap small pads along the backpost goal line.",
  },
  {
    id: "g4",
    title: "Defensive Third Clear Speed",
    category: "defense",
    metric: "defensive_half_pct",
    current: 54.0,
    target: 46.0,
    unit: "%",
    direction: "lower",
    status: "in_progress",
    drills: "Fast aerial to high backboard rebounds; transition ball upfield instead of lingering in corners.",
  },
];

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

  const handleGenerateAiGoals = () => {
    setGenerating(true);
    setTimeout(() => {
      const generated: GoalItem = {
        id: `g-${Date.now()}`,
        title: "Fast Aerial Spacing & 50-50 Containment",
        category: "aerials",
        metric: "aerial_recovery",
        current: 2.9,
        target: 1.6,
        unit: "s",
        direction: "lower",
        status: "in_progress",
        drills: "Double-jump fast aerial with immediate boost feathering. Avoid tilting back late.",
      };
      setGoals((prev) => [generated, ...prev]);
      setGenerating(false);
    }, 900);
  };

  const getProgressPct = (goal: GoalItem) => {
    if (goal.direction === "higher") {
      return Math.min(100, Math.round((goal.current / goal.target) * 100));
    } else {
      // Lower is better: baseline could be 2x target
      const baseline = goal.target * 2.5;
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
              Objective benchmark metrics tracked automatically across your matches
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
              <div className="goal-progress-track">
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
