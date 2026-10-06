import { ExternalLink } from "../externalLinks";
import { useEffect, useRef, useState } from "react";
import { invoke, ipc } from "../ipc";
import { errorMessage } from "../errors";
import { timeLabel } from "../viewerTime";
import { downloadJson } from "../download";
export type Situation = {
  replay_id: string;
  event_id: string;
  file_name: string;
  time: number;
  title: string;
  kind: string;
  event_phase: string;
  review: string;
  context: {
    zone: string;
    lane: string;
    boost_bucket: string;
    score_state: string;
    phase: string;
    position: number[] | null;
    ball_position: number[] | null;
  };
};
type Cluster = {
  id: string;
  kind: string;
  context: Situation["context"];
  candidate_count: number;
  confirmed_mistakes: number;
  distinct_matches: number;
  confirmed_matches: number;
  examples: Situation[];
  trend: { week: string; candidates: number; confirmed: number; matches: number }[];
};
type Report = {
  clusters: Cluster[];
  matches_searched: number;
  method: string;
  trend_policy: string;
};
type Search = {
  rows: Situation[];
  total: number;
  next_cursor: number | null;
  matches_searched: number;
  unknown_phase_events: number;
};
type Opponent = {
  player: { id: string; name: string; is_bot: boolean };
  encounters: number;
  last_seen: string | null;
  tracker_url: string | null;
  replays: string[];
};
export default function IntelligencePanel({
  mode,
  playerId,
  libraryRevision,
  onOpenReplay,
  onPracticeCreated,
  onAskCoach,
}: {
  mode: string;
  playerId?: string | null;
  libraryRevision: unknown;
  onOpenReplay?: (id: string, time?: number) => void;
  onPracticeCreated: () => void;
  onAskCoach?: (question: string) => void;
}) {
  const [tab, setTab] = useState("patterns"),
    [report, setReport] = useState<Report | null>(null),
    [search, setSearch] = useState<Search | null>(null),
    [opponents, setOpponents] = useState<Opponent[]>([]),
    [query, setQuery] = useState("show every OT goal I conceded"),
    [filters, setFilters] = useState({ kind: "goal conceded", phase: "overtime" }),
    [cursor, setCursor] = useState(0),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [shown, setShown] = useState(8);
  const generation = useRef(0),
    scope = useRef("");
  scope.current = `${playerId}:${mode}`;
  useEffect(() => {
    let alive = true;
    const ticket = ++generation.current;
    setShown(8);
    setReport(null);
    setSearch(null);
    setOpponents([]);
    setNotice("");
    setCursor(0);
    if (!playerId) return;
    setLoading(true);
    invoke<Report>("evidence_tool", { tool: "get_mistake_fingerprints", mode, args: {} })
      .then((r) => {
        if (alive && ticket === generation.current) setReport(r);
      })
      .catch((e) => {
        if (alive && ticket === generation.current) setNotice(errorMessage(e));
      })
      .finally(() => {
        if (alive && ticket === generation.current) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [mode, playerId, libraryRevision]);
  useEffect(() => {
    if (!playerId || !report) return;
    let alive = true;
    setLoading(true);
    const work =
      tab === "search"
        ? invoke<Search>("evidence_tool", {
            tool: "search_replay_events",
            mode,
            args: { ...filters, cursor, limit: 10 },
          }).then((r) => {
            if (alive) setSearch(r);
          })
        : tab === "opponents"
          ? invoke<{ records: Opponent[] }>("evidence_tool", {
              tool: "get_opponent_history",
              mode,
              args: {},
            }).then((r) => {
              if (alive) setOpponents(r.records);
            })
          : Promise.resolve();
    work
      .catch((e) => {
        if (alive) setNotice(errorMessage(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tab, mode, playerId, report, filters, cursor]);
  const action = async (fn: () => Promise<unknown>, message: string) => {
    const original = scope.current;
    setBusy(true);
    setNotice("");
    try {
      await fn();
      if (scope.current !== original) return;
      const r = await invoke<Report>("evidence_tool", {
        tool: "get_mistake_fingerprints",
        mode,
        args: {},
      });
      if (scope.current === original) {
        setReport(r);
        setNotice(message);
      }
    } catch (e) {
      if (scope.current === original) setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const open = (r: Situation) => onOpenReplay?.(r.replay_id, Math.max(0, r.time - 3));
  const runQuery = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.toLowerCase();
    if (!/conced|goal|review|mistake|boost|rotation|demo|coverage|touch/.test(q)) {
      setNotice(
        "Use Coach for a broader question. Local search supports recorded goals and review markers, with recorded overtime or last-minute filters.",
      );
      return;
    }
    setFilters({
      kind: /conced|goal against/.test(q)
        ? "goal conceded"
        : /(?:i|my) scored/.test(q)
          ? "goal scored"
          : /goal/.test(q)
            ? "goals"
            : /touch/.test(q)
              ? "touch"
              : /boost/.test(q)
                ? "boost"
                : /rotation/.test(q)
                  ? "rotation"
                  : /demo/.test(q)
                    ? "demo"
                    : /coverage/.test(q)
                      ? "coverage"
                      : "all",
      phase: /\bot\b|overtime/.test(q)
        ? "overtime"
        : /last minute|final minute/.test(q)
          ? "last minute"
          : "all",
    });
    setCursor(0);
    setNotice("");
  };
  return (
    <section className="pg-card intelligence-panel" aria-label="Replay intelligence">
      <div className="pg-card-head">
        <h3 className="pg-card-title">Replay intelligence</h3>
        <span className="pg-card-meta">
          {report?.matches_searched ?? 0} personal {mode} matches
        </span>
      </div>
      <div className="intelligence-tabs">
        {[
          ["patterns", "Mistake fingerprints"],
          ["search", "Search library"],
          ["brief", "Pre-game brief"],
          ["opponents", "Opponent history"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`btn ${tab === id ? "primary" : "secondary"}`}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {!playerId ? (
        <p>Confirm your player in Settings to use personal replay intelligence.</p>
      ) : loading ? (
        <p role="status">Indexing recorded situations… First use may take longer.</p>
      ) : null}
      {notice && <p role="status">{notice}</p>}
      {tab === "patterns" && report && (
        <>
          <p className="studio-hint">
            Repeated context is a review candidate. Mark your decisions before turning a pattern
            into practice. Goals conceded do not establish blame.
          </p>
          {report.clusters.length === 0 && <p>No review candidates in this mode yet.</p>}
          <div className="fingerprint-grid">
            {report.clusters.slice(0, shown).map((c) => (
              <article className="fingerprint" key={c.id}>
                <div className="fingerprint-heading">
                  <strong>{c.kind}</strong>
                  <span>{c.distinct_matches >= 2 ? "Recurring context" : "Single match"}</span>
                </div>
                <p>
                  {c.context.zone} · {c.context.lane} · {c.context.boost_bucket} boost
                </p>
                <p className="studio-hint">
                  {c.context.score_state} · {c.context.phase} · {c.candidate_count} candidates /{" "}
                  {c.distinct_matches} matches · {c.confirmed_mistakes} marked mistakes
                </p>
                {c.examples.map((r) => (
                  <div className="fingerprint-example" key={`${r.replay_id}:${r.event_id}`}>
                    <button className="btn secondary" onClick={() => open(r)}>
                      {timeLabel(r.time)} · {r.file_name}
                    </button>
                    <label>
                      Review decision
                      <select
                        aria-label={`Review ${r.file_name} ${r.event_id}`}
                        value={r.review}
                        disabled={busy}
                        onChange={(e) =>
                          void action(
                            () =>
                              ipc.reviewSituation(mode, r.replay_id, r.event_id, e.target.value),
                            "Review saved locally.",
                          )
                        }
                      >
                        <option value="unreviewed" disabled>
                          Unreviewed
                        </option>
                        <option value="mistake">My mistake</option>
                        <option value="not_mistake">Not my mistake</option>
                        <option value="unsure">Unsure</option>
                      </select>
                    </label>
                  </div>
                ))}
                <details>
                  <summary>Long-term counts</summary>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Header week</th>
                        <th>Candidates</th>
                        <th>Marked mistakes</th>
                        <th>Matches</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.trend.map((t) => (
                        <tr key={t.week}>
                          <td>{t.week}</td>
                          <td>{t.candidates}</td>
                          <td>{t.confirmed}</td>
                          <td>{t.matches}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="studio-hint">
                    Imported-library counts; no opportunity denominator. More uploads can increase
                    counts. Header timezone may be unknown.
                  </p>
                </details>
                <div className="intelligence-actions">
                  <button
                    className="btn primary"
                    disabled={busy || c.confirmed_matches < 2}
                    onClick={() =>
                      void action(async () => {
                        await ipc.drillFromFingerprint(mode, c.id);
                        onPracticeCreated();
                      }, "Weekly drill added to Practice & Reassessment below.")
                    }
                  >
                    Create weekly drill
                  </button>
                  <button
                    className="btn secondary"
                    onClick={() =>
                      downloadJson("AntiRL-training-recipe.json", {
                        format: "antirl-training-recipe-1",
                        mode,
                        fingerprint: c.id,
                        examples: c.examples,
                        units: "Rocket League Unreal units; Z up",
                        status:
                          "Review recipe only. Not an importable Rocket League pack code or verified optimal solution.",
                      })
                    }
                  >
                    Export training recipe
                  </button>
                </div>
              </article>
            ))}
          </div>
          {shown < report.clusters.length && (
            <button className="btn secondary" onClick={() => setShown((n) => n + 8)}>
              Show more fingerprints
            </button>
          )}
          <p className="studio-hint">{report.method}</p>
        </>
      )}
      {tab === "search" && (
        <>
          <form className="intelligence-search" onSubmit={runQuery}>
            <label>
              Find recorded situations
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="show every OT goal I conceded"
              />
            </label>
            <button className="btn primary" disabled={loading}>
              Search all replays
            </button>
            {onAskCoach && (
              <button type="button" className="btn secondary" onClick={() => onAskCoach(query)}>
                Ask Coach
              </button>
            )}
          </form>
          <p className="studio-hint">
            Interpreted filters: {filters.kind} · {filters.phase}. Local query rules; Coach can use
            the same bounded library tools.
          </p>
          {search && (
            <>
              <p>
                {search.total} matches to your query across {search.matches_searched} replays.{" "}
                {search.unknown_phase_events} recorded events have unknown phase and are excluded
                from overtime filters.
              </p>
              {search.rows.map((r) => (
                <button
                  className="btn secondary intelligence-result"
                  key={`${r.replay_id}:${r.event_id}`}
                  onClick={() => open(r)}
                >
                  <strong>
                    {r.file_name} · {timeLabel(r.time)}
                  </strong>
                  <span>
                    {r.title} · {r.event_phase} · {r.review.replaceAll("_", " ")}
                  </span>
                </button>
              ))}
              <div className="intelligence-actions">
                <button
                  className="btn secondary"
                  disabled={cursor === 0 || loading}
                  onClick={() => setCursor(Math.max(0, cursor - 10))}
                >
                  Previous
                </button>
                <button
                  className="btn secondary"
                  disabled={search.next_cursor === null || loading}
                  onClick={() => setCursor(search.next_cursor ?? 0)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
      {tab === "brief" && report && (
        <>
          <p>Before your next {mode} match</p>
          {report.clusters
            .filter((c) => c.confirmed_matches >= 2)
            .slice(0, 3)
            .map((c) => (
              <div className="fingerprint" key={c.id}>
                <strong>
                  {c.kind}: {c.context.zone}, {c.context.boost_bucket} boost
                </strong>
                <p>
                  {mode === "1v1"
                    ? "Check the opponent’s position and your recovery options before committing."
                    : "Check teammate cover and recovery options before committing."}{" "}
                  Review one linked lead-in to choose a cue you can test.
                </p>
                <button className="btn secondary" onClick={() => open(c.examples[0])}>
                  Review source example
                </button>
              </div>
            ))}
          {!report.clusters.some((c) => c.confirmed_matches >= 2) && (
            <p>
              No recurring mistakes confirmed in two matches yet. Review fingerprint examples first.
            </p>
          )}
          <p className="studio-hint">
            Based on your review decisions in imported matches. Suggestions do not predict outcomes
            or rank.
          </p>
        </>
      )}
      {tab === "opponents" && (
        <>
          <p className="studio-hint">
            Local encounters by exact player identity. Tracker links open a public profile; live
            ranks are unavailable.
          </p>
          {opponents.slice(0, 30).map((o) => (
            <article className="fingerprint" key={o.player.id}>
              <strong>
                {o.player.name}
                {o.player.is_bot ? " · Built-in bot flag" : ""}
              </strong>
              <p>
                {o.encounters} encounters · {o.last_seen ?? "Unknown date"}
              </p>
              <div className="intelligence-actions">
                <button className="btn secondary" onClick={() => onOpenReplay?.(o.replays[0])}>
                  Latest encounter
                </button>
                {o.tracker_url ? (
                  <ExternalLink
                    className="btn secondary"
                    href={o.tracker_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Tracker profile
                  </ExternalLink>
                ) : (
                  <span className="studio-hint">No supported Tracker identity link</span>
                )}
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
