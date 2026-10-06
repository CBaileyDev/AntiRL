export type RankTier =
  | "Unranked"
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum"
  | "Diamond"
  | "Champion"
  | "Grand Champion"
  | "Supersonic Legend";

export const parseRankTier = (rankStr?: string | null): RankTier => {
  if (!rankStr) return "Unranked";
  const lower = rankStr.toLowerCase();
  if (lower.includes("supersonic") || lower.includes("ssl")) return "Supersonic Legend";
  if (lower.includes("grand champ") || lower.includes("gc")) return "Grand Champion";
  if (lower.includes("champ")) return "Champion";
  if (lower.includes("diamond")) return "Diamond";
  if (lower.includes("plat")) return "Platinum";
  if (lower.includes("gold")) return "Gold";
  if (lower.includes("silver")) return "Silver";
  if (lower.includes("bronze")) return "Bronze";
  return "Unranked";
};

export const RANK_TIERS: RankTier[] = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Champion",
  "Grand Champion",
  "Supersonic Legend",
];

/** Extracts the in-game division/tier number (I-III) from strings like "Diamond II" or "Gold 3". */
export const parseRankDivision = (rankStr?: string | null): number => {
  if (!rankStr) return 0;
  const m = rankStr.match(/(?:^|[\s_-])(iii|ii|i|[1-3])(?=$|[\s_-])/i);
  if (!m) return 0;
  const v = m[1].toLowerCase();
  if (v === "iii") return 3;
  if (v === "ii") return 2;
  if (v === "i") return 1;
  return Number(v);
};

/** Shared ordering and bundled artwork index; missing and unknown ranks are unranked. */
export function rankAssetIndex(rank: string | null | undefined): number {
  const tier = parseRankTier(rank);
  const index = RANK_TIERS.indexOf(tier);
  return index < 0
    ? 0
    : tier === "Supersonic Legend"
      ? 22
      : index * 3 + (parseRankDivision(rank) || 1);
}

/** Highest competitive rank across the supplied playlists. */
export function highestCompetitiveRank(ranks: readonly (string | null | undefined)[]): string {
  return ranks.reduce<string>(
    (best, rank) => (rankAssetIndex(rank) > rankAssetIndex(best) ? rank! : best),
    "Unranked",
  );
}
