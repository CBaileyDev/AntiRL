import React, { useMemo, useState, useEffect } from "react";
import {
  FolderOpen,
  FilePlus,
  Play,
  Trash2,
  Search,
  Clock,
  Loader2,
  ShieldQuestion,
  Bot,
} from "lucide-react";
import { invoke } from "../ipc";
import type { DetectorRecord } from "../components/DetectorPanel";
import type { BotLabel } from "../components/BotLikenessPanel";
import type { ReplaySummary, ImportRecord } from "../types";
import { timeLabel } from "../ReplayViewer";

interface ReplaysProps {
  replays: ReplaySummary[];
  importRecords: ImportRecord[];
  onRetryFailed: () => void;
  importing: boolean;
  importProgress: { current: number; total: number; file: string; status: string } | null;
  onSelectReplay: (id: string) => void;
  onImportFolder: () => void;
  onImportFiles: () => void;
  onDeleteReplay: (id: string, removeSnapshot?: boolean) => void;
}

function teamScores(r: ReplaySummary): [string, string] {
  const b = r.blue_score;
  const o = r.orange_score;
  if (b == null && o == null) return ["-", "-"];
  return [String(b ?? 0), String(o ?? 0)];
}

/** Stored local indices below this are not flagged in the list; the index is an uncalibrated heuristic. */
const BOT_ICON_MIN_INDEX = 80;

export default function Replays({
  replays,
  importRecords,
  onRetryFailed,
  importing,
  importProgress,
  onSelectReplay,
  onImportFolder,
  onImportFiles,
  onDeleteReplay,
}: ReplaysProps) {
  const [detectors, setDetectors] = useState<DetectorRecord[]>([]);
  useEffect(() => {
    let live = true;
    invoke<{ records: DetectorRecord[] }>("detector_reports")
      .then((r) => {
        if (live) setDetectors(r.records ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [replays]);
  const [botLabels, setBotLabels] = useState<BotLabel[]>([]);
  useEffect(() => {
    let live = true;
    invoke<{ labels?: BotLabel[] }>("bot_labels")
      .then((r) => {
        if (live) setBotLabels(r.labels ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [replays]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [removeSnapshot, setRemoveSnapshot] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return replays.filter((r) => {
      const matchesSearch =
        !q ||
        r.replay_name?.toLowerCase().includes(q) ||
        r.file_name?.toLowerCase().includes(q) ||
        r.map_name?.toLowerCase().includes(q) ||
        r.players?.some((p) => p.name?.toLowerCase().includes(q));
      const matchesMode = filterMode === "all" || r.mode === filterMode;
      return matchesSearch && matchesMode;
    });
  }, [replays, search, filterMode]);

  return (
    <div className="content-pane">
      {pendingDelete && (
        <div className="modal-overlay">
          <section
            className="card"
            role="dialog"
            aria-modal="true"
            aria-label="Delete replay"
            style={{ maxWidth: 480 }}
          >
            <h3>Delete this replay?</h3>
            <p>
              It will stay excluded from future automatic imports. Your original replay file remains
              in its source folder.
            </p>
            <label>
              <input
                type="checkbox"
                checked={removeSnapshot}
                onChange={(e) => setRemoveSnapshot(e.target.checked)}
              />{" "}
              Also remove the imported snapshot copy
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                className="btn primary"
                onClick={() => {
                  onDeleteReplay(pendingDelete, removeSnapshot);
                  setPendingDelete(null);
                }}
              >
                Delete replay
              </button>
              <button className="btn secondary" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
      {/* Import Activity Bar */}
      {importing && (
        <div
          className="card"
          style={{
            background: "var(--surface-raised)",
            borderColor: "var(--accent)",
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Loader2 size={18} className="spin" color="var(--accent)" />
              <strong style={{ fontSize: 13.5, color: "var(--text)" }}>
                Decoding Replay Network Frames...
              </strong>
            </div>
            <span
              style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}
            >
              {importProgress
                ? `${importProgress.current} / ${importProgress.total}`
                : "Starting..."}
            </span>
          </div>

          <div
            style={{
              width: "100%",
              height: 6,
              background: "var(--surface)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${
                  importProgress && importProgress.total > 0
                    ? Math.min(100, (importProgress.current / importProgress.total) * 100)
                    : 10
                }%`,
                height: "100%",
                background: "var(--accent)",
                transition: "width 0.2s ease",
              }}
            />
          </div>
          {importProgress?.file && (
            <span style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 6, display: "block" }}>
              Processing: {importProgress.file}
            </span>
          )}
        </div>
      )}

      {importRecords.length > 0 && (
        <details className="card">
          <summary>
            Import results · {importRecords.filter((r) => r.status === "failed").length} failed
          </summary>
          {importRecords.some((r) => r.status === "failed") && (
            <button className="btn secondary" disabled={importing} onClick={onRetryFailed}>
              Retry failed files
            </button>
          )}
          <ul className="import-history">
            {importRecords.map((record) => (
              <li key={record.path}>
                <strong>{record.file_name}</strong>
                <span>
                  {record.status === "already_present" || record.status === "unchanged"
                    ? "Skipped · already present"
                    : record.status === "new"
                      ? "New · imported"
                      : record.status === "deleted"
                        ? "Deleted · excluded from automatic imports"
                        : "Failed"}
                </span>
                {record.error && <span>{record.error}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {/* Toolbar: Search, Filters & Import Actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 260 }}>
          <div
            style={{
              position: "relative",
              flex: 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Search size={16} style={{ position: "absolute", left: 12, color: "var(--faint)" }} />
            <input
              type="text"
              aria-label="Search replays"
              placeholder="Search by match, player, or map name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 12px 8px 36px",
                color: "var(--text)",
                fontSize: 13,
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              background: "var(--surface)",
              borderRadius: "var(--radius-sm)",
              padding: 2,
              border: "1px solid var(--line)",
            }}
          >
            {["all", "1v1", "2v2", "3v3"].map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                aria-pressed={filterMode === mode}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  color: filterMode === mode ? "var(--accent-ink)" : "var(--muted)",
                  background: filterMode === mode ? "var(--accent)" : "transparent",
                  transition: "all 0.15s ease",
                }}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn secondary" onClick={onImportFiles} disabled={importing}>
            <FilePlus size={15} /> Select Files
          </button>
          <button className="btn btn primary" onClick={onImportFolder} disabled={importing}>
            <FolderOpen size={15} /> Import Folder
          </button>
        </div>
      </div>

      {/* Replays Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--muted)" }}>
            <FolderOpen size={40} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
            <h4 style={{ fontSize: 16, color: "var(--text)", marginBottom: 4 }}>
              No Replays Found
            </h4>
            <p style={{ fontSize: 13 }}>
              {replays.length === 0
                ? "Import your Rocket League Demos folder to begin analysis."
                : "No replays match your current search or playlist filter."}
            </p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Match Name & Date</th>
                <th>Mode</th>
                <th>Duration</th>
                <th>Final Score</th>
                <th>Participants</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  style={{ cursor: "pointer" }}
                  tabIndex={0}
                  onClick={() => onSelectReplay(r.id)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onSelectReplay(r.id);
                    }
                  }}
                >
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <strong style={{ fontSize: 13.5, color: "var(--text)" }}>
                        {r.replay_name || r.file_name}{" "}
                        {(() => {
                          const high = botLabels.filter(
                            (l) =>
                              l.replay_id === r.id &&
                              l.index !== null &&
                              l.index >= BOT_ICON_MIN_INDEX,
                          );
                          if (!high.length) return null;
                          const top = Math.max(...high.map((l) => l.index ?? 0));
                          const text = `Local heuristic index ${top} of 100 (uncalibrated, not evidence of cheating)`;
                          return (
                            <span title={text} style={{ fontSize: 11, color: "var(--muted)" }}>
                              <Bot size={14} aria-hidden="true" /> uncalibrated index {top}
                              <span className="sr-only"> . {text}</span>
                            </span>
                          );
                        })()}{" "}
                        {detectors.some((d) => d.replay_id === r.id) && (
                          <span
                            title="User-entered external detector report; unverified"
                            style={{ fontSize: 11, color: "var(--muted)" }}
                          >
                            <ShieldQuestion size={14} aria-hidden="true" /> external report
                            (unverified)
                          </span>
                        )}
                      </strong>
                      <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        {r.played_at || "Recent Match"} {r.map_name ? `· ${r.map_name}` : ""}
                      </span>
                    </div>
                  </td>

                  <td>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: "var(--radius-pill)",
                        background: "var(--surface-raised)",
                        color:
                          r.mode === "1v1"
                            ? "var(--sage)"
                            : r.mode === "2v2"
                              ? "var(--accent)"
                              : "var(--blue-team)",
                        border: "1px solid var(--line-strong)",
                      }}
                    >
                      {r.mode}
                    </span>
                  </td>

                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12.5,
                        color: "var(--muted)",
                      }}
                    >
                      <Clock size={13} />
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {timeLabel(r.duration_seconds)}
                      </span>
                    </div>
                  </td>

                  <td>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 13.5,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <span style={{ color: "var(--blue-team)" }}>{teamScores(r)[0]}</span>
                      {" - "}
                      <span style={{ color: "var(--orange-team)" }}>{teamScores(r)[1]}</span>
                    </span>
                  </td>

                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                        maxWidth: 280,
                      }}
                    >
                      {r.players?.slice(0, 4).map((p) => (
                        <span
                          key={p.id}
                          style={{
                            fontSize: 11,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background:
                              p.team === 0 ? "var(--blue-team-soft)" : "var(--orange-team-soft)",
                            color: p.team === 0 ? "var(--blue-team)" : "var(--orange-team)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p.name}
                        </span>
                      ))}
                      {(r.players?.length ?? 0) > 4 && (
                        <span style={{ fontSize: 10.5, color: "var(--faint)" }}>
                          +{(r.players?.length ?? 0) - 4} more
                        </span>
                      )}
                    </div>
                  </td>

                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <button
                        className="btn btn secondary"
                        style={{ padding: "5px 10px", fontSize: 12 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectReplay(r.id);
                        }}
                      >
                        <Play size={12} /> Studio
                      </button>

                      <button
                        className="icon-btn"
                        style={{ width: 28, height: 28 }}
                        title="Delete Replay from Cache"
                        aria-label="Delete replay from cache"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRemoveSnapshot(true);
                          setPendingDelete(r.id);
                        }}
                      >
                        <Trash2 size={13} color="var(--danger)" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
