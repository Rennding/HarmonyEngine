//! Inline (~80px strip) and fullscreen visualizer (Build A #90).
//!
//! FFT data is read from `SharedAudioState::fft_frame` at egui frame rate.
//! Render uses egui `Painter` — no wgpu for Build A.

use egui::{Color32, Painter, Pos2, Rect, Rounding, Stroke, Ui, Vec2};
use harmonyengine::config::Phase;

use crate::bridge::SharedAudioState;
use crate::theme::PHASE_COLORS;

/// Draw the inline visualizer strip. Height is `strip_height` px.
pub fn draw_inline(ui: &mut Ui, state: &SharedAudioState, strip_height: f32) {
    let width = ui.available_width();
    let (rect, _) = ui.allocate_exact_size(Vec2::new(width, strip_height), egui::Sense::hover());
    let painter = ui.painter_at(rect);
    render_bars(&painter, rect, state, false);
}

/// Draw the fullscreen visualizer, filling `rect`. `idle_secs` is used to
/// fade the control overlay.
pub fn draw_fullscreen(ui: &mut Ui, state: &SharedAudioState) {
    let rect = ui.available_rect_before_wrap();
    let painter = ui.painter_at(rect);
    // Full black background.
    painter.rect_filled(rect, Rounding::ZERO, Color32::BLACK);
    render_bars(&painter, rect, state, true);
}

fn render_bars(painter: &Painter, rect: Rect, state: &SharedAudioState, fullscreen: bool) {
    let phase_idx = state.phase_idx.load(std::sync::atomic::Ordering::Relaxed) as usize;
    let phase_color = PHASE_COLORS[phase_idx.min(4)];

    let fft = state.fft_frame.lock().unwrap_or_else(|p| p.into_inner());
    let bins = fft.len();
    if bins == 0 {
        return;
    }

    // Group bins logarithmically into `bar_count` visual bars.
    let bar_count: usize = if fullscreen { 128 } else { 64 };
    let bar_w = rect.width() / bar_count as f32;
    let max_h = rect.height();

    for i in 0..bar_count {
        // Map bar index to a logarithmic frequency range [0, bins).
        let t0 = (i as f32 / bar_count as f32).powi(2);
        let t1 = ((i + 1) as f32 / bar_count as f32).powi(2);
        let bin_start = (t0 * bins as f32) as usize;
        let bin_end = ((t1 * bins as f32) as usize).max(bin_start + 1).min(bins);

        let peak: f32 = fft[bin_start..bin_end]
            .iter()
            .cloned()
            .fold(0.0f32, f32::max);

        let bar_h = (peak.min(1.0) * max_h).max(1.0);
        let x = rect.min.x + i as f32 * bar_w;
        let bar_rect = Rect::from_min_size(
            Pos2::new(x + 1.0, rect.max.y - bar_h),
            Vec2::new((bar_w - 1.0).max(1.0), bar_h),
        );

        // Gradient: phase colour at bottom, lighter at top.
        let alpha = (0.4 + peak * 0.6).min(1.0);
        let r = (phase_color.r() as f32 * alpha) as u8;
        let g = (phase_color.g() as f32 * alpha) as u8;
        let b = (phase_color.b() as f32 * alpha) as u8;
        painter.rect_filled(bar_rect, Rounding::ZERO, Color32::from_rgb(r, g, b));
    }

    // Thin top border line.
    painter.line_segment(
        [Pos2::new(rect.min.x, rect.min.y), Pos2::new(rect.max.x, rect.min.y)],
        Stroke::new(1.0, Color32::from_rgba_premultiplied(80, 80, 100, 120)),
    );
}
