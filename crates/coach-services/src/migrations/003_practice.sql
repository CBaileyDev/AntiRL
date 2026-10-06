CREATE TABLE IF NOT EXISTS practice_plans(id TEXT PRIMARY KEY,player_id TEXT NOT NULL,mode TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS training_sessions(id TEXT PRIMARY KEY,plan_id TEXT NOT NULL REFERENCES practice_plans(id),player_id TEXT NOT NULL,mode TEXT NOT NULL,completed_at TEXT NOT NULL,body TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS training_scope ON training_sessions(player_id,mode,completed_at);
CREATE TABLE IF NOT EXISTS rank_observations(id TEXT PRIMARY KEY,player_id TEXT NOT NULL,mode TEXT NOT NULL,rank TEXT NOT NULL,observed_at TEXT NOT NULL,source TEXT NOT NULL);
