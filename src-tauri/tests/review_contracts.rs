//! Boundary characterization; synthetic temporary profiles only.
#![allow(dead_code)]
#[path = "../src/dto.rs"]
mod dto;
#[path = "../src/errors.rs"]
mod errors;

#[test]
fn review_malformed_settings_save_is_successful_then_contract_fails() {
    let dir = tempfile::tempdir().unwrap();
    let s = coach_services::CoachService::open(dir.path()).unwrap();
    let result = s
        .save_settings(serde_json::json!({"chat_model":42}))
        .unwrap();
    assert!(matches!(
        dto::decode::<dto::SettingsDto>(result),
        Err(errors::AppError::Internal(_))
    ));
    assert_eq!(s.get_settings().unwrap()["chat_model"], 42);
}

#[test]
fn review_substring_error_classification_changes_with_incidental_text() {
    assert!(matches!(
        errors::AppError::from("Local storage operation failed: credential_notes table corrupt"),
        errors::AppError::Authentication(_)
    ));
    assert!(matches!(
        errors::AppError::from("Replay worker exited with code -1073741819"),
        errors::AppError::Validation(_)
    ));
    assert!(matches!(
        errors::AppError::from("Replay parsing timed out after 45 seconds"),
        errors::AppError::Network(_)
    ));
    assert!(matches!(
        errors::AppError::from("Replay file C:/matches/401-demo.replay is corrupt"),
        errors::AppError::Authentication(_)
    ));
}
