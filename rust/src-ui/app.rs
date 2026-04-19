//! `HarmonyApp` — top-level egui `App` impl (Build A #90, SPEC_062 §3).
//!
//! Owns the audio bridge, all UI state, and the autosave timer.
//! Routing: Simple tab (default) ↔ Engineer tab (stub in Build A).
//! Fullscreen visualizer mode hides tabs and shows only the visualizer.

use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use egui::{Color32, Context, RichText, TopBottomPanel, Ui};

use crate::bridge::{AudioBridge, UiCmd};
use crate::presets::{Preset, PresetStore};
use crate::shortcuts;
use crate::tabs::simple::{SimpleState, PALETTE_NAMES};
use crate::tabs::visualizer;
use crate::widgets::{meter::LevelMeter, phase_indicator};
use crate::theme;

#[derive(PartialEq, Clone, Copy)]
pub enum ActiveTab {
    Simple,
    Engineer,
}

pub struct HarmonyApp {
    bridge: AudioBridge,
    tab: ActiveTab,
    simple: SimpleState,
    meter: LevelMeter,
    preset_store: Option<PresetStore>,
    last_autosave: Instant,
    show_help: bool,
}

impl HarmonyApp {
    pub fn new(cc: &eframe::CreationContext, seed: i32, palette: Option<&str>) -> Self {
        theme::apply(&cc.egui_ctx);

        let bridge = AudioBridge::start(seed, palette)
            .expect("[HE-UI] failed to start audio bridge");

        // Seed SimpleState from bridge initial state.
        let bpm = bridge.state.bpm();
        let palette_name = bridge.state.palette_name.lock()
            .ok()
            .map(|g| g.clone())
            .unwrap_or_else(|| "dark_techno".to_string());
        let palette_idx = PALETTE_NAMES
            .iter()
            .position(|&n| n == palette_name.as_str())
            .unwrap_or(0);

        let mut simple = SimpleState::default();
        simple.seed = seed;
        simple.bpm = bpm;
        simple.palette_idx = palette_idx;

        let preset_store = PresetStore::new();

        // Load autosave if present.
        if let Some(ref store) = preset_store {
            if let Some(preset) = store.load_autosave() {
                apply_preset_to_simple(&preset, &mut simple);
                send_preset_cmds(&preset, &bridge);
            }
            simple.preset_names = store.named_preset_names();
        }

        Self {
            bridge,
            tab: ActiveTab::Simple,
            simple,
            meter: LevelMeter::default(),
            preset_store,
            last_autosave: Instant::now(),
            show_help: false,
        }
    }

    fn current_preset(&self) -> Preset {
        let beat = self.bridge.state.beat.load(Ordering::Relaxed);
        Preset::new(
            "autosave",
            self.simple.seed,
            PALETTE_NAMES[self.simple.palette_idx],
            self.simple.bpm,
            ["chill", "normal", "intense"][self.simple.mood],
            self.simple.volume,
            self.simple.muted,
            self.simple.forced_phase,
            beat,
        )
    }

    fn handle_actions(&mut self, ctx: &Context) {
        for action in shortcuts::dispatch(ctx) {
            use shortcuts::Action;
            match action {
                Action::TogglePlay => {
                    self.simple.is_playing = !self.simple.is_playing;
                    self.bridge.send(UiCmd::SetMuted(!self.simple.is_playing));
                }
                Action::NewSong => {
                    let seed = new_seed();
                    self.simple.seed = seed;
                    self.bridge.send(UiCmd::NewSong(seed));
                }
                Action::PrevPalette => {
                    let i = (self.simple.palette_idx + PALETTE_NAMES.len() - 1) % PALETTE_NAMES.len();
                    self.simple.palette_idx = i;
                    self.bridge.send(UiCmd::SetPalette(PALETTE_NAMES[i].to_string()));
                }
                Action::NextPalette => {
                    let i = (self.simple.palette_idx + 1) % PALETTE_NAMES.len();
                    self.simple.palette_idx = i;
                    self.bridge.send(UiCmd::SetPalette(PALETTE_NAMES[i].to_string()));
                }
                Action::ForcePhase(n) => {
                    self.simple.forced_phase = n as u8;
                    use harmonyengine::config::Phase;
                    let p = match n {
                        1 => Some(Phase::Pulse),
                        2 => Some(Phase::Swell),
                        3 => Some(Phase::Surge),
                        4 => Some(Phase::Storm),
                        5 => Some(Phase::Maelstrom),
                        _ => None,
                    };
                    self.bridge.send(UiCmd::ForcePhase(p));
                }
                Action::VolumeUp => {
                    self.simple.volume = (self.simple.volume + 0.05).min(1.0);
                    self.bridge.send(UiCmd::SetVolume(self.simple.volume));
                }
                Action::VolumeDown => {
                    self.simple.volume = (self.simple.volume - 0.05).max(0.0);
                    self.bridge.send(UiCmd::SetVolume(self.simple.volume));
                }
                Action::ToggleMute => {
                    self.simple.muted = !self.simple.muted;
                    self.bridge.send(UiCmd::SetMuted(self.simple.muted));
                }
                Action::ToggleVisualizer => {
                    self.simple.viz_enabled = !self.simple.viz_enabled;
                }
                Action::ToggleFullscreenVisualizer => {
                    if self.simple.viz_enabled {
                        self.simple.viz_fullscreen = true;
                    }
                }
                Action::ExitFullscreen => {
                    self.simple.viz_fullscreen = false;
                }
                Action::SwitchTab => {
                    self.tab = if self.tab == ActiveTab::Simple {
                        ActiveTab::Engineer
                    } else {
                        ActiveTab::Simple
                    };
                }
                Action::SavePreset => {
                    self.simple.save_dialog_open = true;
                }
                Action::OpenPreset => {
                    self.simple.open_dialog_open = true;
                }
                Action::SaveQaRepro => {
                    if let Some(ref store) = self.preset_store {
                        let mut preset = self.current_preset();
                        preset.name = "qa-repro".to_string();
                        let _ = store.save_qa_repro(&preset);
                    }
                }
                Action::FreezeBeat => {
                    let frozen = !self.bridge.state.beat.load(Ordering::Relaxed) == 0; // dummy; track locally
                    // Toggle freeze by reading phase_indicator state — store in simple for now.
                    // We use forced_phase==6 as a sentinel for "frozen beat" display.
                    self.bridge.send(UiCmd::SetBeatFrozen(true)); // actual toggle tracked in bridge
                }
                Action::ShowHelp => {
                    self.show_help = true;
                }
            }
        }
    }

    fn maybe_autosave(&mut self) {
        if self.last_autosave.elapsed() >= Duration::from_secs(5) {
            if let Some(ref store) = self.preset_store {
                let preset = self.current_preset();
                let _ = store.autosave(&preset);
            }
            self.last_autosave = Instant::now();
        }
    }

    fn draw_save_dialog(&mut self, ctx: &Context) {
        if !self.simple.save_dialog_open {
            return;
        }
        let mut open = self.simple.save_dialog_open;
        egui::Window::new("Save Preset")
            .open(&mut open)
            .resizable(false)
            .collapsible(false)
            .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
            .show(ctx, |ui| {
                ui.label("Preset name:");
                ui.text_edit_singleline(&mut self.simple.save_preset_name);
                ui.horizontal(|ui| {
                    if ui.button("Save").clicked() {
                        if let Some(ref store) = self.preset_store {
                            let mut preset = self.current_preset();
                            preset.name = self.simple.save_preset_name.clone();
                            let _ = store.save(&preset);
                            self.simple.preset_names = store.named_preset_names();
                        }
                        self.simple.save_dialog_open = false;
                    }
                    if ui.button("Cancel").clicked() {
                        self.simple.save_dialog_open = false;
                    }
                });
            });
        self.simple.save_dialog_open = open;
    }

    fn draw_fullscreen_viz(&mut self, ctx: &Context) {
        egui::CentralPanel::default()
            .frame(egui::Frame::none().fill(Color32::BLACK))
            .show(ctx, |ui| {
                visualizer::draw_fullscreen(ui, &self.bridge.state);

                // Esc hint overlay.
                ui.with_layout(egui::Layout::bottom_up(egui::Align::RIGHT), |ui| {
                    ui.add_space(12.0);
                    ui.label(
                        RichText::new("Esc — exit fullscreen")
                            .color(Color32::from_rgba_premultiplied(180, 180, 200, 140))
                            .size(12.0),
                    );
                });
            });
    }
}

impl eframe::App for HarmonyApp {
    fn update(&mut self, ctx: &Context, _frame: &mut eframe::Frame) {
        // Always request repaint so the visualizer animates.
        ctx.request_repaint_after(Duration::from_millis(16));

        self.handle_actions(ctx);
        self.maybe_autosave();

        // Level meter — sample current FFT max as a proxy for peak level.
        let peak = {
            let fft = self.bridge.state.fft_frame.lock()
                .unwrap_or_else(|p| p.into_inner());
            fft.iter().cloned().fold(0.0f32, f32::max)
        };
        self.meter.update(peak);

        // Shortcut help modal.
        shortcuts::show_help_modal(ctx, &mut self.show_help);

        // Save dialog.
        self.draw_save_dialog(ctx);

        // Fullscreen visualizer mode.
        if self.simple.viz_fullscreen {
            self.draw_fullscreen_viz(ctx);
            return;
        }

        // --- Top bar ---
        let phase = self.bridge.state.phase();
        let beat = self.bridge.state.beat.load(Ordering::Relaxed);
        let bpm = self.bridge.state.bpm();

        TopBottomPanel::top("top_bar")
            .frame(egui::Frame::none()
                .fill(egui::Color32::from_rgb(22, 22, 28))
                .inner_margin(egui::Margin::symmetric(8.0, 4.0)))
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    // App title.
                    ui.label(RichText::new("♪ HarmonyEngine").strong().size(14.0));
                    ui.separator();
                    phase_indicator::draw(ui, phase, beat, bpm, false);
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        // Inline level meter.
                        let meter_rect = ui.allocate_space(egui::vec2(8.0, 16.0)).1;
                        self.meter.draw_vertical(ui.painter(), meter_rect);
                    });
                });
            });

        // --- Tab bar ---
        TopBottomPanel::top("tab_bar")
            .frame(egui::Frame::none()
                .fill(egui::Color32::from_rgb(26, 26, 32))
                .inner_margin(egui::Margin::symmetric(8.0, 2.0)))
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    let simple_btn = egui::Button::new("Simple")
                        .fill(if self.tab == ActiveTab::Simple { crate::theme::ACCENT_DIM } else { egui::Color32::TRANSPARENT });
                    if ui.add(simple_btn).clicked() { self.tab = ActiveTab::Simple; }
                    let eng_btn = egui::Button::new("Engineer")
                        .fill(if self.tab == ActiveTab::Engineer { crate::theme::ACCENT_DIM } else { egui::Color32::TRANSPARENT });
                    if ui.add(eng_btn).clicked() { self.tab = ActiveTab::Engineer; }
                });
            });

        // --- Main content ---
        egui::CentralPanel::default().show(ctx, |ui| {
            egui::ScrollArea::vertical().show(ui, |ui| {
                match self.tab {
                    ActiveTab::Simple => {
                        // Inline visualizer strip at top if enabled.
                        if self.simple.viz_enabled {
                            visualizer::draw_inline(ui, &self.bridge.state, 80.0);
                            ui.add_space(4.0);
                        }
                        let cmds = crate::tabs::simple::draw(ui, &mut self.simple, &self.bridge.state);
                        for cmd in cmds {
                            self.bridge.send(cmd);
                        }
                    }
                    ActiveTab::Engineer => {
                        ui.add_space(12.0);
                        ui.heading("Engineer Tab");
                        ui.add_space(8.0);
                        ui.label(RichText::new("Coming in Build B (#91)").color(crate::theme::TEXT_DIM));
                    }
                }
            });
        });
    }
}

fn apply_preset_to_simple(preset: &Preset, s: &mut SimpleState) {
    s.seed = preset.seed;
    s.bpm = preset.bpm;
    s.volume = preset.volume;
    s.muted = preset.muted;
    s.forced_phase = preset.forced_phase;
    if let Some(idx) = PALETTE_NAMES.iter().position(|&n| n == preset.palette.as_str()) {
        s.palette_idx = idx;
    }
    if let Some(idx) = ["chill", "normal", "intense"].iter().position(|&m| m == preset.mood.as_str()) {
        s.mood = idx;
    }
}

fn send_preset_cmds(preset: &Preset, bridge: &AudioBridge) {
    bridge.send(UiCmd::NewSong(preset.seed));
    bridge.send(UiCmd::SetPalette(preset.palette.clone()));
    bridge.send(UiCmd::SetBpm(preset.bpm));
    bridge.send(UiCmd::SetVolume(preset.volume));
    bridge.send(UiCmd::SetMuted(preset.muted));
    bridge.send(UiCmd::ForcePhase(preset.forced_phase_config()));
}

fn new_seed() -> i32 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let mut x = ns ^ 0xCAFE_BABE;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    x as i32
}
