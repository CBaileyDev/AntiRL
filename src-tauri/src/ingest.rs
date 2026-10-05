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
use tauri::{AppHandle, Emitter, Manager};
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

fn snapshot(source: &Path, snapshots_dir: &Path) -> Result<(PathBuf, String), String> {
    let canonical =
        std::fs::canonicalize(source).map_err(|_| "Replay file became unavailable".to_string())?;
    let mut file = std::fs::File::open(&canonical).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > MAX_REPLAY_SIZE {
        return Err("Replay file is empty or exceeds 64 MiB safety limit".into());
    }
    let mut bytes = Vec::with_capacity(meta.len() as usize);
    (&mut file)
        .take(MAX_REPLAY_SIZE + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;

    let hash = format!("{:x}", Sha256::digest(&bytes));
    std::fs::create_dir_all(snapshots_dir).map_err(|e| e.to_string())?;
    let path = snapshots_dir.join(format!("{hash}.replay"));
    if !path.exists() {
        let tmp = snapshots_dir.join(format!("{hash}.tmp"));
        std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    }
    Ok((path, hash))
}

async fn run_worker(
    snapshot: &Path,
    cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> Result<Value, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut command = tokio::process::Command::new(exe);
    command
        .arg("--parse-worker")
        .arg(snapshot)
        .env_clear()
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    #[cfg(windows)]
    {
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start replay worker: {e}"))?;

    let _job = crate::worker_limits::WorkerJob::attach(
        child.id().ok_or("Parser process has no ID")?,
    )?;

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

    let out_task = tokio::spawn(async move {
        let mut bytes = Vec::new();
        stdout.read_to_end(&mut bytes).await.map(|_| bytes)
    });
    let err_task = tokio::spawn(async move {
        let mut bytes = Vec::new();
        stderr.read_to_end(&mut bytes).await.map(|_| bytes)
    });

    let timeout_duration = Duration::from_secs(45);
    let start = tokio::time::Instant::now();

    loop {
        if cancel.load(Ordering::SeqCst) {
            let _ = child.kill().await;
            return Err("Replay import cancelled by user".into());
        }
        if start.elapsed() > timeout_duration {
            let _ = child.kill().await;
            return Err("Replay parsing timed out after 45 seconds".into());
        }
        if let Ok(Some(status)) = child.try_wait() {
            let out_bytes = out_task.await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;
            let err_bytes = err_task.await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

            if !status.success() {
                let msg = String::from_utf8_lossy(&err_bytes);
                return Err(if msg.trim().is_empty() {
                    format!("Worker process exited with code {}", status.code().unwrap_or(-1))
                } else {
                    msg.trim().to_string()
                });
            }

            let text = String::from_utf8(out_bytes).map_err(|_| "Worker output was not valid UTF-8".to_string())?;
            let value: Value = serde_json::from_str(&text).map_err(|e| format!("Worker produced invalid JSON: {e}"))?;
            return Ok(value);
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

pub async fn import(
    app: &AppHandle,
    state: &AppState,
    folder: &str,
) -> Result<Value, String> {
    if state
        .importing
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Import is already in progress".into());
    }
    let _guard = ImportGuard(state.importing.clone());
    state.cancel.store(false, Ordering::SeqCst);

    let canonical = safe_folder(folder)?;
    let paths = replay_core::replay_paths(&canonical)?;
    let snapshots_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("replay-snapshots");

    let total = paths.len();
    let mut imported = 0usize;
    let mut failed = 0usize;

    for (idx, path) in paths.iter().enumerate() {
        if state.cancel.load(Ordering::SeqCst) {
            break;
        }

        let file_name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let _ = app.emit(
            "import-progress",
            json!({
                "current": idx + 1,
                "total": total,
                "file": file_name,
                "status": "processing"
            }),
        );

        let (sp, sd) = (path.clone(), snapshots_dir.clone());
        let snapshot_res = tokio::task::spawn_blocking(move || snapshot(&sp, &sd))
            .await
            .map_err(|e| e.to_string())
            .and_then(|r| r);
        let (snap_path, content_hash) = match snapshot_res {
            Ok(pair) => pair,
            Err(e) => {
                failed += 1;
                let _ = app.emit(
                    "import-progress",
                    json!({
                        "current": idx + 1,
                        "total": total,
                        "file": file_name,
                        "status": "error",
                        "error": e
                    }),
                );
                continue;
            }
        };

        // Check if replay is already saved
        if let Ok(true) = state.service.has_replay_by_hash(&content_hash) {
            imported += 1;
            continue;
        }

        match run_worker(&snap_path, state.cancel.clone()).await {
            Ok(analysis) => {
                if let Err(e) = state.service.save_replay(&analysis) {
                    failed += 1;
                    let _ = app.emit(
                        "import-progress",
                        json!({
                            "current": idx + 1,
                            "total": total,
                            "file": file_name,
                            "status": "error",
                            "error": e
                        }),
                    );
                } else {
                    imported += 1;
                }
            }
            Err(e) => {
                failed += 1;
                let _ = app.emit(
                    "import-progress",
                    json!({
                        "current": idx + 1,
                        "total": total,
                        "file": file_name,
                        "status": "error",
                        "error": e
                    }),
                );
            }
        }
    }

    let _ = app.emit(
        "import-progress",
        json!({
            "current": total,
            "total": total,
            "file": "Complete",
            "status": "done",
            "imported": imported,
            "failed": failed
        }),
    );

    state.service.get_library()
}

pub async fn import_single_file(
    app: &AppHandle,
    state: &AppState,
    file_path: &str,
) -> Result<Value, String> {
    state.cancel.store(false, Ordering::SeqCst);
    let path = Path::new(file_path);
    let snapshots_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("replay-snapshots");

    let (sp, sd) = (path.to_path_buf(), snapshots_dir);
    let (snap_path, _) = tokio::task::spawn_blocking(move || snapshot(&sp, &sd))
        .await
        .map_err(|e| e.to_string())??;
    let analysis = run_worker(&snap_path, state.cancel.clone()).await?;
    state.service.save_replay(&analysis)?;
    Ok(analysis)
}
