//! Stable IPC error codes. Service messages are converted at the desktop boundary.
use serde::Serialize;

#[derive(Debug, thiserror::Error, Serialize, specta::Type)]
#[serde(tag = "code", content = "message", rename_all = "snake_case")]
pub enum AppError {
    #[error("{0}")]
    Cancelled(String),
    #[error("{0}")]
    Busy(String),
    #[error("{0}")]
    Authentication(String),
    #[error("{0}")]
    Unsupported(String),
    #[error("{0}")]
    Network(String),
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    Storage(String),
    #[error("{0}")]
    Internal(String),
}

impl From<String> for AppError {
    fn from(message: String) -> Self {
        let lower = message.to_ascii_lowercase();
        if lower.contains("cancelled") {
            Self::Cancelled(message)
        } else if lower.contains("already in progress") {
            Self::Busy(message)
        } else if lower.contains("api key")
            || lower.contains("credential")
            || lower.contains("sign in")
            || lower.contains("401")
        {
            Self::Authentication(message)
        } else if lower.contains("unsupported") || lower.contains("not configured") {
            Self::Unsupported(message)
        } else if lower.contains("network")
            || lower.contains("connection")
            || lower.contains("timed out")
            || lower.contains("returned status")
        {
            Self::Network(message)
        } else if lower.contains("storage") || lower.contains("database") {
            Self::Storage(message)
        } else {
            Self::Validation(message)
        }
    }
}

impl From<&str> for AppError {
    fn from(message: &str) -> Self {
        message.to_owned().into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn error_serializes_to_stable_code_and_message() {
        assert_eq!(
            serde_json::to_value(AppError::Cancelled("Stopped".into())).unwrap(),
            serde_json::json!({"code":"cancelled","message":"Stopped"})
        );
        assert!(matches!(
            AppError::from("Import is already in progress"),
            AppError::Busy(_)
        ));
    }
}
