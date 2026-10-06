#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auto_import;
mod commands;
mod dto;
mod errors;
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
            .map(|mut analysis| {
                if let Some(name) = args.get(3) {
                    analysis.summary.file_name = name.clone();
                }
                analysis
            })
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
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = std::env::var_os("ANTIRL_QA_DATA_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?);
            let service = Arc::new(CoachService::open(&data_dir).map_err(std::io::Error::other)?);
            if std::env::var_os("ANTIRL_QA_DATA_DIR").is_some() {
                let mut settings = service.get_settings().map_err(std::io::Error::other)?;
                settings["auto_import"] = serde_json::json!(false);
                service
                    .save_settings(settings)
                    .map_err(std::io::Error::other)?;
            }

            app.manage(AppState {
                service,
                importing: Arc::new(AtomicBool::new(false)),
                cancel: Arc::new(AtomicBool::new(false)),
            });

            // Folder events trigger imports; periodic stat reconciliation catches
            // missed notifications and updates the configured watch directory.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(auto_import::watch(handle));

            Ok(())
        })
        .invoke_handler(ipc_builder().invoke_handler())
        .run(tauri::generate_context!())
        .expect("Unable to start AntiRL desktop application");
}

fn ipc_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
        .commands(tauri_specta::collect_commands![
            commands::create_conversation,
            commands::update_conversation,
            commands::get_context_manifest,
            commands::rebuild_analytics,
            commands::search_training_packs,
            commands::get_practice,
            commands::save_practice_plan,
            commands::record_training,
            commands::start_transfer,
            commands::save_transfer_checkin,
            commands::archive_practice,
            commands::evidence_tool,
            commands::camera_profile,
            commands::reset_camera_profile,
            commands::detector_reports,
            commands::save_camera_profile,
            commands::review_situation,
            commands::drill_from_fingerprint,
            commands::save_detector_report,
            commands::export_conversation,
            commands::get_library,
            commands::import_folder,
            commands::import_single_file,
            commands::get_replay,
            commands::get_coach_replay,
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
            commands::cancel_ai,
            commands::get_player_candidates,
            commands::resolve_identity,
            commands::get_import_status,
            commands::get_cloud_preview,
            commands::retry_failed_imports
        ])
}

#[cfg(test)]
mod tests {
    #[test]
    fn export_ipc_bindings() {
        super::ipc_builder()
            .export(
                specta_typescript::Typescript::default()
                    .bigint(specta_typescript::BigIntExportBehavior::Number),
                concat!(env!("CARGO_MANIFEST_DIR"), "/../app/src/bindings.ts"),
            )
            .expect("Typed IPC bindings export");
        // Tauri's Specta implementation for Channel is opaque. The exporter
        // also imports the real JS Channel; keep that import as the wire type.
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../app/src/bindings.ts");
        let source = std::fs::read_to_string(path).expect("Read generated contracts");
        let source = source.replace("export type TAURI_CHANNEL<TSend> = null", "");
        let normalized = source
            .lines()
            .map(str::trim_end)
            .collect::<Vec<_>>()
            .join("\n");
        std::fs::write(path, format!("{normalized}\n")).expect("Normalize opaque Channel contract");
    }
}
