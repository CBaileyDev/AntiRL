// Synthetic Replay Studio fixture for frame-pacing checks; never loads user files.
import { createRoot } from "react-dom/client";
import ReplayStudio from "../src/pages/ReplayStudio";
import "../src/styles.css";
import type { ReplayAnalysis } from "../src/types";

const players = [0, 1, 2, 3].map(i => ({ id: `p${i}`, name: `Player ${i}`, team: i % 2, is_bot: false }));
const frames = Array.from({ length: 30 * 90 }, (_, f) => {
  const time = f / 30;
  return {
    time, live_play: true, discontinuity: false, match_clock_seconds: 300 - time,
    ball: { position: [Math.sin(time * 0.7) * 3000, Math.cos(time * 0.5) * 4000, 120 + Math.abs(Math.sin(time * 2)) * 800] as [number, number, number], rotation: [0, 0, Math.sin(time), Math.cos(time)] as [number, number, number, number] },
    cars: players.map((p, i) => ({
      player_id: p.id, discontinuity: false, boost: Math.max(0, 100 - ((f + i * 20) % 120)),
      position: [Math.sin(time * 0.6 + i) * 3400, Math.cos(time * 0.45 + i * 1.7) * 4400, 17 + (i % 2) * 300] as [number, number, number],
      rotation: [0, 0, Math.sin(time * 0.6 + i + 0.7), Math.cos(time * 0.6 + i + 0.7)] as [number, number, number, number],
      velocity: [1800, 1200, 0] as [number, number, number],
    })),
  };
});
const replay = {
  summary: { id: "synthetic", file_hash: "", file_name: "synthetic.replay", replay_name: "Synthetic pacing fixture", mode: "2v2", duration_seconds: 90, blue_score: 1, orange_score: 0, players, status: "ok", source_path: "", content_hash: "" },
  players, frames, metrics: [],
  events: [{ id: "g1", time: 30, end_time: 33, category: "goal", team: 0, title: "Goal", description: "", severity: "strength", confidence: "high", metric_keys: [] }],
  coverage: { metadata: true, positions: true, boost: true, goals: true, touches: false, decoded_frames: frames.length, render_frames: frames.length, live_play_seconds: 90, notes: [] },
} as unknown as ReplayAnalysis;
const settings = { player_id: "p0" } as never;
createRoot(document.getElementById("root")!).render(<ReplayStudio replay={replay} settings={settings} onNavigateToCoach={() => {}} />);
