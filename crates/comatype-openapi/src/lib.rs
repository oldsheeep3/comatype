//! Conversion from and to OpenAPI.
//!
//! - `export`: `.comat`（IR）→ OpenAPI 3.0.3
//! - `import`: OpenAPI (YAML / JSON) → a set of `.comat` files

mod export;
mod import;

pub use export::{export, to_yaml};
pub use import::{import, parse_document, Imported};
