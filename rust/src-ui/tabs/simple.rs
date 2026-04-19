//! Simple tab — daily-listener controls (Build A #90, SPEC_062 §4).

use std::sync::atomic::Ordering;

use egui::{Color32, RichText, Ui};
use harmonyengine::config::Phase;

use crate::bridge::{AudioBridge, SharedAudioState, UiCmd};
use crate::theme::{ACCENT, ACCENT_DIM, BG_PANEL, PHASE_COLORS, TEXT_DIM};

pub const PALETTE_NAMES: [&str; 10] = [
    "dark_techno",
    "synthwave",
    "glitch",
    "ambient_dread",
    "lo_fi_chill",
    "chiptune",
    "noir_jazz",
    "industrial",
    "vaporwave",
    "breakbeat",
];

pub const PALETTE_LABELS: [&str; 10] = [
    "Dark Techno",
    "Synthwave",
    "Glitch",
    "Ambient Dread",
    "Lo-Fi Chill",
    "Chiptune",
    "Noir Jazz",
    "Industrial",
    "Vaporwave",
    "Breakbeat",
];

/// Mutable UI state owned by App (passed in each frame).
pub struct SimpleState {
    pub is_playing: bool,
    pub palette_idx: usize,
    pub volume: f32,
    pub muted: bool,
    pub forced_phase: u8, // 0=Auto 1=Pulse..5=Maelstrom
    pub bpm: f32,
    pub mood: usize,      // 0=Chill 1=Normal 2=Intense
    pub viz_enabled: bool,
    pub viz_fullscreen: bool,
    pub seed: i32,
    pub preset_names: Vec<String>,
    pub selected_preset: usize,
    pub save_dialog_open: bool,
    pub save_preset_name: String,
    pub open_dialog_open: bool,
}

impl Default for SimpleState {
    fn default() -> Self {
        Self {
            is_playing: true,
            palette_idx: 0,
            volume: 1.0,
            muted: false,
            forced_phase: 0,
            bpm: 120.0,
            mood: 1,
            viz_enabled: true,
            viz_fullscreen: false,
            seed: 12345,
            preset_names: Vec::new(),
            selected_preset: 0,
            save_dialog_open: false,
            save_preset_name: String::new(),
            open_dialog_open: false,
        }
    }
}

/// Draw the Simple tab content. Returns any commands that should be forwarded
/// to the bridge; also mutates `state` directly for pure-UI changes.
pub fn draw(ui: &mut Ui, state: &mut SimpleState, audio_state: &SharedAudioState) -> Vec<UiCmd> {
    let mut cmds: Vec<UiCmd> = Vec::new();

    // --- Play / Pause -------------------------------------------------
    ui.add_space(8.0);
    ui.horizontal(|ui| {
        let btn_label = if state.is_playing { "⏸  Pause" } else { "▶  Play" };
        let btn = egui::Button::new(RichText::new(btn_label).strong().size(16.0))
            .min_size(egui::vec2(120.0, 40.0))
            .fill(if state.is_playing { ACCENT_DIM } else { ACCENT });
        if ui.add(btn).clicked() {
            state.is_playing = !state.is_playing;
            cmds.push(UiCmd::SetMuted(!state.is_playing));
        }

        ui.add_space(16.0);

        // New song button.
        if ui.button("🎲  New Song").clicked() {
            let new_seed = rand_seed();
            state.seed = new_seed;
            cmds.push(UiCmd::NewSong(new_seed));
        }

        // Seed display + clipboard.
        ui.add_space(8.0);
        ui.label(RichText::new(format!("Seed: {}", state.seed)).monospace().color(TEXT_DIM));
        if ui.small_button("📋").on_hover_text("Copy seed").clicked() {
            ui.output_mut(|o| o.copied_text = state.seed.to_string());
        }
    });

    ui.add_space(8.0);
    ui.separator();

    // --- Palette grid -------------------------------------------------
    ui.add_space(4.0);
    ui.label(RichText::new("Palette").strong());
    ui.add_space(4.0);
    let current_palette = PALETTE_NAMES[state.palette_idx];
    egui::Grid::new("palette_grid").num_columns(5).spacing([4.0, 4.0]).show(ui, |ui| {
        for (i, &label) in PALETTE_LABELS.iter().enumerate() {
            let selected = i == state.palette_idx;
            let btn = egui::Button::new(RichText::new(label).size(11.0))
                .fill(if selected { ACCENT_DIM } else { BG_PANEL })
                .stroke(egui::Stroke::new(if selected { 1.5 } else { 0.5 }, if selected { ACCENT } else { Color32::from_rgb(60, 60, 70) }))
                .min_size(egui::vec2(90.0, 28.0));
            if ui.add(btn).clicked() && !selected {
                state.palette_idx = i;
                cmds.push(UiCmd::SetPalette(PALETTE_NAMES[i].to_string()));
            }
            if (i + 1) % 5 == 0 {
                ui.end_row();
            }
        }
    });

    ui.add_space(4.0);
    ui.separator();

    // --- BPM + Mood + Volume ------------------------------------------
    ui.add_space(4.0);
    egui::Grid::new("controls_grid").num_columns(2).spacing([16.0, 6.0]).show(ui, |ui| {
        // BPM slider.
        ui.label("BPM");
        let bpm_resp = ui.add(
            egui::Slider::new(&mut state.bpm, 60.0..=180.0)
                .step_by(1.0)
                .suffix(" bpm")
                .min_decimals(0)
                .max_decimals(0),
        );
        if bpm_resp.changed() {
            cmds.push(UiCmd::SetBpm(state.bpm));
        }
        ui.end_row();

        // Mood selector.
        ui.label("Mood");
        ui.horizontal(|ui| {
            for (i, label) in ["Chill", "Normal", "Intense"].iter().enumerate() {
                let sel = i == state.mood;
                let btn = egui::Button::new(*label)
                    .fill(if sel { ACCENT_DIM } else { BG_PANEL });
                if ui.add(btn).clicked() && !sel {
                    state.mood = i;
                    // BPM snapping per mood.
                    let snap_bpm = [90.0f32, 120.0, 150.0][i];
                    state.bpm = snap_bpm;
                    cmds.push(UiCmd::SetBpm(snap_bpm));
                }
            }
        });
        ui.end_row();

        // Volume.
        ui.label("Volume");
        ui.horizontal(|ui| {
            let vol_resp = ui.add(
                egui::Slider::new(&mut state.volume, 0.0..=1.0)
                    .show_value(false),
            );
            if vol_resp.changed() {
                cmds.push(UiCmd::SetVolume(state.volume));
            }
            let mute_btn = egui::Button::new(if state.muted { "🔇" } else { "🔊" });
            if ui.add(mute_btn).clicked() {
                state.muted = !state.muted;
                cmds.push(UiCmd::SetMuted(state.muted));
            }
        });
        ui.end_row();
    });

    ui.add_space(4.0);
    ui.separator();

    // --- Phase override -----------------------------------------------
    ui.add_space(4.0);
    ui.label(RichText::new("Phase Override").strong());
    ui.add_space(4.0);
    ui.horizontal(|ui| {
        let labels = ["Auto", "Pulse", "Swell", "Surge", "Storm", "Maelstrom"];
        for (i, label) in labels.iter().enumerate() {
            let sel = state.forced_phase == i as u8;
            let phase_color = if i == 0 {
                Color32::from_rgb(60, 60, 80)
            } else {
                PHASE_COLORS[i - 1]
            };
            let fill = if sel { phase_color } else { BG_PANEL };
            let btn = egui::Button::new(RichText::new(*label).size(11.0))
                .fill(fill)
                .min_size(egui::vec2(64.0, 26.0));
            if ui.add(btn).clicked() {
                state.forced_phase = i as u8;
                let phase_opt = match i {
                    1 => Some(Phase::Pulse),
                    2 => Some(Phase::Swell),
                    3 => Some(Phase::Surge),
                    4 => Some(Phase::Storm),
                    5 => Some(Phase::Maelstrom),
                    _ => None,
                };
                cmds.push(UiCmd::ForcePhase(phase_opt));
            }
        }
    });

    ui.add_space(4.0);
    ui.separator();

    // --- Visualizer controls ------------------------------------------
    ui.add_space(4.0);
    ui.horizontal(|ui| {
        ui.label(RichText::new("Visualizer").strong());
        let viz_btn = egui::Button::new(if state.viz_enabled { "On" } else { "Off" })
            .fill(if state.viz_enabled { ACCENT_DIM } else { BG_PANEL });
        if ui.add(viz_btn).clicked() {
            state.viz_enabled = !state.viz_enabled;
        }
        if state.viz_enabled {
            if ui.button("⛶  Fullscreen").clicked() {
                state.viz_fullscreen = true;
            }
        }
    });

    ui.add_space(4.0);
    ui.separator();

    // --- Preset quick-load --------------------------------------------
    ui.add_space(4.0);
    ui.horizontal(|ui| {
        ui.label(RichText::new("Presets").strong());
        if ui.button("💾 Save").clicked() {
            state.save_dialog_open = true;
        }
        if ui.button("📂 Open").clicked() {
            state.open_dialog_open = true;
        }
    });

    if !state.preset_names.is_empty() {
        ui.add_space(2.0);
        egui::ComboBox::from_id_source("preset_dropdown")
            .selected_text(
                state.preset_names
                    .get(state.selected_preset)
                    .map(|s| s.as_str())
                    .unwrap_or("— select —"),
            )
            .show_ui(ui, |ui| {
                for (i, name) in state.preset_names.iter().enumerate() {
                    ui.selectable_value(&mut state.selected_preset, i, name.as_str());
                }
            });
    }

    cmds
}

/// XorShift32 — cheap non-crypto RNG for seeding new songs without rand dep.
fn rand_seed() -> i32 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let mut x = ts ^ 0xDEAD_BEEF;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    x as i32
}
