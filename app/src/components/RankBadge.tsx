import React from "react";

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

export interface RankBadgeProps {
  rank?: string | null;
  size?: number;
  showLabel?: boolean;
  className?: string;
}

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

export default function RankBadge({
  rank,
  size = 40,
  showLabel = false,
  className = "",
}: RankBadgeProps) {
  const tier = parseRankTier(rank);

  const renderIcon = () => {
    switch (tier) {
      case "Bronze":
        return (
          <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
            <defs>
              <linearGradient id="bronzeGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop stopColor="#D97746" />
                <stop offset="0.5" stopColor="#B45309" />
                <stop offset="1" stopColor="#78350F" />
              </linearGradient>
            </defs>
            <polygon points="32,4 56,16 50,52 32,60 14,52 8,16" fill="url(#bronzeGrad)" stroke="#F59E0B" strokeWidth="2.5" />
            <polygon points="32,12 48,22 44,46 32,52 20,46 16,22" fill="#5E2608" opacity="0.8" />
            <path d="M26 28 L32 20 L38 28 L32 38 Z" fill="#FBBF24" />
          </svg>
        );
      case "Silver":
        return (
          <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
            <defs>
              <linearGradient id="silverGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop stopColor="#E2E8F0" />
                <stop offset="0.5" stopColor="#94A3B8" />
                <stop offset="1" stopColor="#475569" />
              </linearGradient>
            </defs>
            <polygon points="32,4 58,16 48,54 32,62 16,54 6,16" fill="url(#silverGrad)" stroke="#CBD5E1" strokeWidth="2.5" />
            <polygon points="32,13 47,22 40,47 32,52 24,47 17,22" fill="#334155" opacity="0.85" />
            <path d="M32 18 L40 30 L32 42 L24 30 Z" fill="#F8FAFC" />
          </svg>
        );
      case "Gold":
        return (
          <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
            <defs>
              <linearGradient id="goldGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FDE047" />
                <stop offset="0.5" stopColor="#EAB308" />
                <stop offset="1" stopColor="#A16207" />
              </linearGradient>
            </defs>
            <polygon points="32,2 60,18 50,56 32,62 14,56 4,18" fill="url(#goldGrad)" stroke="#FEF08A" strokeWidth="2.5" />
            <polygon points="32,10 49,24 42,49 32,54 22,49 15,24" fill="#713F12" opacity="0.85" />
            <path d="M22 28 L32 14 L42 28 L32 40 Z" fill="#FACC15" />
            <circle cx="32" cy="27" r="4" fill="#FEF9C3" />
          </svg>
        );
      case "Platinum":
        return (
          <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
            <defs>
              <linearGradient id="platGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop stopColor="#67E8F9" />
                <stop offset="0.5" stopColor="#06B6D4" />
                <stop offset="1" stopColor="#0E7490" />
              </linearGradient>
            </defs>
            <polygon points="32,2 62,20 46,58 32,62 18,58 2,20" fill="url(#platGrad)" stroke="#A5F3FC" strokeWidth="2.5" />
            <polygon points="32,10 50,25 39,50 32,53 25,50 14,25" fill="#164E63" opacity="0.85" />
            <polygon points="32,16 42,32 32,44 22,32" fill="#E0F2FE" />
          </svg>
        );
      case "Diamond":
        return (
          <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
            <defs>
              <linearGradient id="diaGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop stopColor="#93C5FD" />
                <stop offset="0.4" stopColor="#3B82F6" />
                <stop offset="1" stopColor="#1E3A8A" />
              </linearGradient>
              <filter id="diaGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <polygon points="32,2 62,26 32,62 2,26" fill="url(#diaGrad)" stroke="#BFDBFE" strokeWidth="2.5" filter="url(#diaGlow)" />
            <polygon points="32,10 52,28 32,52 12,28" fill="#1E40AF" opacity="0.75" />
            <polygon points="32,16 44,29 32,44 20,29" fill="#DBEAFE" />
            <circle cx="32" cy="29" r="3.5" fill="#FFFFFF" />
          </svg>
        );
      case "Champion":
        return (
          <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
            <defs>
              <linearGradient id="champGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop stopColor="#D8B4FE" />
                <stop offset="0.4" stopColor="#9333EA" />
                <stop offset="1" stopColor="#581C87" />
              </linearGradient>
            </defs>
            <polygon points="32,2 62,18 52,56 32,62 12,56 2,18" fill="url(#champGrad)" stroke="#E9D5FF" strokeWidth="2.5" />
            <polygon points="32,10 50,23 42,48 32,53 22,48 14,23" fill="#3B0764" opacity="0.85" />
            <path d="M22 28 L32 14 L42 28 L32 44 Z" fill="#F3E8FF" />
            <polygon points="32,18 36,26 32,32 28,26" fill="#A855F7" />
          </svg>
        );
      case "Grand Champion":
        return (
          <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
            <defs>
              <linearGradient id="gcGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FDA4AF" />
                <stop offset="0.4" stopColor="#E11D48" />
                <stop offset="1" stopColor="#881337" />
              </linearGradient>
            </defs>
            <polygon points="32,2 63,16 54,58 32,63 10,58 1,16" fill="url(#gcGrad)" stroke="#FFE4E6" strokeWidth="2.5" />
            <polygon points="32,8 52,22 44,50 32,54 20,50 12,22" fill="#4C0519" opacity="0.85" />
            <path d="M32 12 L44 26 L38 46 L32 50 L26 46 L20 26 Z" fill="#F43F5E" />
            <path d="M32 18 L38 28 L32 38 L26 28 Z" fill="#FFF1F2" />
          </svg>
        );
      case "Supersonic Legend":
        return (
          <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
            <defs>
              <linearGradient id="sslGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FFFFFF" />
                <stop offset="0.3" stopColor="#E0F2FE" />
                <stop offset="0.7" stopColor="#38BDF8" />
                <stop offset="1" stopColor="#F59E0B" />
              </linearGradient>
              <radialGradient id="sslStar" cx="50%" cy="50%" r="50%">
                <stop stopColor="#FFFFFF" />
                <stop offset="0.6" stopColor="#BAE6FD" />
                <stop offset="1" stopColor="#38BDF8" stopOpacity="0" />
              </radialGradient>
            </defs>
            <polygon points="32,0 64,24 48,64 16,64 0,24" fill="url(#sslGrad)" stroke="#FFFFFF" strokeWidth="2.5" />
            <polygon points="32,8 52,26 40,54 24,54 12,26" fill="#0C4A6E" opacity="0.9" />
            <polygon points="32,12 44,30 32,46 20,30" fill="url(#sslStar)" />
            <circle cx="32" cy="30" r="5" fill="#FFFFFF" />
          </svg>
        );
      default:
        return (
          <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
            <polygon points="32,6 56,18 48,52 32,58 16,52 8,18" fill="#334155" stroke="#64748B" strokeWidth="2" />
            <circle cx="32" cy="32" r="10" stroke="#94A3B8" strokeWidth="2" strokeDasharray="3 3" />
            <text x="32" y="36" textAnchor="middle" fill="#94A3B8" fontSize="14" fontWeight="bold">?</text>
          </svg>
        );
    }
  };

  return (
    <div className={`rank-badge-item ${className}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {renderIcon()}
      {showLabel && (
        <span style={{ fontWeight: 700, fontSize: Math.max(12, size * 0.35) }}>
          {rank || tier}
        </span>
      )}
    </div>
  );
}
