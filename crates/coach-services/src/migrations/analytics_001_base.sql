CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS source_matches(id TEXT PRIMARY KEY, revision TEXT NOT NULL, played_at TEXT, mode TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS metric_observations(match_id TEXT NOT NULL REFERENCES source_matches(id) ON DELETE CASCADE, player_id TEXT NOT NULL, key TEXT NOT NULL, value REAL, numerator REAL, denominator REAL, version TEXT, PRIMARY KEY(match_id,player_id,key));
CREATE INDEX IF NOT EXISTS observation_player ON metric_observations(player_id,key);
CREATE TABLE IF NOT EXISTS projection_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS aggregate_snapshots(player_id TEXT NOT NULL,mode TEXT NOT NULL,query_version TEXT NOT NULL,source_watermark TEXT NOT NULL,computed_at TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(player_id,mode,query_version));
