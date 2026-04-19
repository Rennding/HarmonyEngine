//! Preset system — autosave + named presets + QA repro (Build A #90).
//!
//! Storage path: `%APPDATA%\HarmonyEngine\presets\` on Windows,
//! `~/.config/harmonyengine/presets/` on Linux (via `directories` crate).
//! Format: one JSON file per preset; `schema_version: 1`.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};

use harmonyengine::config::Phase;

use crate::tabs::engineer::EngineerState;

pub const SCHEMA_VERSION: u32 = 2;
pub const AUTOSAVE_FILENAME: &str = "autosave.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub schema_version: u32,
    pub name: String,
    pub seed: i32,
    pub palette: String,
    pub bpm: f32,
    /// Mood: "chill", "normal", "intense".
    pub mood: String,
    /// Volume scalar 0.0–1.0.
    pub volume: f32,
    pub muted: bool,
    /// Forced phase index 0=Auto 1=Pulse .. 5=Maelstrom.
    pub forced_phase: u8,
    /// Beat index at time of save (informational for QA repro).
    pub beat_at_save: u32,
    /// Engineer tab state — QA-critical parameters. Missing in v1 presets.
    #[serde(default)]
    pub engineer: EngineerState,
    /// Phase at time of save (informational, for QA repro).
    #[serde(default)]
    pub phase_at_save: u8,
}

impl Preset {
    pub fn new(
        name: impl Into<String>,
        seed: i32,
        palette: impl Into<String>,
        bpm: f32,
        mood: impl Into<String>,
        volume: f32,
        muted: bool,
        forced_phase: u8,
        beat_at_save: u32,
    ) -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            name: name.into(),
            seed,
            palette: palette.into(),
            bpm,
            mood: mood.into(),
            volume,
            muted,
            forced_phase,
            beat_at_save,
            engineer: EngineerState::default(),
            phase_at_save: 0,
        }
    }

    pub fn forced_phase_config(&self) -> Option<Phase> {
        match self.forced_phase {
            1 => Some(Phase::Pulse),
            2 => Some(Phase::Swell),
            3 => Some(Phase::Surge),
            4 => Some(Phase::Storm),
            5 => Some(Phase::Maelstrom),
            _ => None,
        }
    }
}

pub struct PresetStore {
    dir: PathBuf,
}

impl PresetStore {
    /// Returns `None` if the platform config directory is unavailable.
    pub fn new() -> Option<Self> {
        let proj = ProjectDirs::from("", "", "HarmonyEngine")?;
        let dir = proj.config_dir().join("presets");
        std::fs::create_dir_all(&dir).ok()?;
        Some(Self { dir })
    }

    pub fn preset_dir(&self) -> &PathBuf {
        &self.dir
    }

    /// Save a preset (filename derived from `preset.name`; sanitised).
    pub fn save(&self, preset: &Preset) -> std::io::Result<PathBuf> {
        let filename = sanitise_filename(&preset.name) + ".json";
        let path = self.dir.join(filename);
        let json = serde_json::to_string_pretty(preset)
            .map_err(|e| std::io::Error::other(e.to_string()))?;
        std::fs::write(&path, json)?;
        Ok(path)
    }

    /// Save to the autosave slot.
    pub fn autosave(&self, preset: &Preset) -> std::io::Result<()> {
        let path = self.dir.join(AUTOSAVE_FILENAME);
        let json = serde_json::to_string_pretty(preset)
            .map_err(|e| std::io::Error::other(e.to_string()))?;
        std::fs::write(path, json)?;
        Ok(())
    }

    /// Save as a QA repro preset with a timestamped filename.
    pub fn save_qa_repro(&self, preset: &Preset) -> std::io::Result<PathBuf> {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let filename = format!("qa-{ts}.json");
        let path = self.dir.join(filename);
        let json = serde_json::to_string_pretty(preset)
            .map_err(|e| std::io::Error::other(e.to_string()))?;
        std::fs::write(&path, json)?;
        Ok(path)
    }

    /// Load a preset by path.
    pub fn load(&self, path: &PathBuf) -> std::io::Result<Preset> {
        let json = std::fs::read_to_string(path)?;
        serde_json::from_str(&json).map_err(|e| std::io::Error::other(e.to_string()))
    }

    /// Load the autosave preset if it exists.
    pub fn load_autosave(&self) -> Option<Preset> {
        let path = self.dir.join(AUTOSAVE_FILENAME);
        self.load(&path).ok()
    }

    /// List all `.json` preset files in the preset directory.
    pub fn list(&self) -> Vec<PathBuf> {
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return Vec::new();
        };
        let mut paths: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().map(|e| e == "json").unwrap_or(false))
            .collect();
        paths.sort();
        paths
    }

    /// Names of all presets (stem of filename, excluding autosave/qa files).
    pub fn named_preset_names(&self) -> Vec<String> {
        self.list()
            .into_iter()
            .filter_map(|p| {
                let stem = p.file_stem()?.to_str()?.to_string();
                if stem == "autosave" || stem.starts_with("qa-") {
                    None
                } else {
                    Some(stem)
                }
            })
            .collect()
    }
}

fn sanitise_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}
