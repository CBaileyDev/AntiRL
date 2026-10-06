import { useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { EvidenceHistory } from "../src/components/EvidenceHistory";
import PracticePanel from "../src/components/PracticePanel";
import type { PracticePlanDto, PracticePlanInput, TrainingSessionDto } from "../src/bindings";
import "../src/styles.css";
const fixture = window as unknown as {
  fixtureCalls: { command: string; args: Record<string, unknown> }[];
  malformed: boolean;
};
fixture.fixtureCalls = [];
fixture.malformed = false;
let plans: PracticePlanDto[] = [];
const sessions: TrainingSessionDto[] = [];
mockIPC((command, args) => {
  const values = args as Record<string, unknown>;
  fixture.fixtureCalls.push({ command, args: values });
  if (command === "get_practice")
    return {
      plans: plans.filter((p) => p.mode === values.mode),
      sessions: sessions.filter((s) =>
        plans.some((p) => p.id === s.plan_id && p.mode === values.mode),
      ),
      transfer: {
        cycles: [],
        metric_options: [],
        match_options: [],
        computed_at: "2026-10-05T12:00:00Z",
        privacy: "Local only",
        window_policy: "Next ten matches",
      },
      source: "self_report",
      forecast: "unavailable",
      reassessment: "synthetic",
    };
  if (command === "save_practice_plan") {
    const input = values.body as PracticePlanInput;
    const plan = {
      id: `plan-${plans.length}`,
      mode: String(values.mode),
      body: { ...input, provenance: "user-authored", prompt_version: "fixture" },
      created_at: "2026-10-05",
    };
    plans.push(plan);
    return plan;
  }
  if (command === "record_training") {
    sessions.push({
      plan_id: String(values.planId),
      body: {
        completed_minutes: Number(values.minutes),
        difficulty: String(values.difficulty),
        notes: String(values.notes),
        provenance: "self_report",
      },
      completed_at: "2026-10-05",
      logged_at: "2026-10-05",
      completion_source: "actual_completion",
    });
    return null;
  }
  if (command === "archive_practice") {
    plans = plans.filter((p) => p.id !== values.id);
    return null;
  }
  if (command === "evidence_tool" && values.tool === "list_matches")
    return {
      matches: [
        {
          summary: {
            id: "synthetic:replay",
            mode: "2v2",
            file_name: "original-name.replay",
            date: "2026-10-05",
          },
        },
      ],
      next_cursor: null,
    };
  if (command === "evidence_tool" && values.tool === "get_match_metrics")
    return {
      rows: fixture.malformed
        ? [{ key: "avg_boost", value: "invalid-number" }]
        : [
            {
              key: "avg_boost",
              label: "Average boost",
              value: 42,
              unit: "boost",
              confidence: "high",
            },
          ],
      coverage: { positions: true, boost: true, touches: false },
    };
  return null;
});
function Harness() {
  const [mode, setMode] = useState("2v2");
  return (
    <main className="content-pane">
      <button
        onClick={() => {
          fixture.malformed = true;
        }}
      >
        Malformed metric response
      </button>
      <button onClick={() => setMode(mode === "2v2" ? "1v1" : "2v2")}>Switch practice mode</button>
      <EvidenceHistory mode={mode} onOpen={() => {}} />
      <PracticePanel mode={mode} playerId="synthetic:p" />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
