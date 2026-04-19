//! Minimal dark theme for HarmonyEngine UI (Build A #90).

use egui::{Color32, Rounding, Stroke, Style, Visuals};

pub const ACCENT: Color32 = Color32::from_rgb(80, 200, 180);
pub const ACCENT_DIM: Color32 = Color32::from_rgb(40, 120, 110);
pub const BG_DARK: Color32 = Color32::from_rgb(18, 18, 22);
pub const BG_MID: Color32 = Color32::from_rgb(28, 28, 34);
pub const BG_PANEL: Color32 = Color32::from_rgb(36, 36, 44);
pub const TEXT_PRIMARY: Color32 = Color32::from_rgb(220, 220, 230);
pub const TEXT_DIM: Color32 = Color32::from_rgb(130, 130, 145);
pub const PHASE_COLORS: [Color32; 5] = [
    Color32::from_rgb(60, 80, 140),   // Pulse — deep blue
    Color32::from_rgb(50, 130, 100),  // Swell — teal
    Color32::from_rgb(160, 130, 40),  // Surge — amber
    Color32::from_rgb(180, 80, 40),   // Storm — orange-red
    Color32::from_rgb(160, 40, 120),  // Maelstrom — magenta
];

pub fn apply(ctx: &egui::Context) {
    let mut visuals = Visuals::dark();
    visuals.panel_fill = BG_DARK;
    visuals.window_fill = BG_MID;
    visuals.extreme_bg_color = BG_DARK;
    visuals.faint_bg_color = BG_PANEL;
    visuals.override_text_color = Some(TEXT_PRIMARY);
    visuals.widgets.noninteractive.bg_fill = BG_PANEL;
    visuals.widgets.inactive.bg_fill = BG_MID;
    visuals.widgets.hovered.bg_fill = BG_PANEL;
    visuals.widgets.active.bg_fill = ACCENT_DIM;
    visuals.widgets.noninteractive.rounding = Rounding::same(4.0);
    visuals.widgets.inactive.rounding = Rounding::same(4.0);
    visuals.widgets.hovered.rounding = Rounding::same(4.0);
    visuals.widgets.active.rounding = Rounding::same(4.0);
    visuals.selection.bg_fill = ACCENT_DIM;
    visuals.selection.stroke = Stroke::new(1.0, ACCENT);
    visuals.window_rounding = Rounding::same(6.0);
    visuals.menu_rounding = Rounding::same(6.0);
    let mut style = Style::default();
    style.visuals = visuals;
    style.spacing.item_spacing = egui::vec2(8.0, 6.0);
    style.spacing.button_padding = egui::vec2(10.0, 5.0);
    ctx.set_style(style);
}
