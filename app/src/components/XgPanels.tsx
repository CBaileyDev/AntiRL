import { useState } from "react";
import { ipc } from "../ipc";
import { errorMessage } from "../errors";
import type { ReplayAnalysis } from "../types";

type XgShot = {
  time: number;
  player_id: string;
  goal: boolean;
  xg: number | null;
  unavailable_reason?: string | null;
};
type ReplayXg = {
  status: string;
  reason?: string | null;
  model_scope?: string;
  shots?: XgShot[];
  limitations?: string[];
};
type Bin = {
  range: [number, number];
  n: number;
  mean_predicted: number;
  observed_goal_rate: number;
};
type ModelStatus = {
  status: string;
  reason?: string;
  model_version?: string;
  n_shots?: number;
  n_matches?: number;
  heldout?: {
    method: string;
    log_loss: number;
    brier: number;
    base_rate_log_loss: number;
    base_rate_brier: number;
    beats_base_rate: boolean;
    reliability_bins?: Bin[];
  };
  calibration?: string;
  limitations?: string[];
  gate?: Record<string, number>;
};
type PlayerXg = {
  status: string;
  reason?: string;
  shots_scored?: number;
  shots_without_xg?: number;
  goals_on_scored_shots?: number;
  xg_sum?: number;
  goals_minus_xg?: number;
  basis?: string;
  caveat?: string;
};

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function Limits({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="xg-limits" aria-label="xG limitations">
      {items.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

/** Per-shot expected goals for one replay (Replay Studio). */
export function ShotXgPanel({ replay }: { replay: ReplayAnalysis }) {
  const [data, setData] = useState<ReplayXg | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = replay.summary.id;
  const name = (pid: string) => replay.players.find((p) => p.id === pid)?.name ?? pid;
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      setData((await ipc.xgReplayShots(id)) as unknown as ReplayXg);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const shots = data?.shots ?? [];
  return (
    <details
      className="detector-panel"
      key={id}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && !data && !busy) void load();
      }}
    >
      <summary>Shots · expected goals (xG)</summary>
      <p className="studio-hint">
        A per-shot estimate learned from your own imported library with held-out matches. It is not
        a rank-wide probability and not decision-level xG.
      </p>
      {busy && <p role="status">Scoring shots…</p>}
      {error && <p role="status">{error}</p>}
      {data && data.status !== "available" && (
        <p role="status" className="xg-unavailable">
          <strong>xG unavailable.</strong> {data.reason ?? "No reason was reported."} No probability
          is shown.
        </p>
      )}
      {data?.model_scope && <p className="studio-hint">{data.model_scope}</p>}
      {shots.length > 0 && (
        <table className="bot-signals" aria-label="Shots with xG">
          <thead>
            <tr>
              <th>Time</th>
              <th>Shooter</th>
              <th>Outcome</th>
              <th>xG (library model)</th>
            </tr>
          </thead>
          <tbody>
            {shots.map((s, i) => (
              <tr key={`${s.time}-${i}`}>
                <td>{clock(s.time)}</td>
                <td>{name(s.player_id)}</td>
                <td>{s.goal ? "Goal" : "No goal"}</td>
                <td>
                  {s.xg === null || s.xg === undefined
                    ? `unavailable${s.unavailable_reason ? ` (${s.unavailable_reason})` : ""}`
                    : s.xg.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && shots.length === 0 && data.status === "available" && (
        <p className="studio-hint">No replay-reported shots in this match.</p>
      )}
      <Limits items={data?.limitations} />
    </details>
  );
}

/** Library-level model status and the confirmed player's goals vs xG (Progress). */
export function XgProgressCard() {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [player, setPlayer] = useState<PlayerXg | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const [m, p] = await Promise.all([ipc.xgModelStatus(), ipc.xgPlayerSummary()]);
      setStatus(m as unknown as ModelStatus);
      setPlayer(p as unknown as PlayerXg);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const h = status?.heldout;
  return (
    <details
      className="detector-panel"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && !status && !busy) void load();
      }}
    >
      <summary>Expected goals (xG) · library shot model</summary>
      <p className="studio-hint">
        Per-shot xG from replay-reported shots in your own library. Decision xG (value of
        positioning or rotation choices) remains unavailable.
      </p>
      {busy && <p role="status">Evaluating model on held-out matches…</p>}
      {error && <p role="status">{error}</p>}
      {status && (
        <p role="status">
          <strong>{status.status === "available" ? "Model available" : "Model unavailable"}</strong>
          {status.reason ? ` · ${status.reason}` : ""} · {status.n_shots ?? 0} labelled shots from{" "}
          {status.n_matches ?? 0} matches ({status.model_version})
        </p>
      )}
      {h && (
        <p>
          Held-out by match: log-loss {h.log_loss} vs base rate {h.base_rate_log_loss}; Brier{" "}
          {h.brier} vs {h.base_rate_brier}. {h.beats_base_rate ? "Beats" : "Does not beat"} the
          base-rate predictor.
        </p>
      )}
      {h?.reliability_bins && h.reliability_bins.length > 0 && (
        <table className="bot-signals" aria-label="Reliability bins">
          <thead>
            <tr>
              <th>Predicted range</th>
              <th>Shots</th>
              <th>Mean predicted</th>
              <th>Observed goal rate</th>
            </tr>
          </thead>
          <tbody>
            {h.reliability_bins.map((b) => (
              <tr key={b.range[0]}>
                <td>
                  {b.range[0]}–{b.range[1]}
                </td>
                <td>{b.n}</td>
                <td>{b.mean_predicted}</td>
                <td>{b.observed_goal_rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {status?.calibration && <p className="studio-hint">{status.calibration}</p>}
      {player && player.status === "available" && (
        <p>
          Your shots (out-of-fold): {player.goals_on_scored_shots} goals from {player.shots_scored}{" "}
          scored shots; xG sum {player.xg_sum}.{" "}
          <span data-testid="xg-diff">
            Goals minus xG: {player.goals_minus_xg} (small sample, not a finishing-skill measure).
          </span>{" "}
          {player.caveat}
        </p>
      )}
      {player && player.status !== "available" && player.reason && (
        <p className="studio-hint">Your goals vs xG: unavailable. {player.reason}</p>
      )}
      <Limits items={status?.limitations} />
    </details>
  );
}
