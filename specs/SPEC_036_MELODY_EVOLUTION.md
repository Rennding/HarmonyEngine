# SPEC_036 — Melody Evolution: Motivic Development, Contour Control, Phrase Pairing

**Issue:** #36 — Melody evolution plan
**Model:** Opus (judgment — musical structure, per-palette tuning, interaction design)
**Status:** Draft
**Depends on:** #33 melody synth rebuild (qa-pass), #34 ChordTrack (built), #35 stagger wiring

---

## 1 · Problem

The melody engine generates note-to-note via 2nd-order Markov chains with per-palette matrices. The synthesis chain is now genre-accurate (SPEC_032 #33). But the *musical logic* feeding the synth has no higher-level structure:

1. **No motivic identity.** Every phrase is a fresh Markov walk. Phrases are statistically similar but thematically unrelated. The listener has nothing to latch onto — no hook, no recurring idea. The melody feels random rather than composed.

2. **No phrase shape.** The Markov chain picks note-to-note without contour awareness. A phrase can wander without direction — there's no arch, no wave, no genre-appropriate shape bias.

3. **No phrase pairing.** Musical phrases naturally come in question-answer pairs: antecedent ends unresolved, consequent resolves. Our phrases are independent — the melody feels episodic, not narrative.

4. **No gap-fill logic.** Large leaps can be followed by more leaps in the same direction. This violates the Narmour I-R model — the most validated cognitive model of melodic expectation. Listeners expect leaps to be followed by stepwise contrary motion.

5. **No genre-defining interval character.** dark_techno should favor 4ths and 5ths. noir_jazz should embrace all intervals including chromatic approaches. ambient_dread should lean on minor 2nds and tritones. The Markov matrices encode transition probabilities but don't explicitly weight by interval emotional character.

6. **No rhythmic identity in melody.** `melodyRhythm` captures subdivision, swing inheritance, and hold probability — but not syncopation probability, dotted rhythm bias, or rubato feel. These are genre-defining rhythmic qualities.

---

## 2 · Mental model

Think of this as **six layers stacked on top of the existing Markov chain** — not replacements. The Markov chain remains the note-selection engine. These layers bias, filter, constrain, and structure its output.

```
Layer 6 — Melodic rhythm extensions (syncopation, dotted, rubato)
Layer 5 — Per-palette interval affinity (soft bias on Markov output)
Layer 4 — I-R constraint post-filter (gap-fill enforcement)
Layer 3 — Contour bias (phrase-level directional weighting)
Layer 2 — Antecedent-consequent phrase pairing (question/answer)
Layer 1 — Seed motif system (motif → variation → phrase derivation)
─────────────────────────────────────────────────────────────────
Base    — 2nd-order Markov chain (existing, unchanged)
```

**Data flow per phrase:**
1. If no motif exists → generate seed motif from Markov chain (4–8 notes)
2. Select variation type based on phase (repetition / transposition / inversion / diminution / fragmentation)
3. Apply variation to motif → raw phrase candidate
4. Apply contour bias — weight toward palette's target phrase shape
5. Apply I-R post-filter — enforce gap-fill on large leaps
6. Apply interval affinity — soft-weight Markov fallback candidates by genre interval preference
7. Pair phrases: odd phrases are antecedent (unresolved ending), even phrases are consequent (resolved ending)
8. Apply rhythmic identity: syncopation offsets, dotted placement, rubato drift

**Phase-driven unlock:**
| Phase | Available variation types | Contour strictness | I-R strictness |
|---|---|---|---|
| Pulse | (melody silent) | — | — |
| Swell | Repetition only | Strict (80% bias) | Full |
| Surge | Repetition, transposition | Moderate (60%) | Full |
| Storm | + inversion, diminution | Relaxed (40%) | Moderate |
| Maelstrom | + fragmentation (all types) | Minimal (20%) | Relaxed |

---

## 3 · Subsystem 1: Seed Motif

### 3.1 What it is

At song start (or cycle-mode palette swap), generate a **seed motif** — a 4–8 note sequence drawn from the Markov chain. This motif becomes the melodic DNA for the entire song/cycle. All subsequent phrases derive from it via variation, not from fresh Markov walks.

### 3.2 Generation

The seed motif is generated once, during `MelodyEngine.initRun()`:

1. Use the existing Markov chain to generate 4–8 notes (length = palette config, default 6)
2. Apply the same constraints as `_selectNextNote` (max leap, chord-tone preference)
3. Store as an array of **scale degree offsets** (not MIDI notes) — so transposition and chord changes don't invalidate it
4. Also cache as MIDI notes at current chord for immediate use

**Why scale degrees, not MIDI:** The motif needs to survive chord changes. Degree offsets (0 = root, 1 = 2nd, etc.) are relative to whatever scale/chord is active when the phrase plays. The motif "C E G" in C major becomes "D F# A" in D major — same shape, different pitch.

### 3.3 Storage

```js
// New fields on MelodyEngine:
_motif: null,           // { degrees: [int], lengths: [int], generated: bool }
_motifVariation: null,  // current variation type: 'repeat'|'transpose'|'invert'|'diminish'|'fragment'
_phrIdx: 0,            // phrase index (0-based) — tracks antecedent/consequent pairing
```

`degrees` = array of scale degree indices (0–6 for 7-note scales, 0–4 for pentatonic).
`lengths` = array of relative durations (1 = base subdivision, 2 = double, etc.) — captures the motif's rhythmic identity alongside its pitch identity.

### 3.4 Lifecycle

- **Song start / `initRun()`:** Generate motif. `_phrIdx = 0`.
- **Cycle-mode palette swap (bridge phase):** Regenerate motif for new palette. `_phrIdx = 0`.
- **Phrase request (`_generatePhrase`):** Instead of fresh Markov walk, apply current variation type to motif → phrase.
- **Phase change:** Unlock new variation types (§2 table). Pick variation type randomly from available pool, weighted toward less-used types.

### 3.5 Per-palette motif config

```js
// New field in palette:
motif: {
  length: 6,            // seed motif note count (4–8)
  rhythmCapture: true,  // if true, motif stores duration ratios alongside degrees
  // variation weights per phase (higher = more likely to be chosen)
  variationWeights: {
    swell:     { repeat: 1.0 },
    surge:     { repeat: 0.4, transpose: 0.6 },
    storm:     { repeat: 0.2, transpose: 0.3, invert: 0.3, diminish: 0.2 },
    maelstrom: { repeat: 0.1, transpose: 0.2, invert: 0.2, diminish: 0.2, fragment: 0.3 },
  }
}
```

### 3.6 Variation algorithms

**Repetition:** Return motif degrees unchanged. The phrase is the motif.

**Transposition:** Shift all degrees by a constant offset. Offset = difference between current chord root degree and motif's original chord root degree. Automatically happens when chord changes, but can also be forced by +2, +4, -3, etc. (randomly chosen from consonant intervals: ±2, ±3, ±4, ±5).

**Inversion:** Flip intervals around the first note. If motif goes [0, +2, +4, +2], inversion = [0, -2, -4, -2]. The contour is mirrored.

**Diminution:** Halve all duration values (lengths array). Same pitches, double speed. At Storm+, this creates acceleration tension.

**Fragmentation:** Take a random contiguous slice of the motif (2–4 notes from a 6-note motif). Repeat the fragment with slight variation. At Maelstrom, this creates the chaotic "motif breaking apart" effect.

### 3.7 Interaction with existing NarrativeConductor motif

The existing `NarrativeConductor.getMotifDegrees()` seeding (25% chance per phrase) is **replaced** by this system. The NarrativeConductor motif was a half-measure — it only influenced starting notes 25% of the time. The new system makes the motif central to all phrase generation. NarrativeConductor's `getMotifDegrees`/`getMotifMidi` can remain callable but MelodyEngine will no longer call them.

---

## 4 · Subsystem 2: Contour Bias

### 4.1 What it is

A per-palette probability bias that weights the Markov chain's next-note selection toward a target phrase shape. Not a hard constraint — a soft nudge that makes phrases tend toward genre-appropriate contours.

### 4.2 Contour archetypes

| Contour | Shape | Direction bias per position | Best palettes |
|---|---|---|---|
| arch | Low → peak → low | Up in first half, down in second | synthwave, chiptune, breakbeat |
| ascending | Rising | Up throughout (weakening) | dark_techno (Storm+) |
| descending | Falling | Down throughout (weakening) | noir_jazz, lo_fi_chill, vaporwave |
| wave | Undulating | Alternating up/down | ambient_dread, noir_jazz |
| flat | Minimal movement | Neither direction strongly | industrial, glitch |

### 4.3 Implementation

At each position in a phrase, compute a **direction bias** based on the palette's target contour and the note's position as a fraction of phrase length:

```
bias = contourFunction(position / phraseLength)
// Returns: -1.0 (strong downward) to +1.0 (strong upward), 0 = neutral
```

Contour functions:
- **arch:** `sin(π × pos/len)` mapped to bias — peaks at center
- **ascending:** `1.0 - pos/len` — strongest up bias at start, weakens
- **descending:** `-(1.0 - pos/len)` — strongest down bias at start
- **wave:** `sin(2π × pos/len)` — full cycle
- **flat:** always 0

**Application:** When `_selectNextNote` picks candidates from the Markov row, multiply each candidate's probability by a contour modifier:
- Candidate moves in biased direction → probability × (1 + |bias| × contourStrength)
- Candidate moves against biased direction → probability × (1 - |bias| × contourStrength × 0.5)
- Renormalize probabilities

`contourStrength` = per-palette (0.0–1.0), further scaled by phase (see §2 table: 80% at Swell → 20% at Maelstrom).

### 4.4 Per-palette contour config

```js
// New field in palette:
contour: {
  shape: 'arch',         // 'arch' | 'ascending' | 'descending' | 'wave' | 'flat'
  strength: 0.6,         // 0–1, how strongly to bias toward target shape
}
```

| Palette | Shape | Strength | Rationale |
|---|---|---|---|
| dark_techno | flat | 0.3 | Minimal melodic arc — hypnotic repetition |
| synthwave | arch | 0.7 | Classic anthem arc — build to peak, resolve |
| glitch | flat | 0.2 | Chaotic — minimal directional bias |
| ambient_dread | wave | 0.5 | Slow undulation — eerie, directionless |
| lo_fi_chill | descending | 0.5 | Melancholy fall — laid back, trailing off |
| chiptune | arch | 0.6 | Game melody arch — clear statement |
| noir_jazz | descending | 0.4 | Falling phrases — blues/jazz convention |
| industrial | flat | 0.4 | Mechanical — no lyrical arc |
| vaporwave | descending | 0.4 | Dreamy descent — nostalgia, fading |
| breakbeat | arch | 0.5 | Punchy arc — energy statement |

---

## 5 · Subsystem 3: I-R Constraint Post-Filter

### 5.1 What it is

After the Markov chain + contour bias picks a candidate note, apply Narmour Implication-Realization rules as a **post-filter**. This enforces the cognitive expectation that large leaps are followed by stepwise contrary motion.

### 5.2 Rules

1. **Gap-fill:** If previous interval was a leap > `gapThreshold` semitones, bias next 2–3 notes toward opposite stepwise motion (intervals ≤ 2 semitones in the opposite direction).
2. **Direction continuation:** If previous interval was a step (≤ 2 semitones), mild bias toward continuing in the same direction.
3. **Closure:** After 3+ notes in the same direction, bias toward reversal.

### 5.3 Implementation

New state tracked per phrase:
```js
_irState: {
  lastInterval: 0,       // signed semitone interval of last note-to-note move
  gapFillRemaining: 0,   // beats remaining under gap-fill obligation (0–3)
  directionRun: 0,        // consecutive same-direction moves (for closure rule)
}
```

In `_selectNextNote`, after Markov + contour bias produce a weighted candidate set:

1. If `gapFillRemaining > 0`:
   - Candidates in opposite direction from last leap, stepwise (≤2 semitones): probability × 2.0
   - Candidates in same direction as last leap: probability × 0.3
   - Decrement `gapFillRemaining`
2. If `directionRun >= 3`:
   - Candidates reversing direction: probability × 1.5
   - Candidates continuing: probability × 0.5
3. After pick: update `_irState`
   - If new interval > `gapThreshold`: set `gapFillRemaining` = clamp(interval / 2, 1, 3)
   - Update `directionRun`: same direction → increment, reversal → reset to 1

### 5.4 Per-palette I-R config

```js
// New field in palette:
ir: {
  gapThreshold: 5,       // semitones — leaps above this trigger gap-fill
  strength: 0.8,         // 0–1 — how aggressively to enforce I-R rules
  // strength scales the probability multipliers:
  //   at 1.0: full multipliers (2.0× / 0.3×)
  //   at 0.5: halved effect (1.5× / 0.65×)
  //   at 0.0: no I-R filtering
}
```

| Palette | gapThreshold | Strength | Rationale |
|---|---|---|---|
| dark_techno | 5 | 0.6 | Moderate — hypnotic lines shouldn't leap-and-wander |
| synthwave | 5 | 0.7 | Strong — anthem melodies need smooth voice leading |
| glitch | 7 | 0.2 | Weak — intentional randomness, leaps are the point |
| ambient_dread | 4 | 0.5 | Moderate — eerie gaps OK, but need eventual resolution |
| lo_fi_chill | 5 | 0.8 | Strong — smooth, Rhodes-like lines |
| chiptune | 5 | 0.7 | Strong — NES melodies are tightly constructed |
| noir_jazz | 4 | 0.9 | Very strong — jazz gap-fill is a core idiom |
| industrial | 7 | 0.3 | Weak — mechanical, angular lines are OK |
| vaporwave | 5 | 0.6 | Moderate — dreamy but coherent |
| breakbeat | 5 | 0.5 | Moderate — punchy but not wild |

---

## 6 · Subsystem 4: Antecedent-Consequent Phrase Pairing

### 6.1 What it is

Phrases come in pairs. The first phrase (antecedent) ends on a non-tonic chord tone — it asks a musical question. The second phrase (consequent) reuses the opening of the first but resolves to the root — it answers. This is the fundamental unit of melodic coherence above the note level.

### 6.2 Implementation

`_phrIdx` (phrase index) tracks position in the pairing cycle. Odd indices (0, 2, 4...) = antecedent. Even indices (1, 3, 5...) = consequent.

**Antecedent phrase (phrIdx % 2 === 0):**
1. Generate phrase normally (motif variation + contour + I-R)
2. Force the **last note** to land on a non-root chord tone (3rd, 5th, or 7th of current chord)
3. Cache the phrase's opening degrees (first 2–3 notes) as `_antecedentOpening`

**Consequent phrase (phrIdx % 2 === 1):**
1. Start with `_antecedentOpening` degrees (reuse first 2–3 notes of antecedent)
2. Generate remaining notes normally (fresh variation of motif)
3. Force the **last note** to land on the root (or octave of root) of current chord
4. Clear `_antecedentOpening`

### 6.3 Parallel vs. Contrasting pairing

**Parallel:** Consequent reuses the first 2–3 notes of antecedent, then diverges. Most satisfying for listeners (familiar opening → surprising ending → resolution). Used by most palettes.

**Contrasting:** Consequent starts fresh (no reuse of antecedent opening). More complex, less predictable. Used by jazz and complex palettes.

### 6.4 Per-palette phrase pairing config

```js
// New field in palette:
phrasing: {
  pairStyle: 'parallel',    // 'parallel' | 'contrasting'
  reuseLength: 2,           // notes reused from antecedent in parallel mode (2–3)
}
```

| Palette | pairStyle | reuseLength | Rationale |
|---|---|---|---|
| dark_techno | parallel | 2 | Repetition = hypnosis |
| synthwave | parallel | 3 | Anthem = strong callback |
| glitch | contrasting | — | Chaos = no callback |
| ambient_dread | contrasting | — | Eerie = unpredictable |
| lo_fi_chill | parallel | 2 | Chill = comfortable patterns |
| chiptune | parallel | 3 | Game melodies = strong hooks |
| noir_jazz | contrasting | — | Jazz = complex phrasing |
| industrial | parallel | 2 | Mechanical repetition |
| vaporwave | parallel | 2 | Nostalgic familiarity |
| breakbeat | parallel | 2 | Punchy call-and-response |

---

## 7 · Subsystem 5: Per-Palette Interval Affinity

### 7.1 What it is

A soft bias layer on interval selection. Each palette has preferred intervals that define its emotional character. When the Markov chain produces a set of candidate notes, their probabilities are adjusted by how well the resulting interval matches the palette's affinity profile.

### 7.2 Implementation

After Markov + contour + I-R produce a weighted candidate set, for each candidate compute the interval (in semitones) from the previous note. Multiply the candidate's probability by the affinity weight for that interval.

```js
// New field in palette:
intervalAffinity: {
  // key = absolute semitone interval (0–11), value = weight multiplier (1.0 = neutral)
  0: 0.3,   // unison — rarely desirable
  1: 0.5,   // minor 2nd
  2: 1.0,   // major 2nd
  3: 1.2,   // minor 3rd
  4: 0.8,   // major 3rd
  5: 1.3,   // perfect 4th
  6: 0.4,   // tritone
  7: 1.2,   // perfect 5th
  // 8–11 are rare (leaps > P5 already constrained)
}
```

### 7.3 Per-palette interval profiles

| Palette | Favored intervals (high weight) | Disfavored (low weight) | Character |
|---|---|---|---|
| **dark_techno** | P4 (1.4), P5 (1.3), m3 (1.2) | m2 (0.4), tritone (0.3) | Open, dark, power |
| **synthwave** | M3 (1.4), P4 (1.3), M6 (1.3) | m2 (0.3), tritone (0.3) | Bright, anthem, lyrical |
| **glitch** | m2 (1.2), tritone (1.1) — all others ≈1.0 | unison (0.5) | Chaotic, all intervals welcome |
| **ambient_dread** | m2 (1.5), tritone (1.4), m7 (1.3) | M3 (0.5), P5 (0.6) | Dread, dissonance, tension |
| **lo_fi_chill** | m3 (1.4), M2 (1.3), P5 (1.1) | m2 (0.4), tritone (0.3) | Warm, gentle, smooth |
| **chiptune** | M3 (1.3), P5 (1.3), M2 (1.2) | m2 (0.3), tritone (0.3) | Bright, clean, game-like |
| **noir_jazz** | m3 (1.3), m7 (1.3), tritone (1.1), m2 (1.0) | unison (0.4) | All intervals, chromatic color |
| **industrial** | P4 (1.3), P5 (1.3), m2 (1.1) | M3 (0.5), M6 (0.4) | Angular, harsh, mechanical |
| **vaporwave** | M3 (1.3), M2 (1.2), P5 (1.1) | m2 (0.4), tritone (0.4) | Warm, dreamy, smooth |
| **breakbeat** | P4 (1.3), m3 (1.2), M2 (1.1) | m2 (0.4), tritone (0.3) | Punchy, funky, clear |

### 7.4 Application order

Interval affinity is the **last** probability modifier applied before the weighted pick:

```
Markov base probabilities
  → × contour direction modifier
  → × I-R gap-fill modifier
  → × interval affinity modifier
  → renormalize
  → weighted random pick
```

This ordering means: Markov provides the musical foundation, contour shapes the phrase, I-R enforces cognitive expectations, and interval affinity adds genre color on top.

---

## 8 · Subsystem 6: Melodic Rhythm Extensions

### 8.1 What it is

Three new parameters in `melodyRhythm` that capture genre-defining rhythmic qualities the current config doesn't cover.

### 8.2 New parameters

```js
melodyRhythm: {
  // ... existing fields (subdivide, swingInherit, humanizeInherit, holdProbability, restStyle) ...

  // NEW:
  syncopationProbability: 0.0, // 0–1: chance each note is shifted early by half a sub-unit
  dottedBias: 0.0,             // 0–1: chance a note's duration is 1.5× (dotted) instead of 1×
  rubato: false,               // if true, notes get ±5–15ms random timing offset (not swing — freeform drift)
}
```

**Syncopation:** When a note is marked syncopated, its play time is shifted earlier by half a subdivision unit. E.g., on a beat grid, a syncopated note plays on the "and" before its nominal position. This creates the push/pull feel of jazz and funk.

**Dotted bias:** When a note gets dotted treatment, its duration is multiplied by 1.5× and the next note is shortened by 0.5× to compensate. Creates the long-short rhythmic swing of synthwave and breakbeat.

**Rubato:** Each note gets a small random timing offset (±5–15ms, drawn from `_songRng`). Not tied to swing grid — freeform human drift. Creates the "not quite quantized" feel of ambient and vaporwave.

### 8.3 Per-palette rhythmic profiles

| Palette | syncopation | dottedBias | rubato | Rationale |
|---|---|---|---|---|
| dark_techno | 0.10 | 0.0 | false | Grid-locked, mechanical |
| synthwave | 0.35 | 0.25 | false | Dotted rhythms, slight push |
| glitch | 0.80 | 0.10 | false | Maximum syncopation, stuttered |
| ambient_dread | 0.05 | 0.0 | true | Freeform, rubato drift |
| lo_fi_chill | 0.55 | 0.10 | true | Hip-hop swing + behind-the-beat |
| chiptune | 0.12 | 0.0 | false | Straight, quantized |
| noir_jazz | 0.70 | 0.15 | true | Heavy syncopation + rubato |
| industrial | 0.12 | 0.0 | false | Mechanical, on-grid |
| vaporwave | 0.10 | 0.05 | true | Dreamy, slight drift |
| breakbeat | 0.40 | 0.20 | false | Tight syncopation, dotted feel |

### 8.4 Implementation in tick()

In `MelodyEngine.tick()`, after computing `subTime` and groove timing:

1. **Syncopation check:** `if (rng() < syncopationProbability) subTime -= subDurSec * 0.5`
   - Clamp to not go before beatTime (prevent negative offset from crossing beat boundary)
2. **Dotted check:** `if (rng() < dottedBias) { currentNoteDur *= 1.5; nextNoteCompensation = true }`
   - Store flag so next note shortens by 0.5× to maintain phrase alignment
3. **Rubato:** `if (rubato) subTime += (rng() - 0.5) * 0.025` — ±12.5ms max drift

---

## 9 · Interaction with existing systems

### 9.1 Markov chain — unchanged

The 2nd-order Markov matrices (`_MATRICES`) remain exactly as-is. They are the base probability source. All six subsystems layer on top.

### 9.2 `_revalidateNote()` — unchanged

Chord-tone revalidation still runs after phrase generation. If a motif variation produces a note that's now a non-chord tone (due to chord change since motif generation), revalidation snaps it to the nearest chord tone. This is correct behavior — it preserves harmonic coherence without breaking the motif concept.

### 9.3 Groove engine — syncopation stacks with swing

Groove engine swing and humanize still apply via `GrooveEngine.getTimingOffset()`. Syncopation (§8) is additive — it shifts a note early, then swing/humanize may shift it again. This is intentional: syncopation is a melodic choice, swing is a groove-level feel. They're independent dimensions.

### 9.4 Phase density — unchanged

`_PHASE_DENSITY` controls phrase length, rest range, and gain. The motif system works within these constraints — if `maxPhraseLen` is 3, the motif variation is truncated or fragmented to fit.

### 9.5 Cycle mode — motif resets on palette swap

During cycle-mode bridge phase, `_doPaletteSwap()` calls `Sequencer.initRun(newPalette)` which calls `MelodyEngine.initRun()`. This regenerates the motif from the new palette's Markov matrix. Correct behavior — each palette/cycle gets its own motif identity.

### 9.6 Legato system (SPEC_032) — no conflict

Legato/staccato articulation is a synthesis-level behavior. It operates on whatever MIDI notes the phrase generator produces. The motif system changes *which* notes are generated, not *how* they're synthesized.

### 9.7 ChordTrack — no direct interaction

ChordTrack and melody remain independent tracks. The existing chord-melody collision avoidance (if implemented in #35) operates at synthesis time, not phrase generation. No conflict.

### 9.8 NarrativeConductor motif — superseded

`NarrativeConductor.getMotifDegrees()` was used in `_generatePhrase` with 25% seeding chance. This is removed — the new motif system is the sole source of phrase material. NarrativeConductor's motif data can remain (it's used by other subsystems) but MelodyEngine no longer reads it.

---

## 10 · File changes

| File | Changes |
|---|---|
| **melody.js** | New motif state fields, `_generateMotif()`, `_applyVariation()`, `_contourBias()`, `_irFilter()`, `_intervalAffinity()`, rewrite of `_generatePhrase()` to use motif + layers, syncopation/dotted/rubato in `tick()`, `_irState` tracking |
| **harmony.js** | Add `motif`, `contour`, `ir`, `phrasing`, `intervalAffinity` configs to all 10 palettes. Add `syncopationProbability`, `dottedBias`, `rubato` to all 10 `melodyRhythm` sections. |
| **state.js** | No changes — motif lives in MelodyEngine, not global state |

---

## 11 · Build issues

This is a large system touching melody.js (major addition) and harmony.js (×10 palette configs × 5 new sections). Total scope: ~60+ edits.

**Split into 3 build sessions** — QA gates between structural work and tuning, plus model split (Opus for judgment-heavy subsystems, Sonnet for mechanical config).

### Issue #36: Seed motif + phrase pairing + contour bias (Opus)

**Model:** Opus
**Scope:** The three subsystems that restructure phrase generation — motif system (§3), antecedent-consequent pairing (§6), contour bias (§4). This is the architectural core.
- `_generateMotif()`, `_applyVariation()` (5 variation types), motif lifecycle in `initRun()`
- `_phrIdx` tracking, antecedent caching, resolution logic
- `_contourBias()` with 5 contour functions
- Rewrite `_generatePhrase()` to chain: motif → variation → contour → pick
- Per-palette `motif`, `phrasing`, `contour` configs (×10 palettes in harmony.js)
- Remove NarrativeConductor motif seeding from `_generatePhrase`

~35 edits. melody.js + harmony.js.

**QA gate:** Aram needs to hear motif coherence and phrase pairing before I-R and interval tuning are layered on. These foundational subsystems must feel right alone.

### Issue #37: I-R post-filter + interval affinity (Opus)

**Model:** Opus
**Scope:** The two subsystems that refine note selection within phrases.
- `_irFilter()` — gap-fill tracking, direction-run tracking, probability modifiers
- `_intervalAffinity()` — interval weight lookup, probability multiplication
- `_irState` lifecycle (reset per phrase)
- Per-palette `ir` and `intervalAffinity` configs (×10 palettes in harmony.js)
- Wire into `_selectNextNote` after contour bias

~25 edits. melody.js + harmony.js.

### Issue #38: Melodic rhythm extensions (Sonnet)

**Model:** Sonnet
**Scope:** Mechanical wiring — three new `melodyRhythm` fields applied in `tick()`.
- Syncopation shift logic in tick()
- Dotted duration + compensation logic in tick()
- Rubato offset in tick()
- Per-palette `syncopationProbability`, `dottedBias`, `rubato` in melodyRhythm (×10 palettes in harmony.js)

~15 edits. melody.js + harmony.js.

---

## 12 · Acceptance criteria

### Motif + phrase pairing + contour (#36)
1. **Motif recurrence is audible** — at Swell, consecutive phrases sound related (same opening, similar shape). Not identical, but recognizably derived from the same idea.
2. **Phrase pairing is audible** — pairs of phrases feel like question-answer. First phrase ends "in the air," second phrase resolves to a landing.
3. **Contour shapes are genre-appropriate** — synthwave melodies arc (rise → peak → fall). noir_jazz melodies trend downward. ambient_dread melodies undulate.
4. **Motif resets on cycle palette swap** — new palette = new melodic identity. No carryover from previous palette's motif.
5. **Phase progression unlocks variation** — Swell = repetitive motif. Storm = inverted and accelerated. Maelstrom = fragmented.
6. **No regression** — chord-tone revalidation, legato/staccato, groove inheritance, grace notes all work.
7. `npm run gate` passes.

### I-R + interval affinity (#37)
1. **No consecutive wild leaps** — after a large interval, the melody steps back. Audibly smoother than before.
2. **noir_jazz uses chromatic approaches** — minor 2nd intervals are audible, giving jazz color.
3. **ambient_dread has tension intervals** — tritones and minor 2nds create unease.
4. **synthwave feels bright** — major 3rds and perfect 4ths dominate.
5. **glitch ignores I-R mostly** — angular, leapy lines are preserved (low I-R strength).
6. `npm run gate` passes.

### Melodic rhythm (#38)
1. **noir_jazz melody syncopates heavily** — notes push ahead of the beat, jazzy anticipation.
2. **synthwave has dotted feel** — long-short rhythm patterns in the melody.
3. **ambient_dread drifts** — notes don't land exactly on grid, rubato feel.
4. **dark_techno stays grid-locked** — no syncopation, no drift, mechanical.
5. `npm run gate` passes.

---

## 13 · QA briefs (for build sessions)

### Motif + phrase pairing + contour (#36)

**What changed:** The melody now has a "theme" — a short musical idea generated at the start that all later phrases are based on. Instead of random note-to-note generation, you'll hear the same melodic shape repeated with variation. Phrases come in question-answer pairs: the first ends unresolved, the second resolves. Each genre shapes its phrases differently — synthwave melodies arc upward then back down, jazz melodies trend downward, ambient melodies slowly undulate.

**How to test:**
1. Play synthwave to Swell. Listen for 4+ phrases — they should sound related, like variations of the same idea, not random sequences.
2. Listen for question-answer: odd phrases should feel "incomplete," even phrases should feel like they "land."
3. Play noir_jazz to Storm. Phrases should trend downward — falling bluesy lines.
4. Play ambient_dread to Surge. Melody should slowly wave up and down — no sharp arc.
5. Start cycle mode. When palette swaps, the melody theme should change to a new motif.
6. Compare Swell (simple repetition of motif) vs Maelstrom (fragmented, accelerated) — the motif should break apart as intensity rises.

**Risks:** Motif repetition balance — too repetitive feels robotic, too varied feels random. The `variationWeights` per phase are the tuning knob.

### I-R + interval affinity (#37)

**What changed:** Two new layers of musical intelligence. First: after a big melodic jump, the melody now steps back in the opposite direction (like a real musician would). Second: each genre favors different musical intervals — jazz uses chromatic half-steps for color, synthwave uses bright major intervals, ambient uses tense dissonant intervals.

**How to test:**
1. Play any palette to Storm. Listen for large jumps in the melody — the next few notes should step back toward where the jump started.
2. Play noir_jazz. Listen for chromatic "approach" notes — half-step slides into chord tones.
3. Play ambient_dread. The melody should feel tense and uneasy — lots of close dissonant intervals.
4. Play synthwave. The melody should feel bright and open — wide, clear intervals.
5. Play glitch. The melody should still feel angular and unpredictable — I-R rules are intentionally weak here.

**Risks:** Over-constraining makes melody feel predictable. If everything sounds "too smooth," the I-R and affinity strengths may need pulling back.

### Melodic rhythm (#38)

**What changed:** The melody's timing now matches its genre. Jazz melody pushes ahead of the beat (syncopation). Synthwave melody uses long-short dotted rhythms. Ambient and lo-fi melodies drift slightly off-grid (rubato).

**How to test:**
1. Play noir_jazz to Surge. Melody notes should feel like they land *before* the beat — a jazzy push.
2. Play synthwave to Surge. Some melody notes should hold longer than others — long-short dotted rhythm.
3. Play ambient_dread to Surge. Notes should feel slightly "off" from the grid — not sloppy, but human.
4. Play dark_techno to Storm. Melody should be locked perfectly to the beat grid — no drift, no push.

**Risks:** Syncopation + swing stacking could over-shift notes. If jazz melody sounds ahead *and* behind the beat simultaneously, reduce `syncopationProbability` or disable `swingInherit`.

---

## 14 · Summary

- **6 new subsystems** layered on the existing Markov chain (not replacing it)
- **5 new palette config sections**: `motif`, `contour`, `ir`, `phrasing`, `intervalAffinity`
- **3 new melodyRhythm fields**: `syncopationProbability`, `dottedBias`, `rubato`
- **~8 new functions** in melody.js: `_generateMotif`, `_applyVariation` (dispatch + 5 variation fns), `_contourBias`, `_irFilter`, `_intervalAffinity`
- **1 superseded system**: NarrativeConductor motif seeding removed from MelodyEngine
- **3 build issues**: #36 motif+pairing+contour (Opus, ~35 edits), #37 I-R+affinity (Opus, ~25 edits), #38 rhythm extensions (Sonnet, ~15 edits)
