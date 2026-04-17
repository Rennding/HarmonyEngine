# SPEC_039 — Melody Rhythm + Palette Character Fix

**Status:** Draft  
**Model:** Opus  
**Depends on:** #38 (melody rhythm extensions — built)  
**Fixes:** QA feedback on #38 (qa-improve)

---

## 1 · Problem summary

Three distinct issues found in QA of #38:

### 1a · noir_jazz feels like ambient_dread, not jazz
**Root cause: swing inheritance + syncopation stacking.**

noir_jazz has `swingInherit: true` (swing=0.40, very heavy) AND `syncopationProbability: 0.70`. Both act on `subTime` simultaneously. The swing already delays every odd 8th note by 40% of the sub-duration. Then syncopation pulls 70% of notes *back* by 0.5× subDur. Net result: notes cluster chaotically off the beat, losing jazz feel and sounding more like ambient_dread's freeform rubato drift. The scale is also `harmonicMinor` which shares character with `locrian` (ambient_dread) when rhythmic identity is lost.

**Fix:** Syncopation and swing must be mutually exclusive per-step. When swing shifts an odd step, skip syncopation on that step. Additionally, noir_jazz's `syncopationProbability` is too high (0.70) for the subdivide='8th' grid — jazz syncopation is about *anticipating the beat*, not randomizing every 8th note. Lower to 0.35–0.45.

### 1b · Note pops in synthwave (and noir_jazz)
**Root cause: attack too short relative to note density.**

synthwave melody config has `attack: 0.04` with `legato: true`. When a new phrase starts (non-legato path = fresh oscillator chain), the gain envelope starts from 0.0001 and ramps to finalGain in 40ms. At synthwave BPM (100–120), a beat is 500–600ms, an 8th is 250–300ms. With `syncopationProbability: 0.35` and `dottedBias: 0.25`, some notes land very close together. The fresh chain on phrase-start hits with a sharp transient. 

noir_jazz has `attack: 0.12` which is better, but the same issue occurs at phrase boundaries when the legato chain is killed and restarted. The kill+restart gap is only 20ms (`_killLiveVoice` ramps to 0.0001 in 0.02s) but the new chain starts immediately at time, causing a brief double-trigger click.

**Fix:** 
- synthwave: increase `attack` from 0.04 to 0.08. Keeps anthem feel, removes transient pop.
- Both: add a 20ms guard gap between `_killLiveVoice` and the new chain start on phrase boundary. Done by passing `time + 0.02` as the start time of the fresh chain when a live voice was just killed.

### 1c · ambient_dread plucks sound identical to noir_jazz plucks — both too aggressive
**Root cause: the melody wavetable or oscillator type is effectively the same for both, and the AHDSR envelope for ambient_dread has `attack: 0.15` but `sustainLevel: 0.7` with `release: 0.5` which produces a full sustaining sound — not a pluck at all.**

Wait — Aram says "plucks". Neither palette is configured for pluck. The term "pluck" here refers to the melodic notes sounding short and percussive rather than smooth and legato. This is likely because:
- ambient_dread has `legato: true` but `legatoTime: 0.12`. If the rubato drift (`±12.5ms`) or rest timing causes `this._liveNoteEnd <= time` check to fail, each note falls into the *non-legato path* and creates a new chain — giving a repeated pluck character.
- noir_jazz has the same issue: `rubato: true` + random subTime drift can push the scheduled note *after* `_liveNoteEnd`, breaking legato continuity.

**Root cause confirmed:** `_liveNoteEnd` is computed as `noteOff + 0.05`, where `noteOff = time + dur`. `dur = noteBasis * durFactor` where `noteBasis = subDurHint`. At 8th-note subdivision with `holdProbability: 0.40`, when a hold is skipped, the next note's scheduled time may exceed `_liveNoteEnd` of the previous note, collapsing the legato chain.

**Fix:**
- Extend `_liveNoteEnd` guard: change `+ 0.05` to `+ 0.15` for legato palettes. This gives more overlap tolerance.
- ambient_dread: `attack: 0.15` is fine for legato. But when the non-legato path fires (chain restart), it sounds like an aggressive pluck because the envelope shoots up in 0.15s but the release is `0.5s` with `sustainLevel: 0.7` — that's actually a smooth note. The "aggression" is the transient of a fresh chain. Apply same 20ms guard gap fix as 1b.
- noir_jazz same.

**Additionally:** ambient_dread and noir_jazz sound similar because they share scale affinity (locrian vs harmonicMinor), similar rubato/swing configs, and now identical melody failure mode (broken legato = plucks). The distinct fix for noir_jazz's *character* is issue 1a (swing+syncopation). ambient_dread's distinct character (eerie drift) requires its legato to hold reliably.

---

## 2 · Scope

Three targeted fixes, all in `src/melody.js` and `src/harmony.js`:

### Fix A — Swing × syncopation mutual exclusion (melody.js)
In `tick()`, where syncopation is applied (line ~628): if `swingInherit` is true AND the current step is an odd step (would receive swing delay), skip syncopation. Swing already displaced this step; syncopation would double-displace it.

```
// Current code (line 628–632):
if (this._syncopationProbability > 0 && rng() < this._syncopationProbability) {
  subTime = Math.max(beatTime, subTime - syncShift);
}

// Fixed:
var isSwungStep = this._swingInherit && (this._melodyStep % 2 === 1);
if (!isSwungStep && this._syncopationProbability > 0 && rng() < this._syncopationProbability) {
  subTime = Math.max(beatTime, subTime - syncShift);
}
```

### Fix B — noir_jazz syncopation probability (harmony.js)
Lower `syncopationProbability` from `0.70` to `0.40`.

Jazz anticipation: ~40% of 8th notes push slightly ahead of the beat. 70% was turning every note into an off-beat event, which at heavy swing amplified the chaos.

### Fix C — Attack + phrase-boundary guard (melody.js + harmony.js)
**melody.js `_playMelodyNote`:** When a live voice was just killed (i.e. `this._liveOsc` was set before `_killLiveVoice` was called), offset the new chain start by `+0.02s` to prevent double-trigger click.

Implement by passing `startTime = time + 0.02` to `osc.start()` and setting all envelope/filter scheduled values from `startTime` instead of `time` when chain was freshly killed. Guard this with a local flag: `var freshKill = !!this._liveOsc` (check before calling `_killLiveVoice`).

**melody.js `_liveNoteEnd`:** Change guard extension from `+ 0.05` to `+ 0.15` (line ~1419):
```
this._liveNoteEnd = noteOff + 0.15;  // was + 0.05
```
Also in legato re-trigger path (line ~1419): same change.

**harmony.js synthwave:** Increase `attack` from `0.04` to `0.08`.

### Fix D — ambient_dread / noir_jazz melody gain scalar (harmony.js)
ambient_dread currently has `gainScalar: 0.9`. The "too much" complaint about plucks partly comes from each fresh chain starting at full volume. After legato fix, this should improve. If still too present, reduce to `0.75`.

noir_jazz `gainScalar: 1.0` — keep, as jazz melody should cut through.

---

## 3 · What NOT to change

- Markov matrices for noir_jazz or ambient_dread — scale/pitch character is correct
- ambient_dread `rubato: true` — correct, that's the eerie drift
- noir_jazz `swingInherit: true` — correct, that's the jazz feel
- `_PHASE_DENSITY` rest ranges — correct
- ChordTrack, bass, drums for any palette

---

## 4 · Testing checklist

1. **noir_jazz** — play to Swell/Surge. Notes should feel jazz-like: swung 8ths that occasionally push ahead of the beat (not chaotically off-grid). No confusion with ambient_dread character.
2. **ambient_dread** — notes should be smooth and legato, not plucky. Long held tones with eerie drift, not repeated attack transients.
3. **synthwave** — no pops at phrase starts. Anthem feel intact. Syncopation still present but not overlapping with swing.
4. **noir_jazz vs ambient_dread** — they should sound clearly different. Jazz = swung, articulate, bar-aligned phrases. Dread = floating, eerie, no grid.
5. **dark_techno + glitch** — verify no regression (these don't use swingInherit or legato).

---

## 5 · Files changed

- `src/melody.js` — Fix A (syncopation guard), Fix C (liveNoteEnd + freshKill gap)
- `src/harmony.js` — Fix B (noir_jazz syncopationProbability), Fix C (synthwave attack), Fix D (ambient_dread gainScalar review)
