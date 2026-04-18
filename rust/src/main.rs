//! HarmonyEngine Phase 1 binary — plays a palette forever (or until Ctrl-C).
//!
//! CLI (positional, all optional):
//!   arg1  seed (i32, default 12345)
//!   arg2  duration in seconds (u64, default 600)
//!   --palette <name>  pick a palette by name (default dark_techno)

use std::time::Duration;

use harmonyengine::audio::AudioHost;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args: Vec<String> = std::env::args().skip(1).collect();

    // Extract --palette <name> if present.
    let mut palette_name: Option<String> = None;
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--palette" && i + 1 < args.len() {
            palette_name = Some(args.remove(i + 1));
            args.remove(i);
        } else {
            i += 1;
        }
    }

    let seed: i32 = args.first().and_then(|s| s.parse().ok()).unwrap_or(12345);
    let duration_secs: u64 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(600);

    let _host = AudioHost::start_with_palette(seed, palette_name.as_deref()).map_err(
        |e| -> Box<dyn std::error::Error> { Box::new(std::io::Error::other(e.to_string())) },
    )?;

    let palette_display = palette_name.as_deref().unwrap_or("dark_techno");
    eprintln!(
        "[HE] playing {palette_display} (seed={seed}) for {duration_secs}s — Ctrl-C to stop early"
    );
    std::thread::sleep(Duration::from_secs(duration_secs));
    Ok(())
}
