use serde::Serialize;
use std::fmt;

/// 1-based line and column
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct Span {
    pub line: usize,
    pub col: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Diagnostic {
    pub severity: Severity,
    pub file: String,
    pub line: usize,
    pub col: usize,
    pub message: String,
    /// Syntax error (emitted by the parser). The LSP does not publish semantic check results while a syntax error exists
    pub syntax: bool,
}

impl Diagnostic {
    pub fn error(file: &str, span: Span, message: impl Into<String>) -> Self {
        Self::new(Severity::Error, file, span, message)
    }

    pub fn syntax_error(file: &str, span: Span, message: impl Into<String>) -> Self {
        Diagnostic { syntax: true, ..Self::new(Severity::Error, file, span, message) }
    }

    pub fn warning(file: &str, span: Span, message: impl Into<String>) -> Self {
        Self::new(Severity::Warning, file, span, message)
    }

    fn new(severity: Severity, file: &str, span: Span, message: impl Into<String>) -> Self {
        Diagnostic { severity, file: file.to_string(), line: span.line, col: span.col, message: message.into(), syntax: false }
    }

    pub fn is_error(&self) -> bool {
        self.severity == Severity::Error
    }
}

impl fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let level = match self.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
        };
        if self.line == 0 {
            write!(f, "{}: {}: {}", self.file, level, self.message)
        } else {
            write!(f, "{}:{}:{}: {}: {}", self.file, self.line, self.col, level, self.message)
        }
    }
}
