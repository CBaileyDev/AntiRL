import { useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import PracticePanel from "../src/components/PracticePanel";
import type {
  PracticeDataDto,
  TransferCycleDto,
  TransferMatchDto,
  TransferMetricDto,
} from "../src/bindings";
import dictionary from "../src/data/metrics.json";
import "../src/styles.css";
const fixture = window as unknown as {
  fixtureCalls: { command: string; args: Record<string, unknown> }[];
  failSave: boolean;
};
fixture.fixtureCalls = [];
fixture.failSave = false;
const metrics: TransferMetricDto[] = dictionary.metrics
  .filter((m) => m.key === "avg_boost")
  .map((m) => ({
    ...m,
    version: dictionary.version,
    aggregation: "sum numerator / sum valid seconds",
  }));
const row = (id: string, at: string | null, metric: number | null): TransferMatchDto => ({
  replay_id: id,
  file_name: `${id}.replay`,
  played_at: at,
  comparable_at: at,
  context: { playlist_id: 2 },
  eligibility_note: null,
  revision: "test-source-revision-12345678",
  metric_value: metric,
  metric_note: metric == null ? "measurement_unavailable" : null,
  valid_seconds: metric == null ? null : 100,
});
const after = [
    row("after-one", "2026-01-02T01:00:00Z", 20),
    row("after-missing", "2026-01-02T02:00:00Z", null),
  ],
  manual = row("unclear-date", null, null),
  base = row("before", "2026-01-01T00:00:00Z", 10);
const data: PracticeDataDto = {
  plans: [
    {
      id: "plan",
      mode: "2v2",
      created_at: "2026-01-01T00:00:00Z",
      body: {
        title: "Small pad route",
        drill: "Practice five pad routes",
        success_criterion: "Five controlled routes",
        next_match_cue: "Use small pads on recovery",
        intended_minutes: 5,
        pack_id: null,
        provenance: "user-authored",
        prompt_version: "fixture",
      },
    },
  ],
  sessions: [],
  source: "self_report",
  forecast: "unavailable",
  reassessment: "Review later matches",
  transfer: {
    cycles: [],
    metric_options: metrics,
    match_options: [base, ...after, manual],
    computed_at: "2026-01-02T03:00:00Z",
    privacy: "Transfer check-ins and notes stay local and are excluded from cloud Coach retrieval.",
    window_policy:
      "Closest 10 preceding and earliest 10 following matches; select before checking metric availability. Windows refresh when the replay library changes; saved reflections stay attached to their original replay.",
  },
};
mockIPC((command, args) => {
  const a = args as Record<string, unknown>;
  fixture.fixtureCalls.push({ command, args: a });
  if (command === "get_practice")
    return a.mode === "2v2"
      ? structuredClone(data)
      : {
          ...structuredClone(data),
          plans: [],
          sessions: [],
          transfer: { ...structuredClone(data.transfer), cycles: [] },
        };
  if (command === "start_transfer") {
    data.transfer.cycles.forEach((c) => {
      c.active = false;
    });
    const metric = a.metricKey ? metrics[0] : null;
    const c: TransferCycleDto = {
      id: `cycle-${data.transfer.cycles.length}`,
      plan_id: "plan",
      created_at: "2026-01-02T00:00:00Z",
      active: true,
      anchor_at: null,
      snapshot: {
        cue: "Use small pads on recovery",
        title: "Small pad route",
        metric,
        context: metric ? { playlist_id: 2 } : null,
        replay_offset_minutes: a.replayOffsetMinutes as number | null,
        policy_version: "transfer-1",
        eligible_since: null,
      },
      before: {
        matches: [base],
        selected_count: 1,
        valid_count: 1,
        value: metric ? 10 : null,
        valid_seconds: 100,
        tracked_seconds: 300,
        excluded: {},
        source: "replay_measurement",
        method: "weighted",
      },
      after: {
        matches: after,
        selected_count: 2,
        valid_count: 1,
        value: metric ? 20 : null,
        valid_seconds: 100,
        tracked_seconds: 600,
        excluded: { measurement_unavailable: 1 },
        source: "replay_measurement",
        method: "weighted",
      },
      manual_matches: [manual],
      checkins: [],
      reflection_counts: {},
      excluded: { unclear_chronology: 1 },
      delta: metric ? 10 : null,
    };
    data.transfer.cycles.unshift(c);
    return null;
  }
  if (command === "record_training") {
    data.sessions.push({
      plan_id: "plan",
      completed_at: String(a.completedAt || "2026-01-02T00:00:00Z"),
      logged_at: "2026-01-03T00:00:00Z",
      completion_source: "actual_completion",
      body: {
        completed_minutes: Number(a.minutes),
        difficulty: String(a.difficulty),
        notes: "",
        provenance: "self_report",
      },
    });
    const active = data.transfer.cycles.find((c) => c.active);
    if (active) active.anchor_at = String(a.completedAt || "2026-01-02T00:00:00Z");
    return null;
  }
  if (command === "save_transfer_checkin") {
    if (fixture.failSave) throw new Error("Synthetic save failure; reflection was not saved");
    const c = data.transfer.cycles.find((c) => c.id === a.cycleId)!;
    c.checkins = c.checkins.filter((c) => c.replay_id !== a.replayId);
    c.checkins.push({
      replay_id: String(a.replayId),
      state: String(a.stateValue),
      notes: String(a.notes),
      updated_at: new Date().toISOString(),
      available: true,
      in_window: a.replayId !== manual.replay_id,
      source: "self_report",
    });
    c.reflection_counts = {};
    c.checkins
      .filter((c) => c.in_window)
      .forEach((c1) => {
        c.reflection_counts[c1.state] = (c.reflection_counts[c1.state] || 0) + 1;
      });
    return null;
  }
  return null;
});
function Harness() {
  const [mode, setMode] = useState("2v2"),
    [opened, setOpened] = useState("");
  return (
    <main className="content-pane" style={{ maxWidth: 1040, margin: "auto", padding: 24 }}>
      <button onClick={() => setMode(mode === "2v2" ? "1v1" : "2v2")}>Switch mode</button>
      <button
        onClick={() => {
          fixture.failSave = !fixture.failSave;
        }}
      >
        Toggle save failure
      </button>
      <output aria-label="Opened replay">{opened}</output>
      <PracticePanel key={mode} mode={mode} playerId="p" onOpenReplay={setOpened} />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
