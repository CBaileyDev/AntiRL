ALTER TABLE training_sessions ADD COLUMN logged_at TEXT;
ALTER TABLE training_sessions ADD COLUMN completion_source TEXT NOT NULL DEFAULT 'legacy_logged_time';
UPDATE training_sessions SET logged_at=completed_at;
CREATE TABLE transfer_cycles(id TEXT PRIMARY KEY,plan_id TEXT NOT NULL REFERENCES practice_plans(id),player_id TEXT NOT NULL,mode TEXT NOT NULL,created_at TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,anchor_at TEXT,body TEXT NOT NULL);
CREATE UNIQUE INDEX transfer_active ON transfer_cycles(player_id,mode) WHERE active=1;
CREATE TABLE transfer_checkins(cycle_id TEXT NOT NULL REFERENCES transfer_cycles(id),replay_id TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('used','missed','no_opportunity','unsure','skipped')),notes TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(cycle_id,replay_id));
CREATE INDEX transfer_plan ON transfer_cycles(player_id,mode,plan_id);
