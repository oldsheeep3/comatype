//! Error types.

use std::fmt;

/// Input or output does not match a .comat type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationError {
    pub path: String,
    pub reason: String,
}

impl ValidationError {
    pub fn new(path: impl Into<String>, reason: impl Into<String>) -> Self {
        ValidationError { path: path.into(), reason: reason.into() }
    }
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.path.is_empty() {
            f.write_str(&self.reason)
        } else {
            write!(f, "{}: {}", self.path, self.reason)
        }
    }
}

impl std::error::Error for ValidationError {}

/// Joins `path` and `name` with `.` (just `name` if `path` is empty).
pub fn join(path: &str, name: &str) -> String {
    if path.is_empty() {
        name.to_string()
    } else {
        format!("{path}.{name}")
    }
}

#[derive(Debug)]
pub enum Error {
    /// Validation failed before sending or after receiving
    Validation(ValidationError),
    /// A status not declared in .comat was returned
    UnexpectedStatus { status: u16, body: Vec<u8> },
    /// The network call failed
    Transport(String),
    /// Misconfiguration (wrapper not passed, no base url, etc.)
    Config(String),
    /// The server's own error
    Internal(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Validation(v) => write!(f, "{v}"),
            Error::UnexpectedStatus { status, .. } => write!(f, "想定していないステータス {status} が返りました"),
            Error::Transport(m) | Error::Config(m) | Error::Internal(m) => f.write_str(m),
        }
    }
}

impl std::error::Error for Error {}

impl From<ValidationError> for Error {
    fn from(v: ValidationError) -> Self {
        Error::Validation(v)
    }
}

pub type Result<T> = std::result::Result<T, Error>;

/// Validation error (`reason` at `path`)
pub fn fail_path(path: &str, reason: impl Into<String>) -> Error {
    Error::Validation(ValidationError::new(path, reason))
}
