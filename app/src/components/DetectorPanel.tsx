import { ExternalLink } from "../externalLinks";
import { useEffect, useState } from "react";
import { ipc, invoke } from "../ipc";
import { errorMessage } from "../errors";
import type { ReplayAnalysis } from "../types";
export type DetectorRecord = {
  replay_id: string;
  player_id: string;
  report: {
    score_percent: number;
    source: string;
    detector_version: string;
    result_url: string;
    provenance: string;
    interpretation: string;
  };
  recorded_at: string;
};
export default function DetectorPanel({ replay }: { replay: ReplayAnalysis }) {
  const [records, setRecords] = useState<DetectorRecord[]>([]),
    [player, setPlayer] = useState(""),
    [source, setSource] = useState("whosbotting.com"),
    [score, setScore] = useState(""),
    [version, setVersion] = useState(""),
    [url, setUrl] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setRecords([]);
    setPlayer(replay.players.find((p) => !p.is_bot)?.id ?? "");
    setNotice("");
    setScore("");
    setVersion("");
    setUrl("");
    invoke<{ records: DetectorRecord[] }>("detector_reports")
      .then((r) => {
        if (alive) setRecords(r.records.filter((r) => r.replay_id === replay.summary.id));
      })
      .catch((e) => {
        if (alive) setNotice(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [replay.summary.id, replay.players]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await ipc.saveDetectorReport(replay.summary.id, player, {
        source,
        score_percent: Number(score),
        detector_version: version,
        result_url: url,
      });
      const r = await invoke<{ records: DetectorRecord[] }>("detector_reports");
      setRecords(r.records.filter((r) => r.replay_id === replay.summary.id));
      setNotice("External result saved locally. This entry has not been independently verified.");
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="detector-panel">
      <summary>Bot detection · external reports</summary>
      <p className="studio-hint">
        Automatic RL-bot detection is unavailable. A built-in bot flag is separate from a cheating
        detector. External scores are bot-likeness scores, not a calibrated probability that a
        person cheated.
      </p>
      <ul>
        {replay.players.map((p) => {
          const r = records.find((r) => r.player_id === p.id);
          return (
            <li key={p.id}>
              <strong>{p.name}</strong> ·{" "}
              {p.is_bot ? (
                "Built-in replay bot flag"
              ) : r ? (
                <ExternalLink href={r.report.result_url} target="_blank" rel="noreferrer">
                  {r.report.score_percent}% external score · {r.report.source}{" "}
                  {r.report.detector_version} · user-entered, unverified
                </ExternalLink>
              ) : (
                "Not assessed"
              )}
            </li>
          );
        })}
      </ul>
      <p className="studio-hint">
        Opening a detector does not upload anything. Uploading a replay there shares all
        participants' replay data under that site's policy. Match the file and player before
        recording a result.
      </p>
      <div className="intelligence-actions">
        <ExternalLink
          className="btn secondary"
          href="https://whosbotting.com/"
          target="_blank"
          rel="noreferrer"
        >
          Open Who’s Botting
        </ExternalLink>
        <ExternalLink href="https://whosbotting.com/privacy" target="_blank" rel="noreferrer">
          Privacy policy
        </ExternalLink>
      </div>
      <p className="studio-hint">
        Replay: {replay.summary.file_name} · SHA-256 {replay.summary.file_hash}
      </p>
      <form onSubmit={(e) => void save(e)}>
        <label>
          Player
          <select value={player} onChange={(e) => setPlayer(e.target.value)}>
            {replay.players
              .filter((p) => !p.is_bot)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Detector
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="whosbotting.com">Who’s Botting</option>
            <option value="rldetect.com">RLDetect</option>
          </select>
        </label>
        <div className="camera-fields">
          <label>
            External score (%)
            <input
              required
              type="number"
              min={0}
              max={100}
              step="any"
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </label>
          <label>
            Detector version
            <input
              required
              maxLength={80}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </label>
        </div>
        <label>
          Result URL
          <input
            required
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={`https://${source}/…`}
          />
        </label>
        <button className="btn secondary" disabled={busy || !player}>
          Save external result
        </button>
      </form>
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
