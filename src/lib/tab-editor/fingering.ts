/**
 * Classical-guitar fingering: data model helpers, note editing and an
 * automatic right-hand (p i m a) planner.
 *
 * Two independent annotations live on every alphaTab `Note`:
 *
 * - `rightHandFinger` — which finger plucks the string. Rendered as the
 *   classical letters p (pulgar/thumb), i (índice), m (medio), a (anular),
 *   c (meñique).
 * - `leftHandFinger` — which finger frets the note. Rendered as T, 1, 2, 3, 4.
 *
 * Both survive a Guitar Pro 7 round-trip (`<LeftFingering>` / `<RightFingering>`
 * in the GPIF payload), so they are safe to store and safe across undo, which
 * snapshots the score as GP7 bytes.
 *
 * String numbering: alphaTab's `note.string` is 1-based from the *lowest*
 * pitched string, i.e. on a 6-string guitar string 1 is the physical 6th (low
 * E) and string 6 is the physical 1st (high E). Everything below works in
 * "physical" numbering (1 = highest pitch) because that is how the classical
 * right-hand rules are stated.
 */
import {model} from '@coderline/alphatab';
import type {EditorCursor} from './useEditorCursor';
import {getBeat, findNoteOnString, finishScore} from './scoreOperations';

const {Fingers} = model;

type Score = InstanceType<typeof model.Score>;
type NoteInstance = InstanceType<typeof model.Note>;
type FingerValue = number;

/** Right-hand (plucking) fingers, classical notation. */
export type RightHandFinger = 'p' | 'i' | 'm' | 'a' | 'c';
/** Left-hand (fretting) fingers. `t` = thumb over the neck. */
export type LeftHandFinger = 't' | '1' | '2' | '3' | '4';

export const RIGHT_HAND_FINGERS: RightHandFinger[] = ['p', 'i', 'm', 'a', 'c'];
export const LEFT_HAND_FINGERS: LeftHandFinger[] = ['1', '2', '3', '4', 't'];

const RIGHT_TO_ALPHATAB: Record<RightHandFinger, FingerValue> = {
  p: Fingers.Thumb,
  i: Fingers.IndexFinger,
  m: Fingers.MiddleFinger,
  a: Fingers.AnnularFinger,
  c: Fingers.LittleFinger,
};

const LEFT_TO_ALPHATAB: Record<LeftHandFinger, FingerValue> = {
  t: Fingers.Thumb,
  '1': Fingers.IndexFinger,
  '2': Fingers.MiddleFinger,
  '3': Fingers.AnnularFinger,
  '4': Fingers.LittleFinger,
};

export function rightHandFingerToAlphaTab(finger: RightHandFinger): FingerValue {
  return RIGHT_TO_ALPHATAB[finger];
}

export function leftHandFingerToAlphaTab(finger: LeftHandFinger): FingerValue {
  return LEFT_TO_ALPHATAB[finger];
}

export function alphaTabToRightHandFinger(value: FingerValue): RightHandFinger | null {
  for (const f of RIGHT_HAND_FINGERS) {
    if (RIGHT_TO_ALPHATAB[f] === value) return f;
  }
  return null;
}

export function alphaTabToLeftHandFinger(value: FingerValue): LeftHandFinger | null {
  for (const f of LEFT_HAND_FINGERS) {
    if (LEFT_TO_ALPHATAB[f] === value) return f;
  }
  return null;
}

// ── Per-note editing ────────────────────────────────────────────────────────

export interface NoteFingering {
  left: LeftHandFinger | null;
  right: RightHandFinger | null;
}

/** Read the fingering of the note under the cursor, or `null` if there is none. */
export function getNoteFingering(score: Score, cursor: EditorCursor): NoteFingering | null {
  const beat = getBeat(score, cursor);
  if (!beat) return null;
  const note = findNoteOnString(beat, cursor.stringNumber);
  if (!note) return null;
  return {
    left: alphaTabToLeftHandFinger(note.leftHandFinger),
    right: alphaTabToRightHandFinger(note.rightHandFinger),
  };
}

/**
 * Set (or clear, with `null`) the right-hand finger of the note under the cursor.
 * Returns true when a note was changed.
 */
export function setRightHandFinger(
  score: Score,
  cursor: EditorCursor,
  finger: RightHandFinger | null,
): boolean {
  const beat = getBeat(score, cursor);
  if (!beat) return false;
  const note = findNoteOnString(beat, cursor.stringNumber);
  if (!note) return false;
  const next = finger === null ? Fingers.Unknown : RIGHT_TO_ALPHATAB[finger];
  // Pressing the same finger again clears it, like the effect toggles.
  note.rightHandFinger = note.rightHandFinger === next ? Fingers.Unknown : next;
  finishScore(score);
  return true;
}

/**
 * Set (or clear, with `null`) the left-hand finger of the note under the cursor.
 * Returns true when a note was changed.
 */
export function setLeftHandFinger(
  score: Score,
  cursor: EditorCursor,
  finger: LeftHandFinger | null,
): boolean {
  const beat = getBeat(score, cursor);
  if (!beat) return false;
  const note = findNoteOnString(beat, cursor.stringNumber);
  if (!note) return false;
  const next = finger === null ? Fingers.Unknown : LEFT_TO_ALPHATAB[finger];
  note.leftHandFinger = note.leftHandFinger === next ? Fingers.Unknown : next;
  finishScore(score);
  return true;
}

/** Remove both fingerings from the note under the cursor. */
export function clearNoteFingering(score: Score, cursor: EditorCursor): boolean {
  const beat = getBeat(score, cursor);
  if (!beat) return false;
  const note = findNoteOnString(beat, cursor.stringNumber);
  if (!note) return false;
  note.leftHandFinger = Fingers.Unknown;
  note.rightHandFinger = Fingers.Unknown;
  finishScore(score);
  return true;
}

// ── Automatic right-hand fingering ──────────────────────────────────────────

/** One beat as seen by the planner: the alphaTab string numbers it plucks. */
export interface PlannerBeat {
  /** alphaTab string numbers (1 = lowest pitch). Empty for a rest. */
  strings: number[];
}

export interface RightHandPlanOptions {
  /** Number of strings on the instrument. Defaults to 6. */
  stringCount?: number;
}

/** Treble strings in physical numbering get a fixed finger. */
const TREBLE_BASE: Record<number, RightHandFinger> = {1: 'a', 2: 'm', 3: 'i'};
/** When a finger would repeat on consecutive notes, swap to its partner. */
const ALTERNATE: Record<RightHandFinger, RightHandFinger> = {
  p: 'p',
  i: 'm',
  m: 'i',
  a: 'm',
  c: 'a',
};
/** Pluck fingers available above the thumb, lowest string to highest. */
const PLUCK_ORDER: RightHandFinger[] = ['i', 'm', 'a'];

/**
 * Plan a classical right-hand fingering for a stream of beats.
 *
 * Rules, in the order they are applied:
 *
 * 1. **The thumb owns the bass.** Any note on the lowest three strings
 *    (physical 6/5/4) is a thumb note. In a chord only the lowest bass note
 *    keeps `p`; the others join the pluck pool so the chord still rolls.
 * 2. **i/m/a own the treble.** Physical string 3 → `i`, 2 → `m`, 1 → `a`.
 * 3. **A chord never repeats a finger.** Pool members are assigned from the
 *    lowest-pitched upward with strictly increasing fingers (i → m → a), each
 *    starting no earlier than the finger its string would get on its own. More
 *    than four notes fall back to the thumb for the extra bass ones.
 * 4. **No same finger twice in a row.** On consecutive single notes a repeated
 *    i/m/a alternates with its partner (i↔m, a→m), which is how repeated notes
 *    are actually played. The thumb is allowed to repeat.
 *
 * Returns, per beat, one finger per entry of `strings` (same order), or `null`
 * where no finger could be assigned.
 */
export function planRightHandFingering(
  beats: PlannerBeat[],
  options: RightHandPlanOptions = {},
): (RightHandFinger | null)[][] {
  const stringCount = options.stringCount ?? 6;
  const result: (RightHandFinger | null)[][] = [];
  let lastSingleFinger: RightHandFinger | null = null;

  for (const beat of beats) {
    const count = beat.strings.length;
    if (count === 0) {
      result.push([]);
      lastSingleFinger = null;
      continue;
    }

    // physical 1 = highest pitched string
    const entries = beat.strings.map((s, idx) => ({idx, phys: stringCount + 1 - s}));
    const assigned: (RightHandFinger | null)[] = new Array(count).fill(null);

    if (count === 1) {
      const {phys} = entries[0];
      let finger: RightHandFinger = phys >= 4 ? 'p' : (TREBLE_BASE[phys] ?? 'a');
      if (finger !== 'p' && lastSingleFinger === finger) {
        finger = ALTERNATE[finger];
      }
      assigned[0] = finger;
      lastSingleFinger = finger;
      result.push(assigned);
      continue;
    }

    // Chord: lowest pitch first.
    const byPitch = [...entries].sort((a, b) => b.phys - a.phys);
    const bass = byPitch.filter(e => e.phys >= 4);
    let pool = byPitch.filter(e => e.phys < 4);

    if (bass.length > 0) {
      // The lowest note is the thumb's; any remaining bass notes get plucked.
      assigned[bass[0].idx] = 'p';
      pool = [...bass.slice(1), ...pool];
    }

    // At most three notes can be plucked; extra bass notes go back to the thumb.
    while (pool.length > PLUCK_ORDER.length) {
      const extra = pool.shift()!;
      assigned[extra.idx] = 'p';
    }

    let nextIndex = 0;
    for (const entry of pool) {
      const preferred = entry.phys < 4 ? PLUCK_ORDER.indexOf(TREBLE_BASE[entry.phys]) : 0;
      const index = Math.min(Math.max(preferred, nextIndex), PLUCK_ORDER.length - 1);
      assigned[entry.idx] = PLUCK_ORDER[index];
      nextIndex = index + 1;
    }

    lastSingleFinger = null;
    result.push(assigned);
  }

  return result;
}

export interface ApplyRightHandFingeringOptions {
  trackIndex: number;
  voiceIndex?: number;
  /** First bar, inclusive. Defaults to the first bar of the track. */
  startBar?: number;
  /** Last bar, inclusive. Defaults to the last bar of the track. */
  endBar?: number;
  /** Replace fingering that is already there. Defaults to true. */
  overwrite?: boolean;
}

interface CollectedNote {
  note: NoteInstance;
}

function collectBeats(score: Score, options: ApplyRightHandFingeringOptions) {
  const track = score.tracks[options.trackIndex];
  const staff = track?.staves[0];
  if (!staff || staff.isPercussion) return null;

  const voiceIndex = options.voiceIndex ?? 0;
  const lastBar = staff.bars.length - 1;
  const start = Math.max(0, options.startBar ?? 0);
  const end = Math.min(lastBar, options.endBar ?? lastBar);

  const plannerBeats: PlannerBeat[] = [];
  const noteRows: CollectedNote[][] = [];

  for (let barIndex = start; barIndex <= end; barIndex++) {
    const voice = staff.bars[barIndex]?.voices[voiceIndex];
    if (!voice) continue;
    for (const beat of voice.beats) {
      const notes = beat.isRest ? [] : beat.notes.filter(n => n.isVisible !== false);
      plannerBeats.push({strings: notes.map(n => n.string)});
      noteRows.push(notes.map(note => ({note})));
    }
  }

  const stringCount = staff.stringTuning?.tunings?.length ?? 6;
  return {plannerBeats, noteRows, stringCount};
}

/**
 * Compute and write a classical right-hand fingering over a bar range (or the
 * whole track). Returns the number of notes that were annotated.
 *
 * Only `rightHandFinger` is touched — frets, strings, durations and left-hand
 * fingering are left exactly as they were.
 */
export function applyRightHandFingering(
  score: Score,
  options: ApplyRightHandFingeringOptions,
): number {
  const collected = collectBeats(score, options);
  if (!collected) return 0;

  const {plannerBeats, noteRows, stringCount} = collected;
  const plan = planRightHandFingering(plannerBeats, {stringCount});
  const overwrite = options.overwrite ?? true;

  let changed = 0;
  for (let b = 0; b < noteRows.length; b++) {
    const row = noteRows[b];
    const fingers = plan[b] ?? [];
    for (let n = 0; n < row.length; n++) {
      const finger = fingers[n];
      if (!finger) continue;
      const {note} = row[n];
      if (!overwrite && note.rightHandFinger !== Fingers.Unknown) continue;
      const value = RIGHT_TO_ALPHATAB[finger];
      if (note.rightHandFinger === value) continue;
      note.rightHandFinger = value;
      changed++;
    }
  }

  if (changed > 0) finishScore(score);
  return changed;
}

/** Remove the right-hand fingering over a bar range (or the whole track). */
export function clearRightHandFingering(
  score: Score,
  options: ApplyRightHandFingeringOptions,
): number {
  const collected = collectBeats(score, options);
  if (!collected) return 0;

  let changed = 0;
  for (const row of collected.noteRows) {
    for (const {note} of row) {
      if (note.rightHandFinger === Fingers.Unknown) continue;
      note.rightHandFinger = Fingers.Unknown;
      changed++;
    }
  }
  if (changed > 0) finishScore(score);
  return changed;
}

/** Count how many notes in the track already carry any fingering. */
export function countFingeredNotes(score: Score, trackIndex: number): number {
  const collected = collectBeats(score, {trackIndex});
  if (!collected) return 0;
  let total = 0;
  for (const row of collected.noteRows) {
    for (const {note} of row) {
      if (note.isFingering) total++;
    }
  }
  return total;
}
