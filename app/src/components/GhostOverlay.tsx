import { useEffect, useRef } from "react";
import type { ReplayAnalysis } from "../types";
import { frameIndex } from "../replayMath";
export type GhostReference = {
  replay: ReplayAnalysis;
  playerId: string;
  anchor: number;
  currentAnchor: number;
  rank: string;
};
export default function GhostOverlay({
  replay,
  playerId,
  time,
  reference,
}: {
  replay: ReplayAnalysis;
  playerId?: string | null;
  time: number;
  reference: GhostReference;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ghostTime = time - reference.currentAnchor + reference.anchor;
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 420, 260);
    ctx.fillStyle = "#101c25";
    ctx.fillRect(0, 0, 420, 260);
    ctx.strokeStyle = "#738999";
    ctx.strokeRect(16, 16, 388, 228);
    ctx.beginPath();
    ctx.moveTo(210, 16);
    ctx.lineTo(210, 244);
    ctx.stroke();
    const dot = (x: number, y: number, color: string, ghost = false) => {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(210 + (y / 10240) * 388, 130 - (x / 8192) * 228, ghost ? 7 : 4, 0, Math.PI * 2);
      if (ghost) ctx.stroke();
      else ctx.fill();
    };
    const draw = (
      a: ReplayAnalysis,
      id: string | undefined | null,
      t: number,
      color: string,
      ghost: boolean,
    ) => {
      if (t < (a.frames[0]?.time ?? Infinity) || t > (a.frames.at(-1)?.time ?? -Infinity)) return;
      const f = a.frames[frameIndex(a.frames, t)];
      if (!f || f.discontinuity || t - f.time > 0.3) return;
      const p = a.players.find((p) => p.id === id);
      const flip = p?.team === 1 ? -1 : 1;
      const car = f.cars.find((c) => c.player_id === id && !c.discontinuity);
      if (car) dot(car.position[0] * flip, car.position[1] * flip, color, ghost);
      if (f.ball)
        dot(
          f.ball.position[0] * flip,
          f.ball.position[1] * flip,
          ghost ? "#99efbf" : "#f9d69b",
          ghost,
        );
    };
    draw(replay, playerId, time, "#7dc4ff", false);
    draw(reference.replay, reference.playerId, ghostTime, "#67e6a4", true);
  }, [replay, playerId, time, reference, ghostTime]);
  return (
    <section className="ghost-overlay">
      <div>
        <strong>Reference ghost · recorded positions</strong>
        <p className="studio-hint">
          Solid blue: selected player. Green ring: reference. Pale markers: balls. Both defend left.
          Anchors align manually; unmatched time ranges hide the ghost.
        </p>
        <p className="studio-hint">
          {reference.replay.summary.file_name} · rank: {reference.rank || "Unverified"}{" "}
          (self-reported). {ghostTime.toFixed(1)}s reference time. This comparison is not an optimal
          action or a simulated outcome.
        </p>
      </div>
      <canvas ref={canvas} width={420} height={260} aria-label="Recorded reference ghost overlay" />
    </section>
  );
}
