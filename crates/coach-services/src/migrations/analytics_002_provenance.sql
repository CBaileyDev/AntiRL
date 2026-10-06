CREATE TABLE IF NOT EXISTS match_provenance(match_id TEXT PRIMARY KEY REFERENCES source_matches(id) ON DELETE CASCADE,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS participants(match_id TEXT NOT NULL REFERENCES source_matches(id) ON DELETE CASCADE,player_id TEXT NOT NULL,team INTEGER,name TEXT,identity_confidence TEXT,PRIMARY KEY(match_id,player_id));
CREATE INDEX IF NOT EXISTS participant_scope ON participants(player_id,match_id);
CREATE TABLE IF NOT EXISTS metric_provenance(match_id TEXT NOT NULL REFERENCES source_matches(id) ON DELETE CASCADE,player_id TEXT NOT NULL,key TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(match_id,player_id,key));
CREATE TABLE IF NOT EXISTS evidence_events(id TEXT PRIMARY KEY,match_id TEXT NOT NULL REFERENCES source_matches(id) ON DELETE CASCADE,player_id TEXT,start_s REAL,end_s REAL,body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS event_window ON evidence_events(match_id,player_id,start_s);
