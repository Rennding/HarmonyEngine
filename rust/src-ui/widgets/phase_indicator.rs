//! Top-bar phase + beat + cycle state indicator (Build A #90).

use egui::{Color32, RichText, Ui};
use harmonyengine::config::Phase;

use crate::theme::PHASE_COLORS;

pub fn draw(ui: &mut Ui, phase: Phase, beat: u32, bpm: f32, frozen: bool, cycle: bool) {
    ui.horizontal(|ui| {
        // Phase pill.
        let phase_idx = match phase {
            Phase::Pulse => 0,
            Phase::Swell => 1,
            Phase::Surge => 2,
            Phase::Storm => 3,
            Phase::Maelstrom => 4,
        };
        let phase_name = ["Pulse", "Swell", "Surge", "Storm", "Maelstrom"][phase_idx];
        let color = PHASE_COLORS[phase_idx];

        egui::Frame::none()
            .fill(color)
            .rounding(egui::Rounding::same(4.0))
            .inner_margin(egui::Margin::symmetric(8.0, 2.0))
            .show(ui, |ui| {
                ui.label(RichText::new(phase_name).strong().color(Color32::WHITE));
            });

        ui.separator();

        // Beat counter.
        ui.label(RichText::new(format!("Beat {beat}")).monospace().color(Color32::from_rgb(180, 180, 200)));

        ui.separator();

        // BPM.
        ui.label(RichText::new(format!("{bpm:.0} BPM")).monospace().color(Color32::from_rgb(150, 150, 170)));

        // Cycle indicator.
        if cycle {
            ui.separator();
            ui.label(RichText::new("↻ CYCLE").strong().color(Color32::from_rgb(120, 200, 150)));
        }

        // Frozen indicator.
        if frozen {
            ui.separator();
            ui.label(RichText::new("⏸ FROZEN").strong().color(Color32::from_rgb(220, 180, 40)));
        }
    });
}
