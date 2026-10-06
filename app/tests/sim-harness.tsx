import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import BotLikenessPanel from "../src/components/BotLikenessPanel";
import { ShotXgPanel, XgProgressCard } from "../src/components/XgPanels";
import CounterfactualPanel from "../src/components/CounterfactualPanel";
import SimSettings from "../src/components/SimSettings";
import type { ReplayAnalysis } from "../src/bindings";
import "../src/styles.css";

const frames = [0, 1, 2, 3, 4].map((i) => ({
  time: 7 + i,
  live_play: true,
  ball: { position: [i * 200, i * 500, 100] },
  cars: [{ player_id: "steam:1", position: [-500 + i * 100, -2000 + i * 400, 17] }],
}));
const replay = {
  summary: { id: "a", mode: "3v3", file_name: "a.replay", file_hash: "abc" },
  players: [
    { id: "steam:1", name: "Me", team: 0, is_bot: false },
    { id: "steam:2", name: "Opponent", team: 1, is_bot: false },
    { id: "bot:3", name: "Rookie", team: 1, is_bot: true },
  ],
  frames,
  events: [],
  metrics: [],
  coverage: {},
} as unknown as ReplayAnalysis;

const fixture = window as unknown as {
  calls: { command: string; args: Record<string, unknown> }[];
  flags: { xgAvailable: boolean; refuse: boolean; modes: string[] };
};
fixture.calls = [];
fixture.flags = { xgAvailable: false, refuse: false, modes: ["3v3"] };
let labels: unknown[] = [];
const confounders = [
  "Keyboard, d-pad and other digital-input players also produce few distinct steer/throttle values.",
];
const base = { detector_version: "botlike-1", calibrated: false, sample_count: 1500, confounders };
const XG_REASON = "Only 40 labelled shots; at least 150 are required";
const XG_LIMITS = ["Not a population probability and not decision-level xG."];
mockIPC((command, args) => {
  const a = (args ?? {}) as Record<string, unknown>;
  fixture.calls.push({ command, args: a });
  switch (command) {
    case "bot_likeness":
      return {
        replay_id: "a",
        detector_version: "botlike-1",
        calibrated: false,
        provenance: "local heuristic",
        players: [
          {
            ...base,
            player_id: "steam:1",
            name: "Me",
            status: "ok",
            index: 63.5,
            basis: "discreteness only",
            builtin_bot_flag: false,
            signals: [
              {
                name: "steer_value_cardinality",
                value: 0.8,
                weight: 0.3,
                explanation: "Few distinct steer values.",
              },
              {
                name: "action_change_cadence",
                value: null,
                weight: 0.3,
                explanation: "Update spacing too coarse.",
              },
            ],
          },
          {
            ...base,
            player_id: "steam:2",
            name: "Opponent",
            status: "unavailable",
            reason: "Controller input was not captured",
            index: null,
            builtin_bot_flag: false,
            signals: [],
          },
        ],
      };
    case "bot_labels":
      return { labels };
    case "set_bot_label":
      labels = [
        {
          replay_id: a.replayId,
          player_id: a.playerId,
          confirmed_bot: a.confirmedBot,
          index: 63.5,
          detector_version: "botlike-1",
        },
      ];
      return {};
    case "bot_calibration_report":
      return {
        status: "insufficient labels",
        calibrated: false,
        required: { distinct_players_per_class: 10 },
        have: { distinct_bot_players: 0, distinct_human_players: 1 },
        note: "No threshold or accuracy is reported until both classes have enough distinct confirmed players.",
      };
    case "xg_replay_shots":
      return fixture.flags.xgAvailable
        ? {
            status: "available",
            model_scope: "fitted on the other matches in the library (leave this match out)",
            shots: [
              { time: 8, player_id: "steam:1", goal: true, xg: 0.31 },
              {
                time: 9,
                player_id: "steam:2",
                goal: false,
                xg: null,
                unavailable_reason: "no geometry",
              },
            ],
            limitations: XG_LIMITS,
          }
        : {
            status: "unavailable",
            reason: XG_REASON,
            shots: [{ time: 8, player_id: "steam:1", goal: true, xg: null }],
            limitations: XG_LIMITS,
          };
    case "xg_model_status":
      return {
        status: "unavailable",
        reason: XG_REASON,
        model_version: "xg-1",
        n_shots: 40,
        n_matches: 9,
        limitations: ["Small sample."],
      };
    case "xg_player_summary":
      return { status: "unavailable", reason: XG_REASON };
    case "sim_status":
      return {
        status: fixture.flags.modes.length ? "ready" : "unavailable",
        reason: fixture.flags.modes.length ? undefined : "rl-engine was not found",
        path: "C:\\RLTRAIN_2",
        path_source: "default (not configured)",
        supported_modes: fixture.flags.modes,
        checkpoints: [
          {
            run_id: "run-3v3",
            iteration: 5,
            team_size: 3,
            observation: "advanced_v1",
            problems: [],
          },
        ],
      };
    case "set_sim_path":
      return {
        status: "ready",
        path: a.path,
        path_source: "configured",
        supported_modes: ["3v3"],
        checkpoints: [],
      };
    case "sim_reconstruct_state":
      return { status: "ok", limitations: ["Boost pad state is not applied."] };
    case "sim_validate_ball":
      return { status: "validated", max_error_uu: 40, mean_error_uu: 20, samples: 10 };
    case "sim_what_if":
      if (fixture.flags.refuse)
        return {
          status: "refused",
          reasons: [
            "Ball-only reconstruction check failed: max 400 uu, mean 120 uu (limits 150 / 60)",
          ],
          label: "A trained RLTRAIN_2 policy (unknown skill, not a model of any player).",
        };
      return {
        status: "ok",
        label:
          "A trained RLTRAIN_2 policy (unknown skill, not a model of any player). Simulation, not a prediction.",
        from_replay_time: 7,
        policy: { run_id: "run-3v3", iteration: 5, deterministic: true, measured_skill: "none" },
        end: { reason: "step_limit" },
        reconstruction_validation: {
          status: "validated",
          max_error_uu: 40,
          mean_error_uu: 20,
          samples: 10,
        },
        decisions: [0, 1, 2, 3].map((i) => ({
          time: i,
          ball: { pos: [i * 300, i * 400, 100] },
          cars: [{ player_id: "steam:1", pos: [-500 + i * 150, -2000 + i * 300, 17] }],
        })),
        limitations: ["Boost pad state is not applied."],
        assumptions: ["Physics is RocketSim."],
        uncertainty: "Unquantified: no counterfactual uncertainty evaluation exists.",
      };
  }
  return null;
});
createRoot(document.getElementById("root")!).render(
  <main className="content-pane" style={{ maxWidth: 900, margin: "auto", padding: 24 }}>
    <BotLikenessPanel replay={replay} />
    <ShotXgPanel replay={replay} />
    <XgProgressCard />
    <CounterfactualPanel replay={replay} playerId="steam:1" defaultTime={7} />
    <SimSettings />
  </main>,
);
