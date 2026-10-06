import { useMemo } from "react";
import type { ReplayAnalysis } from "../types";
import { frameIndex, scoreAt } from "../replayMath";
import BoostRing from "./BoostRing";
import { timeLabel } from "../viewerTime";
export default function ViewerHud({
  replay,
  playerId,
  time,
}: {
  replay: ReplayAnalysis;
  playerId?: string | null;
  time: number;
}) {
  const currentFrame = useMemo(
    () => replay.frames[frameIndex(replay.frames, time)],
    [replay.frames, time],
  );
  const scores = useMemo(
    () => scoreAt(replay.events, [replay.summary.blue_score, replay.summary.orange_score], time),
    [replay.events, replay.summary, time],
  );
  const currentCar = currentFrame?.cars.find((c) => c.player_id === playerId);
  const selectedPlayer = replay.players.find((p) => p.id === playerId);

  return (
    <div className="arena-hud">
      <div className="hud-broadcast-scoreboard">
        <div className="score-side blue">
          <span className="team-tag">BLUE</span>
          <span className="score-num">{scores[0] ?? "—"}</span>
        </div>

        <div className="score-clock-box">
          <span className="clock-digits">
            {currentFrame?.match_clock_seconds != null
              ? currentFrame.match_clock_seconds < 0
                ? `+${timeLabel(-currentFrame.match_clock_seconds)}`
                : timeLabel(currentFrame.match_clock_seconds)
              : timeLabel(time)}
          </span>
          <span className="clock-sub">MATCH CLOCK</span>
        </div>

        <div className="score-side orange">
          <span className="score-num">{scores[1] ?? "—"}</span>
          <span className="team-tag">ORANGE</span>
        </div>
      </div>

      {/* Focused Player Telemetry Pill */}
      {selectedPlayer && (
        <div className="hud-telemetry-badge">
          <div className="telemetry-player-info">
            <span className={`team-dot ${selectedPlayer.team === 0 ? "blue" : "orange"}`} />
            <span className="player-label">{selectedPlayer.name}</span>
          </div>
          <BoostRing value={currentCar?.boost} />
        </div>
      )}
    </div>
  );
}
