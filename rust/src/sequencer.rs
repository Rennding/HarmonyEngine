//! Sequencer — drum patterns, drum synthesis, walking bass.
//!
//! JS reference: `src/sequencer.js`. Phase 1 ports only the dark_techno path:
//! four-on-floor kick, backbeat snare, offbeat-8th hat, tier-0/1/2 walking
//! bass. The full per-palette drum dispatch, polyrhythms, fills, ghosts,
//! FillSystem, ChordTrack, PadTrack, MelodyEngine all port in Phase 2a.
//!
//! The design:
//! - Sequencer owns no Web-Audio-style scheduled timing. Instead, the
//!   Conductor calls `tick_16th` sixteen times per bar; each call
//!   synthesises drum hits + bass notes for that sub-step directly into
//!   the output mixer via pool voices (pitched) or one-shot synths (drums).
//! - A 16-step pattern array matches the JS pattern-builder output.

use crate::chord_track::ChordTrack;
use crate::config::{flags, gain, Phase};
use crate::harmony::{midi_to_freq, HarmonyEngine};
use crate::melody::MelodyEngine;
use crate::pad_track::PadTrack;
use crate::palette::{BassConfig, DrumKit, DrumPattern, Palette};
use crate::rng::Mulberry32;
use crate::synth::{BiquadLowpass, Envelope, NoiseGen};
use crate::voice_pool::{start_voice, NoteParams, VoicePool};
use crate::wavetables::PaletteWavetables;

/// Per-track output gain multiplier. Conductor smooths these toward target
/// values when phases change so we avoid abrupt level jumps.
#[derive(Clone, Copy, Debug)]
pub struct TrackGains {
    pub kick: f32,
    pub snare: f32,
    pub hat: f32,
    pub bass: f32,
    pub chord: f32,
    pub pad: f32,
    pub melody: f32,
}

impl TrackGains {
    pub const fn silent() -> Self {
        Self {
            kick: 0.0,
            snare: 0.0,
            hat: 0.0,
            bass: 0.0,
            chord: 0.0,
            pad: 0.0,
            melody: 0.0,
        }
    }

    /// Target gains for a given phase using `CFG.PHASE_FLOOR`. A track is
    /// either floored (full audible) or muted in Phase 1b. SPEC_010 stagger
    /// and intensity-driven layering land in Phase 2a.
    pub fn for_phase(phase: Phase) -> Self {
        Self {
            kick: if phase.floor_kick() { 1.0 } else { 0.0 },
            snare: if phase.floor_snare() { 1.0 } else { 0.0 },
            hat: if phase.floor_hat() { 1.0 } else { 0.0 },
            bass: if phase.floor_bass() { 1.0 } else { 0.0 },
            chord: if phase.floor_chord() { 1.0 } else { 0.0 },
            pad: if phase.floor_pad() { 1.0 } else { 0.0 },
            melody: if phase.floor_melody() { 1.0 } else { 0.0 },
        }
    }

    /// Pull each track gain a fraction `alpha` toward the target.
    pub fn lerp_toward(&mut self, target: &TrackGains, alpha: f32) {
        let lerp = |a: f32, b: f32| a + (b - a) * alpha;
        self.kick = lerp(self.kick, target.kick);
        self.snare = lerp(self.snare, target.snare);
        self.hat = lerp(self.hat, target.hat);
        self.bass = lerp(self.bass, target.bass);
        self.chord = lerp(self.chord, target.chord);
        self.pad = lerp(self.pad, target.pad);
        self.melody = lerp(self.melody, target.melody);
    }
}

/// A drum step — JS `sequencer.js:35–97` pattern builder output.
#[derive(Clone, Copy)]
pub struct Step {
    pub active: bool,
    pub vel: f32,
    pub prob: f32,
}

impl Step {
    const OFF: Step = Step {
        active: false,
        vel: 0.0,
        prob: 0.0,
    };
}

/// 16-step patterns. Only the patterns dark_techno uses are implemented.
pub fn pattern_16(pat: DrumPattern) -> [Step; 16] {
    let mut out = [Step::OFF; 16];
    match pat {
        // four_on_floor: hits on 0,4,8,12; ghosts on 2,6,10,13.
        DrumPattern::FourOnFloor => {
            for i in [0, 4, 8, 12] {
                out[i] = Step {
                    active: true,
                    vel: 0.9,
                    prob: 1.0,
                };
            }
            for i in [2, 6, 10] {
                out[i] = Step {
                    active: true,
                    vel: 0.3,
                    prob: 0.15,
                };
            }
        }
        // backbeat: hits on 4 & 12; ghosts on 2, 10.
        DrumPattern::Backbeat => {
            out[4] = Step {
                active: true,
                vel: 0.9,
                prob: 1.0,
            };
            out[12] = Step {
                active: true,
                vel: 0.85,
                prob: 1.0,
            };
            out[2] = Step {
                active: true,
                vel: 0.2,
                prob: 0.2,
            };
            out[10] = Step {
                active: true,
                vel: 0.2,
                prob: 0.2,
            };
        }
        // offbeat_8th: hits on 2,6,10,14; ghost on 1.
        DrumPattern::Offbeat8th => {
            for i in [2, 6, 10, 14] {
                out[i] = Step {
                    active: true,
                    vel: 0.55,
                    prob: 1.0,
                };
            }
            out[1] = Step {
                active: true,
                vel: 0.2,
                prob: 0.2,
            };
        }
        // euclidean_5_8 over 16 steps = 5 hits evenly distributed.
        DrumPattern::Euclidean5_8 => {
            for k in 0..5 {
                let i = (k * 16 / 5) as usize;
                out[i] = Step { active: true, vel: 0.5, prob: 0.8 };
            }
        }
        DrumPattern::Euclidean3_8 => {
            for k in 0..3 {
                let i = (k * 16 / 3) as usize;
                out[i] = Step { active: true, vel: 0.45, prob: 0.85 };
            }
        }
        DrumPattern::Euclidean7_16 => {
            for k in 0..7 {
                let i = (k * 16 / 7) as usize;
                out[i] = Step { active: true, vel: 0.55, prob: 0.9 };
            }
        }
        // half_time: kick on 0 and 8 only — ambient_dread `sparse_kick`, vaporwave.
        DrumPattern::HalfTime => {
            out[0] = Step { active: true, vel: 0.95, prob: 1.0 };
            out[8] = Step { active: true, vel: 0.85, prob: 1.0 };
        }
        // laid_back: kick 0, 10 — lo_fi `lo_fi_kick`, noir_jazz `jazz_kick`.
        DrumPattern::LaidBack => {
            out[0] = Step { active: true, vel: 0.9, prob: 1.0 };
            out[10] = Step { active: true, vel: 0.75, prob: 0.9 };
            out[6] = Step { active: true, vel: 0.35, prob: 0.4 };
        }
        // syncopated: glitch `glitch_kick`, industrial `industrial_kick`.
        DrumPattern::Syncopated => {
            for i in [0, 3, 7, 11] {
                out[i] = Step { active: true, vel: 0.85, prob: 0.95 };
            }
            out[14] = Step { active: true, vel: 0.45, prob: 0.5 };
        }
        // break_kick: breakbeat amen-style (0, 2.5≈3, 10, 12.5≈13).
        DrumPattern::BreakKick => {
            out[0] = Step { active: true, vel: 0.95, prob: 1.0 };
            out[3] = Step { active: true, vel: 0.75, prob: 0.9 };
            out[10] = Step { active: true, vel: 0.80, prob: 0.95 };
        }
        // scattered: glitch/industrial snare — stuttered around backbeats.
        DrumPattern::Scattered => {
            out[4] = Step { active: true, vel: 0.85, prob: 1.0 };
            out[6] = Step { active: true, vel: 0.55, prob: 0.5 };
            out[12] = Step { active: true, vel: 0.85, prob: 1.0 };
            out[14] = Step { active: true, vel: 0.55, prob: 0.5 };
        }
        // ghost: ambient_dread mostly ghosts + weak 4, 12.
        DrumPattern::Ghost => {
            out[4] = Step { active: true, vel: 0.4, prob: 0.7 };
            out[12] = Step { active: true, vel: 0.4, prob: 0.7 };
            for i in [2, 6, 10, 14] {
                out[i] = Step { active: true, vel: 0.15, prob: 0.3 };
            }
        }
        // jazz: noir_jazz brush on 4, 12 with heavy ghosts.
        DrumPattern::Jazz => {
            out[4] = Step { active: true, vel: 0.5, prob: 0.9 };
            out[12] = Step { active: true, vel: 0.5, prob: 0.9 };
            for i in [2, 6, 10, 14] {
                out[i] = Step { active: true, vel: 0.2, prob: 0.4 };
            }
        }
        // break_snare: breakbeat (4, 10, 12).
        DrumPattern::BreakSnare => {
            out[4] = Step { active: true, vel: 0.9, prob: 1.0 };
            out[10] = Step { active: true, vel: 0.7, prob: 0.8 };
            out[12] = Step { active: true, vel: 0.9, prob: 1.0 };
        }
        // straight_8th: all 8ths.
        DrumPattern::Straight8th => {
            for i in [0, 2, 4, 6, 8, 10, 12, 14] {
                out[i] = Step { active: true, vel: 0.55, prob: 1.0 };
            }
        }
        // busy_16th: glitch/industrial/breakbeat — all 16ths.
        DrumPattern::Busy16th => {
            out.fill(Step { active: true, vel: 0.45, prob: 0.9 });
        }
        // slow_quarter: ambient_dread hat — quarters.
        DrumPattern::SlowQuarter => {
            for i in [0, 4, 8, 12] {
                out[i] = Step { active: true, vel: 0.4, prob: 0.9 };
            }
        }
        // jazz_ride: swung 8ths with accent on downbeats.
        DrumPattern::JazzRide => {
            for i in [0, 4, 8, 12] {
                out[i] = Step { active: true, vel: 0.6, prob: 1.0 };
            }
            for i in [2, 6, 10, 14] {
                out[i] = Step { active: true, vel: 0.4, prob: 0.95 };
            }
        }
    }
    out
}

/// Drum voice — a one-shot transient synthesiser. JS `_synthKick/Snare/Hat`
/// equivalents from `sequencer.js:804–917`.
pub struct DrumVoice {
    active: bool,
    age_samples: u32,
    samples_total: u32,
    // Pitched (kick): oscillator with exponential pitch sweep.
    freq_start: f32,
    freq_end: f32,
    // Noise (snare/hat): bandpass or highpass.
    uses_noise: bool,
    gain: f32,
    phase: f32,
    noise: NoiseGen,
    filter: BiquadLowpass,
    env: Envelope,
    sample_rate: f32,
    // `true` for the pitched layer (kick); `false` for filtered noise
    // (snare/hat).
    pitched: bool,
}

impl DrumVoice {
    pub fn new(sample_rate: f32, rng_seed: u32) -> Self {
        Self {
            active: false,
            age_samples: 0,
            samples_total: 0,
            freq_start: 0.0,
            freq_end: 0.0,
            uses_noise: false,
            gain: 0.0,
            phase: 0.0,
            noise: NoiseGen::new(rng_seed),
            filter: BiquadLowpass::new(sample_rate, 20_000.0, 0.707),
            env: Envelope::new(sample_rate),
            sample_rate,
            pitched: true,
        }
    }

    /// JS `_synthKick`: freq sweep 2.2× → 0.65× over `decay` seconds.
    pub fn trigger_kick(&mut self, freq: f32, decay: f32, vel: f32) {
        self.active = true;
        self.age_samples = 0;
        self.samples_total = ((decay + 0.05) * self.sample_rate) as u32;
        self.freq_start = freq * 2.2;
        self.freq_end = freq * 0.65;
        self.uses_noise = false;
        self.pitched = true;
        self.gain = vel * gain::KICK;
        self.phase = 0.0;
        self.env.attack = 0.001;
        self.env.decay = decay;
        self.env.sustain_level = 0.0;
        self.env.release = 0.05;
        self.env.trigger(1.0);
    }

    /// JS `_synthSnare`: noise + bandpass at `freq*3`, Q=1.2.
    pub fn trigger_snare(&mut self, freq: f32, decay: f32, vel: f32) {
        self.active = true;
        self.age_samples = 0;
        self.samples_total = ((decay + 0.05) * self.sample_rate) as u32;
        self.uses_noise = true;
        self.pitched = false;
        self.filter = BiquadLowpass::new(self.sample_rate, freq * 3.0, 1.2);
        self.gain = vel * gain::SNARE_NOISE;
        self.env.attack = 0.001;
        self.env.decay = decay;
        self.env.sustain_level = 0.0;
        self.env.release = 0.02;
        self.env.trigger(1.0);
    }

    /// JS `_synthHat`: noise with lowpass at `freq` (we use lowpass — a
    /// true highpass is a Phase 2a refinement; in practice the filter is
    /// wide-open at 8 kHz for dark_techno, so near-identity).
    pub fn trigger_hat(&mut self, freq: f32, decay: f32, vel: f32) {
        self.active = true;
        self.age_samples = 0;
        self.samples_total = ((decay + 0.02) * self.sample_rate) as u32;
        self.uses_noise = true;
        self.pitched = false;
        // For a lowpass: a high cutoff near Nyquist passes bright noise;
        // matches JS highpass-at-8kHz audibly for the dark_techno role.
        self.filter = BiquadLowpass::new(self.sample_rate, freq, 0.707);
        self.gain = vel * gain::HAT;
        self.env.attack = 0.001;
        self.env.decay = decay;
        self.env.sustain_level = 0.0;
        self.env.release = 0.01;
        self.env.trigger(1.0);
    }

    #[inline]
    pub fn render(&mut self) -> f32 {
        if !self.active {
            return 0.0;
        }
        let t = self.age_samples as f32 / self.sample_rate.max(1.0);
        let source = if self.pitched {
            // Exponential pitch ramp: f(t) = f0 * (f1/f0)^(t/decay).
            let decay = self.env.decay.max(1e-4);
            let ratio = self.freq_end / self.freq_start;
            let freq = self.freq_start * ratio.powf((t / decay).min(1.0));
            self.phase += freq / self.sample_rate;
            while self.phase >= 1.0 {
                self.phase -= 1.0;
            }
            // Kick = fat sine — good enough stand-in for the wavetable
            // kick recipe (Phase 2a switches to the RECIPES.dark_techno.kick
            // wavetable for exact parity).
            (self.phase * std::f32::consts::TAU).sin()
        } else if self.uses_noise {
            self.filter.process(self.noise.next_sample())
        } else {
            0.0
        };

        let env = self.env.next_sample();
        let y = source * env * self.gain;
        self.age_samples += 1;
        if !self.env.is_active() || self.age_samples >= self.samples_total {
            self.active = false;
        }
        y
    }
}

/// Walking bass — JS `WalkingBass.getNote` (sequencer.js:1555–1654).
/// dark_techno caps at Tier 2 (chord tones). Phase 1 Tier 0/1 only; Tier 2+
/// chord-tone selection ports in Phase 2a alongside the VoicingEngine.
pub struct WalkingBass {
    step: u32,
    rng: Mulberry32,
}

impl WalkingBass {
    pub fn new(seed: i32) -> Self {
        Self {
            step: 0,
            rng: Mulberry32::new(seed.wrapping_add(101)),
        }
    }

    /// Return a MIDI note for this 16th-step.
    ///
    /// When `flags::walking_bass_next_chord()` is on, the last beat of
    /// the current chord biases the bass toward an approach tone of
    /// the next chord's root (chromatic neighbour or scale step). This
    /// is the SPEC_040 §6 "musical convention" — bass walks toward the
    /// next chord rather than reasserting the current root one more time.
    pub fn pick_note(&mut self, he: &HarmonyEngine, bass_cfg: &BassConfig) -> i32 {
        let octave = bass_cfg.octave;
        // Tier 2 RNG advance kept regardless of branch so seed replays
        // identically when the flag is off (golden parity vs #81).
        let _ = self.rng.next_f64();

        let approach_active = flags::walking_bass_next_chord()
            && he.beats_until_next_chord() <= 1;

        let note = if approach_active {
            // Approach next chord root by chromatic step from current root.
            let (next_root, _) = he.peek_next_chord();
            let cur_root_pc = he.root_midi(octave) % 12;
            let key = he.root_semitone();
            let target_pc = (key + next_root).rem_euclid(12);
            // Choose chromatic step: if target is above current, approach
            // from below (target - 1); if below, approach from above
            // (target + 1). Tie-break to the upper chromatic so the bass
            // line ascends most of the time (musically conventional).
            let cur = cur_root_pc;
            let above = (target_pc - cur).rem_euclid(12) <= 6;
            let approach_pc = if above {
                (target_pc - 1).rem_euclid(12)
            } else {
                (target_pc + 1).rem_euclid(12)
            };
            (octave + 1) * 12 + approach_pc
        } else {
            match self.step % 4 {
                0 => he.root_midi(octave),
                2 => he.fifth_midi(octave),
                _ => he.root_midi(octave),
            }
        };
        self.step = self.step.wrapping_add(1);
        note
    }
}

/// Top-level Phase 1b sequencer. Orchestrates drums, walking bass, chord
/// stabs, pad layer, and melody — each with its own voice pool / state —
/// and renders all of them through per-track gain coefficients.
pub struct Sequencer {
    pub drums: DrumKit,
    kick_pattern: [Step; 16],
    snare_pattern: [Step; 16],
    hat_pattern: [Step; 16],
    pub kick_voice: DrumVoice,
    pub snare_voice: DrumVoice,
    pub hat_voice: DrumVoice,
    pub bass: WalkingBass,
    pub bass_cfg: BassConfig,
    pub pool: VoicePool,
    pub chord: ChordTrack,
    pub pad: PadTrack,
    pub melody: MelodyEngine,
    /// Full palette retained so VoicingEngine + WalkingBass next-chord
    /// can read per-palette `voicing` / `harmonic_rhythm` profiles when
    /// those flags are on. Cloned once at run-start; never mutated.
    palette: Palette,
    wavetables: PaletteWavetables,
    rng: Mulberry32,
    sample_rate: f32,
    last_bass_note: i32,
    pub track_gains: TrackGains,
}

impl Sequencer {
    pub fn new(sample_rate: f32, palette: &Palette, seed: i32, bpm: f32) -> Self {
        Self {
            drums: palette.drums,
            kick_pattern: pattern_16(palette.drums.kick_pattern),
            snare_pattern: pattern_16(palette.drums.snare_pattern),
            hat_pattern: pattern_16(palette.drums.hat_pattern),
            kick_voice: DrumVoice::new(sample_rate, 0xA5A5_A5A5),
            snare_voice: DrumVoice::new(sample_rate, 0x5A5A_5A5A),
            hat_voice: DrumVoice::new(sample_rate, 0xC3C3_C3C3),
            bass: WalkingBass::new(seed),
            bass_cfg: palette.bass,
            pool: VoicePool::new(sample_rate),
            chord: ChordTrack::new(sample_rate, palette.chord),
            pad: PadTrack::new(sample_rate, palette.pad),
            melody: MelodyEngine::new(
                sample_rate,
                bpm,
                palette.melody,
                palette.melody_rhythm,
                palette.motif,
                seed,
            ),
            palette: palette.clone(),
            wavetables: PaletteWavetables::for_palette(palette.name),
            rng: Mulberry32::new(seed.wrapping_add(11)),
            sample_rate,
            last_bass_note: 0,
            track_gains: TrackGains::for_phase(Phase::Pulse),
        }
    }

    /// Called by the Conductor at each 16th-step boundary with the current
    /// HarmonyEngine state. Allocates voices for anything that should start
    /// playing now.
    pub fn tick_16th(&mut self, step_in_bar: usize, he: &HarmonyEngine) {
        let k = self.kick_pattern[step_in_bar % 16];
        let s = self.snare_pattern[step_in_bar % 16];
        let h = self.hat_pattern[step_in_bar % 16];
        let kick_freq = self.drums.kick.freq;
        let kick_decay = self.drums.kick.decay;
        let snare_freq = self.drums.snare.freq;
        let snare_decay = self.drums.snare.decay;
        let hat_freq = self.drums.hat.freq;
        let hat_decay = self.drums.hat.decay;

        if k.active && self.roll(k.prob) {
            self.kick_voice.trigger_kick(kick_freq, kick_decay, k.vel);
        }
        if s.active && self.roll(s.prob) {
            self.snare_voice.trigger_snare(snare_freq, snare_decay, s.vel);
        }
        if h.active && self.roll(h.prob) {
            self.hat_voice.trigger_hat(hat_freq, hat_decay, h.vel);
        }

        // Bass: one note every beat (step % 4 == 0).
        if step_in_bar.is_multiple_of(4) {
            let note = self.bass.pick_note(he, &self.bass_cfg);
            self.last_bass_note = note;
            let freq = midi_to_freq(note);
            start_voice(
                &mut self.pool,
                NoteParams {
                    freq_hz: freq,
                    cutoff_hz: self.bass_cfg.filter_cutoff,
                    q: self.bass_cfg.filter_resonance,
                    gain: gain::BASS * self.bass_cfg.gain_scalar,
                    attack: 0.005,
                    decay: 0.30,
                    sustain_level: 0.1,
                    release: 0.10,
                },
            );
        }

        // Chord stabs (own pool). Pass palette + melody-last so the
        // voicing engine (when enabled) can avoid melody collision.
        let melody_last = self.melody.last_note_midi();
        self.chord
            .tick_16th(step_in_bar, he, &self.palette, melody_last);
    }

    /// Per-beat hook (called from Conductor.on_beat). Updates the chord-change-
    /// driven pad and the melody engine.
    pub fn on_beat(&mut self, he: &HarmonyEngine) {
        self.pad.on_beat(he, &self.palette);
        self.melody.on_beat(he);
    }

    pub fn on_phase_change(&mut self, phase: Phase) {
        self.chord.on_phase_change(phase);
        self.pad.on_phase_change(phase);
        self.melody.on_phase_change(phase);
    }

    #[inline]
    fn roll(&mut self, p: f32) -> bool {
        self.rng.next_f64() < p as f64
    }

    /// Render one sample of the sequencer's output — sums drums + bass + chord +
    /// pad + melody, scaled by the current per-track gain coefficients.
    pub fn render(&mut self) -> f32 {
        let g = self.track_gains;
        let mut mix = 0.0;
        mix += self.kick_voice.render() * g.kick;
        mix += self.snare_voice.render() * g.snare;
        mix += self.hat_voice.render() * g.hat;
        mix += self.pool.render_sum(&self.wavetables.bass) * g.bass;
        mix += self.chord.render(&self.wavetables.chord) * g.chord;
        mix += self.pad.render(&self.wavetables.pad) * g.pad;
        mix += self.melody.render(&self.wavetables.melody) * g.melody;
        mix
    }

    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }
}
