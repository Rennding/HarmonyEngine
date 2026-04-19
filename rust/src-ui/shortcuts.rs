//! Keyboard shortcut map for the Simple tab (Build A #90).
//!
//! All shortcuts defined here. `dispatch` is called once per frame by App
//! before drawing; it inspects `ctx.input()` and fires `Action` variants
//! that App applies to its state.

use egui::{Context, Key, Modifiers};

#[derive(Debug, Clone)]
pub enum Action {
    TogglePlay,
    NewSong,
    PrevPalette,
    NextPalette,
    ForcePhase(usize), // 1-indexed; 0 = Auto
    VolumeUp,
    VolumeDown,
    ToggleMute,
    ToggleVisualizer,
    ToggleFullscreenVisualizer,
    ExitFullscreen,
    SwitchTab,
    SavePreset,
    OpenPreset,
    SaveQaRepro,
    FreezeBeat,
    ShowHelp,
}

/// Dispatch keyboard input → zero or more `Action`s. Returns a Vec so a
/// single keypress can produce compound actions if ever needed.
pub fn dispatch(ctx: &Context) -> Vec<Action> {
    let mut out = Vec::new();
    ctx.input(|i| {
        let ctrl = i.modifiers.ctrl;
        let shift = i.modifiers.shift;

        if ctrl && shift && i.key_pressed(Key::S) {
            out.push(Action::SaveQaRepro);
            return;
        }
        if ctrl && i.key_pressed(Key::S) {
            out.push(Action::SavePreset);
            return;
        }
        if ctrl && i.key_pressed(Key::O) {
            out.push(Action::OpenPreset);
            return;
        }
        if ctrl && i.key_pressed(Key::B) {
            out.push(Action::FreezeBeat);
            return;
        }

        if i.key_pressed(Key::Space) { out.push(Action::TogglePlay); }
        if i.key_pressed(Key::N) { out.push(Action::NewSong); }
        if i.key_pressed(Key::ArrowLeft) { out.push(Action::PrevPalette); }
        if i.key_pressed(Key::ArrowRight) { out.push(Action::NextPalette); }
        if i.key_pressed(Key::Num1) { out.push(Action::ForcePhase(1)); }
        if i.key_pressed(Key::Num2) { out.push(Action::ForcePhase(2)); }
        if i.key_pressed(Key::Num3) { out.push(Action::ForcePhase(3)); }
        if i.key_pressed(Key::Num4) { out.push(Action::ForcePhase(4)); }
        if i.key_pressed(Key::Num5) { out.push(Action::ForcePhase(5)); }
        if i.key_pressed(Key::Num0) { out.push(Action::ForcePhase(0)); }
        if i.key_pressed(Key::ArrowUp) { out.push(Action::VolumeUp); }
        if i.key_pressed(Key::ArrowDown) { out.push(Action::VolumeDown); }
        if i.key_pressed(Key::M) { out.push(Action::ToggleMute); }
        if i.key_pressed(Key::V) { out.push(Action::ToggleVisualizer); }
        if i.key_pressed(Key::F) { out.push(Action::ToggleFullscreenVisualizer); }
        if i.key_pressed(Key::Escape) { out.push(Action::ExitFullscreen); }
        if i.key_pressed(Key::Tab) { out.push(Action::SwitchTab); }
        if i.key_pressed(Key::Questionmark) { out.push(Action::ShowHelp); }
    });
    out
}

/// Render the shortcut cheat-sheet modal.
pub fn show_help_modal(ctx: &Context, open: &mut bool) {
    egui::Window::new("Keyboard Shortcuts")
        .open(open)
        .resizable(false)
        .collapsible(false)
        .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
        .show(ctx, |ui| {
            let rows: &[(&str, &str)] = &[
                ("Space", "Play / Pause"),
                ("N", "New song (reseed)"),
                ("← / →", "Prev / next palette"),
                ("1–5", "Force phase 1–5"),
                ("0", "Auto phase"),
                ("↑ / ↓", "Volume +/-"),
                ("M", "Mute"),
                ("V", "Visualizer on/off"),
                ("F", "Fullscreen visualizer"),
                ("Esc", "Exit fullscreen"),
                ("Tab", "Switch Simple / Engineer"),
                ("Ctrl+S", "Save preset"),
                ("Ctrl+O", "Open preset"),
                ("Ctrl+Shift+S", "Save QA repro"),
                ("Ctrl+B", "Freeze beat"),
                ("?", "This dialog"),
            ];
            egui::Grid::new("shortcuts_grid")
                .num_columns(2)
                .spacing([20.0, 4.0])
                .show(ui, |ui| {
                    for (key, desc) in rows {
                        ui.label(egui::RichText::new(*key).monospace());
                        ui.label(*desc);
                        ui.end_row();
                    }
                });
        });
}
