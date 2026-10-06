import { errorMessage } from "../errors";
import { formatStat } from "../formatStat";
import { useEffect, useRef, useState } from "react";
import { invoke } from "../ipc";
import {
  matchPage,
  metricDetail,
  type EvidenceMatch,
  type MetricDetail,
} from "../evidenceResponses";
import { History } from "lucide-react";
import { metricLabel } from "../metricDictionary";

// Every request passes through the backend's explicit identity and mode checks.
export function EvidenceHistory({ mode, onOpen }: { mode: string; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<EvidenceMatch[]>([]),
    [cursor, setCursor] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [detail, setDetail] = useState<MetricDetail | null>(null),
    [status, setStatus] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setRows([]);
    setCursor(0);
    setNext(null);
    setDetail(null);
    setStatus("");
  }, [mode]);
  async function load(offset: number) {
    const request = ++generation.current;
    setStatus("Loading personal evidence…");
    try {
      const response = await invoke<unknown>("evidence_tool", {
        mode,
        tool: "list_matches",
        args: { cursor: offset, limit: 20 },
      });
      if (request !== generation.current) return;
      const r = matchPage(response);
      setRows(r.matches);
      setCursor(offset);
      setNext(r.next_cursor);
      setDetail(null);
      setStatus(
        r.matches.length
          ? "Dates and coverage come from imported records; unknown dates are not treated as recent."
          : "No eligible personal matches in this mode.",
      );
    } catch (e) {
      if (request === generation.current) setStatus(errorMessage(e));
    }
  }
  async function inspect(id: string) {
    const request = ++generation.current;
    setStatus("Loading measured metrics…");
    setDetail(null);
    try {
      const response = await invoke<unknown>("evidence_tool", {
        mode,
        tool: "get_match_metrics",
        args: { replay_id: id },
      });
      if (request === generation.current) {
        setDetail(metricDetail(response));
        setStatus(
          "Measurements are descriptive; heuristic events and tactical interpretations require review.",
        );
      }
    } catch (e) {
      if (request === generation.current) setStatus(errorMessage(e));
    }
  }
  return (
    <details className="coach-drawer">
      <summary>
        <History size={14} /> Browse imported evidence
      </summary>
      <div className="coach-drawer-body">
        <p className="coach-hint">
          Read your deeper history in pages of 20, scoped to the current chat mode and explicit
          player identity.
        </p>
        <div className="coach-drawer-row">
          <button className="btn secondary sm" onClick={() => load(0)}>
            Load personal history
          </button>
          <button
            className="btn secondary sm"
            disabled={!cursor}
            onClick={() => load(Math.max(0, cursor - 20))}
          >
            Previous evidence page
          </button>
          <button
            className="btn secondary sm"
            disabled={next == null}
            onClick={() => next != null && load(next)}
          >
            Next evidence page
          </button>
        </div>
        {status && (
          <p className="coach-hint" role="status">
            {status}
          </p>
        )}
        {rows.map((r) => (
          <div key={r.summary.id} className="coach-evidence-row">
            <div>
              <strong>
                {r.summary.mode} · {r.summary.replay_name || r.summary.file_name || r.summary.id}
              </strong>
              <span className="coach-hint">
                {r.summary.date || r.summary.played_at || "Date unknown"}
              </span>
            </div>
            <div className="coach-evidence-actions">
              <button className="btn secondary sm" onClick={() => inspect(r.summary.id)}>
                Inspect metrics
              </button>
              <button className="btn secondary sm" onClick={() => onOpen(r.summary.id)}>
                Open replay
              </button>
            </div>
          </div>
        ))}
        {detail && (
          <div className="coach-evidence-detail">
            <small className="coach-hint">
              {detail.coverage?.positions
                ? "Position observations available. "
                : "Position coverage unknown. "}
              {detail.coverage?.boost
                ? "Boost observations available. "
                : "Boost coverage unknown. "}
              {detail.coverage?.touches
                ? "Touch events available."
                : "Reliable touch events unavailable."}
            </small>
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Observed value</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {detail.rows.map((m, i) => (
                  <tr key={i}>
                    <td>{metricLabel(m.key, m.label || m.key)}</td>
                    <td>
                      {formatStat(m.value, 1, "Unknown")} {m.unit}
                    </td>
                    <td>{m.confidence || "Unspecified"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <small className="coach-hint">
              No grade, benchmark percentile or promotion estimate is inferred from these values.
            </small>
          </div>
        )}
      </div>
    </details>
  );
}
