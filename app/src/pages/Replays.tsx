import React, { useState } from "react";
import {
  FolderOpen,
  FilePlus,
  Play,
  Trash2,
  Search,
  Filter,
  Users,
  Clock,
  Sparkles,
  Loader2,
} from "lucide-react";
import type { ReplaySummary } from "../types";
import { timeLabel } from "../ReplayViewer";

interface ReplaysProps {
  replays: ReplaySummary[];
  importing: boolean;
  importProgress: { current: number; total: number; file: string; status: string } | null;
  onSelectReplay: (id: string) => void;
  onImportFolder: () => void;
  onImportFiles: () => void;
  onDeleteReplay: (id: string) => void;
}

export default function Replays({
  replays,
  importing,
  importProgress,
  onSelectReplay,
  onImportFolder,
  onImportFiles,
  onDeleteReplay,
}: ReplaysProps) {
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<string>("all");

  const filtered = replays.filter((r) => {
    const matchesSearch =
      r.replay_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.file_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.map_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.players?.some((p) => p.name.toLowerCase().includes(search.toLowerCase()));

    const matchesMode = filterMode === "all" || r.mode === filterMode;
    return matchesSearch && matchesMode;
  });

  return (
    <div className="content-pane">
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Loader2 size={18} className="spin" color="var(--accent)" />
              <strong style={{ fontSize: 13.5, color: "var(--text)" }}>
                Decoding Replay Network Frames...
              </strong>
            </div>
            <span style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
              {importProgress ? `${importProgress.current} / ${importProgress.total}` : "Starting..."}
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
                    ? (importProgress.current / importProgress.total) * 100
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
            <Search
              size={16}
              style={{ position: "absolute", left: 12, color: "var(--faint)" }}
            />
            <input
              type="text"
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

          <div style={{ display: "flex", background: "var(--surface)", borderRadius: "var(--radius-sm)", padding: 2, border: "1px solid var(--line)" }}>
            {["all", "1v1", "2v2", "3v3"].map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
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
          <button className="btn btn-secondary" onClick={onImportFiles} disabled={importing}>
            <FilePlus size={15} /> Select Files
          </button>
          <button className="btn btn-primary" onClick={onImportFolder} disabled={importing}>
            <FolderOpen size={15} /> Import Folder
          </button>
        </div>
      </div>

      {/* Replays Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--muted)" }}>
            <FolderOpen size={40} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
            <h4 style={{ fontSize: 16, color: "var(--text)", marginBottom: 4 }}>No Replays Found</h4>
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
                  onClick={() => onSelectReplay(r.id)}
                >
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <strong style={{ fontSize: 13.5, color: "var(--text)" }}>
                        {r.replay_name || r.file_name}
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
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
                      <Clock size={13} />
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {timeLabel(r.duration_seconds)}
                      </span>
                    </div>
                  </td>

                  <td>
                    <span style={{ fontWeight: 700, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: "var(--blue-team)" }}>{r.blue_score ?? "?"}</span>
                      {" - "}
                      <span style={{ color: "var(--orange-team)" }}>{r.orange_score ?? "?"}</span>
                    </span>
                  </td>

                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", maxWidth: 280 }}>
                      {r.players?.slice(0, 4).map((p) => (
                        <span
                          key={p.id}
                          style={{
                            fontSize: 11,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: p.team === 0 ? "var(--blue-team-soft)" : "var(--orange-team-soft)",
                            color: p.team === 0 ? "var(--blue-team)" : "var(--orange-team)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p.name}
                        </span>
                      ))}
                      {(r.players?.length ?? 0) > 4 && (
                        <span style={{ fontSize: 10.5, color: "var(--faint)" }}>
                          +{r.players.length - 4} more
                        </span>
                      )}
                    </div>
                  </td>

                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <button
                        className="btn btn-secondary"
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
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Delete this replay from local database cache?")) {
                            onDeleteReplay(r.id);
                          }
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
