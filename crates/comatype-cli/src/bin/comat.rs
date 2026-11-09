//! `comat`: a short name for `comatype` (the same program).
#[path = "../main.rs"]
mod app;

fn main() -> std::process::ExitCode {
    app::main()
}
