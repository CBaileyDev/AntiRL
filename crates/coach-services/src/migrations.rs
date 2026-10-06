//! Numbered, transactional migrations. Only the one-time legacy bridge inspects
//! columns: older releases did not record a database user_version.
use super::*;
pub const SCHEMA_VERSION: i64 = 7;

fn has_column(db: &Connection, table: &str, column: &str) -> ServiceResult<bool> {
    let mut q = db
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(err)?;
    let columns = q.query_map([], |r| r.get::<_, String>(1)).map_err(err)?;
    for name in columns {
        if name.map_err(err)? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Legacy scope migration is also used by its preservation regression test.
pub(crate) fn legacy_scope(db: &Connection) -> ServiceResult<()> {
    for (column, sql) in [
        (
            "mode",
            "ALTER TABLE conversations ADD COLUMN mode TEXT NOT NULL DEFAULT 'All'",
        ),
        (
            "preset",
            "ALTER TABLE conversations ADD COLUMN preset TEXT NOT NULL DEFAULT 'Balanced'",
        ),
        (
            "prompt_version",
            "ALTER TABLE conversations ADD COLUMN prompt_version TEXT NOT NULL DEFAULT 'legacy'",
        ),
        (
            "archived",
            "ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
        ),
    ] {
        if !has_column(db, "conversations", column)? {
            db.execute_batch(sql).map_err(err)?;
        }
    }
    Ok(())
}

pub fn migrate(db: &mut Connection, dir: &Path) -> ServiceResult<()> {
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(err)?;
    db.busy_timeout(Duration::from_secs(10)).map_err(err)?;
    let version: i64 = db
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(err)?;
    if version > SCHEMA_VERSION {
        return Err("This database was written by a newer AntiRL version".into());
    }
    if version == SCHEMA_VERSION {
        return Ok(());
    }
    let backup = dir.join(format!("coach-before-schema-v{SCHEMA_VERSION}.sqlite3"));
    if !backup.exists() {
        db.execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()])
            .map_err(err)?;
    }
    for next in version + 1..=SCHEMA_VERSION {
        let tx = db.transaction().map_err(err)?;
        match next {
            1 => tx
                .execute_batch(include_str!("migrations/001_base.sql"))
                .map_err(err)?,
            2 => {
                legacy_scope(&tx)?;
                if !has_column(&tx, "replays", "coach_body")? {
                    tx.execute_batch("ALTER TABLE replays ADD COLUMN coach_body TEXT")
                        .map_err(err)?;
                }
                tx.execute("UPDATE replays SET coach_body=json_remove(body,'$.frames') WHERE coach_body IS NULL", []).map_err(err)?;
            }
            3 => tx
                .execute_batch(include_str!("migrations/003_practice.sql"))
                .map_err(err)?,
            4 => {
                tx.execute_batch(include_str!("migrations/004_replay_storage.sql"))
                    .map_err(err)?;
                // One source row at a time limits migration memory. Every frame
                // blob and metadata projection commits with the version stamp.
                let ids = {
                    let mut q = tx.prepare("SELECT id FROM replays").map_err(err)?;
                    let rows = q.query_map([], |r| r.get::<_, String>(0)).map_err(err)?;
                    rows.collect::<Result<Vec<_>, _>>().map_err(err)?
                };
                for id in ids {
                    let body: String = tx
                        .query_row("SELECT body FROM replays WHERE id=?1", [&id], |r| r.get(0))
                        .map_err(err)?;
                    let analysis: Value = serde_json::from_str(&body).map_err(err)?;
                    super::storage::write_legacy_replay(&tx, &analysis)?;
                }
                // Prior versions reported the snapshot hash as file_name.
                // Recover only from an exact hash match in the configured folder.
                // Old filenames cannot be inferred safely from the hash alone.
            }
            5 => tx
                .execute_batch(include_str!("migrations/005_deleted_match_ids.sql"))
                .map_err(err)?,
            6 => tx
                .execute_batch(include_str!("migrations/006_transfer.sql"))
                .map_err(err)?,
            7 => tx
                .execute_batch(include_str!("migrations/007_intelligence.sql"))
                .map_err(err)?,
            _ => unreachable!(),
        }
        tx.execute(
            "INSERT OR REPLACE INTO schema_migrations VALUES(?1,?2)",
            params![next, now()],
        )
        .map_err(err)?;
        tx.pragma_update(None, "user_version", next).map_err(err)?;
        tx.commit().map_err(err)?;
    }
    Ok(())
}
