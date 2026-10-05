import React from "react";
import RankBadge from "./RankBadge";

const BASE = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Champion", "Grand Champion"];

export const RANK_OPTIONS: string[] = [
  ...BASE.flatMap((t) => [1, 2, 3].map((d) => `${t} ${d}`)),
  "Supersonic Legend",
];

interface RankSelectProps {
  value: string;
  onChange: (v: string) => void;
  allowUnranked?: boolean;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}

export default function RankSelect({
  value,
  onChange,
  allowUnranked = false,
  className = "chat-input",
  style,
  ariaLabel,
}: RankSelectProps) {
  const known = value === "" || RANK_OPTIONS.includes(value);
  return (
    <div className="rank-select-field" style={{ width: "100%", ...style }}>
    <RankBadge rank={value} size={40} />
    <select
      className={className}
      style={{ width: "100%", minWidth: 0 }}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowUnranked && <option value="">Unknown / skipped</option>}
      {!known && <option value={value}>{value}</option>}
      {BASE.map((t) => (
        <optgroup key={t} label={t}>
          {[1, 2, 3].map((d) => (
            <option key={d} value={`${t} ${d}`}>{`${t} ${d}`}</option>
          ))}
        </optgroup>
      ))}
      <option value="Supersonic Legend">Supersonic Legend</option>
    </select>
    </div>
  );
}
