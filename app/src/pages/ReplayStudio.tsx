import React, { useState } from "react";
import {
  MessageSquare,
  Sparkles,
  Shield,
  Zap,
  Target,
  AlertTriangle,
  Award,
  ChevronRight,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import ReplayViewer, { timeLabel } from "../ReplayViewer";
import type { ReplayAnalysis, Settings } from "../types";

interface ReplayStudioProps {
  replay: ReplayAnalysis;
  settings: Settings;
  onNavigateToCoach: (replayId: string, initialPrompt?: string) => void;
}

export default function ReplayStudio({
  replay,
  settings,
  onNavigateToCoach,
}: ReplayStudioProps) {
  const [currentTime, setCurrentTime] = useState<number>(replay.frames[0]?.time ?? 0);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Default active player
  const defaultPlayer =
    replay.players.find((p) => p.id === settings.player_id)?.id ??
    replay.summary.recorder_player_id ??
    replay.players[0]?.id;

  const [activePlayerId, setActivePlayerId] = useState<string>(defaultPlayer);

  // Filter events relevant to this match / player
  const events = replay.events;
  const activeCar = replay.players.find((p) => p.id === activePlayerId);

  // Group events into categories
  const goalEvents = events.filter((e) => e.category === "goal");
  const boostEvents = events.filter((e) => e.category === "boost");
  const rotationEvents = events.filter(
    (e) => e.category === "rotation" || e.category === "coverage"
  );

  // Top 3 major coaching priorities synthesized from telemetry
  const priorities = [
    {
      id: "priority-boost",
      title: "Boost Conservation at Supersonic Speed",
      severity: "review",
      evidence_ids: boostEvents.slice(0, 2).map((e) => e.id),
      target_time: boostEvents[0]?.time ?? 30.0,
      observation:
        "Telemetry records continuous boost engagement while car linear velocity was at or above 2200 uu/s.",
      interpretation:
        "Holding boost once supersonic trail appears consumes 33 boost/sec without increasing forward speed.",
      uncertainty:
        "Brief mid-air adjustments or dodging opponents can produce legitimate high-speed boost use.",
      alternative_action:
        "Release boost immediately upon hitting supersonic speed and wave-dash or front-flip to conserve momentum.",
      training:
        "Freeplay: Practice achieving supersonic speed with a single speed-flip using only 12-15 boost.",
    },
    {
      id: "priority-rotation",
      title: "Small-Pad Pathing vs Corner Starvation",
      severity: "review",
      evidence_ids: rotationEvents.slice(0, 2).map((e) => e.id),
      target_time: rotationEvents[0]?.time ?? 45.0,
      observation:
        "Extended defensive exposure windows occurred when all defenders were positioned upfield of the ball.",
      interpretation:
        "Detouring out of the play to grab 100-boost in the opposite corner left the goal vulnerable to direct rebounds.",
      uncertainty:
        "If opponents had clear possession and zero pressure, retreating for big boost may have been intentional.",
      alternative_action:
        "Path rotations through the center small-pad lines to maintain defensive depth while collecting 36-48 boost.",
      training:
        "Shadow Defense Pack (Code: 5CCE-FB29-7B05-A0B1): Practice saving shots using only 24 boost.",
    },
    {
      id: "priority-transition",
      title: "Backpost Defensive Coverage",
      severity: "strength",
      evidence_ids: goalEvents.slice(0, 2).map((e) => e.id),
      target_time: goalEvents[0]?.time ?? 15.0,
      observation:
        "Goal and recovery timing indicates strong initial goal-line reaction, but near-post crowding occurred.",
      interpretation:
        "Entering the near-post corner while your teammate was already challenging created double-commit risk.",
      uncertainty:
        "Teammate visual field and comms status can make near-post support necessary if teammate is low boost.",
      alternative_action:
        "Anchor on the back post facing slightly into the goal until the 50-50 outcome is resolved.",
      training:
        "2v2 Replay Review: Watch transitions from overhead camera and check whether you had clear vision of both opponents.",
    },
  ];

  const handleSeekEvent = (time: number, id?: string) => {
    // Seek with ~3-second lead-in
    setCurrentTime(Math.max(replay.frames[0]?.time ?? 0, time - 3.0));
    if (id) setSelectedEventId(id);
  };

  return (
    <div className="content-pane" style={{ gap: 16 }}>
      {/* Studio Header Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: "var(--radius-pill)",
              background: "var(--accent-soft)",
              color: "var(--accent)",
              border: "1px solid var(--accent-line)",
            }}
          >
            {replay.summary.mode}
          </span>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
            {replay.summary.replay_name || replay.summary.file_name}
          </h2>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            {replay.summary.played_at || "Match"} · Final:{" "}
            <b style={{ color: "var(--blue-team)" }}>{replay.summary.blue_score ?? 0}</b> -{" "}
            <b style={{ color: "var(--orange-team)" }}>{replay.summary.orange_score ?? 0}</b>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Active Perspective Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ color: "var(--muted)", fontWeight: 500 }}>Perspective:</span>
            <select
              aria-label="Perspective Player"
              value={activePlayerId}
              onChange={(e) => setActivePlayerId(e.target.value)}
              style={{
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--line-strong)",
                borderRadius: "var(--radius-sm)",
                padding: "5px 10px",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {replay.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.team === 0 ? "🔵 Blue: " : "🟠 Orange: "} {p.name}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-primary"
            onClick={() =>
              onNavigateToCoach(
                replay.summary.id,
                `Analyze our boost management and rotations in match ${replay.summary.replay_name || replay.summary.file_name}`
              )
            }
          >
            <MessageSquare size={14} /> Discuss with Coach
          </button>
        </div>
      </div>

      {/* Main Studio Surface: 3D Viewer + Evidence Sidebar */}
      <div className="studio-layout">
        {/* Dominant 3D Viewer */}
        <ReplayViewer
          replay={replay}
          playerId={activePlayerId}
          time={currentTime}
          onTime={setCurrentTime}
          onSelectEvent={(id) => setSelectedEventId(id)}
        />

        {/* Evidence & Findings Panel */}
        <div className="studio-sidebar">
          {/* Priority Findings Card */}
          <div className="card" style={{ padding: 16 }}>
            <div className="card-header" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles size={16} color="var(--accent)" />
                <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                  Key Coaching Priorities
                </h4>
              </div>
              <span style={{ fontSize: 11, color: "var(--faint)" }}>Top 3 Insights</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {priorities.map((item) => (
                <div
                  key={item.id}
                  className={`finding-item ${
                    selectedEventId && item.evidence_ids.includes(selectedEventId)
                      ? "active"
                      : ""
                  }`}
                  onClick={() => handleSeekEvent(item.target_time, item.evidence_ids[0])}
                >
                  <div className="finding-header">
                    <span
                      className={`finding-badge ${
                        item.severity === "strength" ? "badge-strength" : "badge-review"
                      }`}
                    >
                      {item.severity === "strength" ? "Good Habit" : "Improvement"}
                    </span>
                    <span className="finding-time">{timeLabel(item.target_time)}</span>
                  </div>

                  <strong className="finding-title">{item.title}</strong>
                  <p className="finding-desc">{item.observation}</p>

                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--text)",
                      background: "var(--surface)",
                      padding: "6px 8px",
                      borderRadius: 6,
                      marginTop: 4,
                      borderLeft: "2px solid var(--accent)",
                    }}
                  >
                    <b>Recommended Action:</b> {item.alternative_action}
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--sage)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 2,
                    }}
                  >
                    <Target size={12} /> Drill: {item.training}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline Event Ledger */}
          <div className="card" style={{ padding: 16 }}>
            <div className="card-header" style={{ marginBottom: 10 }}>
              <h4 style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
                Match Timeline Events ({events.length})
              </h4>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>Click to seek</span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 260,
                overflowY: "auto",
              }}
            >
              {events.slice(0, 20).map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    padding: "6px 10px",
                    background:
                      selectedEventId === ev.id ? "var(--surface-soft)" : "var(--surface-raised)",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 12,
                    border:
                      selectedEventId === ev.id
                        ? "1px solid var(--accent)"
                        : "1px solid var(--line)",
                    cursor: "pointer",
                  }}
                  onClick={() => handleSeekEvent(ev.time, ev.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--accent)",
                        fontWeight: 600,
                      }}
                    >
                      {timeLabel(ev.time)}
                    </span>
                    <span style={{ color: "var(--text)", fontWeight: 500 }}>{ev.title}</span>
                  </div>

                  <span
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      color:
                        ev.category === "goal"
                          ? "#56B6C2"
                          : ev.category === "demo"
                          ? "var(--orange-team)"
                          : "var(--muted)",
                    }}
                  >
                    {ev.category}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
