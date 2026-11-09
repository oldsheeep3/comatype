//! Comatype language server (LSP). Run with `comatype lsp`; it talks over stdin / stdout.
//!
//! - Diagnostics: checks the whole project using the unsaved content of open files (syntax errors on every keystroke)
//! - Go to definition: type reference → declaration, import path → file, `wrap name` → wrapper in init.comat
//! - Hover, document symbols, completion

mod rpc;
mod scan;
mod server;
mod util;

pub use server::run;
