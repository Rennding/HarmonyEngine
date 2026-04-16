# Audit: Melody & Chord Musicality — Research Findings

**Date:** 2026-04-17
**Type:** audit+ (research-first, plan later)
**Scope:** What HarmonyEngine needs to make melody and chords sound *right* — grounded in music theory, psychoacoustics, sound design, and procedural music best practices.

---

## Part 1 — Melody: What We Have vs. What We Need

### 1.1 Current State

The melody engine uses a 2nd-order Markov chain with per-palette transition matrices, phrase generation, and AHDSR envelopes (SPEC_032 rebuilt). Per-palette synthesis profiles are in place (legato, staccato, filter envelopes, PWM, vibrato). The system generates note-to-note transitions that are harmonically valid but **lack higher-level musical structure**.

### 1.2 What's Missing (Research-Backed)

#### A. Melodic Contour Control

Melodies have *shapes* (contour archetypes), and genre identity depends on which shapes dominate:

| Contour | Shape | Feel | Best Palettes |
|---|---|---|---|
| **Arch** | Low → peak → low | Arrival, completion | synthwave, chiptune, breakbeat |
| **Ascending** | Rising | Energy, tension build | dark_techno (storm+), trance (future) |
| **Descending** | Falling | Resolution, melancholy | noir_jazz, lo_fi_chill, vaporwave |
| **Wave** | Undulating | Continuous motion | ambient_dread, noir_jazz |
| **Inverted arch** | High → dip → high | Tension-restoration | noir_jazz, glitch |

**Gap:** Our Markov chain has no contour awareness. It picks note-to-note but doesn't shape phrases toward arch/wave/descent goals. A phrase can wander without direction.

**Fix concept:** Add a per-palette contour bias — a target shape that weights the Markov output. E.g., synthwave biases toward arch contours; ambient_dread biases toward wave.

#### B. Narmour's Implication-Realization (I-R) Model

The most validated cognitive model of melodic expectation. Core rules:

- **Small interval → continuation in same direction** (listener expects stepwise motion to continue)
- **Large leap → reversal by step** (the "gap-fill" principle — leap up, step back down)
- **Leap > 5 semitones → next 2–3 notes should fill the gap** (opposite stepwise motion)
- **Two consecutive same-direction moves → reversal expected** (closure signal)

**Gap:** Our Markov chain doesn't encode I-R. A large leap can be followed by another large leap in the same direction — sounds random, violates listener expectations.

**Fix concept:** Post-filter on Markov output that applies I-R constraints. After a leap > 5 semitones, bias next note probabilities toward opposite stepwise motion. Strength of constraint = per-palette (strict for noir_jazz/lo_fi, relaxed for glitch/industrial).

#### C. Interval Psychology (Genre-Defining)

Different intervals carry emotional weight, and genres lean on specific intervals:

| Interval | Semitones | Feel | Genre affinity |
|---|---|---|---|
| Minor 2nd | 1 | Horror, dread, dissonance | ambient_dread, industrial |
| Major 2nd | 2 | Mild tension, passing | Universal (passing tones) |
| Minor 3rd | 3 | Warm minor, sadness | noir_jazz, lo_fi, dark_techno |
| Major 3rd | 4 | Warm major, brightness | synthwave, chiptune |
| Perfect 4th | 5 | Open, power, anthem | synthwave, trance (future) |
| Tritone | 6 | Extreme tension, "devil's interval" | ambient_dread, noir_jazz (dominant) |
| Perfect 5th | 7 | Stability, openness | Universal anchor |
| Major 6th | 9 | Bright, lyrical | synthwave, chiptune |
| Major 7th | 11 | Unresolved tension | noir_jazz, ambient_dread |

**Gap:** Our Markov matrices encode transition *probabilities* but don't explicitly weight by interval character. A palette's emotional signature should be reinforced by its interval distribution.

**Fix concept:** Per-palette interval affinity weights — a soft bias layered on the Markov output. dark_techno favors 4ths/5ths; noir_jazz uses all intervals including chromatic approaches; ambient_dread leans on minor 2nds and tritones.

#### D. Phrase Structure (Antecedent-Consequent)

Musical phrases come in pairs: a "question" (antecedent, ends unresolved) followed by an "answer" (consequent, ends resolved). This is the fundamental unit of melodic coherence above the note level.

- **4 bars** = basic phrase unit (cognitive chunk)
- **8 bars** = antecedent + consequent (complete musical thought)
- **Parallel phrasing** = both phrases start the same, consequent diverges (most satisfying)
- **Contrasting phrasing** = different starts (jazz, complex palettes)

**Gap:** Our phrase generator creates phrases of variable length with no pairing logic. Phrases are independent — no question-answer relationship. This makes the melody feel episodic rather than narrative.

**Fix concept:** Generate phrases in pairs. First phrase targets a non-tonic chord tone on its last beat (question). Second phrase reuses opening motif but resolves to root (answer). Per-palette: jazz uses contrasting pairs; pop/electronic uses parallel pairs.

#### E. Motivic Development (Repetition + Variation)

**The mere exposure effect:** Listeners prefer melodies after 10–20 exposures. Optimal: 4–8 repetitions with increasing variation. Beyond 8: risk satiation unless variation is significant.

Techniques that create coherent variation:

| Technique | What it does | Phase fit |
|---|---|---|
| **Repetition** | Same motif unchanged | Pulse/Swell — establish identity |
| **Transposition** | Shift motif up/down | Swell/Surge — harmonic movement |
| **Inversion** | Flip intervals (up→down) | Storm — tension, complexity |
| **Diminution** | Halve durations | Storm/Maelstrom — acceleration |
| **Fragmentation** | Use pieces of motif | Maelstrom — chaotic energy |

**Gap:** Our melody engine generates new phrases from the Markov chain each time. No motif is remembered or developed. Every phrase is statistically similar but thematically unrelated.

**Fix concept:** At song start (or cycle start), generate a 4–8 note "seed motif" from the Markov chain. Subsequent phrases are variations of this motif (transposed, inverted, fragmented) rather than fresh Markov output. Phase controls which variation types are available.

#### F. Rhythmic Identity in Melody

Melody rhythm defines genre as much as pitch:

| Palette | Rhythmic character | Key parameter |
|---|---|---|
| dark_techno | Grid-locked 16ths, minimal syncopation | syncopation: 5–15% |
| synthwave | Dotted rhythms, slight swing | syncopation: 30–50%, dotted bias |
| noir_jazz | Swing 8ths, heavy anticipation/delay | syncopation: 60–80%, swing: 40–60% |
| lo_fi_chill | Hip-hop swing, behind-the-beat | syncopation: 50–70%, swing |
| chiptune | Straight quantized, rapid fills | syncopation: 10–20% |
| ambient_dread | Free, rubato-like | syncopation: 5–10%, no grid lock |
| glitch | Stuttered, irregular | syncopation: 70–90%, random |
| industrial | Mechanical, percussive | syncopation: 10–20% |
| vaporwave | Slow, dreamy, slight rubato | syncopation: 10–20% |
| breakbeat | Tight, punchy, on-beat | syncopation: 30–50% |

**Gap:** Our `melodyRhythm` config has `subdivide`, `swingInherit`, `holdProbability`, and `restStyle` — decent but doesn't capture syncopation probability, dotted rhythm bias, or rubato feel.

**Fix concept:** Extend `melodyRhythm` with `syncopationProbability` (0–1), `dottedBias` (0–1, probability of dotted-note placement), and `rubato` (boolean, allows slight timing drift).

#### G. Voice Leading (Melody-Harmony Relationship)

How melody interacts with the chord underneath:

| Technique | What | When |
|---|---|---|
| **Chord-tone targeting** | Land on chord tones on strong beats | Always — foundation of coherence |
| **Passing tones** | Stepwise non-chord tones between chord tones (weak beats) | All palettes |
| **Neighbor tones** | Step away from chord tone and return | Ornamentation |
| **Chromatic approach** | Half-step approach from above/below | noir_jazz (40–60% of notes), minimal elsewhere |
| **Guide-tone lines** | Target 3rds and 7ths of each chord | noir_jazz specifically |

**Gap:** Our Markov chain respects scale degrees but doesn't differentiate strong-beat vs weak-beat chord-tone targeting. A non-chord tone on beat 1 sounds wrong; on the "and" of beat 2 it sounds like intentional color.

**Fix concept:** Add a beat-position weight to note selection. On strong beats (1, 3), bias heavily toward chord tones. On weak beats, allow passing/neighbor tones. Per-palette chromatic approach probability for jazz.

---

## Part 2 — Chords: Voicing, Rhythm, and Articulation

### 2.1 Current State

SPEC_032 defines ChordTrack (stab/comp/arp/none styles), per-palette profiles, and a 16-step pattern system. PadTrack handles sustained wash. Both read from HarmonyEngine's chord progression system.

### 2.2 What's Missing (Research-Backed)

#### A. Voicing Intelligence

Different genres voice the *same chord* completely differently:

| Genre | Voicing style | Notes |
|---|---|---|
| noir_jazz | Close + drop-2, extensions (7/9/13/#11) | Smooth voice leading between chords |
| synthwave | Open, power chords (root+5th), maj7 | Spacious, cinematic |
| dark_techno | Bare triads or single notes | Minimal, dark |
| lo_fi_chill | maj7, add9, sus chords, loose spread | Warm, slightly dissonant |
| chiptune | Root-position triads only | Hardware limitation aesthetic |
| breakbeat | Power chords, some 7ths | Punchy, clear |
| ambient_dread | Quartal/quintal stacks, clusters | Non-functional, tense |
| industrial | Power chords, bare 5ths | Aggressive, minimal |
| vaporwave | Spread voicings, add9, sus | Dreamy, spacious |

**Gap:** Current `palette.voicing` has `padDefault`, `bassVoicing`, `allowSus`, `allow9th`, `preferOpen` — but ChordTrack doesn't have a voicing algorithm that adapts per-palette. It will play the same triad shape regardless of whether it's jazz or techno.

**Fix concept:** ChordTrack needs a voicing engine that, given a chord symbol + palette + phase, outputs the specific MIDI notes to play. Phase-driven complexity: Swell = triads, Surge = 7ths, Storm = extensions (for palettes that support them).

#### B. Extension Rules by Genre

| Extension | Jazz | Lo-fi | Techno | Synthwave | Chiptune | Breakbeat |
|---|---|---|---|---|---|---|
| maj7 | Yes | Yes (warm) | No | Yes | No | Some |
| min7 | Yes | Some | Some | Yes | No | Some |
| 9th | Yes | Yes | No | No | No | Some |
| 11th (#11) | Yes | No | No | No | No | No |
| 13th | Yes | Some | No | No | No | Some |
| Altered dom | Yes | No | No | No | No | No |

**Key rule:** Natural 11th (perfect 4th above root) is dissonant when stacked with major 3rd — avoid in closed voicings everywhere. Use #11 in jazz only.

**Gap:** Our `voicing` config flags `allow9th` and `allowSus` but doesn't have the full extension matrix. No phase-driven extension complexity.

**Fix concept:** Per-palette extension whitelist + phase-driven complexity ramp. At Swell: triads only. At Surge: +7ths. At Storm: +9ths (for palettes that allow them). At Maelstrom: full extensions for jazz/lo-fi.

#### C. Harmonic Rhythm by Genre and Phase

How often chords change — this is *hugely* genre-defining:

| Palette | Pulse | Swell | Surge | Storm | Maelstrom |
|---|---|---|---|---|---|
| dark_techno | 8 bars | 6 bars | 4 bars | 2 bars | 1 bar |
| synthwave | 2 bars | 2 bars | 1.5 bars | 1 bar | 1 bar |
| noir_jazz | 2 beats | 2 beats | 1 beat | 1 beat | 0.5 beats |
| lo_fi_chill | 4 bars | 3 bars | 2 bars | 1.5 bars | 1 bar |
| ambient_dread | 16 bars | 12 bars | 8 bars | 4 bars | 2 bars |
| chiptune | 2 bars | 2 bars | 2 bars | 1 bar | 1 bar |
| industrial | 8 bars | 6 bars | 4 bars | 2 bars | 0.5 bars |
| breakbeat | 2 bars | 2 bars | 1 bar | 1 bar | 0.5 bars |
| vaporwave | 4 bars | 4 bars | 2 bars | 2 bars | 1 bar |
| glitch | 4 bars | 2 bars | 1 bar | 0.5 bars | random |

**Gap:** Our HarmonyEngine re-voices on a fixed cadence (tied to form structure: A-B-A-C sections). It doesn't accelerate harmonic rhythm with phase.

**Fix concept:** Per-palette harmonic rhythm table (bars-per-chord-change × phase). The Conductor or HarmonyEngine reads the current phase and adjusts chord change rate accordingly.

#### D. Chord-Melody Interaction

**Rule 1 — No parallel doubling:** Melody note should not be doubled in the chord stab at the same octave. Temporal or register separation is required.

**Rule 2 — Complementary rhythm:** Chord stabs on off-beats when melody is on-beat (or vice versa). Prevents masking.

**Rule 3 — Register allocation:**
- Bass: octaves 1–2 (already enforced)
- Chords: octaves 3–4 (SPEC_032 enforces this)
- Melody: octaves 4–5 (melody.octave per palette)
- When melody and chords share octave 4, ensure different articulation (staccato chords vs legato melody) or temporal offset.

**Gap:** No interaction logic between ChordTrack and MelodyEngine. They're independent systems that could collide.

**Fix concept:** ChordTrack.tick() checks current melody note and avoids voicing that note at the same octave. Or: simple rule — ChordTrack voices stay at or below octave 4, melody stays at or above octave 4.

#### E. Psychoacoustic Register Management

**Critical band theory:** Two tones within a critical band (~minor 3rd at low frequencies, ~minor 2nd at high frequencies) create roughness/beating. This is why low-register chords sound muddy — the critical band is wider at low frequencies.

**Rules:**
- Octaves 1–2: single notes only (bass). Never stack chord tones here.
- Octave 3: shell voicings OK (root + one tone). Triads possible but risk muddiness.
- Octave 4+: any voicing density is safe.
- For "warm" palettes (lo_fi, noir_jazz, vaporwave): slight detuning (±5–15 cents) between chord voices adds analog warmth via controlled beating.
- For "cold" palettes (dark_techno, industrial, glitch): precise tuning, no detuning — clean and mechanical.

**Gap:** No register-aware voicing logic. ChordTrack could theoretically play a dense 4-note chord in octave 3 and sound muddy.

**Fix concept:** Enforce minimum voicing rules per register. Octave 3 = max 2 notes. Octave 4+ = no limit.

---

## Part 3 — Sound Design: Per-Palette Synthesis Audit

### 3.1 Genre-Defining Sonic Signatures

Every genre has 2–3 elements that, if absent, make it not sound right:

| Palette | Must-have #1 | Must-have #2 | Must-have #3 |
|---|---|---|---|
| **dark_techno** | Resonant LPF (Q≥4) with peak at 2–4kHz | Sub-bass (20–80Hz) independent of mid-bass | Staggered transients (locked groove feel) |
| **synthwave** | Detuned supersaw pads (±20–40 cents, 5–8 voices) | Long reverb tails (2–4s) on leads/pads | Gated reverb snare character |
| **glitch** | Bitcrushing/granular stutter (intentional degradation) | Rapid filter/pitch modulation (8–20Hz+) | Short abrupt transients |
| **ambient_dread** | Dissonance (minor 2nds, tritones) in sustained elements | Ultra-slow modulation (0.05–0.3Hz) on pitch/filter | Dense long-tail reverb (80%+ wet, 4s+) |
| **lo_fi_chill** | Tape saturation (perceivable warmth + compression) | Pitched imperfections (slight random detune/timing) | Warm filter character (LPF 1.5–2.5kHz) |
| **chiptune** | Pure square/triangle with minimal filtering | Staccato articulation (near-zero sustain) | PWM on square wave (duty cycle modulation) |
| **noir_jazz** | Warm resonant filter (presence peak 3–4kHz) | Light tube/tape saturation throughout | Legato envelope (slow attack, extended release) |
| **industrial** | Aggressive distortion (waveshaper gain 1.5+) | Harsh metallic filter resonance (Q≥8) | Noise-based textures |
| **vaporwave** | Heavy reverb (60–80% wet, 3s+ tail) | Analog imperfections (pitch wobble, tape saturation) | Slow tempo reinforcing dreaminess |
| **breakbeat** | Tight punchy transients (5–20ms attack) | Bright presence peak (3–5kHz) cutting through drums | Percussive staccato articulation |

### 3.2 Current Synthesis Chain Audit

Our rebuilt `_playMelodyNote()` (SPEC_032) has per-palette AHDSR, filter envelope, legato/staccato, PWM, and detune. **This is solid for the melody lead.** The main gap isn't in the synth chain — it's in the musical logic feeding it (Part 1 above).

ChordTrack (SPEC_032 #34, not yet built) will need its own synthesis parameters. The spec already defines per-palette envelope/filter/gain settings for stabs. **The chord synthesis design is adequate.**

### 3.3 Psychoacoustic Tuning Notes

**Attack time → perceived aggression:**
- ≤5ms: percussive, aggressive → dark_techno, industrial, breakbeat, chiptune
- 5–30ms: energetic, clear → synthwave, breakbeat
- 50–100ms: balanced, warm → lo_fi, vaporwave, noir_jazz
- ≥300ms: ambient, floating → ambient_dread

**Filter cutoff → perceived warmth/brightness:**
- <1kHz: dark, warm → ambient_dread bass, noir_jazz pads
- 1–2.5kHz: balanced warm → lo_fi, vaporwave, noir_jazz leads
- 2–4kHz: present, clear → dark_techno, breakbeat leads
- 4–8kHz: bright, cutting → synthwave, chiptune
- >8kHz: harsh, piercing → industrial, glitch

**Fletcher-Munson at low playback volumes:** Bass below 100Hz is nearly inaudible at quiet levels. Palettes designed for headphone listening (lo_fi, ambient) should emphasize mid-bass (100–300Hz) over sub-bass. Club palettes (techno, breakbeat) can lean on sub-bass.

---

## Part 4 — Procedural Music Best Practices

### 4.1 Why Procedural Music Sounds "Procedural" (Bad)

From research on the audio uncanny valley:

1. **Timing perfection** — Machines play quantized; humans have micro-timing variations. Already partially addressed by our groove engine (swing, humanize).
2. **Repetitive phrasing without development** — Same melodic shapes at regular intervals without organic variation. **This is our biggest gap** — no motivic development.
3. **Harmonic predictability** — Repeating the same progressions without surprise. Our tension curve system addresses this partially.
4. **Lack of perceived intention** — Music sounds "designed by rule" not "designed by ear." Motivic development and phrase pairing would help.
5. **Texture sameness** — Same instruments/FX the whole time. Our phase system with staggered entry addresses this well.

### 4.2 Information Theory: Entropy and Surprise

**Key finding (PNAS, Current Biology):** Peak musical pleasure occurs with "high surprise in low-uncertainty contexts" — unexpected thing in a predictable song.

**Application to our phase system:**
- **Pulse/Swell** = low entropy. Establish clear motif, predictable harmonic rhythm. Set expectations.
- **Surge** = introduce variations. Transpose motifs, add extensions to chords. Moderate surprise.
- **Storm** = high surprise within established structure. Invert motifs, fragment them, accelerate harmonic rhythm.
- **Maelstrom** = maximum entropy. Break expectations. Chromatic substitutions, fragmentation, rhythmic chaos.
- **Decay** = return to original motif in simplified form. Resolution.

### 4.3 Lessons from Commercial Systems

**No Man's Sky:** Hybrid system — human-composed fragments assembled by rules. Key insight: *curated assembly > pure generation*. Our seed motif concept follows this principle.

**Brian Eno's Bloom:** Constrained rule set + harmonic coherence. Success comes from the *constraints* being musically intelligent, not from complexity. Our system already has good constraints (chord-tone revalidation, voice leading).

**What they all share:** Explicit hierarchical structure (short-term note logic + medium-term phrase structure + long-term arc). We have the long-term arc (Conductor → phases). We need to strengthen the medium-term (phrase pairing, motivic development).

---

## Part 5 — Future Palette Candidates

### Tier 1: Excellent Fit

| Palette | BPM | Key Identity | Why It Works | What It Adds |
|---|---|---|---|---|
| **Trance** | 128–135 | Euphoric arps, filter sweeps, sidechain, driving energy | Distinct from dark_techno (uplifting vs dark), clear 5-phase path | "Uplifting" emotional slot |
| **Dub Techno** | 110–125 | Minimal + massive echo/reverb, meditative, lots of space | Aligns with "radio station" fantasy, Brian Eno philosophy | FX artistry showcase |
| **UK Garage** | 130–140 | Reese bass (2 detuned sines), swing, syncopated, jazzy chords | FM synthesis showcase, fills "funk/groove" slot | Reese bass technique |
| **Detroit Techno** | 110–130 | Soulful, timbre-focused (not harmony-focused), filter manipulation | Distinct from dark_techno (soulful vs brooding) | Timbre-as-composition |
| **Psytrance** | 130–150 | Hypnotic pounding bass, layered synths, trippy LFO cascades | Fills "hypnotic/trippy" slot, excellent phase evolution | LFO-driven modulation |

### Tier 2: Good Fit (with caveats)

| Palette | Caveat |
|---|---|
| **House (deep)** | Risk overlapping dark_techno — needs clear warm/major identity |
| **Acid House** | Fun personality but lower priority than Tier 1 |
| **Drum & Bass (liquid)** | Risk overlapping breakbeat — only if clearly differentiated by speed + soul |

### Tier 3: Skip

| Palette | Why Skip |
|---|---|
| Dubstep | Drop-focused structure doesn't fit 5-phase arc |
| Future Bass | Overlaps synthwave/trance territory |
| Trip-Hop | Sample-dependent, low BPM = slow phase evolution |
| Shoegaze/Darkwave | Overlaps ambient_dread |
| Witch House | Too niche, overlaps ambient_dread + industrial |
| Minimal Techno | Overlaps dark_techno |

### Future-Proofing Notes

All Tier 1 candidates are fully synthesizable with Web Audio API (oscillators + filters + envelopes + LFOs). No architectural changes needed — they fit our existing palette schema. Key new techniques they'd introduce:

- **Trance:** Filter sweep risers (already possible with LFO on BiquadFilterNode)
- **Dub Techno:** Comb filter reverb (DelayNode with feedback)
- **UK Garage:** FM synthesis (OscillatorNode frequency modulated by another OscillatorNode's gain output)
- **Detroit Techno:** Timbre-focused composition (filter envelope as primary "melody")
- **Psytrance:** Multi-rate LFO stacking (LFO modulating another LFO's depth)

---

## Part 6 — Priority Map: What to Build

### Immediate (within current SPEC_032 build cycle)

These are refinements to the melody and chord systems already being built:

1. **Chord-melody collision avoidance** — ChordTrack should not double melody note at same octave
2. **Register enforcement** — octave 3 = max 2 chord voices, octave 4+ = unrestricted
3. **Phase-aware voicing complexity** — extensions only at Storm+ for palettes that support them

### Near-Term (next plan session, new spec)

These require a melody engine evolution spec:

4. **Seed motif system** — generate a motif at song/cycle start, derive phrases from it
5. **Contour bias per palette** — weight Markov output toward genre-appropriate shapes
6. **I-R constraint post-filter** — enforce gap-fill and direction-reversal rules
7. **Antecedent-consequent phrase pairing** — question/answer phrase structure
8. **Per-palette interval affinity** — soft bias toward genre-defining intervals

### Medium-Term (after melody evolution)

9. **Phase-driven harmonic rhythm** — chord change rate accelerates with phase
10. **Extension ramp by phase** — triads at Swell, 7ths at Surge, full extensions at Storm+
11. **Per-palette voicing engine** — drop-2 for jazz, power chords for synthwave, etc.
12. **Melodic rhythm extensions** — syncopation probability, dotted bias, rubato

### Long-Term (after core musicality is solid)

13. **New palettes** — Trance and Dub Techno first (safest bets, most distinct)
14. **Call-and-response between melody and bass/chords**
15. **Information-theoretic surprise control** — explicit entropy management per phase

---

## Sources

### Music Theory & Cognition
- Narmour, E. — Implication-Realization model (melodic expectation)
- Zajonc, R. — Mere exposure effect (repetition preference, 10–20 exposures optimal)
- Huron, D. — Sweet Anticipation (information theory in music perception)
- Gold, Pearce, et al. — "Uncertainty and Surprise Jointly Predict Musical Pleasure" (Current Biology, 2019)
- Cheung, Harrison, et al. — "Predictability and the pleasure of music" (PNAS, 2025)

### Psychoacoustics
- Fletcher-Munson equal-loudness contours (bass perception at low volumes)
- Critical band theory (register-dependent roughness/beating)
- Plomp & Levelt — sensory consonance model

### Sound Design & Synthesis
- Web Audio API documentation (MDN)
- Attack Magazine — chord stab synthesis, detuned pad techniques
- Various synthesis tutorials per genre (see research agents for full URLs)

### Procedural Music
- No Man's Sky (GDC Vault) — hybrid generative/curated approach
- Brian Eno — generative music philosophy (Bloom, Reflection)
- Music Transformer (Google Magenta) — long-term structure in neural generation
- ISMIR transactions — steerable generation with long-range constraints
