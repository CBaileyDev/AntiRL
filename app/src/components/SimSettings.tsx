import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { ipc } from "../ipc";
import { errorMessage } from "../errors";
import type { SimStatus } from "./CounterfactualPanel";

/** Location of the local RLTRAIN_2 checkout used by the counterfactual simulator. */
export default function SimSettings() {
  const [status, setStatus] = useState<SimStatus | null>(null);
  const [path, setPath] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const apply = (s: SimStatus) => {
    setStatus(s);
    if (s.path) setPath((p) => p || s.path!);
  };
  useEffect(() => {
    let live = true;
    ipc
      .simStatus(false)
      .then((s) => live && apply(s as unknown as SimStatus))
      .catch((e) => live && setNotice(errorMessage(e)));
    return () => {
      live = false;
    };
  }, []);
  const save = async () => {
    setBusy(true);
    setNotice("");
    try {
      apply((await ipc.setSimPath(path)) as unknown as SimStatus);
      setNotice("Location saved.");
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const probe = async () => {
    setBusy(true);
    setNotice("");
    try {
      apply((await ipc.simStatus(true)) as unknown as SimStatus);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card">
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FlaskConical size={18} color="var(--accent)" />
          <h3 className="card-title">Counterfactual simulator</h3>
        </div>
      </div>
      <p className="studio-hint">
        Optional. Points AntiRL at your local RLTRAIN_2 folder so Replay Studio can simulate a
        trained policy. AntiRL only reads the newest checkpoint&apos;s configuration and runs the
        local engine; nothing is copied or uploaded.
      </p>
      <label className="sim-path">
        RLTRAIN_2 folder
        <input
          aria-label="RLTRAIN_2 folder"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="C:\path\to\RLTRAIN_2"
        />
      </label>
      <div className="intelligence-actions">
        <button
          className="btn secondary"
          disabled={busy || !path.trim()}
          onClick={() => void save()}
        >
          Validate and save
        </button>
        <button className="btn secondary" disabled={busy} onClick={() => void probe()}>
          Test engine
        </button>
      </div>
      {status && (
        <div role="status" aria-label="Simulator status">
          <p>
            <strong>{status.status === "ready" ? "Ready" : "Unavailable"}</strong>
            {status.reason ? ` · ${status.reason}` : ""}
          </p>
          <p className="studio-hint">
            Location source: {status.path_source ?? "unknown"}
            {status.supported_modes?.length
              ? ` · modes with a compatible checkpoint: ${status.supported_modes.join(", ")}`
              : ""}
          </p>
          {status.checkpoints && status.checkpoints.length > 0 && (
            <ul>
              {status.checkpoints.map((c) => (
                <li key={c.run_id}>
                  {c.run_id} · iteration {c.iteration ?? "?"} · {c.team_size ?? "?"}v
                  {c.team_size ?? "?"} · {c.observation ?? "unknown observation"}
                  {c.problems?.length ? ` · unusable: ${c.problems.join("; ")}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
