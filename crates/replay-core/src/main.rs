use std::{
    io::{self, BufWriter, Write},
    path::Path,
    process::ExitCode,
};

fn run() -> Result<(), String> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 2 {
        return Err(
            "Usage: antirl-replay parse <file.replay> | profile <file.replay> | discover <folder> | verify <folder>".into(),
        );
    }
    let mut out = BufWriter::new(io::stdout().lock());
    match args[0].to_str() {
        Some("parse") => {
            serde_json::to_writer(&mut out, &replay_core::parse_replay(Path::new(&args[1]))?)
                .map_err(|e| e.to_string())?
        }
        Some("profile") => serde_json::to_writer(
            &mut out,
            &replay_core::read_profile_metadata(Path::new(&args[1]), true)?,
        )
        .map_err(|e| e.to_string())?,
        Some("discover") => serde_json::to_writer(
            &mut out,
            &replay_core::discover_replays(Path::new(&args[1]))?,
        )
        .map_err(|e| e.to_string())?,
        Some("verify") => {
            serde_json::to_writer(&mut out, &replay_core::verify_corpus(Path::new(&args[1]))?)
                .map_err(|e| e.to_string())?
        }
        _ => return Err("Unknown command".into()),
    }
    writeln!(out).map_err(|e| e.to_string())?;
    out.flush().map_err(|e| e.to_string())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
