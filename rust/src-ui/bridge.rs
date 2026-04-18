//! UI ↔ audio-thread bridge (Build A #90).
//!
//! `AudioBridge` owns a cpal stream that drives a `Conductor` internally.
//! The UI communicates via a bounded `crossbeam_channel::Sender<UiCmd>`;
//! the audio callback drains commands on every buffer fill (try_recv loop,
//! non-blocking, RT-safe).
//!
//! Shared read-back state (`SharedAudioState`) uses atomics so the UI can
//! sample beat / phase / BPM at frame rate without touching the audio path.

use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU32, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};

use crossbeam_channel::{bounded, Receiver, Sender, TryRecvError};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SampleRate, StreamConfig};

use harmonyengine::conductor::Conductor;
use harmonyengine::config::Phase;

// --- Command protocol -------------------------------------------------------

/// Commands sent from UI thread → audio callback (fire-and-forget).
#[derive(Debug)]
pub enum UiCmd {
    SetPalette(String),
    ForcePhase(Option<Phase>),
    SetBpm(f32),
    /// 0.0 = silence, 1.0 = full volume.
    SetVolume(f32),
    SetMuted(bool),
    /// Reinitialise with a new seed (new song).
    NewSong(i32),
    SetBeatFrozen(bool),
}

// --- Shared read-back state -------------------------------------------------

pub struct SharedAudioState {
    /// Current beat index (wraps at u32::MAX).
    pub beat: AtomicU32,
    /// Phase as u8: 0=Pulse 1=Swell 2=Surge 3=Storm 4=Maelstrom.
    pub phase_idx: AtomicU8,
    /// BPM as f32 bits.
    pub bpm_bits: AtomicU32,
    /// Seed used by the current run.
    pub seed: AtomicI32,
    /// Whether the audio is playing (stream not paused).
    pub is_playing: AtomicBool,
    /// Last FFT magnitude snapshot (~512 bins, 0.0–1.0). Updated ~10 fps.
    pub fft_frame: Mutex<Vec<f32>>,
    /// Current palette name.
    pub palette_name: Mutex<String>,
}

impl SharedAudioState {
    fn new(seed: i32, bpm: f32, palette: &str) -> Arc<Self> {
        Arc::new(Self {
            beat: AtomicU32::new(0),
            phase_idx: AtomicU8::new(0),
            bpm_bits: AtomicU32::new(bpm.to_bits()),
            seed: AtomicI32::new(seed),
            is_playing: AtomicBool::new(true),
            fft_frame: Mutex::new(vec![0.0f32; 512]),
            palette_name: Mutex::new(palette.to_string()),
        })
    }

    pub fn phase(&self) -> Phase {
        match self.phase_idx.load(Ordering::Relaxed) {
            1 => Phase::Swell,
            2 => Phase::Surge,
            3 => Phase::Storm,
            4 => Phase::Maelstrom,
            _ => Phase::Pulse,
        }
    }

    pub fn bpm(&self) -> f32 {
        f32::from_bits(self.bpm_bits.load(Ordering::Relaxed))
    }
}

fn phase_to_u8(p: Phase) -> u8 {
    match p {
        Phase::Pulse => 0,
        Phase::Swell => 1,
        Phase::Surge => 2,
        Phase::Storm => 3,
        Phase::Maelstrom => 4,
    }
}

// --- AudioBridge ------------------------------------------------------------

pub struct AudioBridge {
    pub cmd_tx: Sender<UiCmd>,
    pub state: Arc<SharedAudioState>,
    _stream: cpal::Stream,
}

impl AudioBridge {
    /// Start a new audio bridge with the given seed and optional palette.
    pub fn start(seed: i32, palette: Option<&str>) -> Result<Self, String> {
        let palette_name = palette.unwrap_or("dark_techno");
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| "no default output device".to_string())?;

        let supported = device
            .default_output_config()
            .map_err(|e| e.to_string())?;
        let sample_rate = supported.sample_rate().0;
        let channels = supported.channels() as usize;
        let format = supported.sample_format();

        let config = StreamConfig {
            channels: supported.channels(),
            sample_rate: SampleRate(sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        let conductor = match palette {
            Some(name) => Conductor::with_palette_name(sample_rate as f32, seed, name),
            None => Conductor::new(sample_rate as f32, seed),
        };

        let shared = SharedAudioState::new(seed, conductor.bpm(), conductor.palette_name());

        let (cmd_tx, cmd_rx) = bounded::<UiCmd>(64);

        let stream = Self::build_stream(conductor, cmd_rx, Arc::clone(&shared), &device, &config, channels, format)?;
        stream.play().map_err(|e| e.to_string())?;

        Ok(Self {
            cmd_tx,
            state: shared,
            _stream: stream,
        })
    }

    fn build_stream(
        mut conductor: Conductor,
        cmd_rx: Receiver<UiCmd>,
        state: Arc<SharedAudioState>,
        device: &cpal::Device,
        config: &StreamConfig,
        channels: usize,
        format: SampleFormat,
    ) -> Result<cpal::Stream, String> {
        // Local bridge-state that lives in the audio closure:
        let mut ui_volume: f32 = 1.0;
        let mut ui_muted = false;
        // FFT accumulation: simple peak envelope per bin-group, updated every ~100 ms.
        let mut fft_counter: u32 = 0;
        let fft_update_interval = (conductor.sample_rate() * 0.10) as u32;
        let mut fft_accum = vec![0.0f32; 512];

        let err_fn = |e| eprintln!("[HE-UI] stream error: {e}");

        let build = |device: &cpal::Device| {
            device.build_output_stream(
                config,
                move |buf: &mut [f32], _| {
                    // Drain command queue — RT-safe non-blocking.
                    loop {
                        match cmd_rx.try_recv() {
                            Ok(cmd) => apply_cmd(cmd, &mut conductor, &mut ui_volume, &mut ui_muted, &state),
                            Err(TryRecvError::Empty) => break,
                            Err(TryRecvError::Disconnected) => break,
                        }
                    }

                    for frame in buf.chunks_mut(channels) {
                        let raw = conductor.render_sample();
                        let out = if ui_muted { 0.0 } else { raw * ui_volume };
                        for slot in frame.iter_mut() {
                            *slot = out;
                        }

                        // FFT accumulation: track peak per 512-bin band via mono sample.
                        let bin = (fft_counter as usize) % 512;
                        let mag = out.abs();
                        if mag > fft_accum[bin] {
                            fft_accum[bin] = mag;
                        }
                        fft_counter = fft_counter.wrapping_add(1);
                    }

                    // Periodic state publish.
                    if fft_counter % fft_update_interval == 0 {
                        state.beat.store(conductor.beat_count(), Ordering::Relaxed);
                        state.phase_idx.store(phase_to_u8(conductor.phase()), Ordering::Relaxed);
                        state.bpm_bits.store(conductor.bpm().to_bits(), Ordering::Relaxed);
                        // Snapshot FFT to shared.
                        if let Ok(mut guard) = state.fft_frame.try_lock() {
                            guard.copy_from_slice(&fft_accum);
                            fft_accum.fill(0.0);
                        }
                    }
                },
                err_fn,
                None,
            )
        };

        match format {
            SampleFormat::F32 => build(device).map_err(|e| e.to_string()),
            other => Err(format!("unsupported sample format: {other:?}")),
        }
    }

    /// Send a command to the audio thread (non-blocking; drops if queue full).
    pub fn send(&self, cmd: UiCmd) {
        let _ = self.cmd_tx.try_send(cmd);
    }
}

fn apply_cmd(
    cmd: UiCmd,
    conductor: &mut Conductor,
    ui_volume: &mut f32,
    ui_muted: &mut bool,
    state: &Arc<SharedAudioState>,
) {
    match cmd {
        UiCmd::SetPalette(name) => {
            let sr = conductor.sample_rate();
            let seed = conductor.seed();
            *conductor = Conductor::with_palette_name(sr, seed, &name);
            state.seed.store(seed, Ordering::Relaxed);
            if let Ok(mut guard) = state.palette_name.try_lock() {
                *guard = name;
            }
        }
        UiCmd::ForcePhase(p) => conductor.set_force_phase(p),
        UiCmd::SetBpm(bpm) => conductor.set_bpm(bpm),
        UiCmd::SetVolume(v) => *ui_volume = v.clamp(0.0, 1.0),
        UiCmd::SetMuted(m) => *ui_muted = m,
        UiCmd::NewSong(seed) => {
            let sr = conductor.sample_rate();
            let palette = conductor.palette_name();
            *conductor = Conductor::with_palette_name(sr, seed, palette);
            state.seed.store(seed, Ordering::Relaxed);
            if let Ok(mut guard) = state.palette_name.try_lock() {
                *guard = palette.to_string();
            }
        }
        UiCmd::SetBeatFrozen(f) => conductor.set_beat_frozen(f),
    }
}
