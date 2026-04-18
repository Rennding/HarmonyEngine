//! cpal audio host wire-up.
//!
//! JS reference: `src/audio.js:180` `initAudio()` — builds the Web Audio
//! graph and owns the `<audio>`-element MediaStream routing. In Rust the
//! equivalent is a cpal `Stream` pushing samples from a closure that owns
//! the `Conductor`.
//!
//! Channel handling: the stream is built with the device's default output
//! format; the conductor produces mono samples that are duplicated across
//! all channels. The Phase 2a mixer introduces per-voice pan; for Phase 1
//! parity (dark_techno plays centred in JS anyway) mono→N duplication is
//! indistinguishable.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SampleRate, Stream, StreamConfig};

use crate::conductor::Conductor;

pub struct AudioHost {
    stream: Stream,
    sample_rate: u32,
}

pub struct AudioError(pub String);

impl std::fmt::Display for AudioError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "audio error: {}", self.0)
    }
}

impl std::fmt::Debug for AudioError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(self, f)
    }
}

impl std::error::Error for AudioError {}

impl From<cpal::DefaultStreamConfigError> for AudioError {
    fn from(e: cpal::DefaultStreamConfigError) -> Self {
        AudioError(e.to_string())
    }
}

impl From<cpal::BuildStreamError> for AudioError {
    fn from(e: cpal::BuildStreamError) -> Self {
        AudioError(e.to_string())
    }
}

impl From<cpal::PlayStreamError> for AudioError {
    fn from(e: cpal::PlayStreamError) -> Self {
        AudioError(e.to_string())
    }
}

impl AudioHost {
    /// Build and start a cpal output stream driven by a fresh `Conductor`.
    pub fn start(seed: i32) -> Result<Self, AudioError> {
        Self::start_with_palette(seed, None, 0)
    }

    /// Build and start a stream with an optional palette override and optional start beat.
    /// `start_beat = 0` plays from the beginning. Use e.g. `135` to skip to Surge.
    pub fn start_with_palette(seed: i32, palette: Option<&str>, start_beat: u32) -> Result<Self, AudioError> {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| AudioError("no default output device".to_string()))?;

        let supported = device.default_output_config()?;
        let sample_rate = supported.sample_rate().0;
        let channels = supported.channels() as usize;
        let format = supported.sample_format();

        let config = StreamConfig {
            channels: supported.channels(),
            sample_rate: SampleRate(sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        let mut conductor = match palette {
            Some(name) => Conductor::with_palette_name(sample_rate as f32, seed, name),
            None => Conductor::new(sample_rate as f32, seed),
        }.with_start_beat(start_beat);

        eprintln!(
            "[HE] audio host: device={} sr={} ch={} fmt={:?} bpm={} palette={}",
            device.name().unwrap_or_default(),
            sample_rate,
            channels,
            format,
            conductor.bpm(),
            conductor.palette_name(),
        );

        let err_fn = |err| eprintln!("[HE] stream error: {err}");

        // `f32` is the common default; for other formats we'd add matches.
        // cpal <0.15> covers the rest, but the default on macOS/Linux/Windows
        // default devices is f32 — Phase 2a widens this when we test edge
        // devices.
        let stream = match format {
            SampleFormat::F32 => device.build_output_stream(
                &config,
                move |buf: &mut [f32], _| {
                    for frame in buf.chunks_mut(channels) {
                        let s = conductor.render_sample();
                        for slot in frame.iter_mut() {
                            *slot = s;
                        }
                    }
                },
                err_fn,
                None,
            )?,
            other => {
                return Err(AudioError(format!(
                    "unsupported sample format: {other:?} (Phase 2a extends)"
                )))
            }
        };

        stream.play()?;

        Ok(Self {
            stream,
            sample_rate,
        })
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn stream(&self) -> &Stream {
        &self.stream
    }
}
