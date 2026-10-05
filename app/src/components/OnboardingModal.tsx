import React, { useEffect, useState } from "react";
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

import RankSelect from "./RankSelect";
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
  const [playstyle, setPlaystyle] = useState(initialSettings.playstyle || "Rotational 2nd Man");
  const [rank1v1, setRank1v1] = useState(initialSettings.rank_1v1 || "");
  const [rank2v2, setRank2v2] = useState(initialSettings.rank_2v2 || "");
  const [rank3v3, setRank3v3] = useState(initialSettings.rank_3v3 || "");

  const [profiles,setProfiles]=useState(initialSettings.mode_profiles || {});
  const updateProfile=(mode:string,key:string,value:string)=>setProfiles(prev=>({...prev,[mode]:{...prev[mode],[key]:key.endsWith("hours") ? value==="" ? null : Math.min(168,Math.max(0,Number(value))) : value || null}}));
  const [selectedFocus, setSelectedFocus] = useState<string[]>(
    initialSettings.focus || ["boost", "rotations", "defense"]
  );
  const [coachPersona, setCoachPersona] = useState(initialSettings.coach_persona || "Constructive Mentor");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleFocus = (item: string) => {
    setSelectedFocus((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await onSave({
        player_name: playerName || null,
        rank_1v1: rank1v1 || null,
        rank_2v2: rank2v2 || null,
        rank_3v3: rank3v3 || null,
        mode_profiles: {...profiles,"1v1":{...profiles["1v1"],current_rank:rank1v1||null},"2v2":{...profiles["2v2"],current_rank:rank2v2||null},"3v3":{...profiles["3v3"],current_rank:rank3v3||null}},
        focus: selectedFocus,
        playstyle,
        coach_persona: coachPersona,
      });
      onClose();
    } catch (e) {
      console.error("Failed to complete onboarding:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Player setup">
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
          <button className="icon-btn" onClick={onClose} title="Skip / Close" aria-label="Close">
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
                    <div role="button" tabIndex={0}
                      key={r.id}
                      className={`role-card ${playstyle === r.id ? "selected" : ""}`}
                      onClick={() => setPlaystyle(r.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
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
                <h2>Ranks, goals & available time</h2>
                <p>Set current and target ranks per mode; you can skip and edit these later.</p>
              </div>

              <p>Optional, self-reported. Leave unknown fields blank. Time helps make a feasible practice plan; it does not predict promotion.</p>
              {["1v1","2v2","3v3"].map(mode=><div className="playlist-rank-section" key={mode}>
                <h3>{mode}</h3>
                <label>Current rank<RankSelect allowUnranked value={mode==="1v1"?rank1v1:mode==="2v2"?rank2v2:rank3v3} onChange={mode==="1v1"?setRank1v1:mode==="2v2"?setRank2v2:setRank3v3} ariaLabel={`${mode} current rank`}/></label>
                <label>Target rank<RankSelect allowUnranked value={profiles[mode]?.target_rank || ""} onChange={value=>updateProfile(mode,"target_rank",value)} ariaLabel={`${mode} target rank`}/></label>
                <label>Longer-term target<RankSelect allowUnranked value={profiles[mode]?.long_term_rank || ""} onChange={value=>updateProfile(mode,"long_term_rank",value)} ariaLabel={`${mode} longer-term target`}/></label>
                <label>Practice hours/week (optional)<input className="number-input" type="number" min="0" max="168" step="0.5" value={profiles[mode]?.practice_hours ?? ""} onChange={e=>updateProfile(mode,"practice_hours",e.target.value)}/></label>
                <label>Match hours/week (optional)<input className="number-input" type="number" min="0" max="168" step="0.5" value={profiles[mode]?.match_hours ?? ""} onChange={e=>updateProfile(mode,"match_hours",e.target.value)}/></label>
              </div>)}
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
                    desc: "Catching zero-boost moments, pad pathing, boost-active windows",
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
                    <div role="button" tabIndex={0}
                      key={f.id}
                      className={`focus-card ${active ? "active" : ""}`}
                      onClick={() => toggleFocus(f.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
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
                  <div role="button" tabIndex={0}
                    key={p.title}
                    className={`persona-card ${coachPersona === p.title ? "selected" : ""}`}
                    onClick={() => setCoachPersona(p.title)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
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
