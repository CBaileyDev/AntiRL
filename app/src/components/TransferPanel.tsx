import { useState } from "react";
import { ipc } from "../ipc";
import type {
  PracticePlanDto,
  TransferDataDto,
  TransferCycleDto,
  TransferMatchDto,
  TransferWindowDto,
} from "../bindings";

export const utcOffsets = Array.from({ length: 105 }, (_, i) => -720 + i * 15);
export const offsetLabel = (n: number) =>
  `UTC${n < 0 ? "−" : "+"}${String(Math.floor(Math.abs(n) / 60)).padStart(2, "0")}:${String(Math.abs(n) % 60).padStart(2, "0")}`;
const labels: Record<string, string> = {
  used: "Used the cue",
  missed: "Had a chance but missed it",
  no_opportunity: "No opportunity",
  unsure: "Unsure",
  skipped: "Skipped",
};
type Action = (fn: () => Promise<unknown>) => Promise<void>;
type Common = { mode: string; busy: boolean; action: Action; onOpen?: (id: string) => void };
const value = (v: number | null, unit = "") =>
  v == null
    ? "Unknown"
    : `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`.trim();
const reasons = (counts: Record<string, number>) =>
  Object.entries(counts)
    .map(([k, n]) => `${k.replaceAll("_", " ")}: ${n}`)
    .join(" · ");

export function TransferSetup({
  plan,
  data,
  mode,
  busy,
  action,
}: Common & { plan: PracticePlanDto; data: TransferDataDto }) {
  const [metric, setMetric] = useState("");
  const [reference, setReference] = useState("");
  const [offset, setOffset] = useState("");
  const active = data.cycles.find((c) => c.active && c.plan_id === plan.id);
  const hasHistory = data.cycles.some((c) => c.plan_id === plan.id);
  return (
    <details className="transfer-setup">
      <summary>{active ? "Start a new tracking cycle" : "Track this cue in matches"}</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(() =>
            ipc.startTransfer(
              mode,
              plan.id,
              metric || null,
              metric ? reference : null,
              offset === "" ? null : Number(offset),
            ),
          );
        }}
      >
        <p>
          One cue is actively tracked per mode. Starting a cycle closes the previous active cycle
          and keeps its history.{" "}
          {hasHistory
            ? "A new cycle waits for practice completed after it starts."
            : "This cycle uses the first practice session with a known completion time, or waits for you to record one."}
        </p>
        <label>
          Optional replay measurement
          <select
            aria-label={`Replay measurement for ${plan.body.title}`}
            value={metric}
            onChange={(e) => {
              setMetric(e.target.value);
              setReference("");
            }}
          >
            <option value="">Self-report only</option>
            {data.metric_options.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {metric && (
          <label>
            Reference match context
            <select
              required
              aria-label={`Reference match for ${plan.body.title}`}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            >
              <option value="">Choose a replay</option>
              {data.match_options
                .filter((m) => m.context && !m.eligibility_note)
                .map((m) => (
                  <option key={m.replay_id} value={m.replay_id}>
                    {m.file_name || m.replay_id} · {m.played_at || "date unknown"} ·{" "}
                    {JSON.stringify(m.context)}
                  </option>
                ))}
            </select>
            <small>
              Compare the same playlist, match type and recorded mutators. Unknown context is
              excluded.
            </small>
          </label>
        )}
        <label>
          Replay clock UTC offset, only if known
          <select
            aria-label={`Replay clock offset for ${plan.body.title}`}
            value={offset}
            onChange={(e) => setOffset(e.target.value)}
          >
            <option value="">Unknown — exclude offset-free dates from windows</option>
            {utcOffsets.map((n) => (
              <option key={n} value={n}>
                {offsetLabel(n)}
              </option>
            ))}
          </select>
          <small>
            This recorded assumption applies to offset-free replay headers in this cycle. Include
            daylight saving time; do not combine clocks with different offsets.
          </small>
        </label>
        <button className="btn secondary" disabled={busy || (!!metric && !reference)}>
          {active ? "Start new cycle" : "Start tracking"}
        </button>
      </form>
    </details>
  );
}

function Checkin({
  match,
  cycle,
  mode,
  busy,
  action,
  onOpen,
  manual = false,
}: Common & { match: TransferMatchDto; cycle: TransferCycleDto; manual?: boolean }) {
  const saved = cycle.checkins.find((c) => c.replay_id === match.replay_id);
  const [state, setState] = useState(saved?.state || "");
  const [notes, setNotes] = useState(saved?.notes || "");
  return (
    <article className="transfer-checkin">
      <div className="transfer-match-heading">
        <b>{match.file_name || match.replay_id}</b>
        {onOpen && (
          <button type="button" className="btn secondary" onClick={() => onOpen(match.replay_id)}>
            Open replay
          </button>
        )}
      </div>
      <small>
        {match.played_at || "Date unknown"}
        {manual ? " · Manual reflection; outside automatic windows" : ""}
      </small>
      {cycle.snapshot.metric && !manual && (
        <p>
          Replay measurement: {value(match.metric_value, cycle.snapshot.metric.unit)}
          {match.metric_note ? ` · ${match.metric_note.replaceAll("_", " ")}` : ""}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(() => ipc.saveTransferCheckin(mode, cycle.id, match.replay_id, state, notes));
        }}
      >
        <label>
          Self-reported cue use
          <select
            required
            aria-label={`Cue use for ${match.file_name || match.replay_id}`}
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">Not answered</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Notes (optional, local only)
          <textarea
            aria-label={`Transfer notes for ${match.file_name || match.replay_id}`}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="transfer-actions">
          <button className="btn secondary" disabled={busy || !state}>
            {saved ? "Update check-in" : "Save check-in"}
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              setState("skipped");
              void action(() =>
                ipc.saveTransferCheckin(mode, cycle.id, match.replay_id, "skipped", notes),
              );
            }}
          >
            Skip this match
          </button>
        </div>
        {saved && <small>Saved locally · {labels[saved.state]}</small>}
      </form>
    </article>
  );
}

function WindowSummary({
  title,
  window,
  unit,
}: {
  title: string;
  window: TransferWindowDto;
  unit: string;
}) {
  return (
    <div className="transfer-window">
      <h5>{title}</h5>
      <strong>{value(window.value, unit)}</strong>
      <p>
        {window.valid_count} of {window.selected_count} selected matches have usable measurements.
      </p>
      <small>
        {value(window.valid_seconds, "valid seconds")} ·{" "}
        {window.tracked_seconds == null
          ? "Total measured player time unknown"
          : value(window.tracked_seconds, "measured player seconds")}
      </small>
      {Object.keys(window.excluded).length > 0 && <p>{reasons(window.excluded)}</p>}
    </div>
  );
}

function Cycle({ cycle, ...common }: Common & { cycle: TransferCycleDto }) {
  const metric = cycle.snapshot.metric;
  const pending = cycle.after.matches.filter(
    (m) => !cycle.checkins.some((c) => c.replay_id === m.replay_id),
  ).length;
  const outside = cycle.checkins.filter(
    (c) => !c.in_window && !cycle.manual_matches.some((m) => m.replay_id === c.replay_id),
  );
  return (
    <section className="transfer-cycle">
      <h4>
        {cycle.snapshot.title} · {cycle.active ? "Active tracking" : "Previous cycle"}
      </h4>
      <p>
        <b>Fixed match cue:</b> {cycle.snapshot.cue}
      </p>
      <small>
        {cycle.snapshot.replay_offset_minutes == null
          ? "Offset-free replay dates excluded"
          : `Replay clock assumption: ${offsetLabel(cycle.snapshot.replay_offset_minutes)}`}
      </small>
      {!cycle.anchor_at ? (
        <p>
          Waiting for practice with a known completion time. Legacy logging times do not establish a
          practice boundary.
        </p>
      ) : (
        <>
          <p>
            Practice completed {new Date(cycle.anchor_at).toLocaleString()} ·{" "}
            {cycle.after.selected_count}/10 later matches ·{" "}
            {pending
              ? `${pending} pending check-ins`
              : cycle.after.selected_count
                ? "All selected matches reviewed or skipped"
                : "Waiting for later matches"}
          </p>
          <p>
            <b>Self-reported reflections:</b>{" "}
            {Object.keys(cycle.reflection_counts).length
              ? Object.entries(cycle.reflection_counts)
                  .map(([s, n]) => `${labels[s]}: ${n}`)
                  .join(" · ")
              : "None yet"}
            . Unanswered, skipped, unsure and no opportunity are separate states.
          </p>
          {metric ? (
            <div className="transfer-measurements">
              <h5>Replay measurement · {metric.label}</h5>
              <p>
                {metric.formula} · {metric.version}
              </p>
              <p>{metric.limitations}</p>
              <div className="transfer-windows">
                <WindowSummary title="Before practice" window={cycle.before} unit={metric.unit} />
                <WindowSummary title="After practice" window={cycle.after} unit={metric.unit} />
              </div>
              <p>
                After − before:{" "}
                {value(cycle.delta, metric.unit === "%" ? "percentage points" : metric.unit)}. This
                is an observed difference, not proof of improvement or a practice effect.
              </p>
              <small>{metric.aggregation}</small>
              <details>
                <summary>Included matches and source revisions</summary>
                {[cycle.before, cycle.after].map((w, i) => (
                  <div key={i}>
                    <b>{i === 0 ? "Before" : "After"}</b>
                    <ul>
                      {w.matches.map((m) => (
                        <li key={m.replay_id}>
                          {m.comparable_at} · {m.file_name || m.replay_id} ·{" "}
                          {value(m.metric_value, metric.unit)}{" "}
                          {common.onOpen && (
                            <button
                              className="btn secondary"
                              onClick={() => common.onOpen?.(m.replay_id)}
                            >
                              Open replay
                            </button>
                          )}
                          <small>
                            Replay {m.replay_id} · source {m.revision.slice(0, 12)}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </details>
            </div>
          ) : (
            <p>
              Self-report only. AntiRL does not infer a measurement or detect this cue from its
              wording.
            </p>
          )}
          <p>
            “Used the cue” means you used it at least once during the match. Replay measurements do
            not verify that answer.
          </p>
          {cycle.after.matches.map((m) => (
            <Checkin
              key={`${cycle.id}:${m.replay_id}:${cycle.checkins.find((c) => c.replay_id === m.replay_id)?.updated_at || "new"}`}
              match={m}
              cycle={cycle}
              {...common}
            />
          ))}
          {cycle.manual_matches.length > 0 && (
            <details>
              <summary>
                Manual check-ins · {cycle.manual_matches.length} matches with unclear chronology
              </summary>
              <p>
                These reflections do not establish that the match happened after practice and never
                enter the comparison.
              </p>
              {cycle.manual_matches.map((m) => (
                <Checkin
                  key={`${cycle.id}:${m.replay_id}:${cycle.checkins.find((c) => c.replay_id === m.replay_id)?.updated_at || "new"}`}
                  match={m}
                  cycle={cycle}
                  {...common}
                  manual
                />
              ))}
            </details>
          )}
          {outside.length > 0 && (
            <details>
              <summary>Saved reflections outside the current window · {outside.length}</summary>
              {outside.map((c) => (
                <div key={c.replay_id}>
                  <p>
                    {c.replay_id} · {labels[c.state]} ·{" "}
                    {c.available ? "Outside current window" : "Replay deleted or unavailable"}
                  </p>
                  <p>{c.notes}</p>
                  {c.available && common.onOpen && (
                    <button className="btn secondary" onClick={() => common.onOpen?.(c.replay_id)}>
                      Open replay
                    </button>
                  )}
                </div>
              ))}
            </details>
          )}
          {Object.keys(cycle.excluded).length > 0 && (
            <details>
              <summary>Excluded from automatic windows</summary>
              <p>{reasons(cycle.excluded)}</p>
            </details>
          )}
        </>
      )}
    </section>
  );
}

export function TransferPanel({ data, ...common }: Common & { data: TransferDataDto }) {
  const active = data.cycles.find((c) => c.active);
  return (
    <section className="transfer-panel">
      <h3>Practice transfer</h3>
      <p>{data.privacy}</p>
      <small>{data.window_policy}</small>
      {active ? (
        <Cycle key={active.id} cycle={active} {...common} />
      ) : (
        <p>Choose a saved plan above to start tracking one cue in this mode.</p>
      )}
      {data.cycles.some((c) => !c.active) && (
        <details>
          <summary>Previous tracking cycles</summary>
          {data.cycles
            .filter((c) => !c.active)
            .map((c) => (
              <Cycle key={c.id} cycle={c} {...common} />
            ))}
        </details>
      )}
      <small>
        Windows refreshed {new Date(data.computed_at).toLocaleString()}. No skill score or rank
        forecast.
      </small>
    </section>
  );
}
