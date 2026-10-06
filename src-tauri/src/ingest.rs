//! Bounded, verified replay ingestion.
use crate::AppState;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::Ordering,
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;

const MAX_REPLAY_SIZE: u64 = 64 * 1024 * 1024;
const MAX_OUTPUT_SIZE: u64 = 128 * 1024 * 1024;

struct ImportGuard(std::sync::Arc<std::sync::atomic::AtomicBool>);
impl Drop for ImportGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

pub fn safe_folder(folder: &str) -> Result<PathBuf, String> {
    let canonical = std::fs::canonicalize(folder).map_err(|_| {
        "Replay folder not found. Choose a folder containing saved .replay files.".to_string()
    })?;
    if !canonical.is_dir() {
        return Err("Replay source must be a directory".into());
    }
    Ok(canonical)
}

#[derive(Clone)]
struct Fingerprint {
    path: PathBuf,
    size: u64,
    mtime_ns: String,
}

fn fingerprint(source: &Path) -> Result<Fingerprint, String> {
    let path =
        std::fs::canonicalize(source).map_err(|_| "Replay file became unavailable".to_string())?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Replay source must be a regular file".into());
    }
    let modified = meta.modified().map_err(|e| e.to_string())?;
    let mtime_ns = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos()
        .to_string();
    Ok(Fingerprint {
        path,
        size: meta.len(),
        mtime_ns,
    })
}

fn read_stable(source: &Fingerprint) -> Result<(Vec<u8>, String), String> {
    if source.size == 0 || source.size > MAX_REPLAY_SIZE {
        return Err("Replay file is empty or exceeds 64 MiB safety limit".into());
    }
    let mut file = std::fs::File::open(&source.path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::with_capacity(source.size as usize);
    (&mut file)
        .take(MAX_REPLAY_SIZE + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let after = fingerprint(&source.path)?;
    if bytes.len() as u64 != source.size
        || after.size != source.size
        || after.mtime_ns != source.mtime_ns
    {
        return Err("Replay changed during import; retry once the game finishes saving it".into());
    }
    let hash = format!("{:x}", Sha256::digest(&bytes));
    Ok((bytes, hash))
}

fn snapshot(bytes: &[u8], hash: &str, snapshots_dir: &Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(snapshots_dir).map_err(|e| e.to_string())?;
    let path = snapshots_dir.join(format!("{hash}.replay"));
    // Validate an existing cached copy before using it. Interrupted or externally
    // modified snapshots never become authoritative just because a name matches.
    let valid = std::fs::File::open(&path)
        .ok()
        .and_then(|file| {
            let mut cached = Vec::new();
            file.take(MAX_REPLAY_SIZE + 1)
                .read_to_end(&mut cached)
                .ok()?;
            Some(
                cached.len() as u64 <= MAX_REPLAY_SIZE
                    && format!("{:x}", Sha256::digest(&cached)) == hash,
            )
        })
        .unwrap_or(false);
    if !valid {
        let tmp = snapshots_dir.join(format!("{hash}.tmp"));
        std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

async fn run_worker(
    snapshot: &Path,
    original_name: &str,
    cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> Result<Value, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut command = tokio::process::Command::new(exe);
    command
        .arg("--parse-worker")
        .arg(snapshot)
        .arg(original_name)
        .env_clear()
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    // Child processes receive only the Windows runtime environment they need;
    // API keys, provider variables, and application configuration stay outside.
    for key in [
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "LOCALAPPDATA",
    ] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    #[cfg(windows)]
    {
        command.creation_flags(0x08000000 | 0x00000004);
    } // NO_WINDOW | SUSPENDED

    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start replay worker: {e}"))?;

    let _job =
        crate::worker_limits::WorkerJob::attach(child.id().ok_or("Parser process has no ID")?)?;
    crate::worker_limits::WorkerJob::resume(child.id().ok_or("Parser process has no ID")?)?;

    let mut stdout = child
        .stdout
        .take()
        .ok_or("Missing worker output pipe")?
        .take(MAX_OUTPUT_SIZE + 1);
    let mut stderr = child
        .stderr
        .take()
        .ok_or("Missing worker error pipe")?
        .take(8192);

    let oversized = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let output_limit = oversized.clone();
    let out_task = tokio::spawn(async move {
        let mut bytes = Vec::new();
        stdout.read_to_end(&mut bytes).await?;
        output_limit.store(bytes.len() as u64 > MAX_OUTPUT_SIZE, Ordering::SeqCst);
        Ok::<_, std::io::Error>(bytes)
    });
    let err_task = tokio::spawn(async move {
        let mut bytes = Vec::new();
        stderr.read_to_end(&mut bytes).await.map(|_| bytes)
    });

    let timeout_duration = Duration::from_secs(45);
    let start = tokio::time::Instant::now();

    loop {
        if oversized.load(Ordering::SeqCst) {
            let _ = child.kill().await;
            return Err("Replay worker output exceeds 128 MiB safety limit".into());
        }
        if cancel.load(Ordering::SeqCst) {
            let _ = child.kill().await;
            return Err("Replay import cancelled by user".into());
        }
        if start.elapsed() > timeout_duration {
            let _ = child.kill().await;
            return Err("Replay parsing timed out after 45 seconds".into());
        }
        if let Ok(Some(status)) = child.try_wait() {
            let out_bytes = out_task
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?;
            let err_bytes = err_task
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?;

            if !status.success() {
                let msg = String::from_utf8_lossy(&err_bytes);
                return Err(if msg.trim().is_empty() {
                    format!(
                        "Worker process exited with code {}",
                        status.code().unwrap_or(-1)
                    )
                } else {
                    msg.trim().to_string()
                });
            }

            if out_bytes.len() as u64 > MAX_OUTPUT_SIZE {
                return Err("Replay worker output exceeds 128 MiB safety limit".into());
            }
            let text = String::from_utf8(out_bytes)
                .map_err(|_| "Worker output was not valid UTF-8".to_string())?;
            let value: Value = serde_json::from_str(&text)
                .map_err(|e| format!("Worker produced invalid JSON: {e}"))?;
            return Ok(value);
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

/// Manual requests wait for the active import, so they cannot reset another
/// operation's cancellation flag or race its snapshot writes.
async fn acquire_import(state: &AppState) -> ImportGuard {
    loop {
        if state
            .importing
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            state.cancel.store(false, Ordering::SeqCst);
            return ImportGuard(state.importing.clone());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

#[derive(Default)]
struct ImportCounts {
    imported: usize,
    already_present: usize,
    skipped: usize,
    failed: usize,
}
impl ImportCounts {
    fn json(&self, cancelled: bool) -> Value {
        json!({"imported":self.imported,"new":self.imported,"already_present":self.already_present,"skipped":self.skipped,"failed":self.failed,"cancelled":cancelled})
    }
}

enum Preparation {
    Skip {
        status: String,
        error: Option<String>,
    },
    Present {
        id: String,
    },
    Deleted,
    Parse {
        source: Fingerprint,
        snapshot: PathBuf,
        hash: String,
    },
}

fn prepare(service: &coach_services::CoachService, path: &Path) -> Result<Preparation, String> {
    let source = fingerprint(path)?;
    let key = source.path.to_string_lossy().to_string();
    if let Some((status, error)) = service.unchanged_import(&key, source.size, &source.mtime_ns)? {
        return Ok(Preparation::Skip { status, error });
    }
    // A recently saved replay may still be growing even between successful
    // metadata reads. Wait for the next poll without recording a permanent failure.
    if std::fs::metadata(&source.path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.elapsed().ok())
        .is_some_and(|age| age < Duration::from_secs(2))
    {
        return Ok(Preparation::Skip {
            status: "waiting".into(),
            error: Some("Waiting for the game to finish saving this replay".into()),
        });
    }
    let (bytes, hash) = match read_stable(&source) {
        Ok(result) => result,
        Err(e) => {
            service.record_import(
                &key,
                source.size,
                &source.mtime_ns,
                None,
                "failed",
                Some(&e),
            )?;
            return Err(e);
        }
    };
    if service.is_replay_deleted(&hash)? {
        service.record_import(
            &key,
            source.size,
            &source.mtime_ns,
            Some(&hash),
            "deleted",
            None,
        )?;
        return Ok(Preparation::Deleted);
    }
    if let Some(id) = service.replay_id_by_hash(&hash)? {
        service.restore_original_filename(
            &hash,
            source
                .path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .as_ref(),
        )?;
        service.record_import(
            &key,
            source.size,
            &source.mtime_ns,
            Some(&hash),
            "already_present",
            None,
        )?;
        return Ok(Preparation::Present { id });
    }
    let copy = match snapshot(&bytes, &hash, &service.snapshot_dir()) {
        Ok(copy) => copy,
        Err(e) => {
            service.record_import(
                &key,
                source.size,
                &source.mtime_ns,
                Some(&hash),
                "failed",
                Some(&e),
            )?;
            return Err(e);
        }
    };
    Ok(Preparation::Parse {
        source,
        snapshot: copy,
        hash,
    })
}

async fn import_paths(
    app: &AppHandle,
    state: &AppState,
    paths: Vec<PathBuf>,
) -> Result<Value, String> {
    let total = paths.len();
    let mut counts = ImportCounts::default();
    let mut replay_id = None;
    for (idx, path) in paths.iter().enumerate() {
        if state.cancel.load(Ordering::SeqCst) {
            break;
        }
        let file_name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let report = |status: &str, error: Option<&str>| {
            let _=app.emit("import-progress",json!({"current":idx+1,"total":total,"file":file_name,"status":status,"error":error}));
        };
        let service = state.service.clone();
        let source = path.clone();
        let prepared = tokio::task::spawn_blocking(move || prepare(&service, &source))
            .await
            .map_err(|e| e.to_string())?;
        match prepared {
            Ok(Preparation::Skip { status, error }) => {
                counts.skipped += 1;
                report(
                    if status == "failed" {
                        "failed"
                    } else if status == "deleted" {
                        "deleted"
                    } else {
                        "skipped"
                    },
                    error.as_deref(),
                );
            }
            Ok(Preparation::Deleted) => {
                counts.skipped += 1;
                report("deleted", None);
            }
            Ok(Preparation::Present { id }) => {
                counts.already_present += 1;
                replay_id = Some(id);
                report("already_present", None);
            }
            Err(e) => {
                counts.failed += 1;
                report("failed", Some(&e));
            }
            Ok(Preparation::Parse {
                source,
                snapshot,
                hash,
            }) => {
                report("processing", None);
                let analysis = run_worker(&snapshot, &file_name, state.cancel.clone()).await;
                let cancelled = state.cancel.load(Ordering::SeqCst);
                let service = state.service.clone();
                let original_name = file_name.clone();
                let outcome = tokio::task::spawn_blocking(move || {
                    let key = source.path.to_string_lossy().to_string();
                    // Cancellation is retryable and must not poison a healthy source.
                    if cancelled {
                        let _ = std::fs::remove_file(&snapshot);
                        return Err("Replay import cancelled by user".to_string());
                    }
                    let parsed_id = analysis
                        .as_ref()
                        .ok()
                        .and_then(|a| a["summary"]["id"].as_str())
                        .map(str::to_string);
                    let saved = analysis.and_then(|mut a| {
                        if a["summary"]["file_hash"].as_str() != Some(hash.as_str()) {
                            return Err(
                                "Parsed replay hash did not match its verified source snapshot"
                                    .into(),
                            );
                        }
                        a["summary"]["file_name"] = json!(original_name);
                        service.save_replay(&a)?;
                        Ok(a["summary"]["id"].as_str().map(str::to_string))
                    });
                    match saved {
                        Ok(id) => {
                            service.record_import(
                                &key,
                                source.size,
                                &source.mtime_ns,
                                Some(&hash),
                                "new",
                                None,
                            )?;
                            Ok(id)
                        }
                        Err(e) => {
                            let deleted = service.is_replay_deleted(&hash)?
                                || parsed_id
                                    .as_deref()
                                    .map(|id| service.is_replay_id_deleted(id))
                                    .transpose()?
                                    .unwrap_or(false);
                            service.record_import(
                                &key,
                                source.size,
                                &source.mtime_ns,
                                Some(&hash),
                                if deleted { "deleted" } else { "failed" },
                                if deleted { None } else { Some(&e) },
                            )?;
                            let _ = std::fs::remove_file(&snapshot);
                            if deleted {
                                Ok(None)
                            } else {
                                Err(e)
                            }
                        }
                    }
                })
                .await
                .map_err(|e| e.to_string())?;
                match outcome {
                    Ok(Some(id)) => {
                        counts.imported += 1;
                        replay_id = Some(id);
                        report("new", None);
                    }
                    Ok(None) => {
                        counts.skipped += 1;
                        report("deleted", None);
                    }
                    Err(e) => {
                        if !cancelled {
                            counts.failed += 1;
                        }
                        report(if cancelled { "cancelled" } else { "failed" }, Some(&e));
                    }
                }
            }
        }
    }
    let mut result = counts.json(state.cancel.load(Ordering::SeqCst));
    result["replay_id"] = json!(replay_id);
    let mut done = result.clone();
    done["status"] = json!("done");
    done["file"] = json!("Complete");
    done["current"] = json!(total);
    done["total"] = json!(total);
    let _ = app.emit("import-progress", done);
    Ok(result)
}

pub async fn import(app: &AppHandle, state: &AppState, folder: &str) -> Result<Value, String> {
    let _guard = acquire_import(state).await;
    let folder = folder.to_owned();
    let paths =
        tokio::task::spawn_blocking(move || replay_core::replay_paths(&safe_folder(&folder)?))
            .await
            .map_err(|e| e.to_string())??;
    import_paths(app, state, paths).await
}

pub async fn retry_failed(
    app: &AppHandle,
    state: &AppState,
    folder: &str,
) -> Result<Value, String> {
    let _guard = acquire_import(state).await;
    let folder = folder.to_owned();
    let service = state.service.clone();
    let paths = tokio::task::spawn_blocking(move || {
        let folder = safe_folder(&folder)?;
        service.retry_failed_imports(&folder)?;
        replay_core::replay_paths(&folder)
    })
    .await
    .map_err(|e| e.to_string())??;
    import_paths(app, state, paths).await
}

pub async fn import_single_file(
    app: &AppHandle,
    state: &AppState,
    file_path: &str,
) -> Result<Value, String> {
    let _guard = acquire_import(state).await;
    if !Path::new(file_path)
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("replay"))
    {
        return Err("Select a .replay file".into());
    }
    // A file selected immediately after a copy/save deserves one settling wait
    // instead of returning a silent skip to the manual action.
    let settle = std::fs::metadata(file_path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.elapsed().ok())
        .and_then(|age| Duration::from_secs(2).checked_sub(age));
    if let Some(settle) = settle {
        tokio::time::sleep(settle).await;
    }
    import_paths(app, state, vec![PathBuf::from(file_path)]).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn old_file(dir: &Path, name: &str, bytes: &[u8]) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, bytes).unwrap();
        std::fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap()
            .set_times(
                std::fs::FileTimes::new()
                    .set_modified(std::time::UNIX_EPOCH + Duration::from_secs(1_600_000_000)),
            )
            .unwrap();
        path
    }

    #[test]
    fn unchanged_failed_or_imported_file_never_creates_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let service = coach_services::CoachService::open(dir.path()).unwrap();
        let file = old_file(dir.path(), "broken.replay", b"malformed replay");
        let source = fingerprint(&file).unwrap();
        for status in ["failed", "new", "already_present", "deleted"] {
            service
                .record_import(
                    source.path.to_string_lossy().as_ref(),
                    source.size,
                    &source.mtime_ns,
                    None,
                    status,
                    Some("retained reason"),
                )
                .unwrap();
            assert!(
                matches!(prepare(&service,&file).unwrap(),Preparation::Skip{status:s,error:Some(e)} if s==status && e=="retained reason")
            );
            assert!(!service.snapshot_dir().exists());
        }
        std::fs::write(&file, b"changed replay").unwrap();
        assert!(service
            .unchanged_import(source.path.to_string_lossy().as_ref(), 14, &source.mtime_ns)
            .unwrap()
            .is_none());
    }

    #[test]
    fn duplicate_and_deleted_hash_are_checked_before_copy() {
        let dir = tempfile::tempdir().unwrap();
        let service = coach_services::CoachService::open(dir.path()).unwrap();
        let bytes = b"replay bytes";
        let hash = format!("{:x}", Sha256::digest(bytes));
        let original = old_file(dir.path(), "friendly.replay", bytes);
        service.save_replay(&json!({"summary":{"id":"match","file_hash":hash,"file_name":format!("{hash}.replay")},"players":[],"frames":[]})).unwrap();
        assert!(
            matches!(prepare(&service,&original).unwrap(),Preparation::Present{id} if id=="match")
        );
        assert!(!service.snapshot_dir().exists());
        assert_eq!(
            service.get_coach_replay("match").unwrap()["summary"]["file_name"],
            "friendly.replay"
        );
        service.delete_replay("match").unwrap();
        let moved = old_file(dir.path(), "renamed.replay", bytes);
        assert!(matches!(
            prepare(&service, &moved).unwrap(),
            Preparation::Deleted
        ));
        assert!(!service.snapshot_dir().exists());
    }

    #[test]
    fn rejects_empty_oversized_and_changed_input() {
        let dir = tempfile::tempdir().unwrap();
        let empty = old_file(dir.path(), "empty.replay", b"");
        assert!(read_stable(&fingerprint(&empty).unwrap()).is_err());
        let source = old_file(dir.path(), "changed.replay", b"abc");
        let before = fingerprint(&source).unwrap();
        std::fs::write(&source, b"xyzabc").unwrap();
        assert!(read_stable(&before)
            .unwrap_err()
            .contains("changed during import"));
        let mut fake = before;
        fake.size = MAX_REPLAY_SIZE + 1;
        assert!(read_stable(&fake).unwrap_err().contains("64 MiB"));
    }

    #[test]
    fn corrupted_snapshot_is_replaced_from_verified_source() {
        let dir = tempfile::tempdir().unwrap();
        let bytes = b"trusted";
        let hash = format!("{:x}", Sha256::digest(bytes));
        let path = snapshot(bytes, &hash, dir.path()).unwrap();
        std::fs::write(&path, b"wrong").unwrap();
        assert_eq!(snapshot(bytes, &hash, dir.path()).unwrap(), path);
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
    }
}
