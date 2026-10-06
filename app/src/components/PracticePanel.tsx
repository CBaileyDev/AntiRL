import { errorMessage } from "../errors";
import React, { useEffect, useState, useRef } from "react";
import { ipc } from "../ipc";
import { TransferPanel, TransferSetup, utcOffsets, offsetLabel } from "./TransferPanel";
import type { PracticeDataDto } from "../bindings";

const emptyPractice: PracticeDataDto = {
  plans: [],
  sessions: [],
  source: "self_report",
  forecast: "unavailable",
  reassessment: "",
  transfer: {
    cycles: [],
    metric_options: [],
    match_options: [],
    computed_at: new Date().toISOString(),
    privacy: "",
    window_policy: "",
  },
};

function completionIso(local: string, offset: number) {
  const parsed = new Date(`${local}${local.length === 16 ? ":00" : ""}Z`);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Enter a valid practice completion time");
  return new Date(parsed.getTime() - offset * 60000).toISOString();
}
export default function PracticePanel({
  mode,
  playerId,
  onOpenReplay,
  libraryRevision,
}: {
  mode: string;
  playerId?: string | null;
  onOpenReplay?: (id: string) => void;
  libraryRevision?: unknown;
}) {
  const [data, setData] = useState<PracticeDataDto>(emptyPractice);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState({
    title: "",
    drill: "",
    success_criterion: "",
    next_match_cue: "",
    intended_minutes: "",
  });
  const [minutes, setMinutes] = useState<Record<string, string>>({});
  const [difficulty, setDifficulty] = useState<Record<string, string>>({});
  const [completed, setCompleted] = useState<Record<string, string>>({});
  const [completionOffsets, setCompletionOffsets] = useState<Record<string, string>>({});
  const requestRef = useRef(0);
  const scopeRef = useRef("");
  scopeRef.current = `${mode}:${playerId || ""}`;
  const load = async () => {
    const scope = scopeRef.current;
    if (playerId) {
      const request = ++requestRef.current;
      const result = await ipc.getPractice(mode);
      if (scopeRef.current === scope && requestRef.current === request) {
        setData(result);
        setLoading(false);
      }
    }
  };
  useEffect(() => {
    setData(emptyPractice);
    setLoading(!!playerId);
    setNotice("");
  }, [mode, playerId]);
  useEffect(() => {
    let alive = true;
    const request = ++requestRef.current;
    if (playerId)
      ipc
        .getPractice(mode)
        .then((d) => {
          if (alive && requestRef.current === request) setData(d);
        })
        .catch((e) => {
          if (alive && requestRef.current === request) setNotice(errorMessage(e));
        })
        .finally(() => {
          if (alive && requestRef.current === request) setLoading(false);
        });
    return () => {
      alive = false;
    };
  }, [mode, playerId, libraryRevision]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    const scope = scopeRef.current;
    try {
      await fn();
      if (scopeRef.current === scope) {
        await load();
        setNotice("Saved locally");
      }
    } catch (e) {
      if (scopeRef.current === scope) setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card practice-panel">
      <h3>Practice & reassessment · {mode}</h3>
      <p>
        Save one drill and a cue to review in later matches. Completion and difficulty are
        self-reported; they do not predict a promotion date.
      </p>
      {!playerId ? (
        <p>Confirm your account in Settings to keep a personal practice history.</p>
      ) : loading ? (
        <p role="status">Loading practice history...</p>
      ) : (
        <>
          <details>
            <summary>Add a practice plan</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await ipc.savePracticePlan(mode, {
                    ...body,
                    intended_minutes:
                      body.intended_minutes === "" ? null : Number(body.intended_minutes),
                    pack_id: null,
                  });
                  setBody({
                    title: "",
                    drill: "",
                    success_criterion: "",
                    next_match_cue: "",
                    intended_minutes: "",
                  });
                });
              }}
            >
              {(
                [
                  ["title", "Practice priority"],
                  ["drill", "Drill setup"],
                  ["success_criterion", "Success criterion"],
                  ["next_match_cue", "Next-match cue"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    aria-label={label}
                    required
                    maxLength={2000}
                    value={body[key]}
                    onChange={(e) => setBody({ ...body, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label>
                Planned minutes (optional)
                <input
                  aria-label="Planned minutes"
                  type="number"
                  min="1"
                  max="240"
                  value={body.intended_minutes}
                  onChange={(e) => setBody({ ...body, intended_minutes: e.target.value })}
                />
              </label>
              <button className="btn primary" disabled={busy}>
                Save practice plan
              </button>
            </form>
          </details>
          {!data.plans.length && (
            <p>No saved plans yet. Choose a priority from a coaching response or add your own.</p>
          )}
          {data.plans.map((p) => (
            <article key={p.id} className="practice-plan">
              <h4>{p.body.title}</h4>
              <p>{p.body.drill}</p>
              <p>
                <b>Success:</b> {p.body.success_criterion}
              </p>
              <p>
                <b>In your next match:</b> {p.body.next_match_cue}
              </p>
              <small>
                {p.body.intended_minutes != null
                  ? `${p.body.intended_minutes} planned minutes · `
                  : ""}
                User-authored plan
              </small>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() =>
                    ipc.recordTraining(
                      mode,
                      p.id,
                      Number(minutes[p.id]),
                      difficulty[p.id] || "appropriate",
                      "",
                      completed[p.id]
                        ? completionIso(
                            completed[p.id],
                            Number(completionOffsets[p.id] ?? -new Date().getTimezoneOffset()),
                          )
                        : null,
                    ),
                  );
                }}
              >
                <label>
                  Completed minutes
                  <input
                    aria-label={`Completed minutes for ${p.body.title}`}
                    required
                    type="number"
                    min="1"
                    max="240"
                    value={minutes[p.id] || ""}
                    onChange={(e) => setMinutes({ ...minutes, [p.id]: e.target.value })}
                  />
                </label>
                <label>
                  Difficulty
                  <select
                    aria-label={`Difficulty for ${p.body.title}`}
                    value={difficulty[p.id] || "appropriate"}
                    onChange={(e) => setDifficulty({ ...difficulty, [p.id]: e.target.value })}
                  >
                    <option value="easy">Easy</option>
                    <option value="appropriate">Appropriate</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>
                <label>
                  Actual completion time (optional; defaults to now)
                  <input
                    type="datetime-local"
                    aria-label={`Practice completed at for ${p.body.title}`}
                    value={completed[p.id] || ""}
                    onChange={(e) => setCompleted({ ...completed, [p.id]: e.target.value })}
                  />
                </label>
                {completed[p.id] && (
                  <label>
                    Completion time UTC offset
                    <select
                      aria-label={`Completion offset for ${p.body.title}`}
                      value={completionOffsets[p.id] ?? String(-new Date().getTimezoneOffset())}
                      onChange={(e) =>
                        setCompletionOffsets({ ...completionOffsets, [p.id]: e.target.value })
                      }
                    >
                      {utcOffsets.map((n) => (
                        <option key={n} value={n}>
                          {offsetLabel(n)}
                        </option>
                      ))}
                    </select>
                    <small>
                      Use the offset when practice happened, including daylight saving time.
                    </small>
                  </label>
                )}
                <button className="btn secondary" disabled={busy}>
                  Record practice
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => run(() => ipc.archivePractice(mode, p.id))}
                >
                  Archive plan
                </button>
              </form>
              <TransferSetup
                key={`${scopeRef.current}:${p.id}`}
                plan={p}
                mode={mode}
                data={data.transfer}
                busy={busy}
                action={run}
              />
            </article>
          ))}
          <TransferPanel
            key={scopeRef.current}
            data={data.transfer}
            mode={mode}
            busy={busy}
            action={run}
            onOpen={onOpenReplay}
          />
          {data.sessions.length > 0 && (
            <details>
              <summary>Recent practice · {data.sessions.length} recorded sessions</summary>
              <ul>
                {data.sessions.map((s, i) => (
                  <li key={i}>
                    {new Date(s.completed_at).toLocaleDateString()} · {s.body.completed_minutes}{" "}
                    minutes · {s.body.difficulty} · self-reported ·{" "}
                    {s.completion_source === "legacy_logged_time"
                      ? "time logged; completion unknown"
                      : "actual completion time"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
