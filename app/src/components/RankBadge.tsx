import React from "react";
import { parseRankTier, rankAssetIndex } from "../rankMath";
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

/** Uses the original rank artwork bundled locally; no remote runtime requests. */
export default function RankBadge({
  rank,
  size = 40,
  showLabel = false,
  className = "",
}: RankBadgeProps) {
  const tier = parseRankTier(rank);
  const index = rankAssetIndex(rank);
  return (
    <div
      className={`rank-badge-item ${className}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      <img
        src={`/ranks/${index}.png`}
        width={size}
        height={size}
        alt={rank || tier}
        style={{ objectFit: "contain", flexShrink: 0 }}
        draggable={false}
        decoding="async"
        onError={(e) => {
          const img = e.currentTarget;
          if (!img.src.endsWith("/ranks/0.png")) img.src = "/ranks/0.png";
        }}
      />
      {showLabel && (
        <span style={{ fontWeight: 700, fontSize: Math.max(12, size * 0.35) }}>{rank || tier}</span>
      )}
    </div>
  );
}
