//! Circular knob widget — vertical drag to change value (Build B #91).
//!
//! Usage:
//!   let resp = ui.add(Knob::new(&mut value, 0.0, 1.0));
//!   if resp.changed() { /* send cmd */ }

use egui::{Color32, Response, Sense, Stroke, Ui, Vec2};

pub struct Knob<'a> {
    value: &'a mut f32,
    min: f32,
    max: f32,
    radius: f32,
}

impl<'a> Knob<'a> {
    pub fn new(value: &'a mut f32, min: f32, max: f32) -> Self {
        Self { value, min, max, radius: 14.0 }
    }

    pub fn radius(mut self, r: f32) -> Self {
        self.radius = r;
        self
    }
}

impl<'a> egui::Widget for Knob<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        let size = Vec2::splat(self.radius * 2.0 + 4.0);
        let (rect, mut response) = ui.allocate_exact_size(size, Sense::drag());

        if response.dragged() {
            let delta = response.drag_delta().y;
            let range = self.max - self.min;
            *self.value = (*self.value - delta * range / 120.0).clamp(self.min, self.max);
            response.mark_changed();
        }

        if ui.is_rect_visible(rect) {
            let center = rect.center();
            let painter = ui.painter();

            let hovered = response.hovered();
            let bg = if hovered { Color32::from_rgb(55, 55, 70) } else { Color32::from_rgb(38, 38, 50) };
            painter.circle_filled(center, self.radius, bg);
            painter.circle_stroke(center, self.radius, Stroke::new(1.0, Color32::from_rgb(90, 90, 110)));

            // Value indicator: 7 o'clock (min) → 5 o'clock (max), 300° CW sweep.
            let t = (*self.value - self.min) / (self.max - self.min).max(1e-6);
            // angle_min = 2*PI/3 (7 o'clock in egui's CW-from-East system)
            // sweep = 5*PI/3 (300°)
            let angle = (2.0 * std::f32::consts::PI / 3.0)
                + t * (5.0 * std::f32::consts::PI / 3.0);
            let tip = center + Vec2::new(angle.cos(), angle.sin()) * (self.radius - 3.0);
            let indicator_color = if hovered {
                Color32::from_rgb(130, 180, 255)
            } else {
                Color32::from_rgb(100, 150, 220)
            };
            painter.line_segment([center, tip], Stroke::new(2.0, indicator_color));

            // Track arc (background sweep).
            // Draw a simple dot at min and max positions to indicate range.
            let min_pt = center + Vec2::new(
                (2.0 * std::f32::consts::PI / 3.0).cos(),
                (2.0 * std::f32::consts::PI / 3.0).sin(),
            ) * self.radius;
            let max_pt = center + Vec2::new(
                (7.0 * std::f32::consts::PI / 3.0).cos(),
                (7.0 * std::f32::consts::PI / 3.0).sin(),
            ) * self.radius;
            let dot_color = Color32::from_rgb(60, 60, 80);
            painter.circle_filled(min_pt, 1.5, dot_color);
            painter.circle_filled(max_pt, 1.5, dot_color);
        }

        response
    }
}
