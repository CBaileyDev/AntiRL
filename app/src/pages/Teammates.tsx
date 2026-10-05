import React from "react";
import { Users, Award, Clock, ArrowRight, ShieldCheck } from "lucide-react";
import type { TeammateStats } from "../types";

interface TeammatesProps {
  teammates: TeammateStats[];
  onSelectTeammateMatches?: (playerId: string) => void;
}

export default function Teammates({ teammates, onSelectTeammateMatches }: TeammatesProps) {
  return (
    <div className="content-pane">
      {/* Header and Explanation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
            Teammate Chemistry & Synergy
          </h2>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            Ranked strictly by <b>shared-team appearances</b> in competitive matches, not incidental lobby encounters.
          </span>
        </div>
      </div>

      {/* Teammates Table Card */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {teammates.length === 0 ? (
          <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--muted)" }}>
            <Users size={40} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
            <h4 style={{ fontSize: 16, color: "var(--text)", marginBottom: 4 }}>
              No Teammates Recorded Yet
            </h4>
            <p style={{ fontSize: 13 }}>
              Import 2v2 or 3v3 matches where you played alongside other players to track shared records.
            </p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Player Name</th>
                <th>Platform</th>
                <th>Shared Matches</th>
                <th>Record (W - L)</th>
                <th>Win Rate</th>
                <th>Last Played</th>
              </tr>
            </thead>
            <tbody>
              {teammates.map((mate) => (
                <tr key={mate.player_id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="profile-avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
                        {mate.name.slice(0, 1).toUpperCase()}
                      </div>
                      <strong style={{ fontSize: 13.5, color: "var(--text)" }}>
                        {mate.name}
                      </strong>
                    </div>
                  </td>

                  <td>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 7px",
                        borderRadius: "var(--radius-pill)",
                        background: "var(--surface-raised)",
                        color: "var(--muted)",
                        border: "1px solid var(--line)",
                      }}
                    >
                      {mate.platform || "Cross-platform"}
                    </span>
                  </td>

                  <td>
                    <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {mate.shared_matches} matches
                    </span>
                  </td>

                  <td>
                    <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      <b style={{ color: "var(--sage)" }}>{mate.wins}W</b> -{" "}
                      <b style={{ color: "var(--danger)" }}>{mate.losses}L</b>
                    </span>
                  </td>

                  <td>
                    <span
                      style={{
                        fontWeight: 700,
                        color: mate.win_rate >= 50 ? "var(--sage)" : "var(--orange-team)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {mate.win_rate}%
                    </span>
                  </td>

                  <td>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {mate.last_played || "Recent"}
                    </span>
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
