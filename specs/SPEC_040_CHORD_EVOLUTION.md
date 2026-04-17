# SPEC_040 — Chord Evolution: Voicing Intelligence, Harmonic Rhythm, Extension Ramp, Collision Avoidance

**Issue:** #40 — Chord evolution plan
**Model:** Opus (judgment — voicing architecture, per-palette harmonic design, psychoacoustic register rules)
**Status:** Draft
**Depends on:** #35 (ChordTrack stagger + phase tuning — qa-pass), #34 (ChordTrack built), #33 (melody synth rebuilt)
**Research source:** AUDIT_MELODY_CHORDS_RESEARCH.md Part 2 + Part 6 items 9–12

---

## 1 · Problem

ChordTrack (SPEC_032 #34) plays rhythmic chord voicings — stabs, comps, arps — but treats every chord as a fixed triad at a fixed octave. HarmonyEngine's `_getVoicingIntervals()` adds 7ths at Surge and 9ths at Storm for PadTrack, but ChordTrack bypasses this entirely — it calls `getChordTones(octave)`, which always returns raw triads. Four gaps:

1. **No voicing intelligence.** A noir_jazz chord stab plays the same root-position triad as a dark_techno stab. In reality: jazz uses close-voiced drop-2 with extensions, techno uses bare root+5th power shapes, synthwave uses open spread voicings. The chord *symbol* is the same — the *realization* should be completely different.

2. **Fixed harmonic rhythm.** `_beatsPerChord` is hardcoded to 4 beats (one bar). dark_techno should sustain a single chord for 8 bars at Pulse but change every bar at Maelstrom. noir_jazz should change every 2 beats at Pulse and every half-beat at Maelstrom. Harmonic rhythm is one of the strongest genre-defining parameters and it's currently flat.

3. **No phase-driven extension ramp.** The `voicing` config has `allow9th` and `allowSus` flags, but these are binary and don't progress with phase. Swell should be triads-only for every palette. Storm should unlock 7ths for palettes that support them. Maelstrom should unlock full extensions (9ths, 11ths, 13ths) for jazz/lo-fi. Currently extensions either exist always or never.

4. **No chord-melody collision avoidance.** ChordTrack and MelodyEngine are independent — they can double the same pitch class at the same octave on the same beat, creating phase cancellation or unpleasant unison beating. No register awareness exists: a dense 4-note chord in octave 3 would sound muddy (critical band masking).

---

## 2 · Mental model

Think of this as upgrading ChordTrack from "pattern player" to "chord realizer." Currently the pipeline is:

```
HarmonyEngine._currentChord → getChordTones(oct) → [triad MIDI] → ChordTrack plays them
```

After this spec:

```
HarmonyEngine._currentChord → VoicingEngine(chord, palette, phase, melodyNote) → [voiced MIDI] → ChordTrack plays them
```

The VoicingEngine is a new module-scope object that sits between HarmonyEngine's chord symbols and ChordTrack/PadTrack's synthesis. It takes a chord symbol and returns the specific MIDI notes to play, accounting for: palette voicing style, phase-driven extensions, voice leading from previous chord, register constraints, and melody collision avoidance.

Harmonic rhythm becomes a per-palette × per-phase table read by HarmonyEngine.advanceBeat(), replacing the hardcoded `_beatsPerChord = 4`.

### Architecture after this spec

```
HarmonyEngine (chord symbols, progression, harmonic rhythm)
       ↓
  VoicingEngine (new — voicing style, extensions, register, collision)
       ↓                          ↓
  ChordTrack (stabs/comps/arps)   PadTrack (sustained wash)
```

---

## 3 · Subsystem 1 — Voicing Engine

### 3.1 What it does

Given: chord symbol (root semitone + quality) + palette name + current phase + melody engine's last note.
Returns: array of MIDI note numbers representing the specific voicing to play.

### 3.2 Voicing styles (per-palette)

Each palette declares a `voicingStyle` that determines how chord tones are arranged:

| Style | What it produces | Palettes |
|---|---|---|
| `power` | Root + P5 (+ octave at Storm+). No 3rd. | dark_techno, industrial |
| `close` | Root-position close triads. All notes within one octave. | chiptune, breakbeat |
| `drop2` | Drop-2 voicing: second-from-top note dropped one octave. Smooth spread. | noir_jazz |
| `open` | Wide spread: root in bass register, 3rd/5th/7th spread across octave 4–5. | synthwave, vaporwave |
| `shell` | Root + 3rd + 7th only (no 5th). Skeletal jazz harmony. | noir_jazz (comp mode), lo_fi_chill |
| `cluster` | Notes packed within a minor 3rd — dissonant stack. | ambient_dread |
| `spread` | add9/sus voicings — root, 5th, 9th spread wide. Airy. | lo_fi_chill, vaporwave |

### 3.3 New `palette.voicingEngine` schema

```js
voicingEngine: {
  style: 'close',            // voicing algorithm (see table above)

  // Extension whitelist per phase — what intervals are allowed
  extensions: {
    pulse:     [],            // triads only (or power for power style)
    swell:     [],            // triads only
    surge:     [7],           // 7 = minor 7th (10 semitones) or major 7th (11)
    storm:     [7, 9],        // 9 = major 9th (14 semitones)
    maelstrom: [7, 9],        // full set for this palette
  },

  // Register constraints
  registerFloor: 3,           // lowest octave for chord voices
  registerCeiling: 5,         // highest octave for chord voices
  maxNotesOct3: 2,            // max simultaneous notes in octave 3 (critical band)

  // Voice leading strength: 0 = no voice leading, 1 = strict minimal movement
  voiceLeadStrength: 0.8,

  // Collision avoidance mode
  collisionMode: 'avoid',     // 'avoid' | 'split' | 'none'
  //   avoid: check melody note, omit that pitch class from voicing
  //   split: hard register split (chords ≤ oct4, melody ≥ oct4)
  //   none: no collision logic (ambient_dread — melody is sparse/slow)
}
```

### 3.4 Per-palette voicing profiles

| Palette | Style | Extensions (Maelstrom) | Register | Collision | Voice lead |
|---|---|---|---|---|---|
| **dark_techno** | power | [] (power chords throughout) | 3–4 | split | 0.3 |
| **synthwave** | open | [7] | 3–5 | avoid | 0.7 |
| **glitch** | close | [7] | 4–5 | none | 0.2 |
| **ambient_dread** | cluster | [] (clusters, no functional extensions) | 3–5 | none | 0.5 |
| **lo_fi_chill** | spread | [7, 9] | 3–5 | avoid | 0.8 |
| **chiptune** | close | [] (triads only throughout) | 4–5 | split | 0.4 |
| **noir_jazz** | drop2 | [7, 9, 11, 13] | 3–5 | avoid | 0.95 |
| **industrial** | power | [] (bare 5ths throughout) | 3–4 | split | 0.3 |
| **vaporwave** | spread | [7, 9] | 3–5 | none | 0.7 |
| **breakbeat** | close | [7] | 4–5 | avoid | 0.5 |

### 3.5 Extension resolution rules

Extensions are interval numbers that resolve to semitone offsets depending on chord quality:

| Extension | Major quality | Minor quality | Diminished |
|---|---|---|---|
| 7 | 11 (major 7th) | 10 (minor 7th) | 10 (minor 7th) |
| 9 | 14 (major 9th) | 14 (major 9th) | 14 |
| 11 | 17 (perfect 11th)¹ | 17 (perfect 11th) | — |
| 13 | 21 (major 13th) | 21 (major 13th) | — |

¹ **Natural 11th rule:** Perfect 11th (17 semitones above root = perfect 4th) clashes with major 3rd in close voicing. For major-quality chords, use #11 (18 semitones) instead. This applies to noir_jazz only (the only palette that reaches 11ths). For minor chords, natural 11th is safe.

### 3.6 VoicingEngine algorithm

```
function voice(chordRoot, quality, palette, phase, melodyMidi):
  1. Get base intervals from quality (triad: [0, 3|4, 7])
  2. Look up palette.voicingEngine.extensions[phase]
     → append allowed extension semitones
  3. Apply voicing style:
     - power: keep [0, 7] only (+ 12 at Storm+)
     - close: stack intervals within one octave from registerFloor
     - drop2: sort close voicing, drop 2nd-from-top by -12
     - open: root at registerFloor, spread remaining across ceiling range
     - shell: keep root + 3rd + 7th only (drop 5th)
     - cluster: collapse all notes into minor-3rd range at register midpoint
     - spread: root low, skip an octave, place extensions high
  4. Convert to MIDI notes (chordRoot + voicingOctave * 12 + interval)
  5. Voice leading: if prevVoicing exists and voiceLeadStrength > 0,
     minimize total semitone movement (reuse existing _voiceLead logic)
  6. Register enforcement:
     - Count notes in octave 3. If > maxNotesOct3, move extras up to oct 4.
     - Clamp all notes to [registerFloor*12, registerCeiling*12+11]
  7. Collision avoidance:
     - If collisionMode === 'avoid' and melodyMidi is valid:
       Remove any note whose pitch class matches melodyMidi % 12
       AND whose octave matches Math.floor(melodyMidi / 12) - 1
       (same octave check — different octaves are fine, adds harmonic richness)
     - If collisionMode === 'split':
       Clamp all chord notes to ≤ octave 4 (MIDI 71)
  8. Return MIDI note array
```

### 3.7 Where it lives

New module-scope object `VoicingEngine` in harmony.js, placed after `HarmonyEngine` (it reads `HarmonyEngine._currentChord`). Approximately 80–100 lines.

### 3.8 Integration points

- **ChordTrack.tickStep():** Replace `HarmonyEngine.getChordTones(cfg.octave)` with `VoicingEngine.voice(chord, paletteName, phase, melodyLastMidi)`. The `cfg.voices` limit still applies on top (truncate returned array to voice count).
- **PadTrack.tick():** Replace `HarmonyEngine.getVoicedChordTones(cfg.octave)` with `VoicingEngine.voice(chord, paletteName, phase, null)`. Pad doesn't need collision avoidance (it's a wash, not rhythmic).
- **MelodyEngine exposure:** VoicingEngine reads `MelodyEngine._lastNoteMidi` (the most recently played melody MIDI note). This is already tracked as part of the Markov state. Need to expose it as a readable field — currently internal. Add `MelodyEngine.getLastNoteMidi()` getter.

---

## 4 · Subsystem 2 — Phase-Driven Harmonic Rhythm

### 4.1 What it does

Replaces the hardcoded `_beatsPerChord = 4` with a per-palette, per-phase lookup table. HarmonyEngine reads the current phase and palette to determine how many beats (or fractions of a beat) before the next chord change.

### 4.2 New `palette.harmonicRhythm` schema

```js
harmonicRhythm: {
  // Beats per chord change at each phase
  // Values < 1 mean sub-beat changes (e.g. 0.5 = every 2 16th notes)
  // Values use beats as unit (1 beat = quarter note at current BPM)
  pulse:     16,    // 4 bars
  swell:     12,    // 3 bars
  surge:      8,    // 2 bars
  storm:      4,    // 1 bar
  maelstrom:  4,    // 1 bar
}
```

### 4.3 Per-palette harmonic rhythm tables

Values in **beats** (4 beats = 1 bar). Derived from audit research:

| Palette | Pulse | Swell | Surge | Storm | Maelstrom |
|---|---|---|---|---|---|
| **dark_techno** | 32 | 24 | 16 | 8 | 4 |
| **synthwave** | 8 | 8 | 6 | 4 | 4 |
| **noir_jazz** | 2 | 2 | 1 | 1 | 0.5² |
| **lo_fi_chill** | 16 | 12 | 8 | 6 | 4 |
| **ambient_dread** | 64 | 48 | 32 | 16 | 8 |
| **chiptune** | 8 | 8 | 8 | 4 | 4 |
| **industrial** | 32 | 24 | 16 | 8 | 2² |
| **vaporwave** | 16 | 16 | 8 | 8 | 4 |
| **breakbeat** | 8 | 8 | 4 | 4 | 2² |
| **glitch** | 16 | 8 | 4 | 2 | 1³ |

² Sub-bar changes (0.5 beats = 2 16th notes for noir_jazz; 2 beats = half bar for industrial/breakbeat).
³ glitch at Maelstrom: 1 beat per chord = rapid harmonic churn (intentionally chaotic).

### 4.4 Beat-alignment rule

Chord changes must land on beat boundaries. For values ≥ 1 beat, this is automatic — `advanceBeat()` fires on beats. For sub-beat values (0.5), the change fires on the nearest 16th-note quantization point. Only noir_jazz is allowed sub-beat changes at Maelstrom (jazz harmonic idiom). All other palettes have a floor of 1 beat.

**Implementation:** When `_beatsPerChord` resolves to < 1, switch to a sub-beat counter in `advanceBeat()` that tracks 16th-note subdivisions. This requires `advanceBeat()` to accept a sub-step index (already available — Sequencer tick passes step index to sub-step dispatch).

Alternative (simpler): keep `advanceBeat()` as-is but allow it to advance the chord index multiple times in a single beat call when `_beatsPerChord < 1`. E.g., if beatsPerChord = 0.5, advance twice per beat. This keeps the existing architecture intact.

### 4.5 Implementation in HarmonyEngine

```js
// In initRun():
this._harmonicRhythm = palette.harmonicRhythm || null;
this._updateBeatsPerChord('pulse');

// New method:
_updateBeatsPerChord: function(phase) {
  if (!this._harmonicRhythm) {
    this._beatsPerChord = 4;  // legacy default
    return;
  }
  this._beatsPerChord = this._harmonicRhythm[phase] || 4;
},

// In onPhaseChange():
this._updateBeatsPerChord(newPhase);

// In advanceBeat() — handle sub-beat:
// If _beatsPerChord < 1, fire multiple chord changes per beat
var changesPerBeat = Math.round(1 / this._beatsPerChord);
if (changesPerBeat > 1) {
  for (var i = 0; i < changesPerBeat; i++) {
    this._advanceChordIndex();
    this._resolveChord();
  }
  return; // skip normal beat counting
}
// ... existing beat counting logic for _beatsPerChord >= 1
```

### 4.6 Interaction with chord rhythm offset (SPEC_017 §7)

The existing anticipation/delay system (`_chordRhythmOffset`) still applies on top of the harmonic rhythm table. At sub-beat rates (< 1), disable anticipation/delay — changes are too fast for rhythmic offset to be perceptible.

### 4.7 Interaction with cycle mode

On palette swap during cycle bridge, `_updateBeatsPerChord()` is called with the current phase for the new palette. The new palette's harmonic rhythm takes effect immediately after the bridge resolves.

---

## 5 · Subsystem 3 — Extension Ramp

### 5.1 What it does

Controls which chord extensions (7ths, 9ths, 11ths, 13ths) are available at each phase, per palette. This replaces the current binary `allow9th` flag with a phase-progressive whitelist.

### 5.2 How it works

Already defined in the `voicingEngine.extensions` table (§3.3). VoicingEngine reads the phase, looks up the allowed extensions, and only adds those intervals to the voicing.

### 5.3 Extension ramp by palette group

**Minimal group** (dark_techno, industrial, chiptune): No extensions ever. Power chords or bare triads throughout all phases. These genres derive energy from *rhythm and timbre*, not harmonic complexity.

**Moderate group** (synthwave, breakbeat, glitch, vaporwave): 7ths unlock at Surge. 9ths at Storm for vaporwave/lo_fi only. No 11ths or 13ths. These genres benefit from harmonic warmth but not jazz complexity.

**Rich group** (noir_jazz, lo_fi_chill): Full extension ramp. 7ths at Surge, 9ths at Storm, 11ths/13ths at Maelstrom. These genres *require* extensions for identity — a jazz chord without a 7th isn't jazz.

### 5.4 PadTrack extension ramp

PadTrack currently uses `_getVoicingIntervals()` which has its own phase logic. After this spec, PadTrack routes through VoicingEngine, which unifies the extension logic. The existing `_getVoicingIntervals()` method can be removed or reduced to a thin wrapper.

### 5.5 The existing `palette.voicing` config

The current `voicing` block (`padDefault`, `allowSus`, `allow9th`, `preferOpen`) is superseded by `voicingEngine`. Migration path:

- `padDefault: 'power'` → `voicingEngine.style: 'power'`
- `padDefault: 'add9'` → `voicingEngine.style: 'spread'` + `extensions.surge: [9]`
- `allowSus: true` → handled by voicing style ('spread' naturally includes sus-like intervals)
- `allow9th: true` → `extensions.storm: [7, 9]`
- `preferOpen: true` → `voicingEngine.style: 'open'`

The old `voicing` block remains in palette configs for backward compatibility (VoicePool still reads `bassVoicing`) but `_getVoicingIntervals()` delegates to VoicingEngine for ChordTrack and PadTrack.

---

## 6 · Subsystem 4 — Chord-Melody Collision Avoidance

### 6.1 The problem

ChordTrack plays chord tones. MelodyEngine plays melody notes. Both can land on the same pitch class at the same octave on the same beat. When two oscillators play the same frequency, you get either: phase cancellation (volume drops unpredictably) or unison beating (sounds like a tuning error, not a musical choice).

### 6.2 Two strategies

**Strategy A — Pitch avoidance (preferred for most palettes):**
VoicingEngine checks the melody's last played MIDI note. If any chord voice matches that pitch class at the same octave (±1 semitone for close matches), that voice is omitted or moved up/down an octave.

- Works for: synthwave, lo_fi_chill, noir_jazz, breakbeat (palettes where melody and chords coexist actively)
- Cost: occasionally produces incomplete voicings (2 notes instead of 3). Acceptable — real arrangers do this.

**Strategy B — Register split (simpler, for minimal palettes):**
Hard rule: all chord voices ≤ MIDI 71 (B4). Melody stays ≥ MIDI 60 (C4) per palette config. Overlap zone is octave 4 — but melody tends to sit in the upper half (C4–B4) while chords sit in the lower half. Combined with the fact that power-chord palettes only use root+5th, collision is extremely unlikely.

- Works for: dark_techno, industrial, chiptune (palettes where chords are rhythmic texture, not harmonic richness)
- Cost: limits chord register flexibility. Fine for these genres.

**Strategy C — None (for sparse palettes):**
ambient_dread and vaporwave have `chord.style: 'none'` — no rhythmic chords at all. glitch melody is sparse and chaotic enough that collisions are stylistically appropriate. No avoidance needed.

### 6.3 MelodyEngine interface

New getter in melody.js:

```js
MelodyEngine.getLastNoteMidi = function() {
  return this._lastNoteMidi || null;
};
```

`_lastNoteMidi` is already tracked internally (set in `_playMelodyNote()`). Just needs to be readable.

### 6.4 Psychoacoustic register rules

Enforced in VoicingEngine step 6 (§3.6):

- **Octave 1–2:** Bass only. Never place chord tones here.
- **Octave 3:** Max 2 notes. Critical band at these frequencies is ~3 semitones wide — a close-voiced triad here produces audible roughness. Shell voicings (root + one tone) are safe.
- **Octave 4+:** Unrestricted density. Critical band narrows at higher frequencies.

These rules apply regardless of palette. They are physics, not style.

---

## 7 · Interaction with existing systems

### 7.1 Stagger system (SPEC_010)

No changes. ChordTrack is already in the harmony stagger group. VoicingEngine runs when ChordTrack.tickStep fires — stagger only controls *when* the track unmutes, not *what* it plays.

### 7.2 Cycle mode (SPEC_008)

On palette swap: VoicingEngine reads the new palette's `voicingEngine` config. `_prevVoicing` resets to null (new palette = new voicing context, no voice leading across palette boundaries). HarmonyEngine's `_beatsPerChord` updates to the new palette's harmonic rhythm for the current phase.

### 7.3 Tension curve (SPEC_011)

Tension events push DC up/down, which may cause phase transitions. Phase transitions trigger `_updateBeatsPerChord()` and VoicingEngine reads the new phase's extension whitelist. No special integration needed — the existing phase-change callbacks handle it.

### 7.4 WalkingBass

WalkingBass reads `HarmonyEngine._chordChanged` to detect chord changes. Harmonic rhythm acceleration means more frequent chord changes, which means WalkingBass changes pitch more often. This is musically correct — bass follows harmony. No code changes needed in WalkingBass.

### 7.5 Borrowed chords / secondary dominants (SPEC_017)

VoicingEngine receives the resolved chord (after borrowed/secondary injection). It voices whatever chord HarmonyEngine gives it. No special handling needed.

### 7.6 Post-Maelstrom decay (#30)

If #30 builds a decay arc that simplifies harmony, harmonic rhythm should slow down during decay. This is a future concern — #30's spec will address it. For now, VoicingEngine and harmonic rhythm respond to the phase system, and decay will be a phase-like state.

---

## 8 · Files changed

| File | Changes | Scope |
|---|---|---|
| harmony.js | New `VoicingEngine` object (~100 lines), new `palette.voicingEngine` config in all 10 palettes, new `palette.harmonicRhythm` config in all 10 palettes, modify `_updateBeatsPerChord()`, modify `advanceBeat()` for sub-beat, add `_updateBeatsPerChord` call in `onPhaseChange()` and `initRun()` | Major |
| sequencer.js | ChordTrack.tickStep() calls VoicingEngine instead of getChordTones(), PadTrack.tick() calls VoicingEngine | Moderate |
| melody.js | Add `getLastNoteMidi()` getter (1 line) | Trivial |
| state_mapper.js | No changes needed | None |
| config.js | No changes needed | None |
| audio.js | No changes needed | None |

---

## 9 · Build issues

### 9.1 Splitting rationale

Three tightly coupled subsystems (voicing + extensions + collision) that share the VoicingEngine object → one session. Harmonic rhythm is independent (HarmonyEngine changes, no VoicingEngine dependency) → could be separate, but total scope is ~45 edits, within single-session budget if batched.

**Decision: 2 sessions.** Voicing + collision is judgment-heavy (Opus). Harmonic rhythm is mechanical table work (Sonnet).

### Issue #40: VoicingEngine — per-palette voicing intelligence + extension ramp + collision avoidance (Opus)

**Scope:**
- New `VoicingEngine` object in harmony.js (~100 lines)
- New `palette.voicingEngine` config in all 10 palettes in harmony.js
- `MelodyEngine.getLastNoteMidi()` getter in melody.js
- ChordTrack.tickStep() updated to call VoicingEngine in sequencer.js
- PadTrack.tick() updated to call VoicingEngine in sequencer.js

~35 edits. harmony.js is primary (VoicingEngine + 10 palette configs). sequencer.js secondary (ChordTrack + PadTrack integration). melody.js trivial (1-line getter).

**Model:** Opus — voicing algorithms require musical judgment (drop-2 inversion logic, register constraint balancing, collision avoidance edge cases).

### Issue #41: Phase-driven harmonic rhythm — per-palette × per-phase chord change rate (Sonnet)

**Depends on:** #40 (VoicingEngine must exist before harmonic rhythm accelerates chord changes).

**Scope:**
- New `palette.harmonicRhythm` config in all 10 palettes in harmony.js
- Modify `HarmonyEngine.initRun()` to read harmonic rhythm
- New `_updateBeatsPerChord(phase)` method
- Modify `HarmonyEngine.onPhaseChange()` to call `_updateBeatsPerChord()`
- Modify `HarmonyEngine.advanceBeat()` for sub-beat chord changes

~20 edits. harmony.js only. Mechanical — the per-palette tables are specified in §4.3, the algorithm is specified in §4.5.

**Model:** Sonnet — table insertion + straightforward control flow changes. No judgment calls.

**Depends on:** #40 (VoicingEngine must exist before harmonic rhythm accelerates chord changes — faster changes without proper voicing would amplify existing problems).

---

## 10 · Acceptance criteria

### VoicingEngine (#39)

1. **noir_jazz chords sound jazzy** — drop-2 voicings with extensions at Storm+, not root-position triads
2. **dark_techno chords are bare** — root+5th power shapes, no 3rds, no extensions
3. **chiptune stays triads** — close-voiced, root position, no extensions at any phase
4. **lo_fi_chill has warm spread** — add9/sus-style voicings, 7ths at Surge
5. **No melody-chord doubling** — when melody plays E4, chord voicing does not include E4 (for avoid-mode palettes)
6. **No muddy octave-3 chords** — max 2 notes in octave 3 for any palette
7. **Voice leading audible** — consecutive chords share common tones where possible (minimal movement in upper voices)
8. **PadTrack benefits** — pad wash uses VoicingEngine too, sounds richer at Storm+ with extensions
9. `npm run gate` passes

### Harmonic rhythm (#40)

1. **dark_techno at Pulse holds chord for 8 bars** — audibly static harmony
2. **dark_techno at Maelstrom changes every bar** — audibly accelerating harmony
3. **noir_jazz changes every 2 beats at Pulse** — fast harmonic movement from the start
4. **noir_jazz at Maelstrom changes every half-beat** — rapid jazz reharmonization feel
5. **ambient_dread at Pulse holds chord for 16 bars** — glacial harmonic motion
6. **Phase transitions update harmonic rhythm immediately** — no stale rate after phase change
7. **Cycle palette swap updates harmonic rhythm** — new palette's rate takes effect post-bridge
8. **Anticipation/delay disabled at sub-beat rates** — no offset when beatsPerChord < 1
9. `npm run gate` passes

---

## 11 · QA brief

### VoicingEngine (#39)

**What changed:** Chords now sound different per genre — not just different rhythms (that was SPEC_032), but different *note choices*. Jazz chords are rich and complex with smooth voice movement between changes. Techno chords are stripped to the bone — just root and fifth, like a power chord. Lo-fi chords are warm and airy with extra color notes. The melody and chords no longer step on each other — if the melody is playing a note, the chord avoids playing that same note at the same pitch.

**How to test:**
1. Play noir_jazz to Storm. Listen to chord hits — they should sound *jazzy* (rich, spread, not thin triads). Compare to chiptune at Storm — chiptune should sound crisp and simple (basic triads).
2. Play dark_techno to Swell. Chord stabs should sound like power chords — punchy, no color. No 3rds.
3. Play synthwave to Storm. Chord stabs should sound wider/more cinematic than at Swell (7ths unlock).
4. Play any palette with melody active. Listen for moments where chord stab and melody land together — they should complement, not clash or double.
5. Play lo_fi_chill to Surge. Pad wash should sound warmer/richer than at Swell (extensions kicking in).

**Risks:** Voice leading smoothness is subtle — if transitions between chords sound "jumpy," the voiceLeadStrength value per palette may need tuning. The algorithm is right even if individual strength values need adjustment.

### Harmonic rhythm (#40)

**What changed:** How often the chord changes now depends on the genre and the current phase. Ambient genres hold a single chord for a very long time at low intensity, while jazz changes chords rapidly even at the start. All genres accelerate their chord changes as intensity builds — by Maelstrom, harmony is moving much faster than at Pulse.

**How to test:**
1. Play dark_techno from the start. Notice the chord barely changes for a long time (8 bars at Pulse). Let it reach Maelstrom — now chords change every bar. The acceleration should be audible.
2. Play noir_jazz. Even at Swell, chords change every 2 beats (fast). At Maelstrom, chords change twice per beat — rapid jazz reharmonization.
3. Play ambient_dread. Harmony should feel nearly frozen at Pulse — the same chord sustains for 16 bars. This is intentional.
4. A/B dark_techno vs noir_jazz at the same phase — the *rate* of chord changes should feel completely different (techno = slow and heavy, jazz = quick and nimble).

**Risks:** Very fast harmonic rhythm (sub-beat) in noir_jazz Maelstrom may sound chaotic rather than jazzy if the chord progressions don't have enough variety. This is a progression content issue, not a rhythm engine issue — solvable by adding more progression variants in a future spec.

---

## 12 · Summary

- **1 new object:** VoicingEngine in harmony.js (~100 lines)
- **1 new palette section:** `palette.voicingEngine` (×10 palettes)
- **1 new palette section:** `palette.harmonicRhythm` (×10 palettes)
- **1 new getter:** `MelodyEngine.getLastNoteMidi()` in melody.js
- **2 modified methods:** `ChordTrack.tickStep()`, `PadTrack.tick()` in sequencer.js
- **3 modified methods:** `HarmonyEngine.initRun()`, `.onPhaseChange()`, `.advanceBeat()` in harmony.js
- **1 new method:** `HarmonyEngine._updateBeatsPerChord()` in harmony.js
- **2 build issues:** #40 VoicingEngine (Opus, ~35 edits), #41 harmonic rhythm (Sonnet, ~20 edits)
