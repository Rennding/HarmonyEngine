//! HarmonyEngine Phase 1 binary — plays `dark_techno` forever (or until
//! Ctrl-C). Seed can be overridden via the first CLI arg for golden-test
//! replay parity with JS.

use std::time::Duration;

use harmonyengine::audio::AudioHost;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let seed: i32 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(12345);

    let duration_secs: u64 = std::env::args()
        .nth(2)
        .and_then(|s| s.parse().ok())
        .unwrap_or(600); // 10-minute default satisfies Phase 1 AC#3 "no underruns in 10 min"

    let _host = AudioHost::start(seed).map_err(|e| -> Box<dyn std::error::Error> {
        Box::new(std::io::Error::other(e.to_string()))
    })?;

    eprintln!(
        "[HE] playing dark_techno (seed={seed}) for {duration_secs}s — Ctrl-C to stop early"
    );
    std::thread::sleep(Duration::from_secs(duration_secs));
    Ok(())
}
