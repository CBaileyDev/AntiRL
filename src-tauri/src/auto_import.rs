//! Event-driven folder discovery with periodic stat-only reconciliation.
use crate::{ingest, AppState};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::{path::PathBuf, time::Duration};
use tauri::{AppHandle, Manager};

pub async fn watch(app: AppHandle) {
    let (send, mut events) = tokio::sync::mpsc::channel::<()>(1);
    let mut watcher: Option<RecommendedWatcher> =
        notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
            if result.is_ok_and(|event| !matches!(event.kind, notify::EventKind::Access(_))) {
                let _ = send.try_send(());
            }
        })
        .ok();
    let mut watched: Option<PathBuf> = None;
    loop {
        let state = app.state::<AppState>();
        let service = state.service.clone();
        let settings = tokio::task::spawn_blocking(move || service.get_settings()).await;
        let configured = settings
            .ok()
            .and_then(Result::ok)
            .filter(|s| s["auto_import"].as_bool() == Some(true))
            .and_then(|s| s["replay_folder"].as_str().map(PathBuf::from))
            .filter(|p| !p.as_os_str().is_empty());
        if configured != watched {
            if let Some(watcher) = watcher.as_mut() {
                if let Some(old) = watched.as_ref() {
                    let _ = watcher.unwatch(old);
                }
                if let Some(path) = configured.as_ref() {
                    let _ = watcher.watch(path, RecursiveMode::NonRecursive);
                }
            }
            watched = configured;
        }
        if let Some(path) = watched.as_ref() {
            let _ = ingest::import(&app, &state, &path.to_string_lossy()).await;
        }
        tokio::select! {
            event = events.recv(), if watcher.is_some() => {
                if event.is_none() { watcher = None; }
                loop {
                    tokio::select! {
                        _ = tokio::time::sleep(Duration::from_millis(2100)) => break,
                        more = events.recv() => { if more.is_none() { watcher = None; break; } },
                    }
                }
            },
            _ = tokio::time::sleep(Duration::from_secs(20)) => {},
        }
    }
}
