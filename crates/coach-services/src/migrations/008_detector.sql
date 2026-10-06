-- User-confirmed bot labels for calibrating the local bot-likeness heuristic. Separate from
-- detector_reports (external, user-entered results) and from replay_players.is_bot (built-in flag).
CREATE TABLE bot_labels(
  replay_id TEXT NOT NULL REFERENCES replays(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  confirmed_bot INTEGER CHECK(confirmed_bot IN (0,1)),
  index_value REAL,
  detector_version TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  cadence_resolvable INTEGER NOT NULL DEFAULT 0,
  builtin_bot INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(replay_id,player_id)
);
