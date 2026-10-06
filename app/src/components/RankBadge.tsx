import React from "react";
import { parseRankTier, parseRankDivision } from "../rankMath";
import type { RankTier } from "../rankMath";
export { parseRankTier, parseRankDivision, RANK_TIERS } from "../rankMath";
export type { RankTier } from "../rankMath";

export interface RankBadgeProps {
  rank?: string | null;
  size?: number;
  showLabel?: boolean;
  className?: string;
}

export const DEFAULT_MMR: Record<RankTier, number> = {
  Unranked: 600,
  Bronze: 260,
  Silver: 420,
  Gold: 580,
  Platinum: 750,
  Diamond: 930,
  Champion: 1180,
  "Grand Champion": 1520,
  "Supersonic Legend": 1900,
};

/** Original AntiRL medal geometry; rank names are labels, never a rank forecast. */
export default function RankBadge({
  rank,
  size = 40,
  showLabel = false,
  className = "",
}: RankBadgeProps) {
  const tier = parseRankTier(rank);
  const colors: Record<RankTier, string> = {
    Unranked: "#94a3b8",
    Bronze: "#cb956a",
    Silver: "#cbd5e1",
    Gold: "#f8c96b",
    Platinum: "#70dbcc",
    Diamond: "#77b9fa",
    Champion: "#bb9aff",
    "Grand Champion": "#ff889e",
    "Supersonic Legend": "#edf0ff",
  };
  const division = parseRankDivision(rank) || 1;
  return (
    <span
      className={`rank-badge-item ${className}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        role="img"
        aria-label={rank || tier}
        style={{ flexShrink: 0 }}
      >
        <path d="M10 4h10l4 9 4-9h10l-9 19H19z" fill={colors[tier]} opacity=".35" />
        <path
          d="m24 13 14 8v16l-14 8-14-8V21z"
          fill="#182030"
          stroke={colors[tier]}
          strokeWidth="2"
        />
        <path d="m24 20 7 9-7 9-7-9z" fill={colors[tier]} />
        {Array.from({ length: tier === "Unranked" ? 0 : division }, (_, i) => (
          <circle
            key={i}
            cx={24 + (i - (division - 1) / 2) * 5}
            cy="41"
            r="1.3"
            fill={colors[tier]}
          />
        ))}
      </svg>
      {showLabel && (
        <span style={{ fontWeight: 700, fontSize: Math.max(12, size * 0.35) }}>{rank || tier}</span>
      )}
    </span>
  );
}
