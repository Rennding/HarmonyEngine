//! HarmonyEngine desktop UI — eframe/egui entry point (Build A #90, SPEC_062).
//!
//! CLI args (all optional, same as CLI binary):
//!   --palette <name>   initial palette (default dark_techno)
//!   --seed <i32>       initial seed (default 12345)
//!   --enable-2b2       enable all Phase 2b-2 algorithm upgrades

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod bridge;
mod presets;
mod shortcuts;
mod tabs;
mod theme;
mod widgets;

use app::HarmonyApp;
use harmonyengine::config::flags;

fn main() -> eframe::Result {
    let mut args: Vec<String> = std::env::args().skip(1).collect();

    let mut palette_name: Option<String> = None;
    let mut seed: i32 = 12345;
    let mut enable_2b2 = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--palette" if i + 1 < args.len() => {
                palette_name = Some(args.remove(i + 1));
                args.remove(i);
            }
            "--seed" if i + 1 < args.len() => {
                if let Ok(s) = args[i + 1].parse::<i32>() {
                    seed = s;
                }
                args.remove(i + 1);
                args.remove(i);
            }
            "--enable-2b2" => {
                enable_2b2 = true;
                args.remove(i);
            }
            _ => i += 1,
        }
    }

    if enable_2b2 {
        flags::enable_all_2b2();
    }

    let palette_for_cc = palette_name.clone();
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("HarmonyEngine")
            .with_inner_size([860.0, 640.0])
            .with_min_inner_size([600.0, 400.0]),
        ..Default::default()
    };

    eframe::run_native(
        "HarmonyEngine",
        options,
        Box::new(move |cc| {
            Ok(Box::new(HarmonyApp::new(
                cc,
                seed,
                palette_for_cc.as_deref(),
            )))
        }),
    )
}
