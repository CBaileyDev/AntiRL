import { useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import IntelligencePanel from "../src/components/IntelligencePanel";
import CameraSettings from "../src/components/CameraSettings";
import DetectorPanel from "../src/components/DetectorPanel";
import ReferenceComparison from "../src/components/ReferenceComparison";
import GhostOverlay, { type GhostReference } from "../src/components/GhostOverlay";
import type { ReplayAnalysis, CameraProfile } from "../src/bindings";
import "../src/styles.css";
const context = {
  zone: "own third",
  lane: "center",
  boost_bucket: "low (<20)",
  score_state: "tied",
  phase: "overtime",
  position: [0, -3000, 17],
  ball_position: [100, -4000, 100],
};
const rows = ["a", "b"].map((id, i) => ({
  replay_id: id,
  event_id: "goal",
  file_name: `${id}.replay`,
  time: 10 + i,
  title: "Goal conceded",
  kind: "goal conceded",
  review: "unreviewed",
  event_phase: "overtime",
  context,
}));
let camera = { fov: 100, distance: 300, height: 120, angle: -4, stiffness: 0.5 };
let source = "your recorded replay camera";
let records: unknown[] = [];
const replay = {
  summary: { id: "a", mode: "2v2", file_name: "a.replay", file_hash: "abc" },
  players: [
    { id: "steam:1", name: "Me", team: 0, is_bot: false },
    { id: "steam:2", name: "Opponent", team: 1, is_bot: false },
  ],
  frames: [
    {
      time: 7,
      live_play: true,
      cars: [{ player_id: "steam:1", position: [0, -3000, 17] }],
      ball: { position: [100, -4000, 100] },
    },
    {
      time: 11,
      live_play: true,
      cars: [{ player_id: "steam:1", position: [0, -2900, 17] }],
      ball: { position: [100, -4000, 100] },
    },
  ],
  events: [],
  metrics: [],
  coverage: {},
} as unknown as ReplayAnalysis;
const fixture = window as unknown as {
  calls: { command: string; args: Record<string, unknown> }[];
  failSave: boolean;
};
fixture.calls = [];
fixture.failSave = false;
mockIPC((command, args) => {
  const a = (args ?? {}) as Record<string, unknown>;
  fixture.calls.push({ command, args: a });
  if (command === "evidence_tool") {
    if (a.tool === "get_mistake_fingerprints")
      return {
        matches_searched: a.mode === "2v2" ? 30 : 0,
        clusters:
          a.mode === "2v2"
            ? [
                {
                  id: "fingerprint",
                  kind: "goal conceded",
                  context,
                  candidate_count: 2,
                  distinct_matches: 2,
                  confirmed_mistakes: rows.filter((r) => r.review === "mistake").length,
                  confirmed_matches: rows.filter((r) => r.review === "mistake").length,
                  examples: rows,
                  trend: [
                    {
                      week: "2026-W40",
                      candidates: 2,
                      confirmed: rows.filter((r) => r.review === "mistake").length,
                      matches: 2,
                    },
                  ],
                },
              ]
            : [],
        method: "Deterministic context buckets",
      };
    if (a.tool === "search_replay_events")
      return {
        rows: a.mode === "2v2" ? rows : [],
        total: a.mode === "2v2" ? 2 : 0,
        next_cursor: null,
        matches_searched: 30,
        unknown_phase_events: 3,
      };
    if (a.tool === "get_opponent_history")
      return {
        records: [
          {
            player: replay.players[1],
            encounters: 4,
            last_seen: null,
            tracker_url:
              "https://rocketleague.tracker.network/rocket-league/profile/steam/2/overview",
            replays: ["b"],
          },
        ],
      };
  }
  if (command === "review_situation") {
    if (fixture.failSave) throw new Error("Synthetic review save failure");
    rows.find((r) => r.replay_id === a.replayId)!.review = String(a.verdict);
    return null;
  }
  if (command === "drill_from_fingerprint") return { id: "plan" };
  if (command === "camera_profile" || command === "reset_camera_profile") {
    if (command === "reset_camera_profile") source = "your recorded replay camera";
    return { camera, source, detail: "a.replay", player_id: "steam:1" };
  }
  if (command === "save_camera_profile") {
    camera = a.body as CameraProfile;
    source = "your manual camera profile";
    return { camera, source, detail: "Saved locally", player_id: "steam:1" };
  }
  if (command === "detector_reports") return { records };
  if (command === "save_detector_report") {
    records = [
      {
        replay_id: "a",
        player_id: a.playerId,
        report: { ...(a.body as object), provenance: "user-entered, unverified" },
      },
    ];
    return null;
  }
  if (command === "get_replay")
    return { ...replay, summary: { ...replay.summary, id: "b", file_name: "b.replay" } };
  return null;
});
function Harness() {
  const [mode, setMode] = useState("2v2"),
    [opened, setOpened] = useState(""),
    [drills, setDrills] = useState(0),
    [profile, setProfile] = useState<CameraProfile>(camera),
    [ghost, setGhost] = useState<GhostReference | null>(null);
  return (
    <main className="content-pane" style={{ maxWidth: 1100, margin: "auto", padding: 24 }}>
      <button onClick={() => setMode(mode === "2v2" ? "1v1" : "2v2")}>Switch mode</button>
      <button
        onClick={() => {
          fixture.failSave = !fixture.failSave;
        }}
      >
        Toggle review failure
      </button>
      <output aria-label="Opened source">{opened}</output>
      <output aria-label="Drills created">{drills}</output>
      <output aria-label="Applied camera">{profile.fov}</output>
      <IntelligencePanel
        mode={mode}
        playerId="steam:1"
        libraryRevision="fixed"
        onOpenReplay={(id, time) => setOpened(`${id}:${time}`)}
        onPracticeCreated={() => setDrills((n) => n + 1)}
      />
      <CameraSettings accountId="steam:1" onChange={setProfile} />
      <ReferenceComparison
        replay={replay}
        library={[{ ...replay.summary, id: "b", file_name: "b.replay" }]}
        currentAnchor={7}
        onChange={setGhost}
      />
      {ghost && <GhostOverlay replay={replay} playerId="steam:1" time={7} reference={ghost} />}
      <DetectorPanel replay={replay} />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
