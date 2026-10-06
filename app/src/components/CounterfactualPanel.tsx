import { useEffect, useMemo, useState } from "react";
import { ipc } from "../ipc";
import { errorMessage } from "../errors";
import type { ReplayAnalysis } from "../types";

export type SimStatus = {
  status: string;
  reason?: string;
  path?: string;
  path_source?: string;
  label?: string;
  supported_modes?: string[];
  engine?: string;
  checkpoints?: {
    run_id: string;
    iteration?: number;
    team_size?: number | null;
    observation?: string;
    problems?: string[];
  }[];
};
type Vec3 = [number, number, number];
type Decision = {
  time: number;
  ball: { pos: Vec3 };
  cars: { player_id: string | null; pos: Vec3 }[];
};
type WhatIf = {
  status: string;
  reason?: string;
  reasons?: string[];
  label?: string;
  from_replay_time?: number;
  decisions?: Decision[];
  end?: { reason?: string; goal_by?: unknown; steps?: number };
  policy?: {
    run_id?: string;
    iteration?: number;
    deterministic?: boolean;
    measured_skill?: string;
    claims?: string;
  };
  reconstruction_validation?: {
    status: string;
    max_error_uu: number;
    mean_error_uu: number;
    samples: number;
  };
  assumptions?: string[];
  limitations?: string[];
  uncertainty?: string;
};
type Reconstruction = {
  status: string;
  reasons?: string[];
  reason?: string;
  limitations?: string[];
  frame_time?: number;
};

const W = 8200;
const H = 11000;
const px = (p: Vec3) => `${(p[0] + W / 2).toFixed(0)},${(p[1] + H / 2).toFixed(0)}`;
const line = (pts: Vec3[]) => pts.map(px).join(" ");

/** Overhead plot of actual recorded motion vs simulated motion from the same start state. */
export function TrajectoryPlot({
  replay,
  result,
  playerId,
}: {
  replay: ReplayAnalysis;
  result: WhatIf;
  playerId: string | null;
}) {
  const t0 = result.from_replay_time ?? 0;
  const decisions = result.decisions ?? [];
  const span = decisions.length ? decisions[decisions.length - 1].time : 0;
  const actual = useMemo(() => {
    const frames = (replay.frames ?? []).filter(
      (f) => f.time >= t0 && f.time <= t0 + span + 0.01 && f.live_play !== false,
    );
    return {
      ball: frames.map((f) => f.ball.position as Vec3),
      car: frames
        .map((f) => f.cars.find((c) => c.player_id === playerId)?.position as Vec3 | undefined)
        .filter((p): p is Vec3 => !!p),
      frames,
    };
  }, [replay, t0, span, playerId]);
  const simBall = decisions.map((d) => d.ball.pos);
  const simCar = decisions
    .map((d) => d.cars.find((c) => c.player_id === playerId)?.pos)
    .filter((p): p is Vec3 => !!p);
  const last = decisions[decisions.length - 1];
  let gap: number | null = null;
  if (last && actual.frames.length) {
    const target = t0 + last.time;
    const f = actual.frames.reduce((a, b) =>
      Math.abs(b.time - target) < Math.abs(a.time - target) ? b : a,
    );
    const a = f.ball.position as Vec3;
    gap = Math.hypot(a[0] - last.ball.pos[0], a[1] - last.ball.pos[1], a[2] - last.ball.pos[2]);
  }
  return (
    <figure className="sim-plot">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Overhead plot: recorded and simulated ball and car paths"
      >
        <rect x="0" y="0" width={W} height={H} className="sim-field" />
        <rect x="0" y={H / 2 - 5120} width={W} height="10240" className="sim-lines" />
        <polyline
          points={line(actual.ball)}
          className="sim-actual-ball"
          data-testid="actual-ball"
        />
        <polyline points={line(simBall)} className="sim-sim-ball" data-testid="sim-ball" />
        <polyline points={line(actual.car)} className="sim-actual-car" />
        <polyline points={line(simCar)} className="sim-sim-car" />
        {simBall[0] && (
          <circle
            cx={W / 2 + simBall[0][0]}
            cy={H / 2 + simBall[0][1]}
            r="120"
            className="sim-start"
          />
        )}
      </svg>
      <figcaption>
        Solid lines: what actually happened in the replay (ball, and the selected player's car).
        Dashed lines: one simulated rollout from the same start state, with a trained policy of
        unknown skill controlling every car. Both start at the circle.
        {gap !== null && (
          <>
            {" "}
            Ball position gap at the end of the run: <strong>{Math.round(gap)} uu</strong>.
          </>
        )}
      </figcaption>
    </figure>
  );
}

export default function CounterfactualPanel({
  replay,
  playerId,
  defaultTime,
}: {
  replay: ReplayAnalysis;
  playerId: string | null;
  defaultTime: number;
}) {
  const [sim, setSim] = useState<SimStatus | null>(null);
  const [time, setTime] = useState(String(Math.max(0, Math.round(defaultTime * 10) / 10)));
  const [steps, setSteps] = useState("90");
  const [deterministic, setDeterministic] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [recon, setRecon] = useState<Reconstruction | null>(null);
  const [validation, setValidation] = useState<
    (WhatIf["reconstruction_validation"] & { reason?: string; status: string }) | null
  >(null);
  const [result, setResult] = useState<WhatIf | null>(null);
  const id = replay.summary.id;
  useEffect(() => {
    setTime(String(Math.max(0, Math.round(defaultTime * 10) / 10)));
  }, [defaultTime]);
  useEffect(() => {
    setRecon(null);
    setValidation(null);
    setResult(null);
  }, [id]);

  const loadStatus = async (probe: boolean) => {
    try {
      setSim((await ipc.simStatus(probe)) as unknown as SimStatus);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const t = Number(time);
  const stepsN = Number(steps);
  const inputsOk =
    time.trim() !== "" &&
    Number.isFinite(t) &&
    t >= 0 &&
    Number.isInteger(stepsN) &&
    stepsN >= 1 &&
    stepsN <= 300;
  const mode = replay.summary.mode;
  const modeOk = !!sim?.supported_modes?.includes(mode);
  const ready = sim?.status === "ready";
  const gate = !sim
    ? "Checking the simulator…"
    : !ready
      ? `Simulation unavailable: ${sim.reason ?? "engine not ready"}`
      : !modeOk
        ? `Simulation unavailable for ${mode}: no compatible checkpoint (available: ${(sim.supported_modes ?? []).join(", ") || "none"}).`
        : "";
  const run = async (kind: "recon" | "validate" | "run") => {
    setBusy(kind);
    setError("");
    try {
      if (kind === "recon")
        setRecon((await ipc.simReconstructState(id, t)) as unknown as Reconstruction);
      if (kind === "validate")
        setValidation((await ipc.simValidateBall(id, t)) as unknown as typeof validation);
      if (kind === "run") {
        setResult(null);
        setResult(
          (await ipc.simWhatIf(id, t, {
            steps: stepsN,
            deterministic,
            run: null,
          })) as unknown as WhatIf,
        );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  };
  const refusal = result && result.status !== "ok";
  return (
    <details
      className="detector-panel"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && !sim) void loadStatus(false);
      }}
    >
      <summary>Counterfactual · trained-policy simulation</summary>
      <p className="studio-hint">
        Simulation, not a prediction. A trained RLTRAIN_2 policy (unknown skill, not a model of any
        player) plays on from a state rebuilt from this replay. It is not a higher-ranked player and
        the simulator is not Rocket League. Runs are refused when the replay data cannot support a
        faithful start state.
      </p>
      {gate && (
        <p role="status" className="xg-unavailable">
          {gate}
        </p>
      )}
      <div className="camera-fields">
        <label>
          Start time (s)
          <input
            aria-label="Counterfactual start time"
            type="number"
            min={0}
            step="0.1"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <label>
          Steps (1-300, 15 steps per second)
          <input
            aria-label="Counterfactual steps"
            type="number"
            min={1}
            max={300}
            step={1}
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
          />
        </label>
      </div>
      <label className="sim-check">
        <input
          type="checkbox"
          checked={deterministic}
          onChange={(e) => setDeterministic(e.target.checked)}
        />{" "}
        Deterministic policy (uncheck to sample)
      </label>
      <div className="intelligence-actions">
        <button
          className="btn secondary"
          type="button"
          disabled={!inputsOk || !!busy}
          onClick={() => void run("recon")}
        >
          Check start state
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={!inputsOk || !!busy || !!gate}
          onClick={() => void run("validate")}
        >
          Validate ball physics
        </button>
        <button
          className="btn primary"
          type="button"
          disabled={!inputsOk || !!busy || !!gate}
          onClick={() => void run("run")}
        >
          Run simulation
        </button>
      </div>
      {busy && <p role="status">Working ({busy})…</p>}
      {error && <p role="status">{error}</p>}
      {recon && (
        <div role="region" aria-label="Start state check">
          <p>
            <strong>Start state: {recon.status === "ok" ? "reconstructed" : "refused"}</strong>
            {recon.reason ? ` · ${recon.reason}` : ""}
          </p>
          {recon.reasons && (
            <ul>
              {recon.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {recon.limitations && (
            <ul>
              {recon.limitations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {validation && (
        <p role="status">
          <strong>Ball physics: {validation.status}</strong>
          {validation.reason ? ` · ${validation.reason}` : ""}
          {typeof validation.max_error_uu === "number"
            ? ` · max error ${Math.round(validation.max_error_uu)} uu, mean ${Math.round(validation.mean_error_uu)} uu over ${validation.samples} samples (engineering limits, not calibrated)`
            : ""}
        </p>
      )}
      {refusal && (
        <div role="alert" className="sim-refusal">
          <p>
            <strong>
              {result.status === "refused" ? "Simulation refused" : "Simulation unavailable"}
            </strong>
            {result.reason ? `: ${result.reason}` : ""}
          </p>
          {result.reasons && (
            <ul>
              {result.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <p className="studio-hint">No trajectory is shown because none can be trusted.</p>
        </div>
      )}
      {result && result.status === "ok" && (
        <div role="region" aria-label="Simulation result">
          <p>
            <strong>{result.label}</strong>
          </p>
          <p className="studio-hint" data-testid="sim-rollout-note">
            The dashed path is one rollout of that policy from the reconstructed state. It is not a
            recommendation, not what would have happened, and not a model of what any player would
            do.
          </p>
          <TrajectoryPlot replay={replay} result={result} playerId={playerId} />
          <p>
            Policy {result.policy?.run_id} (iteration {result.policy?.iteration},{" "}
            {result.policy?.deterministic ? "deterministic" : "sampled"}) · measured skill:{" "}
            {result.policy?.measured_skill} · run ended: {result.end?.reason}
          </p>
          {result.reconstruction_validation && (
            <p>
              Ball physics validated on this replay: max{" "}
              {Math.round(result.reconstruction_validation.max_error_uu)} uu, mean{" "}
              {Math.round(result.reconstruction_validation.mean_error_uu)} uu. This says nothing
              about car state or the policy.
            </p>
          )}
          {result.uncertainty && <p className="studio-hint">{result.uncertainty}</p>}
          {[...(result.limitations ?? []), ...(result.assumptions ?? [])].length > 0 && (
            <details>
              <summary>Assumptions and limitations</summary>
              <ul>
                {[...(result.limitations ?? []), ...(result.assumptions ?? [])].map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </details>
  );
}
