ALTER TABLE replays ADD COLUMN intelligence_revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE situation_cache(replay_id TEXT PRIMARY KEY REFERENCES replays(id) ON DELETE CASCADE,revision INTEGER NOT NULL,body TEXT NOT NULL);
CREATE TABLE situation_reviews(replay_id TEXT NOT NULL REFERENCES replays(id) ON DELETE CASCADE,event_id TEXT NOT NULL,player_id TEXT NOT NULL,verdict TEXT NOT NULL CHECK(verdict IN ('mistake','not_mistake','unsure')),updated_at TEXT NOT NULL,PRIMARY KEY(replay_id,event_id,player_id));
CREATE TABLE camera_profiles(player_id TEXT PRIMARY KEY,body TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE detector_reports(replay_id TEXT NOT NULL REFERENCES replays(id) ON DELETE CASCADE,player_id TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(replay_id,player_id));
