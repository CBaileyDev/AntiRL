import React, { useState } from "react";
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Shield,
  Target,
  User,
  Zap,
  HelpCircle,
  X,
} from "lucide-react";
import RankBadge, { RANK_TIERS, DEFAULT_MMR, type RankTier } from "./RankBadge";
import type { Settings } from "../types";

interface OnboardingModalProps {
  initialSettings: Settings;
  onSave: (settings: Partial<Settings>) => Promise<void>;
  onClose: () => void;
}

export default function OnboardingModal({
  initialSettings,
  onSave,
  onClose,
}: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Form State
  const [playerName, setPlayerName] = useState(initialSettings.player_name || "");
  const [playstyle, setPlaystyle] = useState("Rotational 2nd Man");
  const [rank1v1, setRank1v1] = useState(initialSettings.rank_1v1 || "Platinum 2");
  const [rank2v2, setRank2v2] = useState(initialSettings.rank_2v2 || "Diamond 2");
  const [rank3v3, setRank3v3] = useState(initialSettings.rank_3v3 || "Diamond 2");

  const [mmr1v1, setMmr1v1] = useState(720);
  const [mmr2v2, setMmr2v2] = useState(940);
  const [mmr3v3, setMmr3v3] = useState(930);

  const [selectedFocus, setSelectedFocus] = useState<string[]>(
    initialSettings.focus || ["boost", "rotations", "defense"]
  );
  const [coachPersona, setCoachPersona] = useState("Tactical Analyst");

  const toggleFocus = (item: string) => {
    setSelectedFocus((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await onSave({
        player_name: playerName || "Pilot",
        rank_1v1: rank1v1,
        rank_2v2: rank2v2,
        rank_3v3: rank3v3,
        focus: selectedFocus,
      });
      onClose();
    } catch (e) {
      console.error("Failed to complete onboarding:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="onboarding-card">
        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-step-indicator">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`step-pill ${s === step ? "active" : s < step ? "completed" : ""}`}
              >
                {s < step ? <CheckCircle2 size={13} /> : s}
              </div>
            ))}
          </div>
          <button className="icon-btn" onClick={onClose} title="Skip / Close">
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="onboarding-body">
          {/* STEP 1: Identity */}
          {step === 1 && (
            <div className="step-content">
              <div className="step-hero">
                <div className="hero-icon-bubble">
                  <User size={24} color="#38BDF8" />
                </div>
                <h2>Player Identity & Profile</h2>
                <p>Tell AntiRL who you are so the AI coach can calibrate to your role and identity.</p>
              </div>

              <div className="form-group">
                <label className="form-label">In-Game Name / Gamertag</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="e.g. Zen, Squishy, or your Epic ID"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Primary Playstyle / Role</label>
                <div className="role-grid">
                  {[
                    {
                      id: "Aggressive 1st Man",
                      desc: "Pressure, demoing, forcing 50-50s, disruptive offense",
                    },
                    {
                      id: "Rotational 2nd Man",
                      desc: "Passing, cleanup, mid-field support, spacing balance",
                    },
                    {
                      id: "Defensive Anchor (3rd Man)",
                      desc: "Backpost coverage, shadow defense, clearing, patience",
                    },
                    {
                      id: "Mechanical Solo Playmaker",
                      desc: "Air dribbles, flip resets, 1v1 outplays, ceiling plays",
                    },
                  ].map((r) => (
                    <div
                      key={r.id}
                      className={`role-card ${playstyle === r.id ? "selected" : ""}`}
                      onClick={() => setPlaystyle(r.id)}
                    >
                      <div className="role-title">{r.id}</div>
                      <div className="role-desc">{r.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Ranks & MMR */}
          {step === 2 && (
            <div className="step-content">
              <div className="step-hero">
                <div className="hero-icon-bubble">
                  <Shield size={24} color="#F59E0B" />
                </div>
                <h2>Competitive Ranks & MMR</h2>
                <p>Select your approximate rank and MMR per playlist. This calibrates expectations.</p>
              </div>

              {/* 2v2 (Primary Competitive) */}
              <div className="playlist-rank-section">
                <div className="playlist-header">
                  <span className="playlist-name">2v2 Competitive (Doubles)</span>
                  <div className="badge-preview">
                    <RankBadge rank={rank2v2} size={32} showLabel />
                  </div>
                </div>

                <div className="tier-scroller">
                  {RANK_TIERS.map((tier) => (
                    <button
                      key={tier}
                      className={`tier-chip ${rank2v2.startsWith(tier) ? "active" : ""}`}
                      onClick={() => {
                        setRank2v2(`${tier} 2`);
                        setMmr2v2(DEFAULT_MMR[tier]);
                      }}
                    >
                      <RankBadge rank={tier} size={22} />
                      <span>{tier}</span>
                    </button>
                  ))}
                </div>

                <div className="mmr-row">
                  <label>Current Estimated MMR:</label>
                  <input
                    type="number"
                    className="number-input"
                    value={mmr2v2}
                    onChange={(e) => setMmr2v2(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* 3v3 (Standard) */}
              <div className="playlist-rank-section">
                <div className="playlist-header">
                  <span className="playlist-name">3v3 Competitive (Standard)</span>
                  <div className="badge-preview">
                    <RankBadge rank={rank3v3} size={28} showLabel />
                  </div>
                </div>
                <div className="tier-scroller">
                  {RANK_TIERS.map((tier) => (
                    <button
                      key={tier}
                      className={`tier-chip small ${rank3v3.startsWith(tier) ? "active" : ""}`}
                      onClick={() => {
                        setRank3v3(`${tier} 2`);
                        setMmr3v3(DEFAULT_MMR[tier]);
                      }}
                    >
                      <RankBadge rank={tier} size={18} />
                      <span>{tier}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 1v1 (Duel) */}
              <div className="playlist-rank-section">
                <div className="playlist-header">
                  <span className="playlist-name">1v1 Competitive (Duel)</span>
                  <div className="badge-preview">
                    <RankBadge rank={rank1v1} size={28} showLabel />
                  </div>
                </div>
                <div className="tier-scroller">
                  {RANK_TIERS.map((tier) => (
                    <button
                      key={tier}
                      className={`tier-chip small ${rank1v1.startsWith(tier) ? "active" : ""}`}
                      onClick={() => {
                        setRank1v1(`${tier} 2`);
                        setMmr1v1(DEFAULT_MMR[tier] - 150);
                      }}
                    >
                      <RankBadge rank={tier} size={18} />
                      <span>{tier}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Weaknesses & Objectives */}
          {step === 3 && (
            <div className="step-content">
              <div className="step-hero">
                <div className="hero-icon-bubble">
                  <Target size={24} color="#10B981" />
                </div>
                <h2>Focus Areas & Weaknesses</h2>
                <p>Select what you want the AI coach to inspect during every replay.</p>
              </div>

              <div className="focus-grid">
                {[
                  {
                    id: "boost",
                    name: "Boost Management & Small Pads",
                    desc: "Catching zero-boost moments, pad pathing, supersonic waste",
                  },
                  {
                    id: "rotations",
                    name: "Rotations & Backpost Spacing",
                    desc: "Double commitments, over-rotation, staying in play",
                  },
                  {
                    id: "defense",
                    name: "Defensive Goal-Line Coverage",
                    desc: "Exposed net windows, shadow defense timing, corner clears",
                  },
                  {
                    id: "aerials",
                    name: "Fast Aerials & Air Recovery",
                    desc: "Takeoff speed, high-speed landing drift, boost feathering",
                  },
                  {
                    id: "kickoffs",
                    name: "Kickoffs & 50-50 Positioning",
                    desc: "Diagonal flip kickoffs, center-pad conservation, cheats",
                  },
                  {
                    id: "speed",
                    name: "Momentum & Wave Dash Transitions",
                    desc: "Powerslide turns, wall recoveries, maintaining supersonic",
                  },
                ].map((f) => {
                  const active = selectedFocus.includes(f.id);
                  return (
                    <div
                      key={f.id}
                      className={`focus-card ${active ? "active" : ""}`}
                      onClick={() => toggleFocus(f.id)}
                    >
                      <div className="focus-checkbox">
                        {active && <CheckCircle2 size={16} color="#10B981" />}
                      </div>
                      <div className="focus-info">
                        <div className="focus-name">{f.name}</div>
                        <div className="focus-desc">{f.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4: Coach Persona */}
          {step === 4 && (
            <div className="step-content">
              <div className="step-hero">
                <div className="hero-icon-bubble">
                  <Sparkles size={24} color="#A855F7" />
                </div>
                <h2>AI Coach Persona</h2>
                <p>Choose the communication tone for your post-match analysis.</p>
              </div>

              <div className="persona-list">
                {[
                  {
                    title: "Tactical Esports Analyst",
                    badge: "Pro Level",
                    desc: "Objective, direct, frame-by-frame precision. Cites exact seconds and positioning angles without fluff.",
                  },
                  {
                    title: "Constructive Mentor",
                    badge: "Recommended",
                    desc: "Supportive, holistic, and positive. Identifies good habits while gently illustrating rotational fixes.",
                  },
                  {
                    title: "Strict Drill Sergeant",
                    badge: "High Accountability",
                    desc: "Demanding and blunt. Points out every wasted boost point, slow recovery, and open net mistake.",
                  },
                ].map((p) => (
                  <div
                    key={p.title}
                    className={`persona-card ${coachPersona === p.title ? "selected" : ""}`}
                    onClick={() => setCoachPersona(p.title)}
                  >
                    <div className="persona-top">
                      <span className="persona-title">{p.title}</span>
                      <span className="persona-badge">{p.badge}</span>
                    </div>
                    <div className="persona-desc">{p.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="onboarding-footer">
          {step > 1 ? (
            <button className="btn secondary" onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft size={16} /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button className="btn primary" onClick={() => setStep((s) => s + 1)}>
              Next Step <ChevronRight size={16} />
            </button>
          ) : (
            <button className="btn primary glow" onClick={handleFinish} disabled={saving}>
              {saving ? "Calibrating..." : "Complete Setup & Launch Coach"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
