import React, { useState, useEffect, useMemo } from "react";
import { MessageSquare, Play, ListFilter, Target, ChevronLeft, ChevronRight, Activity } from "lucide-react";
import ReplayViewer, { timeLabel } from "../ReplayViewer";
import { perspectiveEvents } from "../replayMath";
import type { ReplayAnalysis, Settings, Event } from "../types";

interface ReplayStudioProps {
  replay: ReplayAnalysis;
  settings: Settings;
  onNavigateToCoach: (replayId: string, initialPrompt?: string) => void;
}

/** Review questions don't pretend that geometry proves intent or a mistake. */
const reviewPrompt = (event: Event) => {
  if (event.category === "boost") return event.metric_keys.includes("supersonic_boost_seconds")
    ? "Was boost needed for aerial control or maintaining speed? Check the car's position before deciding to release it."
    : "Look for reachable small pads and the next challenge. Was staying in the play worth the low boost?";
  if (event.category === "rotation" || event.category === "coverage") return "Use Overhead to check every teammate and opponent. Could one player stay goal-side without giving away pressure?";
  if (event.category === "goal") return "Watch the three seconds before the goal in Ball Cam, then Overhead. Which touch or positioning decision created the chance?";
  if (event.category === "demo") return "Check the approach and your recovery options. Did the demolition change the available space or cover?";
  return "Watch the lead-in from the player's view, then Overhead. Compare available options before judging the outcome.";
};

export default function ReplayStudio({ replay, settings, onNavigateToCoach }: ReplayStudioProps) {
  const defaultPlayer = replay.players.find(p => p.id === settings.player_id)?.id ??
    replay.summary.recorder_player_id ?? replay.players[0]?.id;
  const [currentTime, setCurrentTime] = useState(replay.frames[0]?.time ?? 0);
  const [activePlayerId, setActivePlayerId] = useState(defaultPlayer);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [seekVersion, setSeekVersion] = useState(0);
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);
  const [allPlayers, setAllPlayers] = useState(false);
  const activePlayer = replay.players.find(p => p.id === activePlayerId);

  useEffect(() => {
    setCurrentTime(replay.frames[0]?.time ?? 0);
    setActivePlayerId(defaultPlayer);
    setSelectedEventId(null);
    setPage(0); setCategory("all");
    setSeekVersion(v => v + 1);
  }, [replay.summary.id]);
  useEffect(() => { setPage(0); setSelectedEventId(null); }, [category, activePlayerId, allPlayers]);

  const relevant = useMemo(() => perspectiveEvents(replay.events, allPlayers ? undefined : activePlayer), [replay.events, activePlayer, allPlayers]);
  const events = useMemo(() => relevant.filter(e => category === "all" || e.category === category), [relevant, category]);
  const priorities = useMemo(() => relevant.filter(e => e.severity === "critical" || e.severity === "review")
    .sort((a, b) => (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1) || a.time - b.time).slice(0, 3), [relevant]);
  const selected = replay.events.find(e => e.id === selectedEventId);
  const metrics = useMemo(() => replay.metrics.filter(m => m.player_id === activePlayerId &&
    ["avg_boost", "low_boost_pct", "supersonic_boost_seconds", "defensive_half_pct"].includes(m.key)), [replay.metrics, activePlayerId]);
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(events.length / pageSize));
  const seekEvent = (event: Event) => {
    setSelectedEventId(event.id);
    setCurrentTime(Math.max(replay.frames[0]?.time ?? 0, event.time - 3));
    setSeekVersion(v => v + 1);
  };
  const askCoach = (event?: Event) => onNavigateToCoach(replay.summary.id, event
    ? `Review event ${event.id} at ${timeLabel(event.time)} (${event.title}) for ${activePlayer?.name ?? "the selected player"} [player_id=${activePlayerId}]. Explain measured evidence, uncertainty, and one actionable alternative. Do not assume the recorder is me.`
    : `Review match ${replay.summary.id} for ${activePlayer?.name ?? "the selected player"} [player_id=${activePlayerId}]. Find useful priorities from recorded metrics and cited events. Separate observations from interpretations.`);

  return (
    <div className="content-pane studio-page">
      <header className="studio-header">
        <div className="studio-match-info">
          <span className="studio-mode">{replay.summary.mode}</span>
          <div><h2>{replay.summary.replay_name || replay.summary.file_name}</h2>
            <p>{replay.summary.map_name || "Standard arena"} · {replay.summary.played_at || "Local replay"} · Final {replay.summary.blue_score ?? "—"}–{replay.summary.orange_score ?? "—"}</p></div>
        </div>
        <div className="studio-header-actions">
          <label>Perspective<select aria-label="Perspective Player" value={activePlayerId ?? ""} onChange={e => setActivePlayerId(e.target.value)}>
            {replay.players.map(p => <option key={p.id} value={p.id}>{p.team === 0 ? "Blue" : "Orange"} · {p.name}</option>)}
          </select></label>
          <button className="btn primary" onClick={() => askCoach()}><MessageSquare size={15} /> Ask Coach</button>
        </div>
      </header>
      <div className="studio-layout">
        <ReplayViewer replay={replay} playerId={activePlayerId} time={currentTime} onTime={setCurrentTime}
          seekVersion={seekVersion} onSelectEvent={setSelectedEventId} />
        <aside className="studio-sidebar" aria-label="Replay review notes">
          <section className="card studio-review-card">
            <div className="studio-section-heading"><Target size={16} /><h3>Review next</h3><span>{priorities.length} moments</span></div>
            <p className="studio-hint">Recorded flags to investigate. Click a moment for a 3-second lead-in.</p>
            <div className="studio-priorities">
              {priorities.map((event, index) => <button key={event.id} className={`studio-priority ${event.id === selectedEventId ? "active" : ""}`} onClick={() => seekEvent(event)}>
                <span className="priority-number">0{index + 1}</span><span><strong>{event.title}</strong><small>{event.category} · {event.confidence} confidence</small></span><time>{timeLabel(event.time)}</time>
              </button>)}
              {!priorities.length && <p className="studio-hint">No review flags were detected for this perspective. You can still review recorded events below.</p>}
            </div>
            {selected && <div className="studio-event-detail">
              <div className="studio-section-heading"><Activity size={14} /><h4>{selected.title}</h4><time>{timeLabel(selected.time)}</time></div>
              <span className="studio-detail-label">RECORDED · {selected.confidence} confidence</span>
              <p>{selected.description}</p>
              <span className="studio-detail-label">CHECK IN THE REPLAY</span>
              <p>{reviewPrompt(selected)}</p>
              <div className="studio-detail-actions"><button className="btn" onClick={() => seekEvent(selected)}><Play size={13} /> Watch lead-in</button><button className="btn" onClick={() => askCoach(selected)}><MessageSquare size={13} /> Explain</button></div>
            </div>}
          </section>
          <section className="card studio-events-card">
            <div className="studio-section-heading"><ListFilter size={16} /><h3>Match events</h3><span>{events.length}</span></div>
            <div className="studio-event-filters">
              <select aria-label="Event category" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="all">All events</option><option value="goal">Goals</option><option value="boost">Boost</option><option value="rotation">Rotation</option><option value="demo">Demolitions</option>
              </select>
              <label><input type="checkbox" checked={allPlayers} onChange={e => setAllPlayers(e.target.checked)} /> All players</label>
            </div>
            <div className="studio-event-list">
              {events.slice(page * pageSize, (page + 1) * pageSize).map(event => <button key={event.id} className={`studio-event-row ${selectedEventId === event.id ? "active" : ""}`} onClick={() => seekEvent(event)}>
                <time>{timeLabel(event.time)}</time><span><strong>{event.title}</strong><small>{event.category}{event.player_id ? ` · ${replay.players.find(p => p.id === event.player_id)?.name ?? "Player"}` : event.team != null ? ` · ${event.team === 0 ? "Blue" : "Orange"} team` : " · Match"}</small></span><Play size={12} />
              </button>)}
              {!events.length && <p className="studio-hint">No recorded events match this filter.</p>}
            </div>
            <div className="studio-pagination"><button className="icon-btn" aria-label="Previous events" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={15} /></button><span>{page + 1} / {pages}</span><button className="icon-btn" aria-label="Next events" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight size={15} /></button></div>
          </section>
          <section className="card studio-metrics-card">
            <div className="studio-section-heading"><Activity size={16} /><h3>Player telemetry</h3></div>
            <dl>{metrics.map(metric => <div key={metric.key} title={`${metric.description} · ${metric.sample_count} samples · ${metric.confidence} confidence`}><dt>{metric.label}</dt><dd>{metric.value == null ? "—" : `${metric.value.toFixed(1)}${metric.unit}`}</dd></div>)}</dl>
            <p className="studio-hint">{replay.coverage.render_frames.toLocaleString()} recorded frames · {replay.coverage.positions ? "Position coverage available" : "Positions unavailable"}. Octane visual proxy; boost pickup timing unavailable.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
