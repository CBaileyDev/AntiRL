/** Flexible evidence tools are validated at the transport boundary before rendering. */
export interface EvidenceMatch {
  summary: {
    id: string;
    mode: string;
    replay_name?: string | null;
    file_name?: string | null;
    date?: string | null;
    played_at?: string | null;
  };
  revision?: string;
}
export interface MatchPage {
  tool: "list_matches";
  matches: EvidenceMatch[];
  next_cursor: number | null;
}
export interface ObservedMetric {
  key: string;
  label?: string | null;
  value: number | null;
  unit?: string | null;
  confidence?: string | null;
}
export interface MetricDetail {
  tool: "get_match_metrics";
  rows: ObservedMetric[];
  coverage: { positions?: boolean; boost?: boolean; touches?: boolean };
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function optionalText(value: unknown): value is string | null | undefined {
  return value == null || typeof value === "string";
}
export function matchPage(value: unknown): MatchPage {
  if (
    !object(value) ||
    !Array.isArray(value.matches) ||
    value.matches.length > 40 ||
    !(
      value.next_cursor == null ||
      (typeof value.next_cursor === "number" &&
        Number.isSafeInteger(value.next_cursor) &&
        value.next_cursor >= 0)
    )
  )
    throw new Error("The evidence history response is invalid. Reload the history to try again.");
  const matches = value.matches.map((row) => {
    if (!object(row) || !object(row.summary))
      throw new Error("A replay summary in the evidence response is invalid.");
    const summary = row.summary;
    if (
      typeof summary.id !== "string" ||
      typeof summary.mode !== "string" ||
      ![summary.replay_name, summary.file_name, summary.date, summary.played_at].every(optionalText)
    )
      throw new Error("A replay summary in the evidence response is invalid.");
    return {
      summary: {
        id: summary.id,
        mode: summary.mode,
        replay_name: summary.replay_name as string | null | undefined,
        file_name: summary.file_name as string | null | undefined,
        date: summary.date as string | null | undefined,
        played_at: summary.played_at as string | null | undefined,
      },
      revision: typeof row.revision === "string" ? row.revision : undefined,
    };
  });
  return {
    tool: "list_matches",
    matches,
    next_cursor: typeof value.next_cursor === "number" ? value.next_cursor : null,
  };
}
export function metricDetail(value: unknown): MetricDetail {
  if (
    !object(value) ||
    !Array.isArray(value.rows) ||
    value.rows.length > 120 ||
    !(value.coverage == null || object(value.coverage))
  )
    throw new Error("The measured evidence response is invalid. Reload the metrics to try again.");
  const rows = value.rows.map((row) => {
    if (
      !object(row) ||
      typeof row.key !== "string" ||
      !(row.value == null || (typeof row.value === "number" && Number.isFinite(row.value))) ||
      ![row.label, row.unit, row.confidence].every(optionalText)
    )
      throw new Error("A metric in the evidence response is invalid.");
    return {
      key: row.key,
      value: typeof row.value === "number" ? row.value : null,
      label: row.label as string | null | undefined,
      unit: row.unit as string | null | undefined,
      confidence: row.confidence as string | null | undefined,
    };
  });
  const coverage = object(value.coverage) ? value.coverage : {};
  return {
    tool: "get_match_metrics",
    rows,
    coverage: {
      positions: coverage.positions === true,
      boost: coverage.boost === true,
      touches: coverage.touches === true,
    },
  };
}
