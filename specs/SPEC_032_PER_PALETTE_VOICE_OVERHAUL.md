# SPEC_032 — Per-Palette Voice Overhaul: Melody Synth + Chord Articulation

**Issue:** #32 — Per-palette voice overhaul
**Model:** Opus (judgment — synth architecture, per-palette timbre design, articulation behavior)
**Status:** Draft
**Depends on:** #31 (melody muted) — melody is currently silenced, this spec rebuilds it

---

## 1 · Problem

The melody engine was muted (#31) because it has a single-synth-fits-all architecture. Every palette plays melody through the same synthesis chain: one oscillator → one LPF → one gain envelope. The only per-palette variation is the wavetable timbre and a handful of optional overrides (`attack`, `release`, `vibratoDepth`, `lpfCutoff`). The result:

1. **Melody sounds genre-wrong.** A noir_jazz melody needs legato phrasing with pitch bends between notes and a warm, breath-like attack. A chiptune melody needs hard-edged instant attacks with duty-cycle PWM. A dark_techno melody should be a filtered, acid-style sequence, not a singer. Currently they all sound like the same sine-ish lead played through different wavetables.

2. **No chord articulation.** The PadTrack is a sustained wash that re-voices on chord changes. There is no rhythmic chord component — no stabs, no comps, no rhythmic chording. In genres like synthwave (power chord stabs), chiptune (arpeggiated triads), noir_jazz (comp voicings with ghosted hits), and breakbeat (stab-and-release chords), the absence of rhythmic chords creates a huge hole in the arrangement at Swell through Storm.

3. **voiceConfig is a VoicePool relic.** `palette.voiceConfig` feeds VoicePool, which is an event-triggered SFX system from DemoShooter — it plays notes on spawn/death events that no longer exist in HarmonyEngine. It's not connected to any melodic function. The melody engine reads `palette.melody` and `palette.melodyRhythm` instead.

---

## 2 · Mental model

Think of this as two parallel overhauls sharing one spec because they serve the same musical goal: **making each palette's upper register sound like its genre.**

**Melody synth overhaul** = the lead instrument gets a per-palette synthesis chain (not just timbre, but envelope shape, modulation, articulation style).

**Chord articulation** = a new rhythmic chord track that sits between the sustained PadTrack (wash) and the melody (lead line), providing the rhythmic harmonic layer that most genres need.

Together, these two systems give each palette a complete "band": drums + bass (already personalized in SPEC_028) + rhythmic chords (new) + lead melody (rebuilt) + pad wash (existing).

### Architecture after overhaul

```
Drums    ─── [per-palette patterns, fills, groove]     ← existing
Bass     ─── [per-palette tierCap, gainScalar, filter]  ← SPEC_028
ChordTrack ── [NEW: per-palette stab/comp/arp patterns] ← this spec
PadTrack ─── [sustained wash, 3-osc unison]             ← existing, unchanged
Melody   ─── [rebuilt: per-palette synth chain]          ← this spec
VoicePool ── [event SFX — unchanged, legacy]             ← existing
```

---

## 3 · Melody synth overhaul

### 3.1 The problem with the current single-chain approach

The current `_playMelodyNote()` builds:
```
osc(wavetable) → LPF(3kHz) → gain(ADSR) → trackGain
```

Per-palette overrides (`palette.melody`) only adjust 5 scalar values: attack, release, vibratoDepth, vibratoRate, lpfCutoff. This is insufficient for genre identity because:

- **No per-palette envelope shape.** Jazz needs slow attack + long sustain. Chiptune needs zero attack + hard cutoff. Industrial needs percussive click + fast decay. These aren't scalar variations of the same shape — they're fundamentally different envelope types.
- **No modulation options beyond vibrato.** Acid techno needs filter sweep (LPF cutoff modulated by an LFO or envelope). Synthwave needs pitch drift. Glitch needs random pitch detune per note. Vaporwave needs detuned chorusing.
- **No articulation modes.** Legato (pitch slide between notes) for jazz. Staccato (hard note separation) for chiptune. Portamento (smooth glide) for synthwave leads. Currently all notes are independent — no inter-note behavior.

### 3.2 New `palette.melody` schema

Replace the current optional overrides with a full synthesis profile. Backward-compatible: any field omitted falls back to current defaults.

```js
melody: {
  // === Envelope ===
  attack: 0.02,          // seconds — attack ramp
  hold: 0,               // seconds — hold at peak before decay (0 = straight to sustain)
  decay: 0.1,            // seconds — decay to sustain level
  sustainLevel: 0.8,     // 0–1 — sustain as fraction of peak (1.0 = no decay)
  release: 0.1,          // seconds — release after note-off

  // === Filter ===
  lpfCutoff: 3000,       // Hz — static LPF cutoff
  lpfEnvAmount: 0,       // Hz — additive: filter opens by this much on attack, decays back
  lpfEnvDecay: 0.1,      // seconds — how fast the filter envelope closes
  lpfResonance: 0.7,     // Q value for LPF

  // === Modulation ===
  vibratoDepth: 0,       // cents
  vibratoRate: 5,        // Hz
  vibratoDelay: 0,       // seconds — vibrato fades in after this delay
  detuneSpread: 0,       // cents — random per-note detune (±spread)
  pwmRate: 0,            // Hz — pulse-width modulation rate (chiptune only; 0 = off)
  pwmDepth: 0,           // 0–1 — PWM modulation depth

  // === Articulation ===
  legato: false,         // if true, pitch-slides between consecutive notes
  legatoTime: 0.06,     // seconds — glide time for legato
  staccato: false,       // if true, hard note-off at 60% of note duration

  // === Gain ===
  gainScalar: 1.0,       // multiplier on CFG.GAIN.melody (same pattern as bass SPEC_028)

  // === Phase-aware override ===
  phaseGain: {           // optional per-phase gain multiplier (null = use _PHASE_DENSITY)
    pulse: null,
    swell: null,
    surge: null,
    storm: null,
    maelstrom: null,
  },
}
```

### 3.3 Per-palette melody profiles

| Palette | Key character | Envelope style | Filter | Modulation | Articulation |
|---|---|---|---|---|---|
| **dark_techno** | Acid sequence | Fast attack, short decay, low sustain | Heavy LPF env sweep (±800 Hz, fast decay) | No vibrato | Staccato |
| **synthwave** | Anthem lead | Med attack, full sustain | Gentle sweep (±400 Hz) | Slow vibrato (3 Hz, 6 cents, 0.3s delay) | Legato (80ms glide) |
| **glitch** | Digital stutter | Instant attack, no sustain | Bright, static (5 kHz) | Random detune ±30 cents per note | Staccato |
| **ambient_dread** | Eerie drift | Slow attack (150ms), long release (500ms) | Dark (1.2 kHz), no sweep | Slow vibrato (3.5 Hz, 8 cents) | Legato (120ms) |
| **lo_fi_chill** | Rhodes-like | Med attack (40ms), med sustain | Warm (2 kHz), gentle sweep (±200 Hz) | Subtle vibrato (4 Hz, 3 cents, 0.2s delay) | Neither (natural decay) |
| **chiptune** | NES lead | Instant (5ms), hard cutoff | Bright (6 kHz), no sweep | PWM (4 Hz, depth 0.3) | Staccato |
| **noir_jazz** | Muted trumpet | Slow attack (120ms), full sustain | Dark (2 kHz), gentle sweep | Expressive vibrato (4.5 Hz, 6 cents, delayed) | Legato (60ms) |
| **industrial** | Metallic stab | Instant, percussive (click transient) | Mid (4 kHz), sharp sweep (±1200 Hz, fast) | No vibrato | Staccato |
| **vaporwave** | Detuned FM | Slow (80ms), long sustain | Dark (1.8 kHz), no sweep | Detune spread ±15 cents | Legato (100ms) |
| **breakbeat** | Hoover stab | Fast (10ms), med decay | Mid (3.5 kHz), med sweep (±600 Hz) | Subtle vibrato (5 Hz, 3 cents) | Neither |

### 3.4 Implementation: rebuilt `_playMelodyNote()`

The current function is ~100 lines. The rebuilt version needs:

1. **AHDSR envelope** (not just AD): `attack → hold → decay → sustainLevel → release`
2. **Filter envelope**: LPF starts at `lpfCutoff + lpfEnvAmount`, decays to `lpfCutoff` over `lpfEnvDecay` seconds
3. **Legato handling**: if `legato: true` and there's an active note, pitch-slide the existing oscillator to the new frequency instead of creating a new one. This requires keeping a reference to the "live" oscillator between calls.
4. **Staccato handling**: if `staccato: true`, force note-off at 60% of the nominal duration
5. **Per-note detune**: if `detuneSpread > 0`, add random `osc.detune.value = ±spread`
6. **Vibrato delay**: vibrato LFO gain starts at 0, ramps to `vibratoDepth` over `vibratoDelay` seconds
7. **PWM** (chiptune only): second oscillator at same frequency, phase-offset modulated by a low-frequency oscillator — creates the classic duty-cycle sweep

**Legato architecture change:** The current `_playMelodyNote` creates and destroys an oscillator per note. For legato, we need a persistent oscillator that survives between notes. New approach:

```
MelodyEngine._liveOsc = null      // persistent oscillator (legato mode)
MelodyEngine._liveGain = null     // persistent gain node
MelodyEngine._liveFilter = null   // persistent filter
```

- Non-legato palettes: same as current (create/destroy per note)
- Legato palettes: on first note, create osc+filter+gain and keep them alive. On subsequent notes, `osc.frequency.exponentialRampToValueAtTime(newFreq, time + legatoTime)`. On rest/phrase-end, trigger release envelope and null the refs.

### 3.5 Gain scalar and phase gain

Same pattern as bass (SPEC_028):
- `gainScalar` multiplies `CFG.GAIN.melody` at synthesis time
- `phaseGain` overrides the `_PHASE_DENSITY[phase].gain` value when non-null

This lets us independently control "how loud is chiptune melody relative to other palettes" (gainScalar) and "how loud is melody at Storm vs Swell for this palette" (phaseGain).

### 3.6 Unmuting melody

Once the new synth chain is built and per-palette profiles are in place, restore `_PHASE_DENSITY` to its original values (currently preserved in comments at melody.js lines 30–33). The mute (#31) is reversed as part of this build.

---

## 4 · Chord articulation: ChordTrack

### 4.1 What it is

A new track object (like PadTrack, WalkingBass) that plays **rhythmic chord voicings** — stabs, comps, arpeggiated triads, ghost hits. It reads from HarmonyEngine's current chord, voices it according to a per-palette rhythm pattern, and routes through a dedicated `_trackGains.chord` bus (new).

### 4.2 Why it's separate from PadTrack

PadTrack is a sustained wash — long attack, long release, re-voices only on chord changes. ChordTrack is rhythmic — short notes, pattern-driven, re-triggers within a single chord. Merging them would break PadTrack's simplicity and create envelope conflicts.

### 4.3 New `palette.chord` schema

```js
chord: {
  // === Articulation style ===
  style: 'stab',        // 'stab' | 'comp' | 'arp' | 'none'
  //   stab:  full chord hit, short decay (synthwave, breakbeat)
  //   comp:  voiced chord with ghost notes + accents (noir_jazz, lo_fi)
  //   arp:   arpeggiated chord tones one at a time (chiptune, glitch)
  //   none:  no rhythmic chords (ambient_dread, vaporwave — pad alone)

  // === Rhythm ===
  pattern: 'offbeat_stab',  // pattern name (from ChordTrack pattern library)
  //   offbeat_stab:   hits on beats 2+4 (synthwave power chords)
  //   four_stab:      hits on every beat (dark_techno)
  //   synco_comp:     jazz comp: 1-and, 2, and-of-3, 4 (noir_jazz)
  //   arp_up:         ascending arp through chord tones (chiptune)
  //   arp_updown:     up then down (chiptune at Storm+)
  //   euclidean_3_8:  euclidean pattern (breakbeat)
  //   ghost_comp:     mostly ghosted, random accent (lo_fi)
  //   stutter_8th:    rapid 8th-note stabs (industrial)

  // === Voice count ===
  voices: 3,             // how many chord tones to play simultaneously
  //   stab/comp: all voices hit together
  //   arp: voices play sequentially

  // === Envelope ===
  attack: 0.01,          // seconds
  decay: 0.15,           // seconds — stab decay
  sustainLevel: 0,       // 0 = pure stab (no sustain); >0 = held chord
  release: 0.05,

  // === Octave ===
  octave: 4,             // chord register (typically 4 — between bass@2 and melody@5)

  // === Filter ===
  lpfCutoff: 2000,       // Hz
  lpfResonance: 1.0,     // Q

  // === Gain ===
  gainScalar: 1.0,       // multiplier on CFG.GAIN.chord (new constant)

  // === Phase entry ===
  entryPhase: 'swell',   // earliest phase this track activates
}
```

### 4.4 Per-palette chord profiles

| Palette | Style | Pattern | Voices | Character |
|---|---|---|---|---|
| **dark_techno** | stab | four_stab | 2 | Tight minor stabs every beat, filtered dark. Techno chord stab. |
| **synthwave** | stab | offbeat_stab | 3 | Power chord stabs on 2+4. Bright, wide, detuned. The 80s hit. |
| **glitch** | arp | arp_up | 3 | Rapid ascending arps through chord tones. Chaotic, irregular. |
| **ambient_dread** | none | — | — | No rhythmic chords. Pad wash carries harmony alone. |
| **lo_fi_chill** | comp | ghost_comp | 3 | Ghosted Rhodes-style comps, occasional accent. Chill, behind-the-beat. |
| **chiptune** | arp | arp_updown | 3 | Classic NES arpeggio cycling through triad. Fast (16th notes). |
| **noir_jazz** | comp | synco_comp | 4 | Jazz voicings with extensions. Ghosted hits, swung, sparse. |
| **industrial** | stab | stutter_8th | 2 | Aggressive 8th-note stabs, distorted. Power chord or fifth. |
| **vaporwave** | none | — | — | No rhythmic chords. Dreamy pad does the work. |
| **breakbeat** | stab | euclidean_3_8 | 3 | Euclidean-distributed stabs, tight and punchy. Jungle chord hits. |

### 4.5 ChordTrack object structure

```js
var ChordTrack = {
  _active: false,
  _muted: true,
  _palette: null,        // palette.chord config
  _paletteName: null,
  _pattern: [],          // 16-step pattern (like drum patterns)
  _step: 0,              // current step (0–15, advances per 16th note)
  _lpf: null,            // shared lowpass

  initRun: function(palette) { ... },
  tick: function(beatTime) { ... },
  _playStab: function(time, tones, vel) { ... },
  _playArpNote: function(time, tone, vel) { ... },
  shutdown: function() { ... },
};
```

**Tick timing:** ChordTrack needs 16th-note resolution (like drums), not beat resolution (like PadTrack). It should be called from the sequencer's main step loop, not the beat-level tick.

### 4.6 New gain bus: `_trackGains.chord`

Add a new track gain channel in `audio.js initAudio()`, routed through the existing submix chain. This gives StateMapper independent volume control over rhythmic chords vs pad wash.

### 4.7 StateMapper integration

- **Floor:** ChordTrack activates at `entryPhase` (per-palette, typically Swell)
- **Track gain ramp:** Similar to pad — 0.3 at Swell, 0.7 at Surge, 0.9 at Storm, 0.95 at Maelstrom
- **Stagger group:** Part of the `harmony` group (same as bass, chord changes) — enters when harmony stagger fires

---

## 5 · Interaction with existing systems

### 5.1 PadTrack — unchanged

PadTrack remains the sustained wash. ChordTrack is additive on top. No changes to PadTrack needed. At phases where `chord.style === 'none'`, PadTrack alone carries harmony (as it does now for all palettes).

### 5.2 WalkingBass — no conflict

Bass operates in octave 2, ChordTrack in octave 4, melody in octave 5. No frequency collision. The chord stabs will sit in the "mid" register between bass and lead.

### 5.3 Stagger (SPEC_010)

ChordTrack joins the harmony stagger group. When stagger fires harmony, bass + chords enter together. This is correct: in a real arrangement, the rhythm section (bass + chords) comes in as a unit.

### 5.4 Cycle mode (SPEC_008)

During palette swap, `ChordTrack.initRun(newPalette)` loads the new chord profile. Same pattern as all other track objects.

### 5.5 Tension curve (SPEC_011)

Tension events push DC up/down, which affects intensity, which affects track gains. ChordTrack's bus gain will respond to intensity like all other tracks. No special handling needed.

### 5.6 VoicePool

VoicePool continues to work as-is — it's an event SFX system, not a melodic voice. `palette.voiceConfig` stays in place for VoicePool. No changes.

### 5.7 Melody _PHASE_DENSITY unmute

The muted `_PHASE_DENSITY` values (melody.js lines 30–33) are restored to their original values as part of the melody synth rebuild. The `_playMelodyNote` rebuild must be complete before unmuting — partial unmuting would play melody through the old broken chain.

---

## 6 · New constants

### 6.1 CFG.GAIN.chord

```js
CFG.GAIN.chord = 0.10;  // base gain for chord stabs (between pad=0.05 and melody=0.07)
```

### 6.2 CFG.GAIN.melody remains at 0.07

No change needed — per-palette `gainScalar` handles palette-specific volume.

---

## 7 · Build issues

This is a large overhaul touching melody.js (major rewrite), sequencer.js (new ChordTrack), harmony.js (×10 palette profiles), audio.js (new gain bus), state_mapper.js (ChordTrack integration), config.js (new constant).

**Split into 3 build sessions** — there's a QA gate between melody and chords, and the scope exceeds single-session budget (~60+ edits total).

### Issue #33: Melody synth rebuild — per-palette synthesis chain (Opus)

**Scope:** melody.js rewrite of `_playMelodyNote()` + legato system + new `palette.melody` profiles in harmony.js (×10 palettes) + unmute `_PHASE_DENSITY`.

~30 edits. melody.js is the primary file, harmony.js gets 10 palette profile additions/updates.

**QA gate:** Aram needs to hear each palette's melody before ChordTrack is built. Melody is the harder judgment call — chord stabs are more mechanical.

### Issue #34: ChordTrack — rhythmic chord articulation engine (Opus)

**Scope:** New `ChordTrack` object in sequencer.js + 8 chord patterns + `palette.chord` profiles in harmony.js (×10 palettes) + `_trackGains.chord` in audio.js + `CFG.GAIN.chord` in config.js + StateMapper integration.

~35 edits. Depends on #33 passing QA (we need melody audible to judge how chords blend with it).

### Issue #35: ChordTrack stagger + phase tuning (Sonnet)

**Scope:** Wire ChordTrack into stagger harmony group in state_mapper.js + tune phase entry/gain curves per palette. Mechanical — follows patterns established by SPEC_010 and SPEC_028.

~10 edits. Depends on #34.

---

## 8 · Acceptance criteria

### Melody (#33)
1. **Each palette's melody sounds genre-appropriate** at Storm/Maelstrom — not just different timbres, but different *behavior* (envelope, modulation, articulation)
2. **Noir_jazz melody has audible legato** — notes slide into each other, not separate staccato hits
3. **Chiptune melody has PWM character** — the duty-cycle wobble is audible
4. **Dark_techno melody has acid-style filter sweep** — each note opens bright and closes
5. **Ambient_dread melody drifts in slowly** — 150ms+ attack, long tails, eerie vibrato
6. **No regression:** Markov phrase generation, chord-tone revalidation, groove inheritance, grace notes all work exactly as before
7. **`_PHASE_DENSITY` unmuted** — melody audible at Swell+ again
8. `npm run gate` passes

### ChordTrack (#34)
1. **Synthwave has audible power chord stabs on 2+4** — not just pad wash
2. **Chiptune has rapid arpeggiated chords** — classic NES triad cycling
3. **Noir_jazz has ghosted jazz comps** — syncopated, sparse, swung
4. **Ambient_dread and vaporwave have NO chord stabs** — pad wash only
5. **ChordTrack volume responds to intensity** — quiet at Swell, full at Storm
6. **No frequency collision with bass or melody** — chords sit clearly in octave 4
7. `npm run gate` passes

### Stagger integration (#35)
1. **ChordTrack enters with harmony stagger group** — not before bass
2. **Phase entry respects per-palette `entryPhase`** — no chords at Pulse
3. `npm run gate` passes

---

## 9 · QA brief (for build sessions)

### Melody rebuild (#33)

**What changed:** The melody instrument now sounds different per genre — not just different notes, but a completely different synthesizer per palette. Jazz melody slides between notes like a trumpet player. Chiptune melody has the classic NES wobble. Techno melody does the acid filter sweep (wah-wah on each note). Ambient melody fades in like a ghost.

**How to test:**
1. Play noir_jazz, let it reach Swell. Listen for melody — notes should glide into each other smoothly, not separate plinks.
2. Play chiptune to Swell. Melody should sound crisp, instant, with a subtle wobble in the tone.
3. Play dark_techno to Storm. Melody should have a "wah" filter on each note — bright attack that darkens quickly.
4. Play ambient_dread to Swell. Melody should fade in very slowly per note — ghostly, not percussive.
5. A/B any two palettes at Storm — the melodies should sound like different instruments, not the same synth with different notes.

**Risks:** Legato timing is judgment-sensitive. If the glide feels too fast or too slow for noir_jazz, that's a single number tweak (`legatoTime`). The architecture is right even if individual values need tuning.

### Chord stabs (#34)

**What changed:** A new rhythmic chord layer sits between the bass and melody. In genres that need it, you'll hear punchy chord hits on the beat (or off-beat, or arpeggiated) — filling the arrangement gap that used to be just pad wash.

**How to test:**
1. Play synthwave to Swell. You should hear chord stabs on beats 2 and 4 — like an 80s power chord hit.
2. Play chiptune to Swell. You should hear rapid triad arpeggios cycling through the chord — the classic NES sound.
3. Play ambient_dread at any phase. You should NOT hear any chord stabs — just the smooth pad wash.
4. Play noir_jazz to Storm. You should hear ghosted chord hits — quiet, syncopated, behind-the-beat.

**Risks:** Mix balance between ChordTrack and PadTrack is the main tuning challenge. If stabs are too loud they'll mask the pad's warmth; too quiet and they disappear. `gainScalar` per palette is the tuning knob.

---

## 10 · Summary

- **5 new fields** in `palette.melody` (envelope, filter env, modulation, articulation, gain)
- **1 new palette section**: `palette.chord` (×10 palettes)
- **1 new track object**: `ChordTrack` in sequencer.js
- **1 new gain bus**: `_trackGains.chord` in audio.js
- **1 new constant**: `CFG.GAIN.chord` in config.js
- **1 major rewrite**: `_playMelodyNote()` in melody.js (legato + AHDSR + filter env + modulation)
- **1 unmute**: `_PHASE_DENSITY` restored to original values
- **3 build issues**: #33 melody synth (Opus), #34 ChordTrack (Opus), #35 stagger wiring (Sonnet)
