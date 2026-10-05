#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod ingest;
mod worker_limits;

use coach_services::CoachService;
use std::sync::{atomic::AtomicBool, Arc};
use tauri::Manager;

pub struct AppState {
    pub service: Arc<CoachService>,
    pub importing: Arc<AtomicBool>,
    pub cancel: Arc<AtomicBool>,
}

fn main() {
    // Child worker process execution (isolated from GUI, service, and provider init)
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--parse-worker") {
        let result = args
            .get(2)
            .ok_or_else(|| "Missing snapshot path".to_string())
            .and_then(|path| replay_core::parse_replay(std::path::Path::new(path)))
            .and_then(|analysis| serde_json::to_string(&analysis).map_err(|e| e.to_string()));
        match result {
            Ok(json) => println!("{json}"),
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let service = Arc::new(CoachService::open(&data_dir).map_err(std::io::Error::other)?);

            // Seed initial profile notes if not present
            let mem = service.get_memory().map_err(std::io::Error::other)?;
            if !mem.as_array().is_some_and(|files| files.iter().any(|f| f["name"] == "profile.md")) {
                let _ = service.save_memory(
                    "profile.md",
                    "# Coaching Profile\n\n- Scope: Competitive 1v1, 2v2 and 3v3.\n- Current 2v2 self-reported rank: Diamond 2.\n- Current 3v3 self-reported rank: Diamond 2.\n- Focus areas: Boost conservation, rotations, small-pad pathing, backpost defense.\n\nThese are user-reported starting parameters. AntiRL will measure progress against verified replay telemetry.\n",
                );
            }

            app.manage(AppState {
                service,
                importing: Arc::new(AtomicBool::new(false)),
                cancel: Arc::new(AtomicBool::new(false)),
            });

            // Background auto-import checker
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(20)).await;
                    let state = handle.state::<AppState>();
                    if let Ok(settings) = state.service.get_settings() {
                        if settings["auto_import"].as_bool() == Some(true) {
                            let folder = settings["replay_folder"]
                                .as_str()
                                .unwrap_or_default()
                                .to_string();
                            if !folder.is_empty() {
                                let _ = ingest::import(&handle, &state, &folder).await;
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_library,
            commands::import_folder,
            commands::import_single_file,
            commands::get_replay,
            commands::delete_replay,
            commands::get_settings,
            commands::save_settings,
            commands::get_progress,
            commands::get_teammates,
            commands::list_models,
            commands::set_api_key,
            commands::get_ai_status,
            commands::chat,
            commands::analyze_with_ai,
            commands::get_conversations,
            commands::get_messages,
            commands::get_memory,
            commands::save_memory,
            commands::delete_memory,
            commands::start_chatgpt_sign_in,
            commands::sign_out_chatgpt,
            commands::cancel_import,
            commands::cancel_ai
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start AntiRL desktop application");
}
