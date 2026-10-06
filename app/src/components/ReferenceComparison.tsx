import { useEffect, useState } from "react";
import { ipc } from "../ipc";
import { errorMessage } from "../errors";
import type { ReplayAnalysis, ReplaySummary } from "../types";
import type { GhostReference } from "./GhostOverlay";
export default function ReferenceComparison({
  replay,
  library,
  currentAnchor,
  onChange,
}: {
  replay: ReplayAnalysis;
  library: ReplaySummary[];
  currentAnchor: number;
  onChange: (r: GhostReference | null) => void;
}) {
  const [reference, setReference] = useState<ReplayAnalysis | null>(null),
    [player, setPlayer] = useState(""),
    [anchor, setAnchor] = useState(0),
    [alignedAt, setAlignedAt] = useState(currentAnchor),
    [rank, setRank] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setReference(null);
    setNotice("");
    onChange(null);
  }, [replay.summary.id, onChange]);
  const choose = async (id: string) => {
    onChange(null);
    setReference(null);
    if (!id) return;
    try {
      const r = await ipc.getReplay(id);
      setReference(r);
      setPlayer(r.players[0]?.id ?? "");
      setAnchor(r.frames[0]?.time ?? 0);
      setAlignedAt(currentAnchor);
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };
  const apply = () => {
    if (reference && player)
      onChange({ replay: reference, playerId: player, anchor, currentAnchor: alignedAt, rank });
  };
  return (
    <details className="reference-settings">
      <summary>Compare a reference replay</summary>
      <p className="studio-hint">
        Choose a same-mode reference, its player, and two timing anchors. Record the rank only if
        you know it; AntiRL cannot verify rank from a replay.
      </p>
      <label>
        Reference replay
        <select
          aria-label="Reference ghost replay"
          value={reference?.summary.id ?? ""}
          onChange={(e) => void choose(e.target.value)}
        >
          <option value="">None</option>
          {library
            .filter((r) => r.id !== replay.summary.id && r.mode === replay.summary.mode)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.file_name}
              </option>
            ))}
        </select>
      </label>
      {reference && (
        <>
          <label>
            Reference player
            <select value={player} onChange={(e) => setPlayer(e.target.value)}>
              {reference.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="camera-fields">
            <label>
              Current replay anchor (s)
              <input
                type="number"
                min={replay.frames[0]?.time ?? 0}
                max={replay.frames.at(-1)?.time ?? 0}
                value={Number(alignedAt.toFixed(3))}
                onChange={(e) => setAlignedAt(Number(e.target.value))}
              />
            </label>
            <label>
              Reference anchor (s)
              <input
                type="number"
                min={reference.frames[0]?.time ?? 0}
                max={reference.frames.at(-1)?.time ?? 0}
                value={Number(anchor.toFixed(3))}
                onChange={(e) => setAnchor(Number(e.target.value))}
              />
            </label>
            <label>
              Reference rank (self-reported)
              <input
                value={rank}
                onChange={(e) => setRank(e.target.value)}
                maxLength={80}
                placeholder="Unverified"
              />
            </label>
          </div>
          <div className="intelligence-actions">
            <button
              className="btn primary"
              onClick={apply}
              disabled={
                !Number.isFinite(anchor) ||
                !Number.isFinite(alignedAt) ||
                anchor < (reference.frames[0]?.time ?? 0) ||
                anchor > (reference.frames.at(-1)?.time ?? 0) ||
                alignedAt < (replay.frames[0]?.time ?? 0) ||
                alignedAt > (replay.frames.at(-1)?.time ?? 0)
              }
            >
              Show reference ghost
            </button>
            <button className="btn secondary" onClick={() => onChange(null)}>
              Hide ghost
            </button>
          </div>
        </>
      )}
      <p className="studio-hint">
        Decision xG: unavailable, no validated probability model. RLGym what-if: unavailable, no
        compatible trained policy, simulator adapter, or complete state reconstruction. Recorded
        references remain useful for comparison.
      </p>
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
