# SPEC_071 — Rust palette timbre fixes + QA fast-start flag

**Model:** Sonnet
**Triggered by:** qa-improve verdict on #69
**Branch:** `claude/issue-71-slug` (assigned at build time)

---

## Problems

Three issues found in QA of #69 (all 10 palettes):

1. **All pad layers sound uniformly dark** — `PadTrack` has a hardcoded `LPF_CUTOFF = 800.0 Hz` constant (a Phase 1b placeholder) applied to every palette. Synthwave, chiptune, and glitch sound indistinguishable from ambient_dread in their pad layer.

2. **Noir jazz ride sounds robotic** — `JazzRide` offbeat drum hits fire at exact 16th-note positions (no timing displacement). Jazz swing requires offbeats to land ~33% of a 16th note late. No swing mechanism exists in the Rust drum sequencer yet.

3. **Pulse phase is too long for QA** — DC math: Swell threshold (0.30) reached at beat ~76 (~40s at 120 BPM); Surge (0.60) at beat ~134 (~67s). A 60-second test run never reaches Surge. QA requires hearing all phases.

---

## Changes

### 1 · Per-palette pad LPF (`palette.rs`, `pad_track.rs`)

**`palette.rs`** — add `lpf_cutoff: f32` to `PadConfig`:

```rust
pub struct PadConfig {
    pub wave: Wave,
    pub octave: u8,
    pub attack: f32,
    pub release: f32,
    pub detune_cents: f32,
    pub lpf_cutoff: f32,   // ← new
}
```

Per-palette values:

| Palette       | `lpf_cutoff` | Character                  |
|---------------|-------------|----------------------------|
| dark_techno   | 1200.0      | dark, filtered             |
| synthwave     | 4500.0      | bright, glassy             |
| glitch        | 3500.0      | bright, digital            |
| ambient_dread | 650.0       | very dark, muffled         |
| lo_fi_chill   | 1600.0      | warm, softly filtered      |
| chiptune      | 5000.0      | crisp, digital bright      |
| noir_jazz     | 2000.0      | warm, open                 |
| industrial    | 2500.0      | mid-bright, gritty         |
| vaporwave     | 2200.0      | hazy, warm                 |
| breakbeat     | 2800.0      | mid-open                   |

**`pad_track.rs`** — remove the constant and use cfg:

```rust
// Remove:
const LPF_CUTOFF: f32 = 800.0;

// In start_voice(), replace:
v.filter = BiquadLowpass::new(sr, LPF_CUTOFF, LPF_Q);
// with:
v.filter = BiquadLowpass::new(sr, self.cfg.lpf_cutoff, LPF_Q);
```

### 2 · JazzRide swing timing (`sequencer.rs`)

The `pattern_16` function for `JazzRide` marks offbeat steps (2, 6, 10, 14) with a new `swing_late: bool = true` flag. When the sequencer fires a drum step that is `swing_late`, it delays the audio by `swing_offset_samples`.

**Add `swing_late: bool` to `Step`:**

```rust
pub struct Step {
    pub active: bool,
    pub vel: f32,
    pub prob: f32,
    pub swing_late: bool,   // ← new; only used by JazzRide offbeats
}
```

Default `swing_late: false` everywhere. In `JazzRide` pattern, set offbeat steps:

```rust
for i in [2, 6, 10, 14] {
    out[i] = Step { active: true, vel: 0.3, prob: 0.90, swing_late: true };
}
```

Also increase velocity contrast on downbeats (from 0.6 → 0.75) and add ±0.10 randomized velocity on all JazzRide steps using the palette's PRNG seed.

**Compute swing offset once per beat in `Sequencer::on_beat`:**

```rust
// swing_offset_samples = 33% of one 16th note
let sixteenth_samples = (sample_rate * 60.0 / bpm / 4.0) as u32;
let swing_offset = (sixteenth_samples as f32 * 0.33) as u32;
```

When dispatching a `swing_late` step, schedule it `swing_offset` samples into the future rather than immediately. Since the Rust engine renders block-by-block, the simplest implementation is a **pending step queue**: push the step onto a small ring buffer with `fire_at_sample = current_sample + swing_offset`; drain the queue at the top of each render block before processing the normal on-beat dispatch.

### 3 · `--start-beat N` QA flag (`main.rs`, `conductor.rs`, `audio.rs`)

**`main.rs`** — parse `--start-beat N` alongside existing flags:

```
cargo run --release -- 12345 120 --palette synthwave --start-beat 130
```

Pass `start_beat: u32` (default 0) through to `Conductor`.

**`conductor.rs`** — initialize with pre-seeded beat count:

```rust
pub fn with_start_beat(mut self, start_beat: u32) -> Self {
    self.beat_count = start_beat;
    // Re-compute DC and phase immediately so the first rendered beat is correct.
    let base_dc = (start_beat as f64 / config::DC_SCALE).powf(config::DC_EXP);
    self.dc = base_dc;
    self.phase = Phase::from_dc(self.dc);
    self.target_track_gains = TrackGains::for_phase(self.phase);
    self.sequencer.on_phase_change(self.phase);
    self
}
```

**`audio.rs`** — thread `start_beat` through `start_with_palette`.

Quick reference for QA:

| Target phase | Approx `--start-beat` |
|---|---|
| Swell | 80 |
| Surge | 135 |
| Storm | 190 |
| Maelstrom | 240 |

---

## Acceptance

1. `synthwave` pad layer sounds clearly brighter / more open than `dark_techno` when A/B compared.
2. `ambient_dread` pad is noticeably darker / more muffled than `synthwave`.
3. `noir_jazz` at seed 12345: ride off-beats have a perceptible "behind the beat" swing feel; no longer sounds robotic.
4. `--start-beat 135` drops into Surge immediately; all layers active within first few seconds.
5. `cargo check`, `cargo clippy`, `cargo test` all green.
6. No regression on `dark_techno` golden test.

---

## Out of scope

- Full GrooveEngine port (swing for bass, melody, chords) — Phase 2a/2b
- Velocity humanization for non-JazzRide patterns — future palette tuning pass
- Pad breathing / gain-dip animation — noted as Phase 2a refinement in pad_track.rs comments
