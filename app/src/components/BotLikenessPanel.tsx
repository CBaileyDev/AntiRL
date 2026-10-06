import { useCallback, useState } from "react";
import { ipc } from "../ipc";
import { errorMessage } from "../errors";
import type { ReplayAnalysis } from "../types";

type Signal = { name: string; value: number | null; weight: number; explanation: string };
export type BotPlayerResult = {
  player_id: string;
  name?: string;
  status: string;
  reason?: string;
  index: number | null;
  basis?: string;
  signals: Signal[];
  sample_count: number;
  coverage?: Record<string, unknown>;
  timing?: Record<string, unknown>;
  confounders: string[];
  builtin_bot_flag: boolean;
  interpretation?: string;
};
type BotResult = {
  detector_version: string;
  provenance: string;
  calibrated: boolean;
  players: BotPlayerResult[];
};
export type BotLabel = {
  replay_id: string;
  player_id: string;
  confirmed_bot: boolean | null;
  index: number | null;
  detector_version: string;
};
type Calibration = {
  status: string;
  calibrated?: boolean;
  auc?: number;
  note?: string;
  required?: { distinct_players_per_class: number };
  have?: Record<string, number>;
  in_sample?: boolean;
  limitations?: string[];
  in_sample_best_youden_threshold?: {
    threshold: number;
    true_positive_rate: number;
    false_positive_rate: number;
  };
};

const signalLabel = (name: string) => name.replace(/_/g, " ");
const labelValue = (l?: BotLabel) =>
  !l ? "none" : l.confirmed_bot === true ? "bot" : l.confirmed_bot === false ? "human" : "unknown";

/** Local bot-likeness index. Separate from user-entered external detector reports. */
export default function BotLikenessPanel({ replay }: { replay: ReplayAnalysis }) {
  const [result, setResult] = useState<BotResult | null>(null);
  const [labels, setLabels] = useState<BotLabel[]>([]);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const id = replay.summary.id;

  const load = useCallback(async () => {
    setBusy(true);
    setNotice("");
    try {
      const [r, l] = await Promise.all([ipc.botLikeness(id), ipc.botLabels()]);
      const res = r as unknown as BotResult;
      if (!Array.isArray(res.players)) throw new Error("The detector returned no player results.");
      setResult(res);
      setLabels(
        ((l as unknown as { labels?: BotLabel[] }).labels ?? []).filter((x) => x.replay_id === id),
      );
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [id]);

  const setLabel = async (playerId: string, value: string) => {
    const confirmed = value === "bot" ? true : value === "human" ? false : null;
    try {
      await ipc.setBotLabel(id, playerId, confirmed);
      const l = await ipc.botLabels();
      setLabels(
        ((l as unknown as { labels?: BotLabel[] }).labels ?? []).filter((x) => x.replay_id === id),
      );
      setCalibration(null);
      setNotice("Saved locally. Labels are your own confirmations and are not verified.");
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };
  const loadCalibration = async () => {
    try {
      setCalibration((await ipc.botCalibrationReport()) as unknown as Calibration);
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  return (
    <details
      className="detector-panel"
      key={id}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && !result && !busy) void load();
      }}
    >
      <summary>Bot detection · local bot-likeness index</summary>
      <p className="studio-hint">
        A local heuristic over replicated controller inputs, scored 0 to 100. It is{" "}
        <strong>not calibrated</strong>, not a probability that anyone cheated, and not a verdict.
        Keyboard and d-pad players look discrete too. The built-in bot flag and external reports are
        shown separately.
      </p>
      {busy && <p role="status">Analysing controller inputs…</p>}
      {result && (
        <ul className="bot-list">
          {result.players.map((p) => {
            const label = labels.find((l) => l.player_id === p.player_id);
            return (
              <li key={p.player_id}>
                <div>
                  <strong>{p.name || p.player_id}</strong>
                  {p.builtin_bot_flag && <span> · Built-in replay bot flag (separate field)</span>}
                </div>
                {p.status === "ok" && p.index !== null ? (
                  <p>
                    <span className="bot-index" aria-label={`Bot-likeness index for ${p.name}`}>
                      Index {p.index} / 100
                    </span>{" "}
                    · {p.basis} · {p.sample_count} control samples · uncalibrated heuristic
                  </p>
                ) : (
                  <p>
                    <strong>Unavailable.</strong> {p.reason}
                  </p>
                )}
                {p.signals.length > 0 && (
                  <details>
                    <summary>Signals and confounders</summary>
                    <table className="bot-signals">
                      <thead>
                        <tr>
                          <th>Signal</th>
                          <th>Value</th>
                          <th>Weight</th>
                          <th>Meaning</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.signals.map((s) => (
                          <tr key={s.name}>
                            <td>{signalLabel(s.name)}</td>
                            <td>{s.value === null ? "unavailable" : s.value.toFixed(2)}</td>
                            <td>{s.weight}</td>
                            <td>{s.explanation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
                <details>
                  <summary>Confounders and limits ({p.confounders.length})</summary>
                  <ul>
                    {p.confounders.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </details>
                <label>
                  Your label for {p.name || p.player_id}
                  <select
                    aria-label={`Label ${p.name || p.player_id}`}
                    value={labelValue(label)}
                    onChange={(e) => void setLabel(p.player_id, e.target.value)}
                  >
                    <option value="none" disabled>
                      Not recorded
                    </option>
                    <option value="unknown">Unknown (store index only)</option>
                    <option value="bot">I confirmed: bot</option>
                    <option value="human">I confirmed: human</option>
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {result && (
        <p className="studio-hint">
          {result.detector_version} · {result.provenance} · calibrated:{" "}
          {result.calibrated ? "yes" : "no"}. Labels let AntiRL report how the index separates your
          confirmed bots from confirmed humans. They never change the index.
        </p>
      )}
      <div className="intelligence-actions">
        <button className="btn secondary" type="button" onClick={() => void loadCalibration()}>
          Show label calibration report
        </button>
      </div>
      {calibration && (
        <div className="bot-calibration" role="region" aria-label="Calibration report">
          <p>
            <strong>{calibration.status}</strong> · calibrated:{" "}
            {calibration.calibrated ? "yes" : "no"}
          </p>
          {calibration.note && <p>{calibration.note}</p>}
          {calibration.have && (
            <p>
              Labelled replays: {calibration.have.labelled_replays ?? 0} (bot{" "}
              {calibration.have.bot_labelled_replays ?? 0}, human{" "}
              {calibration.have.human_labelled_replays ?? 0}). Distinct players: bot{" "}
              {calibration.have.distinct_bot_players ?? 0}, human{" "}
              {calibration.have.distinct_human_players ?? 0}
              {calibration.required
                ? ` (at least ${calibration.required.distinct_players_per_class} of each are required)`
                : ""}
              .
            </p>
          )}
          {typeof calibration.auc === "number" && (
            <p>
              In-sample AUC on your labels: {calibration.auc.toFixed(2)}. Descriptive only, not
              held-out.
            </p>
          )}
          {calibration.in_sample_best_youden_threshold && (
            <p>
              Threshold with the highest separation on these same labels (in-sample, not a decision
              cutoff): {calibration.in_sample_best_youden_threshold.threshold}
            </p>
          )}
          {calibration.limitations && (
            <ul>
              {calibration.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
