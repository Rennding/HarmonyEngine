# SPEC_042 — Audio Diagnostic System

**Status:** Confirmed  
**Model:** Opus (judgment-heavy: vocabulary design, anomaly thresholds, UX)  
**Depends on:** None (reads existing state, no engine changes)  
**Addresses:** QA communication gap — Aram can't describe sounds, Claude can't hear them

---

## 1 · Problem summary

Aram hears something wrong. He has no precise language for it. He tries to describe it ("the bass sounds weird in Storm"), Claude guesses what he means, often wrong, iteration is slow and lossy.

Two complementary tools fix this:

- **A.** A shared vocabulary that maps human-friendly sound descriptors to technical audio dimensions — so when Aram says "muddy" or the system says "muddy," both sides know exactly what's meant.
- **B.** An active diagnostic overlay that watches for anomalies in real time, names them using that vocabulary, and logs them with full context — so Aram doesn't have to describe anything at all for an entire class of bugs.

Together: the overlay catches what it can automatically; the vocabulary gives Aram words for what it can't.

---

## 2 · Part A — Reference Vocabulary

### 2.1 · The glossary

A fixed set of descriptors, each mapping to a technical definition and the frequency/gain range where it lives. This is the shared language for all QA from now on.

| Descriptor | What you hear | Technical meaning | Where to look |
|---|---|---|---|
| **Muddy** | Thick, indistinct low end — instruments blur together | Too much energy in 200–500 Hz; multiple voices overlapping in low-mids | Bass + pad + kick frequency overlap |
| **Boomy** | Excessive bass resonance, one-note rumble | Energy pileup 80–200 Hz, often from bass + kick stacking | Bass gain + kick tail + pad low shelf |
| **Harsh** | Piercing, fatiguing upper range | Excessive 2–5 kHz energy, often from saw-wave overtones | Melody + arp + chord synth harmonics |
| **Brittle** | Sharp, spiky transients that stick out | High-frequency transient spikes >5 kHz, short attack envelopes | Melody attack, chord stab attack, hat gain |
| **Thin** | Sounds empty, missing body | Low end absent below 200 Hz — bass too quiet or filtered out | Bass gain, pad low-end, kick presence |
| **Honky** | Nasal, boxy mid-range buildup | Resonance at 800 Hz–1.5 kHz | Pad mid-range, chord voicing register |
| **Dull** | Sounds muffled, lifeless, missing sparkle | High-frequency energy absent above 4 kHz | Melody filter cutoff, master EQ high band |
| **Clipping** | Crackling, distortion, digital crunch | Gain exceeds 1.0 at any node; waveform flat-tops | Master gain, track gain stacking, limiter input |
| **Pumping** | Rhythmic volume ducking that sounds unnatural | Sidechain compressor over-ducking or slow release | Sidechain depth/release on bass, pad, arp |
| **Silence gap** | Unexpected quiet moment, dropout | Track gain drops to 0 unexpectedly; voice pool exhaustion; stagger group stalled | Voice pool count, track gain transitions, stagger queue |
| **Monotone** | Same note/pattern repeating, no movement | Melody stuck, chord not progressing, or same progression looping without variation | Melody engine state, chord progression index, harmonic rhythm |
| **Cluttered** | Too many things happening, can't pick out individual parts | Voice count too high, too many tracks at full gain, too many notes in one subdivision | Active voice count, simultaneous track gains, note density |
| **Poppy** | Click or pop on note start/end | Envelope too short (<10ms attack), oscillator start/stop discontinuity, voice steal transient | Attack time, legato chain kill gap, voice steal rate |
| **Washy** | Everything blends into reverb soup | Reverb send too high, wet/dry balance wrong, too many overlapping release tails | Reverb send gains, reverb decay time, release tail overlap |
| **Flat** | No dynamics, no movement, everything same volume | All track gains similar, no sidechain movement, DC not progressing, swing canceling syncopation | Track gain variance, DC rate of change, groove net offset |
| **Dissonant** | A note that sounds "wrong" against the chord | Sustained non-chord, non-scale tone (not a passing tone) | Melody note vs. chord tones, scale membership |
| **Jarring** | Sudden uncomfortable shift — key change, phase drop | Distant modulation without pivot chord, unexpected phase regression | Modulation interval, DC direction vs. phase |
| **Sloppy** | Rhythm feels loose, unintentional swing | Notes landing >25ms off grid after groove + swing stack | Humanize + swing accumulation, beat drift |

### 2.2 · How it's used

- **In the overlay log:** When the diagnostic system detects an anomaly, it labels it with the vocabulary term. "🔴 Clipping: bass track gain 1.34 at beat 47 (Storm, dark_techno)."
- **In QA reports:** Aram uses these terms in qa[NN] feedback. "qa42: boomy in Swell, dark_techno." Claude knows exactly where to look.
- **In the UI:** The glossary is accessible via a `?` button in the debug panel — hover/tap any term to see the technical definition.

### 2.3 · Living document

The glossary lives in code as a `DIAGNOSTIC_VOCAB` object (key → { label, description, technicalHint, freqRange }). New terms can be added as new bug patterns emerge. Claude updates the vocab when a new pattern is identified during a QA cycle.

---

## 3 · Part B — Diagnostic Overlay

### 3.1 · What it is

A toggleable debug panel in the player UI that:
1. Shows real-time audio state (tracks, phase, harmony, voices)
2. Runs anomaly detectors every beat
3. Logs detected anomalies with full reproduction context
4. Provides a copyable log for pasting into QA reports

### 3.2 · Toggle

- Keyboard: `D` key toggles the panel
- The panel appears as a semi-transparent overlay on the right side of the viewport
- Does NOT pause or affect audio — purely observational
- Persists across play/stop cycles within a session

### 3.3 · Panel layout

```
┌─────────────────────────────────────┐
│ 🔧 DIAGNOSTIC          [?] [📋] [×] │
├─────────────────────────────────────┤
│ STATE                                │
│  Phase: Storm   DC: 1.12   Beat: 94 │
│  Key: Dm harmonic_minor              │
│  Chord: iv (Gm7)   next in 2 beats  │
│  Palette: dark_techno   Seed: 8812   │
│  Cycle: active (bridge)              │
│  Voices: 11/16                       │
├─────────────────────────────────────┤
│ TRACKS          gain   target  state │
│  kick           0.72   0.72   ✓     │
│  bass           0.65   0.65   ✓     │
│  snare          0.40   0.40   ✓     │
│  hat            0.30   0.30   ✓     │
│  pad            0.55   0.55   ✓     │
│  arp            0.00   0.00   muted │
│  chord          0.48   0.50   ↑     │
│  melody         0.60   0.60   ✓     │
│  perc           0.25   0.25   ✓     │
│  master         0.87   —      ⚠     │
├─────────────────────────────────────┤
│ ANOMALY LOG (newest first)           │
│  [94] 🔴 Clipping: master 0.87 but  │
│       limiter reducing >6dB         │
│  [71] 🟡 Cluttered: 14/16 voices,   │
│       6 tracks above 0.50           │
│  [52] 🟡 Pumping: bass gain swing   │
│       0.65→0.12 in 1 beat           │
│                                      │
│  [📋 Copy log]                       │
└─────────────────────────────────────┘
```

**[?]** — opens vocabulary glossary popup  
**[📋]** — copies full log to clipboard (formatted for pasting into QA)  
**[×]** — closes panel

### 3.4 · State display (top section)

Reads from existing globals every beat via `conductor:beat` event:

| Field | Source |
|---|---|
| Phase, DC, Beat | `G.phase`, `G.dc`, `G.beatCount` |
| Key + scale | `HarmonyEngine.rootName`, `HarmonyEngine.scaleName` |
| Current chord | `HarmonyEngine.getCurrentChord()` display name |
| Chord countdown | `HarmonyEngine._beatsPerChord - HarmonyEngine._beatsInChord` |
| Palette + Seed | `HarmonyEngine.getPalette().name`, `G.songSeed` |
| Cycle state | `Conductor.getCycleState()` |
| Voice count | `VoicePool.activeCount()` (needs thin accessor — see §5) |

### 3.5 · Track monitor (middle section)

Per-track row showing:
- **gain**: current `_trackGains[track].gain.value` (sampled at beat)
- **target**: what StateMapper last set it to (requires thin bookkeeping — see §5)
- **state**: ✓ normal, `muted` (gain=0 + phase floor says off), `↑`/`↓` (ramping toward target), `⚠` (gain > threshold)

### 3.6 · Anomaly detectors

Each detector runs once per beat (some accumulate state across beats). If triggered, it writes an entry to the log with: beat number, severity (🔴 error / 🟡 warning / 🔵 info), vocab term, details.

All thresholds are configurable in `CFG.DIAGNOSTIC` so we can tune without code changes.

#### Gain & clipping (4 detectors)

| Detector | Vocab term | Trigger condition | Severity |
|---|---|---|---|
| **Clip watch** | Clipping | Any `_trackGains[t].gain.value > 1.0` OR master gain > 0.95 OR limiter `reduction > 6dB` | 🔴 |
| **Gain spike** | Brittle | Any track gain jumps >0.3 in a single beat | 🟡 |
| **Silence drop** | Silence gap | A track that was >0.2 drops to 0 without a phase change or stagger transition | 🟡 |
| **Pump detect** | Pumping | Bass or pad gain oscillates >0.4 range within 4 beats | 🟡 |

#### Frequency / spectral (3 detectors — use FFT via `getAnalyser()`)

These sample the 64-bin FFT once per beat and bucket into ranges.

| Detector | Vocab term | Trigger condition | Severity |
|---|---|---|---|
| **Spectral mud** | Muddy | Average energy in bins 3–7 (≈200–500 Hz) exceeds 2× the energy in bins 8–16 (≈500–1500 Hz) for 4+ consecutive beats | 🟡 |
| **Spectral hole** | Thin | Any frequency band (low/mid/high thirds) drops below 10% of the total energy for 4+ consecutive beats while ≥3 tracks are active | 🟡 |
| **Brightness drift** | Harsh / Dull | Ratio of high-band (bins 20–63) to low-band (bins 0–10) energy deviates >3× from the palette's baseline ratio for 8+ beats. Palette baseline is computed from the first 16 beats after palette swap. | 🔵 |

Implementation note: FFT bin-to-Hz mapping depends on sample rate. At 44100 Hz with fftSize=128: bin width ≈ 345 Hz. Bin indices are approximate — exact mapping calculated at init.

#### Voice pool (3 detectors)

| Detector | Vocab term | Trigger condition | Severity |
|---|---|---|---|
| **Voice flood** | Cluttered | `VoicePool.activeCount() > 14` (87.5% of 16) | 🟡 |
| **Voice steal storm** | Poppy | Voices stolen (oldest killed to make room) more than 4× in a single beat | 🔴 |
| **Voice leak** | Cluttered | Active voice count increases for 8+ consecutive beats without any beat having a decrease — suggests note-offs are failing | 🟡 |

Requires: `VoicePool.activeCount()` accessor + `VoicePool.stealCount` counter that resets each beat.

#### Musical coherence (5 detectors)

| Detector | Vocab term | Trigger condition | Severity |
|---|---|---|---|
| **Chord-melody clash** | Dissonant | Melody note is not in the current chord tones AND not a scale tone AND sustains for >1 beat (passing tones exempt) | 🟡 |
| **Register collision** | Muddy | Bass voice and melody voice are within 1 octave of each other (MIDI note difference <12) for 4+ consecutive beats | 🟡 |
| **Harmonic stall** | Monotone (chord) | Same chord held for >12 beats (3× normal harmonic rhythm) | 🔵 |
| **Progression loop** | Monotone (progression) | The same chord sequence (3+ chords) repeats identically more than 2 full cycles without modulation or variation | 🔵 |
| **Modulation whiplash** | Jarring | Key change where new root is >5 semitones from old root AND no shared chord between old and new key appeared in the 4 beats before the change | 🟡 |

Requires: `MelodyEngine` to expose last played MIDI note (thin accessor), `HarmonyEngine` chord history (last 16 chords ring buffer).

#### Envelope & synthesis (3 detectors)

| Detector | Vocab term | Trigger condition | Severity |
|---|---|---|---|
| **Attack pop** | Poppy | A note-on event fires within 20ms of a note-off on the same track (the exact legato chain break from #39) | 🟡 |
| **Release collision** | Washy | Two voices on the same track have overlapping release tails (voice B starts while voice A release is >50% of peak gain) | 🔵 |
| **Low-end stack** | Boomy | Bass + kick + pad all above 0.5 gain simultaneously in Swell or earlier phase | 🟡 |

Attack pop and release collision require note-event timestamps. Implementation: `diagnostic.js` registers a lightweight listener on note-on/note-off events (see §5 hooks).

#### Phase & transition (4 detectors)

| Detector | Vocab term | Trigger condition | Severity |
|---|---|---|---|
| **Stagger stall** | Silence gap | A stagger group hasn't fired within 2× its expected beat delay after phase change | 🟡 |
| **Phase regression** | Jarring | DC drops enough to enter a lower phase outside of intentional cycle decay or user-forced phase change | 🟡 |
| **Density mismatch** | Thin / Cluttered | Number of tracks with gain >0.1 doesn't match the phase floor expectation (±1 tolerance) for 8+ beats | 🔵 |
| **Flat dynamics** | Flat | DC hasn't changed >0.05 in 16 beats (outside Maelstrom sustain or intentional plateau) | 🔵 |

#### Rhythm (3 detectors)

| Detector | Vocab term | Trigger condition | Severity |
|---|---|---|---|
| **Beat drift** | Sloppy | A scheduled note lands >25ms off its quantized grid position (after groove humanize + swing are applied — detects when they stack too aggressively) | 🟡 |
| **Density spike** | Cluttered (rhythm) | More than 6 note-on events in a single 16th-note subdivision across all tracks | 🟡 |
| **Groove collapse** | Flat (rhythm) | Swing and syncopation values are both active but net timing offset is <5ms for 80%+ of notes in an 8-beat window — they're canceling each other out | 🔵 |

Requires: note scheduling timestamps from the sequencer beat clock. Implementation: `diagnostic.js` hooks into the `conductor:beat` detail and cross-references with `GrooveEngine` state.

---

**Total: 25 detectors** across 7 categories. Each is independently toggleable in `CFG.DIAGNOSTIC.enabled[detectorName]` so we can disable noisy ones during tuning.

### 3.7 · Anomaly log

- Max 50 entries (FIFO ring buffer)
- Each entry: `{ beat, severity, vocabTerm, message, context: { phase, palette, seed, dc, trackGains } }`
- **Copy log** button formats entries as:
  ```
  [Beat 94] 🔴 Clipping: master gain 0.87 with limiter reducing >6dB
    Phase: Storm | DC: 1.12 | Palette: dark_techno | Seed: 8812
  [Beat 71] 🟡 Cluttered: 14/16 voices, 6 tracks above 0.50
    Phase: Storm | DC: 1.05 | Palette: dark_techno | Seed: 8812
  ```
- This format pastes directly into a GitHub comment or Cowork message — zero reformatting needed.

### 3.8 · Visual alerts

When a 🔴 anomaly fires:
- The panel header briefly flashes red (200ms)
- If the panel is closed, a small red dot badge appears on the `D` key hint in the status bar
- No audio interruption, no modal

---

## 4 · Integration points

### 4.1 · New code (diagnostic module)

A new `src/diagnostic.js` module containing:
- `DIAGNOSTIC_VOCAB` — the vocabulary object (17 terms)
- `DiagnosticPanel` — DOM construction + update loop
- `AnomalyDetector` — per-beat detector runner (25 detectors, 7 categories)
- `DiagnosticLog` — ring buffer + clipboard formatter
- `NoteEventBus` — lightweight pub/sub for note-on/note-off timestamps (used by envelope and rhythm detectors)

### 4.2 · Thin hooks into existing modules

Minimal additions to existing files (no refactors, no behavioral changes):

| Module | Change | Purpose |
|---|---|---|
| `voice_pool.js` | `VoicePool.activeCount()` — returns `_pool.filter(v => v.active).length` | Voice count display + flood/leak detection |
| `voice_pool.js` | `VoicePool.stealCount` — counter incremented on voice steal, reset each beat by diagnostic | Voice steal storm detection |
| `state_mapper.js` | `StateMapper._lastTargetGains[track] = value` after each gain ramp | Target vs. actual comparison |
| `state_mapper.js` | `StateMapper._lastStaggerFire = { group, beat }` after each stagger group fires | Stagger stall detection |
| `audio.js` | `getLimiterReduction()` — returns `_limiter.reduction` | Clip detection |
| `harmony.js` | `HarmonyEngine._chordHistory[]` — push current chord on each change, 16-entry ring buffer | Harmonic stall + progression loop detection |
| `harmony.js` | `HarmonyEngine._lastModulation = { fromRoot, toRoot, beat }` — set on each modulation | Modulation whiplash detection |
| `melody.js` | `MelodyEngine._lastPlayedMidi` — store MIDI note number on each note-on | Chord-melody clash + register collision |
| `melody.js` | `MelodyEngine._noteEventCallback` — optional callback `(type, midi, time, track)` called on note-on/note-off | Attack pop, release collision, beat drift, density spike |
| `sequencer.js` | Same `_noteEventCallback` pattern on drum/bass/chord note-on events | Rhythm detector coverage across all tracks |
| `groove.js` | `GrooveEngine.getLastOffsets()` — returns array of recent timing offsets applied | Groove collapse + beat drift detection |
| `shell.html` | `<div id="diagnosticRoot"></div>` container + `D` key handler | Panel mount point |
| `build.js` | Add `diagnostic.js` to concatenation list | Include in build |

### 4.3 · Hook design principle

All hooks follow the same pattern: **store a value that already exists at the call site into a module-scope variable**. No new computation, no new branching, no conditionals. The diagnostic module reads these values on its own schedule (per-beat). If diagnostic.js is not loaded, the stored values are never read — zero cost.

The `_noteEventCallback` is the one active hook: a function pointer that defaults to `null`. When diagnostic.js initializes, it sets the callback. Each note-on/note-off site calls `if (_noteEventCallback) _noteEventCallback(type, midi, time, track)`. Cost when diagnostic is off: one null check per note. Cost when on: one function call per note (~50–200/beat at peak).

### 4.4 · What this does NOT touch

- No changes to audio synthesis logic, scheduling, or signal routing
- No changes to harmony, melody, groove, or conductor decision-making
- No new npm dependencies
- Per-beat sampling for most detectors (~2–4 Hz) — negligible CPU
- Note event callback is the only per-note hook — still lightweight

---

## 5 · Thin accessors (full list)

All additions to existing modules. Each is a one-liner or near-one-liner.

```javascript
// ── voice_pool.js ──
VoicePool.activeCount = function() {
  return _pool.filter(v => v.active).length;
};
VoicePool.stealCount = 0;
// In existing steal path: VoicePool.stealCount++;

// ── audio.js ──
function getLimiterReduction() {
  return _limiter ? _limiter.reduction : 0;
}

// ── state_mapper.js ──
StateMapper._lastTargetGains = {};
// After each gain ramp: StateMapper._lastTargetGains[trackName] = targetValue;
StateMapper._lastStaggerFire = null;
// After each stagger group fire: StateMapper._lastStaggerFire = { group, beat: G.beatCount };

// ── harmony.js ──
HarmonyEngine._chordHistory = [];  // 16-entry ring buffer
// On chord change: _chordHistory.push(chord); if (_chordHistory.length > 16) _chordHistory.shift();
HarmonyEngine._lastModulation = null;
// On modulation: _lastModulation = { fromRoot, toRoot, beat: G.beatCount };

// ── melody.js ──
MelodyEngine._lastPlayedMidi = null;
// On note play: _lastPlayedMidi = midiNote;
var _noteEventCallback = null;  // set by diagnostic.js
// On note-on: if (_noteEventCallback) _noteEventCallback('on', midi, time, 'melody');
// On note-off: if (_noteEventCallback) _noteEventCallback('off', midi, time, 'melody');

// ── sequencer.js ──
// Same _noteEventCallback pattern on drum/bass/chord note events
// if (_noteEventCallback) _noteEventCallback('on', midi, time, trackName);

// ── groove.js ──
GrooveEngine._recentOffsets = [];  // last 16 timing offsets
// After applying offset: _recentOffsets.push(offset); if (>16) shift();
GrooveEngine.getLastOffsets = function() { return this._recentOffsets; };
```

---

## 6 · Styling

- Matches existing cyberpunk theme: `#0a0a0f` bg, `#00ffcc` highlights, monospace
- Semi-transparent (`rgba(10,10,15,0.92)`) so visualizer partially visible behind
- Fixed position, right side, 350px wide, full height, scrollable log section
- Severity colors: 🔴 `#ff3366`, 🟡 `#ffcc00`, 🔵 `#00aaff`
- Glossary popup: same style, overlays the panel area

---

## 7 · Build issues

Three issues, two sessions. Split rationale: the hooks + panel + gain detectors are testable alone (session 1). The musical/spectral/rhythm detectors need the panel working first to verify output (session 2 = QA gate).

**#42 — Diagnostic foundation: vocab + panel + gain/voice detectors + hooks (Opus)**
- New `diagnostic.js` module: `DIAGNOSTIC_VOCAB` (17 terms), `DiagnosticPanel`, `DiagnosticLog`, `NoteEventBus`
- Thin accessors in voice_pool, audio, state_mapper (gain-related hooks only)
- Shell integration: DOM container, D-key toggle, build inclusion
- Detectors: Clip watch, Gain spike, Silence drop, Pump detect, Voice flood, Voice steal storm, Voice leak, Low-end stack, Flat dynamics (9 detectors — all gain/state based, no FFT or note-event hooks needed)
- Copy-to-clipboard log formatting
- Glossary popup with all 17 vocab terms
- `CFG.DIAGNOSTIC` threshold config

**#43 — Diagnostic expansion: spectral + musical + rhythm + envelope detectors (Opus)**
- Depends on #42 (needs working panel + log infrastructure)
- Thin hooks in harmony, melody, sequencer, groove (note-event callback, chord history, modulation tracking, groove offsets)
- Detectors: Spectral mud, Spectral hole, Brightness drift, Chord-melody clash, Register collision, Harmonic stall, Progression loop, Modulation whiplash, Attack pop, Release collision, Stagger stall, Phase regression, Density mismatch, Beat drift, Density spike, Groove collapse (16 detectors — FFT + note-event + musical state)

**#44 — (future, ongoing) — Diagnostic tuning pass**
- After real QA usage: adjust thresholds, add new detectors for patterns that emerge, extend vocabulary
- Not a single build — recurring maintenance

---

## 8 · QA plan

### How to test

1. Press `D` — panel appears on right side, shows live state
2. Play any palette — track gains update per beat, phase/chord/key display matches status bar
3. Force to Maelstrom quickly — should trigger Cluttered and/or Clipping warnings in Storm+
4. Check voice count tracks with audible density
5. Press `📋` — clipboard contains formatted log
6. Paste into a text editor — verify it's readable and contains context
7. Press `?` — glossary popup shows all vocab terms with definitions
8. Close panel (`D` or `×`) — red dot badge appears if any 🔴 events occurred while closed
9. Performance: no audible glitches, no visible frame drops with panel open

### What "pass" looks like

- Panel shows accurate real-time state matching the existing status bar
- At least 2-3 anomaly types trigger naturally during a Pulse→Maelstrom run
- Copied log is paste-ready for GitHub/Cowork with zero editing
- No audio or visual performance regression
