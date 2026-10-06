import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Video,
  Eye,
  Compass,
  Tv,
  Layers,
  Sparkles,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { ReplayAnalysis } from "./types";
import CameraSettings from "./components/CameraSettings";
import GhostOverlay, { type GhostReference } from "./components/GhostOverlay";
import type { CameraProfile } from "./bindings";
import { frameIndex, PRO_CAMERA } from "./replayMath";
import ViewerHud from "./components/ViewerHud";
import { mountReplayScene } from "./viewerScene";

export { timeLabel } from "./viewerTime";
import { timeLabel } from "./viewerTime";

interface ReplayViewerProps {
  replay: ReplayAnalysis;
  accountId?: string | null;
  ghost?: GhostReference | null;
  playerId?: string | null;
  /** Requested position; applied whenever seekVersion changes. Playback time itself lives in the viewer. */
  seekTime: number;
  onSelectEvent?: (eventId: string) => void;
  seekVersion?: number;
}

/** Timeline pins are static per replay, so they must not re-render with the 10 Hz playback clock. */
const TimelineMarkers = React.memo(function TimelineMarkers({
  events,
  start,
  end,
  onPick,
}: {
  events: ReplayAnalysis["events"];
  start: number;
  end: number;
  onPick: (eventId: string, time: number) => void;
}) {
  return (
    <div className="timeline-markers-layer">
      {events.map((ev) => {
        const pct = Math.max(
          0,
          Math.min(100, ((ev.time - start) / Math.max(end - start, 1)) * 100),
        );
        const pinClass =
          ev.category === "goal"
            ? "marker-goal"
            : ev.category === "demo"
              ? "marker-demo"
              : ev.severity === "strength"
                ? "marker-strength"
                : "marker-review";
        return (
          <button
            key={ev.id}
            className={`timeline-marker-pin ${pinClass}`}
            style={{ left: `${pct}%` }}
            title={`${timeLabel(ev.time)}: ${ev.title}`}
            aria-label={`${timeLabel(ev.time)}: ${ev.title}`}
            onClick={() => onPick(ev.id, ev.time)}
          />
        );
      })}
    </div>
  );
});

export default function ReplayViewer({
  replay,
  accountId,
  ghost,
  playerId,
  seekTime,
  onSelectEvent,
  seekVersion = 0,
}: ReplayViewerProps) {
  const [time, setTime] = useState(seekTime);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<CameraProfile>({ ...PRO_CAMERA });
  const stateRef = useRef({ playerId, camera: "player", profile });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [camera, setCamera] = useState<"player" | "ball" | "broadcast" | "top" | "free">("player");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [cutaway, setCutaway] = useState(true);
  const cutawayRef = useRef(cutaway);
  cutawayRef.current = cutaway;
  const [quality, setQuality] = useState<"low" | "high">(() =>
    localStorage.getItem("viewer-quality") === "low" ? "low" : "high",
  );
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  useEffect(() => {
    localStorage.setItem("viewer-quality", quality);
  }, [quality]);
  const [expanded, setExpanded] = useState(false);

  stateRef.current = { playerId, camera, profile };

  const start = replay.frames[0]?.time ?? 0;
  const end = replay.frames.at(-1)?.time ?? replay.summary.duration_seconds;

  const clock = useRef(time);
  const previousSeek = useRef(seekVersion);
  const playbackRef = useRef(playing);
  playbackRef.current = playing;
  useEffect(() => {
    if (seekVersion !== previousSeek.current) {
      previousSeek.current = seekVersion;
      clock.current = seekTime;
      setTime(seekTime);
      setPlaying(false);
    }
  }, [seekTime, seekVersion]);

  // The renderer reads clock directly; React state only feeds the HUD and scrubber.
  const publish = (value: number) => {
    clock.current = value;
    setTime(value);
  };
  const seek = (value: number) => {
    setPlaying(false);
    publish(value);
  };
  const pickEventRef = useRef<(id: string, t: number) => void>(() => {});
  pickEventRef.current = (id, t) => {
    seek(Math.max(start, t - 3.0));
    onSelectEvent?.(id);
  };
  const pickEvent = useCallback((id: string, t: number) => pickEventRef.current(id, t), []);

  useEffect(() => {
    const changed = () => setExpanded(document.fullscreenElement === surfaceRef.current);
    document.addEventListener("fullscreenchange", changed);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
    };
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await surfaceRef.current?.requestFullscreen();
    } catch {
      /* Host may disable fullscreen; regular responsive view remains usable. */
    }
  };

  // Animation frame loop for playback
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    let last = performance.now();
    let lastPublish = last;
    if (clock.current >= end) {
      // Restart from the beginning when play is pressed at the end
      clock.current = start;
      publish(start);
    }

    const tick = (now: number) => {
      // Background windows should not consume CPU or advance silently.
      const dt = document.hidden ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      const next = Math.min(end, clock.current + dt * speed);
      clock.current = next;
      // The renderer reads clock directly; React/HUD update at 10 Hz instead of 60+ Hz.
      if (now - lastPublish >= 100 || next >= end) {
        publish(next);
        lastPublish = now;
      }
      if (next >= end) {
        setPlaying(false);
      } else {
        id = requestAnimationFrame(tick);
      }
    };

    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      publish(clock.current);
    };
  }, [playing, speed, end, start]);

  useEffect(
    () =>
      mountReplayScene({
        replay,
        canvasRef,
        clock,
        stateRef,
        cutawayRef,
        qualityRef,
        playbackRef,
        setReady,
        setError,
      }),
    [replay],
  );

  const frameStep = (dir: number) => {
    const index = frameIndex(replay.frames, clock.current);
    const exact = Math.abs((replay.frames[index]?.time ?? 0) - clock.current) < 0.001;
    const next = dir > 0 ? index + 1 : exact ? index - 1 : index;
    seek(replay.frames[Math.max(0, Math.min(replay.frames.length - 1, next))]?.time ?? start);
  };
  const seekRelative = (delta: number) =>
    seek(Math.max(start, Math.min(end, clock.current + delta)));

  return (
    <div ref={surfaceRef} className="studio-main" aria-label="Replay 3D Studio">
      {/* 3D Arena Surface */}
      <div
        className="arena-wrapper"
        tabIndex={0}
        aria-label="Replay arena canvas. Space to toggle play/pause, left/right arrows to step frames, 1-5 for camera views."
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("input,select,textarea,button")) return;
          if (e.key === " ") {
            e.preventDefault();
            setPlaying((p) => !p);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            if (e.shiftKey) seekRelative(-5);
            else frameStep(-1);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            if (e.shiftKey) seekRelative(5);
            else frameStep(1);
          } else if (["1", "2", "3", "4", "5"].includes(e.key)) {
            e.preventDefault();
            setCamera((["player", "ball", "broadcast", "top", "free"] as const)[Number(e.key) - 1]);
          }
        }}
      >
        <canvas ref={canvasRef} className="arena-canvas" />

        <ViewerHud replay={replay} playerId={playerId} time={time} />

        {(!ready || error) && (
          <div className="arena-loading-overlay">
            {!error && <Sparkles size={24} className="spinning" color="#38BDF8" />}
            <span>{error || "Loading replay stadium…"}</span>
          </div>
        )}
      </div>

      <div
        style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}
      >
        <label>
          <input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} />{" "}
          Automatic spectator cutaway
        </label>
        <label>
          Render quality{" "}
          <select
            aria-label="Render quality"
            value={quality}
            onChange={(e) => setQuality(e.target.value as "low" | "high")}
          >
            <option value="high">High</option>
            <option value="low">Low · reduced effects</option>
          </select>
        </label>
        <span>
          Pad glow is decorative; pickup/cooldown state unavailable. Exhaust is inferred from
          observed boost decrease.
        </span>
      </div>
      <CameraSettings accountId={accountId} onChange={setProfile} />
      {ghost && <GhostOverlay replay={replay} playerId={playerId} time={time} reference={ghost} />}
      {/* Timeline & Broadcast Playback Card */}
      <div className="timeline-card">
        {/* Scrubber with Event Pins */}
        <div className="timeline-scrubber-track">
          <input
            type="range"
            className="timeline-slider"
            aria-label="Replay scrub bar"
            min={start}
            max={Math.max(end, start + 0.01)}
            step="any"
            value={Math.max(start, Math.min(time, end))}
            onChange={(e) => {
              setPlaying(false);
              seek(Number(e.target.value));
            }}
          />

          <TimelineMarkers events={replay.events} start={start} end={end} onPick={pickEvent} />
        </div>

        {/* Playback Controls & Camera Selection */}
        <div className="playback-bar">
          <div className="playback-buttons">
            <button
              className="icon-btn"
              aria-label="Restart from beginning"
              title="Restart from beginning"
              onClick={() => {
                setPlaying(false);
                seek(start);
              }}
            >
              <RotateCcw size={15} />
            </button>
            <button
              className="icon-btn"
              aria-label="Previous frame"
              title="Previous frame (Left Arrow)"
              onClick={() => frameStep(-1)}
            >
              <SkipBack size={15} />
            </button>
            <button
              className="icon-btn primary play-pulse"
              aria-label={playing ? "Pause replay" : "Play replay"}
              title={playing ? "Pause (Space)" : "Play (Space)"}
              disabled={!ready || !!error}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              className="icon-btn"
              aria-label="Next frame"
              title="Next frame (Right Arrow)"
              onClick={() => frameStep(1)}
            >
              <SkipForward size={15} />
            </button>

            <span className="time-display-box">
              {timeLabel(time)} <span className="time-duration">/ {timeLabel(end)}</span>
            </span>
          </div>

          {/* Right Controls: Speeds & Cameras */}
          <div className="playback-right-controls">
            {/* Speed Pills */}
            <div className="speed-pills-row">
              {[0.25, 0.5, 1, 1.5, 2].map((s) => (
                <button
                  key={s}
                  className={`speed-pill ${speed === s ? "active" : ""}`}
                  aria-pressed={speed === s}
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="camera-settings-row">
          <span className="control-label">CAMERA</span>
          {/* Camera Switcher Buttons */}
          <div className="camera-btn-group">
            {[
              { id: "player", label: "Chase", icon: Video },
              { id: "ball", label: "Ball Cam", icon: Eye },
              { id: "broadcast", label: "Broadcast", icon: Tv },
              { id: "top", label: "Overhead", icon: Layers },
              { id: "free", label: "Orbit", icon: Compass },
            ].map((c) => {
              const Icon = c.icon;
              const active = camera === c.id;
              return (
                <button
                  key={c.id}
                  className={`camera-toggle-btn ${active ? "active" : ""}`}
                  onClick={() => setCamera(c.id as any)}
                  title={c.label}
                  aria-pressed={active}
                >
                  <Icon size={14} />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
          <button
            className="icon-btn"
            onClick={toggleFullscreen}
            title={expanded ? "Exit fullscreen" : "Fullscreen viewer"}
            aria-label={expanded ? "Exit fullscreen" : "Fullscreen viewer"}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
        <div className="viewer-footnote">
          <span>
            {camera === "player" || camera === "ball"
              ? "Pro preset · zen · 110° / 270 / 100 / −3° / 0.35"
              : camera === "free"
                ? "Drag to orbit · Scroll to zoom"
                : camera === "top"
                  ? "Overhead · full pitch"
                  : "Broadcast · ball tracking"}
          </span>
          <span>Space play · ← → frame · 1–5 camera</span>
        </div>
      </div>
    </div>
  );
}
