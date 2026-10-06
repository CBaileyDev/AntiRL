import type { Event, Frame, Player } from "./types";

// Source: https://blast.tv/rl/player/0f1c26cc/zen (checked 2026-10-05).
// RL's internal camera controller is proprietary; the response curve is our approximation.
export const PRO_CAMERA = Object.freeze({
  fov: 110,
  distance: 270,
  height: 100,
  angle: -3,
  stiffness: 0.35,
});
export const damping = (rate: number, seconds: number) =>
  1 - Math.exp(-rate * Math.max(0, seconds));

/** Last recorded frame at/before time, O(log n), including the two end boundaries. */
export function frameIndex(frames: Pick<Frame, "time">[], time: number): number {
  let low = 0,
    high = frames.length - 1;
  if (high < 0) return -1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (frames[mid].time <= time) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function perspectiveEvents(events: Event[], player?: Player): Event[] {
  return events.filter(
    (e) =>
      e.category === "goal" ||
      !player ||
      e.player_id === player.id ||
      (!e.player_id && (e.team == null || e.team === player.team)),
  );
}

/** Replays often start mid-score. Work backward from the known final and remaining goals. */
export function scoreAt(
  events: Event[],
  final: [number | null | undefined, number | null | undefined],
  time: number,
) {
  return final.map((score, team) =>
    score == null
      ? null
      : Math.max(
          0,
          score -
            events.filter((e) => e.category === "goal" && e.team === team && e.time > time).length,
        ),
  );
}

export type Point = { x: number; y: number; z: number };
export function chasePose(car: Point, forward: Point, ball?: Point) {
  let dx = ball ? ball.x - car.x : forward.x;
  let dz = ball ? ball.z - car.z : forward.z;
  if (Math.hypot(dx, dz) < 0.001) {
    dx = forward.x;
    dz = forward.z;
  }
  if (Math.hypot(dx, dz) < 0.001) {
    dx = 1;
    dz = 0;
  }
  const length = Math.hypot(dx, dz) || 1;
  dx /= length;
  dz /= length;
  const distance = PRO_CAMERA.distance * 0.01;
  const eye = {
    x: car.x - dx * distance,
    y: Math.max(0.3, car.y + PRO_CAMERA.height * 0.01),
    z: car.z - dz * distance,
  };
  // Keep the eye in the standard arena, with room inside the goal tunnel.
  eye.x = Math.max(-40.5, Math.min(40.5, eye.x));
  const end = Math.abs(eye.x) < 8.5 && eye.y < 6.2 ? 58.8 : 50.7;
  eye.z = Math.max(-end, Math.min(end, eye.z));
  eye.y = Math.min(20.2, eye.y);
  const target = ball
    ? { ...ball }
    : {
        x: eye.x + dx * 20,
        y: eye.y + Math.tan((PRO_CAMERA.angle * Math.PI) / 180) * 20,
        z: eye.z + dz * 20,
      };
  return { eye, target };
}
