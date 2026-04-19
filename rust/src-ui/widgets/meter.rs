//! Peak / RMS level meter widget (Build A #90).

use egui::{Color32, Painter, Rect, Rounding, Stroke, Ui, Vec2};

pub struct LevelMeter {
    /// Peak level 0.0–1.0 (decays per frame).
    peak: f32,
    /// Smoothed RMS envelope 0.0–1.0.
    rms: f32,
    /// Peak hold value and hold-counter (frames).
    peak_hold: f32,
    hold_frames: u32,
}

impl Default for LevelMeter {
    fn default() -> Self {
        Self { peak: 0.0, rms: 0.0, peak_hold: 0.0, hold_frames: 0 }
    }
}

impl LevelMeter {
    /// Feed a new sample peak. Call once per frame.
    pub fn update(&mut self, new_peak: f32) {
        // Envelope follow.
        let attack = 0.8;
        let release = 0.05;
        if new_peak > self.peak {
            self.peak = self.peak * (1.0 - attack) + new_peak * attack;
        } else {
            self.peak *= 1.0 - release;
        }
        self.rms = self.rms * 0.9 + new_peak * 0.1;

        // Peak hold for 60 frames (~1s at 60fps).
        if self.peak > self.peak_hold {
            self.peak_hold = self.peak;
            self.hold_frames = 60;
        } else if self.hold_frames > 0 {
            self.hold_frames -= 1;
        } else {
            self.peak_hold *= 0.97;
        }
    }

    /// Draw a vertical meter bar in `rect`. Returns the rect consumed.
    pub fn draw_vertical(&self, painter: &Painter, rect: Rect) {
        let h = rect.height();
        let w = rect.width();

        // Background.
        painter.rect_filled(rect, Rounding::same(2.0), Color32::from_rgb(20, 20, 26));

        // RMS fill.
        let rms_h = (self.rms * h).min(h);
        let rms_rect = Rect::from_min_size(
            egui::pos2(rect.min.x, rect.max.y - rms_h),
            Vec2::new(w, rms_h),
        );
        painter.rect_filled(rms_rect, Rounding::ZERO, meter_color(self.rms));

        // Peak hold tick.
        if self.peak_hold > 0.01 {
            let y = rect.max.y - (self.peak_hold * h).min(h);
            painter.line_segment(
                [egui::pos2(rect.min.x, y), egui::pos2(rect.max.x, y)],
                Stroke::new(1.5, Color32::WHITE),
            );
        }

        // Border.
        painter.rect_stroke(rect, Rounding::same(2.0), Stroke::new(1.0, Color32::from_rgb(50, 50, 60)));
    }

    /// Draw a compact horizontal meter suitable for inline use.
    pub fn draw_horizontal(&self, ui: &mut Ui, width: f32, height: f32) {
        let (rect, _) = ui.allocate_exact_size(Vec2::new(width, height), egui::Sense::hover());
        let painter = ui.painter();
        painter.rect_filled(rect, Rounding::same(2.0), Color32::from_rgb(20, 20, 26));
        let fill_w = (self.rms * rect.width()).min(rect.width());
        let fill_rect = Rect::from_min_size(rect.min, Vec2::new(fill_w, height));
        painter.rect_filled(fill_rect, Rounding::ZERO, meter_color(self.rms));
        painter.rect_stroke(rect, Rounding::same(2.0), Stroke::new(1.0, Color32::from_rgb(50, 50, 60)));
    }
}

fn meter_color(level: f32) -> Color32 {
    if level > 0.9 {
        Color32::from_rgb(220, 60, 60)
    } else if level > 0.7 {
        Color32::from_rgb(220, 180, 40)
    } else {
        Color32::from_rgb(60, 180, 120)
    }
}
