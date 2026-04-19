//! Engineer tab — deep-parameter control surface + QA tooling (Build B #91, SPEC_062 §5/§6).
//!
//! 8 collapsible sections: Conductor · Harmony · Sequencer · Melody · Groove ·
//! Tension · Diagnostic · 2b-2 Flags.
//!
//! Live parameters (wired to engine, audible effect on toggle):
//!   - 2b-2 flags (via config::flags global atomics — direct UI-thread calls)
//!   - Per-track gain scalars (UiCmd::SetTrackGainScalar)
//!   - Groove swing/humanize (UiCmd::SetGrooveSwing/HumanizeMs)
//!   - Cycle mode (UiCmd::SetCycleMode)
//!   - Phase progression / beat freeze (existing UiCmds)
//!
//! Stored parameters (persisted to preset, applied on new song):
//!   - Per-phase DC thresholds, Maelstrom sustain, palette recency decay,
//!     voicing override, collision mode, harmonic rhythm override,
//!     WalkingBass tier cap, chord rhythm pattern, melody variation weights,
//!     interval affinity, phrase length, tension params, diagnostic enables.

use egui::{Color32, CollapsingHeader, RichText, Ui};
use harmonyengine::config::flags;

use crate::bridge::{SharedAudioState, UiCmd};
use crate::theme::{ACCENT, ACCENT_DIM, BG_PANEL, TEXT_DIM};
use crate::widgets::knob::Knob;

// ─────────────────────────────────────────────────────────────────────────────
//  EngineerState — all tweakable params owned by App, passed in each frame
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct EngineerState {
    // Conductor
    #[serde(default = "default_false")] pub cycle_mode: bool,
    #[serde(default)] pub phase_progression: u8, // 0=Auto 1=Manual 2=Frozen
    #[serde(default = "default_dc_thresholds")] pub dc_thresholds: [f32; 5],
    #[serde(default = "default_maelstrom_sustain")] pub maelstrom_sustain: (u32, u32),

    // Harmony
    #[serde(default = "default_recency_decay")] pub recency_decay: f32,
    #[serde(default)] pub voicing_profile_override: u8,      // 0=Auto 1..=n
    #[serde(default)] pub collision_mode_override: u8,        // 0=Auto 1=Strict 2=Allow
    #[serde(default = "default_harmonic_rhythm")] pub harmonic_rhythm_beats: u8, // 1..=8

    // Sequencer
    #[serde(default = "default_track_scalars")] pub track_gain_scalars: [f32; 7],
    #[serde(default = "default_tier_cap")] pub walking_bass_tier_cap: u8,
    #[serde(default)] pub chord_pattern: u8, // 0..=7

    // Melody
    #[serde(default = "default_variation_weights")] pub variation_weights: [f32; 5],
    #[serde(default = "default_interval_affinity")] pub interval_affinity: f32,
    #[serde(default = "default_phrase_min")] pub phrase_len_min: u32,
    #[serde(default = "default_phrase_max")] pub phrase_len_max: u32,

    // Groove
    #[serde(default)] pub swing: f32,
    #[serde(default = "default_humanize")] pub humanize_ms: f32,
    #[serde(default = "default_ghost_prob")] pub ghost_prob: f32,

    // Tension
    #[serde(default = "default_tension_plateau")] pub tension_plateau_freq: f32,
    #[serde(default = "default_tension_spike")] pub tension_spike_mag: f32,
    #[serde(default = "default_tension_retreat")] pub tension_retreat_depth: f32,

    // Diagnostic
    #[serde(default = "default_diag_enables")] pub diag_enables: [bool; 15],
    #[serde(default = "default_diag_sensitivity")] pub diag_sensitivity: f32,

    // 2b-2 flags (mirrored — written through to global atomics on change)
    #[serde(default)] pub flag_voicing: bool,
    #[serde(default)] pub flag_harmonic_rhythm: bool,
    #[serde(default)] pub flag_walking_bass: bool,
    #[serde(default)] pub flag_cadential: bool,
    #[serde(default)] pub flag_lookahead: bool,

    // UI-only state (not serialised)
    #[serde(skip, default = "default_sections_open")] pub sections_open: [bool; 8],
    #[serde(skip)] pub recent_tweaks: Vec<String>,
    #[serde(skip)] pub show_diag_log: bool,
}

// Default helpers (serde needs fns)
fn default_false() -> bool { false }
fn default_dc_thresholds() -> [f32; 5] { [0.0, 0.30, 0.60, 1.00, 1.50] }
fn default_maelstrom_sustain() -> (u32, u32) { (8, 32) }
fn default_recency_decay() -> f32 { 0.65 }
fn default_harmonic_rhythm() -> u8 { 4 }
fn default_track_scalars() -> [f32; 7] { [1.0; 7] }
fn default_tier_cap() -> u8 { 2 }
fn default_variation_weights() -> [f32; 5] { [0.30, 0.25, 0.15, 0.15, 0.15] }
fn default_interval_affinity() -> f32 { 0.5 }
fn default_phrase_min() -> u32 { 2 }
fn default_phrase_max() -> u32 { 4 }
fn default_humanize() -> f32 { 3.0 }
fn default_ghost_prob() -> f32 { 0.5 }
fn default_tension_plateau() -> f32 { 0.25 }
fn default_tension_spike() -> f32 { 0.30 }
fn default_tension_retreat() -> f32 { 0.20 }
fn default_diag_enables() -> [bool; 15] { [true; 15] }
fn default_diag_sensitivity() -> f32 { 1.0 }
fn default_sections_open() -> [bool; 8] { [true, false, true, false, true, false, false, true] }

impl Default for EngineerState {
    fn default() -> Self {
        Self {
            cycle_mode: default_false(),
            phase_progression: 0,
            dc_thresholds: default_dc_thresholds(),
            maelstrom_sustain: default_maelstrom_sustain(),
            recency_decay: default_recency_decay(),
            voicing_profile_override: 0,
            collision_mode_override: 0,
            harmonic_rhythm_beats: default_harmonic_rhythm(),
            track_gain_scalars: default_track_scalars(),
            walking_bass_tier_cap: default_tier_cap(),
            chord_pattern: 0,
            variation_weights: default_variation_weights(),
            interval_affinity: default_interval_affinity(),
            phrase_len_min: default_phrase_min(),
            phrase_len_max: default_phrase_max(),
            swing: 0.0,
            humanize_ms: default_humanize(),
            ghost_prob: default_ghost_prob(),
            tension_plateau_freq: default_tension_plateau(),
            tension_spike_mag: default_tension_spike(),
            tension_retreat_depth: default_tension_retreat(),
            diag_enables: default_diag_enables(),
            diag_sensitivity: default_diag_sensitivity(),
            flag_voicing: false,
            flag_harmonic_rhythm: false,
            flag_walking_bass: false,
            flag_cadential: false,
            flag_lookahead: false,
            sections_open: default_sections_open(),
            recent_tweaks: Vec::new(),
            show_diag_log: false,
        }
    }
}

impl EngineerState {
    /// Reset every parameter to its factory default (keeps UI-only fields).
    pub fn reset_all(&mut self) {
        let sections = self.sections_open;
        let tweaks = std::mem::take(&mut self.recent_tweaks);
        let show_log = self.show_diag_log;
        *self = Self::default();
        self.sections_open = sections;
        self.recent_tweaks = tweaks;
        self.show_diag_log = show_log;
        self.push_tweak("Reset: all");
    }

    pub fn push_tweak(&mut self, msg: impl Into<String>) {
        self.recent_tweaks.insert(0, msg.into());
        while self.recent_tweaks.len() > 10 {
            self.recent_tweaks.pop();
        }
    }

    /// Push all UI-driven flag values to the global atomics so the engine reads them live.
    /// Call on load-preset to sync.
    pub fn sync_flags_to_engine(&self) {
        flags::set_voicing_engine(self.flag_voicing);
        flags::set_harmonic_rhythm(self.flag_harmonic_rhythm);
        flags::set_walking_bass_next_chord(self.flag_walking_bass);
        flags::set_cadential_planning(self.flag_cadential);
        flags::set_lookahead_all_voices(self.flag_lookahead);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  draw — main entry
// ─────────────────────────────────────────────────────────────────────────────

/// Draw the Engineer tab. Returns any UiCmds to forward to the bridge.
pub fn draw(
    ui: &mut Ui,
    state: &mut EngineerState,
    audio: &SharedAudioState,
) -> Vec<UiCmd> {
    let mut cmds: Vec<UiCmd> = Vec::new();

    ui.add_space(4.0);

    // Top action row: Reset all · Copy state JSON · Open log viewer
    ui.horizontal(|ui| {
        if ui.button("↻ Reset All").clicked() {
            state.reset_all();
            for i in 0..7 {
                cmds.push(UiCmd::SetTrackGainScalar { track: i as u8, scalar: 1.0 });
            }
            cmds.push(UiCmd::SetGrooveSwing(state.swing));
            cmds.push(UiCmd::SetGrooveHumanizeMs(state.humanize_ms));
            cmds.push(UiCmd::SetCycleMode(state.cycle_mode));
            state.sync_flags_to_engine();
        }
        if ui.button("📋 Copy state as JSON").clicked() {
            if let Ok(json) = serde_json::to_string_pretty(&state) {
                ui.output_mut(|o| o.copied_text = json);
            }
        }
        let log_label = if state.show_diag_log { "Hide log" } else { "Open log" };
        if ui.button(log_label).clicked() {
            state.show_diag_log = !state.show_diag_log;
        }
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.label(RichText::new(format!(
                "DC: {:.3}",
                audio.dc()
            )).monospace().color(TEXT_DIM));
        });
    });

    ui.add_space(4.0);
    ui.separator();

    // --- Sections ---------------------------------------------------------
    section_conductor(ui, state, &mut cmds);
    section_harmony(ui, state);
    section_sequencer(ui, state, &mut cmds);
    section_melody(ui, state);
    section_groove(ui, state, &mut cmds);
    section_tension(ui, state);
    section_diagnostic(ui, state, audio);
    section_flags_2b2(ui, state);

    // --- Recent tweaks list ------------------------------------------------
    ui.add_space(8.0);
    ui.separator();
    ui.collapsing("Recent tweaks (last 10)", |ui| {
        if state.recent_tweaks.is_empty() {
            ui.label(RichText::new("(no tweaks yet)").italics().color(TEXT_DIM));
        } else {
            for msg in &state.recent_tweaks {
                ui.label(RichText::new(msg).monospace().size(11.0));
            }
        }
    });

    cmds
}

// ─────────────────────────────────────────────────────────────────────────────
//  Sections
// ─────────────────────────────────────────────────────────────────────────────

fn section_conductor(ui: &mut Ui, s: &mut EngineerState, cmds: &mut Vec<UiCmd>) {
    CollapsingHeader::new(RichText::new("[Conductor]").strong())
        .default_open(s.sections_open[0])
        .show(ui, |ui| {
            // Cycle mode
            let prev = s.cycle_mode;
            if ui.checkbox(&mut s.cycle_mode, "Cycle mode")
                .on_hover_text("Loop-style palette cycle (engine flag; loop logic pending)")
                .changed()
            {
                cmds.push(UiCmd::SetCycleMode(s.cycle_mode));
                s.push_tweak(format!("Cycle mode: {} → {}", prev, s.cycle_mode));
            }

            // Phase progression
            ui.horizontal(|ui| {
                ui.label("Progression:");
                for (i, label) in ["Auto", "Manual", "Frozen"].iter().enumerate() {
                    let sel = s.phase_progression == i as u8;
                    let btn = egui::Button::new(*label)
                        .fill(if sel { ACCENT_DIM } else { BG_PANEL });
                    if ui.add(btn).clicked() && !sel {
                        s.phase_progression = i as u8;
                        if i == 2 {
                            cmds.push(UiCmd::SetBeatFrozen(true));
                        } else {
                            cmds.push(UiCmd::SetBeatFrozen(false));
                        }
                        if i == 0 {
                            cmds.push(UiCmd::ForcePhase(None));
                        }
                        s.push_tweak(format!("Phase prog: {}", label));
                    }
                }
            });

            // DC thresholds
            ui.add_space(2.0);
            ui.label("DC thresholds (Pulse · Swell · Surge · Storm · Maelstrom):");
            ui.horizontal(|ui| {
                let names = ["Pulse", "Swell", "Surge", "Storm", "Maelstrom"];
                for (i, name) in names.iter().enumerate() {
                    ui.vertical(|ui| {
                        ui.label(RichText::new(*name).size(10.0).color(TEXT_DIM));
                        let prev = s.dc_thresholds[i];
                        let resp = ui.add(
                            Knob::new(&mut s.dc_thresholds[i], 0.0, 3.0).radius(12.0),
                        );
                        ui.label(RichText::new(format!("{:.2}", s.dc_thresholds[i])).size(10.0));
                        if resp.changed() {
                            s.push_tweak(format!("DC {} {:.2}→{:.2}", name, prev, s.dc_thresholds[i]));
                        }
                    });
                }
            });

            // Maelstrom sustain
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                ui.label("Maelstrom sustain (bars):");
                let prev_lo = s.maelstrom_sustain.0;
                let prev_hi = s.maelstrom_sustain.1;
                ui.add(egui::DragValue::new(&mut s.maelstrom_sustain.0).range(1..=64).prefix("min "));
                ui.add(egui::DragValue::new(&mut s.maelstrom_sustain.1).range(1..=128).prefix("max "));
                if s.maelstrom_sustain.0 > s.maelstrom_sustain.1 {
                    s.maelstrom_sustain.1 = s.maelstrom_sustain.0;
                }
                if prev_lo != s.maelstrom_sustain.0 || prev_hi != s.maelstrom_sustain.1 {
                    s.push_tweak(format!(
                        "Maelstrom sust: {}-{}",
                        s.maelstrom_sustain.0, s.maelstrom_sustain.1
                    ));
                }
            });
        });
}

fn section_harmony(ui: &mut Ui, s: &mut EngineerState) {
    CollapsingHeader::new(RichText::new("[Harmony]").strong())
        .default_open(s.sections_open[1])
        .show(ui, |ui| {
            ui.label(RichText::new("(stored — applied on new song)")
                .italics()
                .color(TEXT_DIM)
                .size(11.0));
            ui.add_space(2.0);

            let prev = s.recency_decay;
            if ui.add(
                egui::Slider::new(&mut s.recency_decay, 0.0..=1.0)
                    .text("Palette recency decay"),
            ).changed() {
                s.push_tweak(format!("Recency decay: {:.2}→{:.2}", prev, s.recency_decay));
            }

            ui.horizontal(|ui| {
                ui.label("Voicing profile override:");
                let labels = ["Auto", "Block", "Open", "Drop2", "Drop3"];
                egui::ComboBox::from_id_source("voicing_override")
                    .selected_text(labels[s.voicing_profile_override as usize])
                    .show_ui(ui, |ui| {
                        for (i, lbl) in labels.iter().enumerate() {
                            let prev_v = s.voicing_profile_override;
                            if ui.selectable_value(&mut s.voicing_profile_override, i as u8, *lbl).changed()
                                && prev_v != i as u8
                            {
                                s.push_tweak(format!("Voicing override: {}", lbl));
                            }
                        }
                    });
            });

            ui.horizontal(|ui| {
                ui.label("Collision mode:");
                let labels = ["Auto", "Strict", "Allow"];
                egui::ComboBox::from_id_source("collision_override")
                    .selected_text(labels[s.collision_mode_override as usize])
                    .show_ui(ui, |ui| {
                        for (i, lbl) in labels.iter().enumerate() {
                            let prev_v = s.collision_mode_override;
                            if ui.selectable_value(&mut s.collision_mode_override, i as u8, *lbl).changed()
                                && prev_v != i as u8
                            {
                                s.push_tweak(format!("Collision: {}", lbl));
                            }
                        }
                    });
            });

            ui.horizontal(|ui| {
                ui.label("Harmonic rhythm (beats/chord):");
                let prev_v = s.harmonic_rhythm_beats;
                ui.add(egui::DragValue::new(&mut s.harmonic_rhythm_beats).range(1..=8));
                if prev_v != s.harmonic_rhythm_beats {
                    s.push_tweak(format!("Harm. rhythm: {} beats", s.harmonic_rhythm_beats));
                }
            });
        });
}

fn section_sequencer(ui: &mut Ui, s: &mut EngineerState, cmds: &mut Vec<UiCmd>) {
    CollapsingHeader::new(RichText::new("[Sequencer]").strong())
        .default_open(s.sections_open[2])
        .show(ui, |ui| {
            ui.label(RichText::new("Per-track gain scalars (live):").size(11.0));
            ui.add_space(2.0);

            let track_names = ["Kick", "Snare", "Hat", "Bass", "Chord", "Pad", "Melody"];
            ui.horizontal(|ui| {
                for (i, name) in track_names.iter().enumerate() {
                    ui.vertical(|ui| {
                        ui.label(RichText::new(*name).size(10.0).color(TEXT_DIM));
                        let prev = s.track_gain_scalars[i];
                        let resp = ui.add(
                            Knob::new(&mut s.track_gain_scalars[i], 0.0, 2.0).radius(13.0),
                        );
                        let changed = resp.changed();
                        let delta = if (s.track_gain_scalars[i] - 1.0).abs() > 1e-4 {
                            RichText::new("•").color(ACCENT).size(11.0)
                        } else {
                            RichText::new(" ").size(11.0)
                        };
                        ui.horizontal(|ui| {
                            ui.label(delta);
                            ui.label(RichText::new(format!("{:.2}", s.track_gain_scalars[i])).size(10.0));
                        });
                        if changed {
                            cmds.push(UiCmd::SetTrackGainScalar {
                                track: i as u8,
                                scalar: s.track_gain_scalars[i],
                            });
                            s.push_tweak(format!(
                                "{} gain: {:.2}→{:.2}",
                                name, prev, s.track_gain_scalars[i]
                            ));
                        }
                    });
                }
                // Reset section button
                ui.vertical(|ui| {
                    ui.add_space(18.0);
                    if ui.small_button("↻").on_hover_text("Reset gains").clicked() {
                        for i in 0..7 {
                            s.track_gain_scalars[i] = 1.0;
                            cmds.push(UiCmd::SetTrackGainScalar { track: i as u8, scalar: 1.0 });
                        }
                        s.push_tweak("Reset: track gains");
                    }
                });
            });

            ui.add_space(4.0);
            ui.horizontal(|ui| {
                ui.label("WalkingBass tier cap:");
                let prev = s.walking_bass_tier_cap;
                ui.add(egui::DragValue::new(&mut s.walking_bass_tier_cap).range(0..=3));
                if prev != s.walking_bass_tier_cap {
                    s.push_tweak(format!("Tier cap: {}", s.walking_bass_tier_cap));
                }
            });

            ui.horizontal(|ui| {
                ui.label("Chord pattern:");
                let labels = ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7"];
                egui::ComboBox::from_id_source("chord_pattern")
                    .selected_text(labels[s.chord_pattern as usize])
                    .show_ui(ui, |ui| {
                        for (i, lbl) in labels.iter().enumerate() {
                            let prev_v = s.chord_pattern;
                            if ui.selectable_value(&mut s.chord_pattern, i as u8, *lbl).changed()
                                && prev_v != i as u8
                            {
                                s.push_tweak(format!("Chord pattern: {}", lbl));
                            }
                        }
                    });
            });
        });
}

fn section_melody(ui: &mut Ui, s: &mut EngineerState) {
    CollapsingHeader::new(RichText::new("[Melody]").strong())
        .default_open(s.sections_open[3])
        .show(ui, |ui| {
            ui.label(RichText::new("Variation weights (repeat · transpose · invert · diminish · fragment):").size(11.0));
            ui.add_space(2.0);
            ui.horizontal(|ui| {
                let names = ["Rep", "Trsp", "Inv", "Dim", "Frag"];
                for (i, name) in names.iter().enumerate() {
                    ui.vertical(|ui| {
                        ui.label(RichText::new(*name).size(10.0).color(TEXT_DIM));
                        let prev = s.variation_weights[i];
                        let resp = ui.add(
                            Knob::new(&mut s.variation_weights[i], 0.0, 1.0).radius(12.0),
                        );
                        ui.label(RichText::new(format!("{:.2}", s.variation_weights[i])).size(10.0));
                        if resp.changed() {
                            s.push_tweak(format!("{} wt: {:.2}→{:.2}", name, prev, s.variation_weights[i]));
                        }
                    });
                }
            });
            ui.add_space(4.0);
            let prev = s.interval_affinity;
            if ui.add(
                egui::Slider::new(&mut s.interval_affinity, 0.0..=1.0)
                    .text("Interval affinity strength"),
            ).changed() {
                s.push_tweak(format!("Interval aff: {:.2}→{:.2}", prev, s.interval_affinity));
            }
            ui.horizontal(|ui| {
                ui.label("Phrase length:");
                let pmin = s.phrase_len_min;
                let pmax = s.phrase_len_max;
                ui.add(egui::DragValue::new(&mut s.phrase_len_min).range(1..=8).prefix("min "));
                ui.add(egui::DragValue::new(&mut s.phrase_len_max).range(1..=16).prefix("max "));
                if s.phrase_len_min > s.phrase_len_max {
                    s.phrase_len_max = s.phrase_len_min;
                }
                if pmin != s.phrase_len_min || pmax != s.phrase_len_max {
                    s.push_tweak(format!("Phrase len: {}-{}", s.phrase_len_min, s.phrase_len_max));
                }
            });
        });
}

fn section_groove(ui: &mut Ui, s: &mut EngineerState, cmds: &mut Vec<UiCmd>) {
    CollapsingHeader::new(RichText::new("[Groove]").strong())
        .default_open(s.sections_open[4])
        .show(ui, |ui| {
            let prev = s.swing;
            if ui.add(
                egui::Slider::new(&mut s.swing, 0.0..=1.0).text("Swing"),
            ).changed() {
                cmds.push(UiCmd::SetGrooveSwing(s.swing));
                s.push_tweak(format!("Swing: {:.2}→{:.2}", prev, s.swing));
            }
            let prev = s.humanize_ms;
            if ui.add(
                egui::Slider::new(&mut s.humanize_ms, 0.0..=25.0)
                    .text("Humanize (ms)")
                    .suffix(" ms"),
            ).changed() {
                cmds.push(UiCmd::SetGrooveHumanizeMs(s.humanize_ms));
                s.push_tweak(format!("Humanize: {:.1}→{:.1}", prev, s.humanize_ms));
            }
            let prev = s.ghost_prob;
            if ui.add(
                egui::Slider::new(&mut s.ghost_prob, 0.0..=1.0).text("Ghost note prob"),
            ).changed() {
                s.push_tweak(format!("Ghost prob: {:.2}→{:.2}", prev, s.ghost_prob));
            }
        });
}

fn section_tension(ui: &mut Ui, s: &mut EngineerState) {
    CollapsingHeader::new(RichText::new("[Tension]").strong())
        .default_open(s.sections_open[5])
        .show(ui, |ui| {
            ui.label(RichText::new("(stored — applied on new song)")
                .italics()
                .color(TEXT_DIM)
                .size(11.0));
            ui.add_space(2.0);
            let prev = s.tension_plateau_freq;
            if ui.add(
                egui::Slider::new(&mut s.tension_plateau_freq, 0.0..=1.0).text("Plateau freq"),
            ).changed() {
                s.push_tweak(format!("Plateau: {:.2}→{:.2}", prev, s.tension_plateau_freq));
            }
            let prev = s.tension_spike_mag;
            if ui.add(
                egui::Slider::new(&mut s.tension_spike_mag, 0.0..=1.0).text("Spike magnitude"),
            ).changed() {
                s.push_tweak(format!("Spike: {:.2}→{:.2}", prev, s.tension_spike_mag));
            }
            let prev = s.tension_retreat_depth;
            if ui.add(
                egui::Slider::new(&mut s.tension_retreat_depth, 0.0..=1.0).text("Retreat depth"),
            ).changed() {
                s.push_tweak(format!("Retreat: {:.2}→{:.2}", prev, s.tension_retreat_depth));
            }
        });
}

fn section_diagnostic(ui: &mut Ui, s: &mut EngineerState, audio: &SharedAudioState) {
    CollapsingHeader::new(RichText::new("[Diagnostic]").strong())
        .default_open(s.sections_open[6])
        .show(ui, |ui| {
            // Master sensitivity
            let prev = s.diag_sensitivity;
            if ui.add(
                egui::Slider::new(&mut s.diag_sensitivity, 0.0..=2.0).text("Master sensitivity"),
            ).changed() {
                s.push_tweak(format!("Diag sens: {:.2}→{:.2}", prev, s.diag_sensitivity));
            }

            // Per-detector enables
            ui.add_space(2.0);
            ui.label("Detectors:");
            let det_names = [
                "clip_track", "clip_master", "clip_limiter", "gain_spike", "silence_drop",
                "pump_range", "voice_flood", "voice_steal", "voice_leak", "low_end_stack",
                "flat_dc", "voice_jitter", "plan_latency", "lookahead_fill", "flush_latency",
            ];
            egui::Grid::new("diag_detectors").num_columns(3).spacing([6.0, 2.0]).show(ui, |ui| {
                for (i, name) in det_names.iter().enumerate() {
                    let prev = s.diag_enables[i];
                    if ui.checkbox(&mut s.diag_enables[i], *name).changed() && prev != s.diag_enables[i] {
                        s.push_tweak(format!("{}: {}", name, if s.diag_enables[i] { "on" } else { "off" }));
                    }
                    if (i + 1) % 3 == 0 {
                        ui.end_row();
                    }
                }
            });

            // Anomaly count + log viewer
            ui.add_space(4.0);
            let log_len = audio.diagnostic_log.lock()
                .map(|l| l.len())
                .unwrap_or(0);
            ui.horizontal(|ui| {
                ui.label(RichText::new(format!("Log entries: {}", log_len)).monospace());
                let open_label = if s.show_diag_log { "Hide viewer" } else { "Open viewer" };
                if ui.button(open_label).clicked() {
                    s.show_diag_log = !s.show_diag_log;
                }
            });

            if s.show_diag_log {
                ui.add_space(4.0);
                let entries: Vec<String> = audio.diagnostic_log.lock()
                    .map(|l| l.iter().take(50).cloned().collect())
                    .unwrap_or_default();

                ui.horizontal(|ui| {
                    if ui.button("📋 Copy log").clicked() {
                        let joined = entries.join("\n");
                        ui.output_mut(|o| o.copied_text = joined);
                    }
                    ui.label(RichText::new(format!("(showing {} entries)", entries.len()))
                        .italics().color(TEXT_DIM));
                });

                egui::ScrollArea::vertical()
                    .max_height(200.0)
                    .auto_shrink([false, true])
                    .show(ui, |ui| {
                        egui::Frame::none()
                            .fill(Color32::from_rgb(18, 18, 24))
                            .inner_margin(egui::Margin::same(4.0))
                            .show(ui, |ui| {
                                if entries.is_empty() {
                                    ui.label(RichText::new("(no entries yet — log fills as audio plays)")
                                        .italics().color(TEXT_DIM));
                                } else {
                                    for entry in &entries {
                                        ui.label(RichText::new(entry).monospace().size(11.0));
                                    }
                                }
                            });
                    });
            }
        });
}

fn section_flags_2b2(ui: &mut Ui, s: &mut EngineerState) {
    CollapsingHeader::new(RichText::new("[2b-2 Flags]").strong().color(ACCENT))
        .default_open(s.sections_open[7])
        .show(ui, |ui| {
            ui.label(RichText::new("Algorithm upgrades — flip live to A/B test")
                .color(TEXT_DIM).size(11.0));
            ui.add_space(2.0);

            flag_toggle(ui, "VoicingEngine", &mut s.flag_voicing, flags::set_voicing_engine, &mut s.recent_tweaks);
            flag_toggle(ui, "HarmonicRhythm", &mut s.flag_harmonic_rhythm, flags::set_harmonic_rhythm, &mut s.recent_tweaks);
            flag_toggle(ui, "WalkingBass next-chord", &mut s.flag_walking_bass, flags::set_walking_bass_next_chord, &mut s.recent_tweaks);
            flag_toggle(ui, "CadentialPlanning", &mut s.flag_cadential, flags::set_cadential_planning, &mut s.recent_tweaks);
            flag_toggle(ui, "LookaheadAllVoices", &mut s.flag_lookahead, flags::set_lookahead_all_voices, &mut s.recent_tweaks);

            ui.add_space(4.0);
            ui.horizontal(|ui| {
                if ui.button("Enable all 2b-2").clicked() {
                    s.flag_voicing = true;
                    s.flag_harmonic_rhythm = true;
                    s.flag_walking_bass = true;
                    s.flag_cadential = true;
                    s.flag_lookahead = true;
                    flags::enable_all_2b2();
                    s.recent_tweaks.insert(0, "All 2b-2: ON".to_string());
                    while s.recent_tweaks.len() > 10 { s.recent_tweaks.pop(); }
                }
                if ui.button("Disable all 2b-2").clicked() {
                    s.flag_voicing = false;
                    s.flag_harmonic_rhythm = false;
                    s.flag_walking_bass = false;
                    s.flag_cadential = false;
                    s.flag_lookahead = false;
                    flags::disable_all_2b2();
                    s.recent_tweaks.insert(0, "All 2b-2: OFF".to_string());
                    while s.recent_tweaks.len() > 10 { s.recent_tweaks.pop(); }
                }
            });
        });
}

fn flag_toggle(
    ui: &mut Ui,
    label: &str,
    val: &mut bool,
    set_fn: fn(bool),
    tweaks: &mut Vec<String>,
) {
    let prev = *val;
    if ui.checkbox(val, label).changed() && prev != *val {
        set_fn(*val);
        tweaks.insert(0, format!("{}: {}", label, if *val { "on" } else { "off" }));
        while tweaks.len() > 10 { tweaks.pop(); }
    }
}
