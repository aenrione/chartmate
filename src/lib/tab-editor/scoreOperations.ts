import {model, Settings} from '@coderline/alphatab';
import type {EditorCursor} from './useEditorCursor';
// Percussion uses alphaTab's built-in PercussionMapper

const {
  Beat,
  Note,
  Bar,
  Voice,
  MasterBar,
  Duration,
  SlideOutType,
  HarmonicType,
  VibratoType,
  AccentuationType,
  BendType,
  BendPoint,
} = model;

type Score = InstanceType<typeof model.Score>;
type BeatInstance = InstanceType<typeof Beat>;
type NoteInstance = InstanceType<typeof Note>;

function getVoice(score: Score, cursor: EditorCursor) {
  const track = score.tracks[cursor.trackIndex];
  if (!track) return null;
  const staff = track.staves[0];
  if (!staff) return null;
  const bar = staff.bars[cursor.barIndex];
  if (!bar) return null;
  return bar.voices[cursor.voiceIndex] ?? null;
}

function getBeat(score: Score, cursor: EditorCursor): BeatInstance | null {
  const voice = getVoice(score, cursor);
  if (!voice) return null;
  return voice.beats[cursor.beatIndex] ?? null;
}

function findNoteOnString(beat: BeatInstance, stringNumber: number): NoteInstance | null {
  for (const note of beat.notes) {
    if (note.string === stringNumber) return note;
  }
  return null;
}

function finishScore(score: Score) {
  score.finish(new Settings());
}

// --- Duration helpers ---

/** Map Duration enum to fraction of a whole note */
const DURATION_VALUES: Record<number, number> = {
  [Duration.Whole]: 1,
  [Duration.Half]: 0.5,
  [Duration.Quarter]: 0.25,
  [Duration.Eighth]: 0.125,
  [Duration.Sixteenth]: 0.0625,
  [Duration.ThirtySecond]: 0.03125,
  [Duration.SixtyFourth]: 0.015625,
};

function beatDurationValue(beat: BeatInstance): number {
  let val = DURATION_VALUES[beat.duration] ?? 0.25;
  if (beat.dots === 1) val *= 1.5;
  if (beat.dots === 2) val *= 1.75;
  return val;
}

/** Sum of beat durations in a voice, as fraction of a whole note */
function voiceFillAmount(voice: InstanceType<typeof model.Voice>): number {
  let total = 0;
  for (const b of voice.beats) {
    total += beatDurationValue(b);
  }
  return total;
}

/** How much space a bar has based on time signature (in whole-note fractions) */
function barCapacity(score: Score, barIndex: number): number {
  const mb = score.masterBars[barIndex];
  if (!mb) return 1;
  return mb.timeSignatureNumerator / mb.timeSignatureDenominator;
}

// --- Note operations ---

export function setNote(score: Score, cursor: EditorCursor, fret: number): void {
  const beat = getBeat(score, cursor);
  if (!beat) return;

  const existing = findNoteOnString(beat, cursor.stringNumber);
  if (existing) {
    existing.fret = fret;
  } else {
    const note = new Note();
    note.string = cursor.stringNumber;
    note.fret = fret;
    beat.addNote(note);
  }

  beat.isEmpty = false;

  finishScore(score);
}

/**
 * Place a note and set up the next beat in the bar.
 * Returns the cursor position for the next input, or null if bar is full.
 */
export function setNoteAndAdvance(
  score: Score,
  cursor: EditorCursor,
  fret: number,
  duration: number,
): EditorCursor | null {
  const voice = getVoice(score, cursor);
  if (!voice) return null;

  const beat = getBeat(score, cursor);
  if (!beat) return null;

  // Place the note
  const existing = findNoteOnString(beat, cursor.stringNumber);
  if (existing) {
    existing.fret = fret;
  } else {
    const note = new Note();
    note.string = cursor.stringNumber;
    note.fret = fret;
    beat.addNote(note);
  }
  beat.isEmpty = false;
  beat.duration = duration;

  // Check if there's a next beat already
  if (cursor.beatIndex < voice.beats.length - 1) {
    // Move to next existing beat
    finishScore(score);
    return {...cursor, beatIndex: cursor.beatIndex + 1};
  }

  // Check if bar has space for another beat
  const capacity = barCapacity(score, cursor.barIndex);
  const filled = voiceFillAmount(voice);

  if (filled < capacity - 0.001) {
    // Insert a new rest beat for the next input
    const newBeat = new Beat();
    newBeat.isEmpty = true;
    newBeat.duration = duration; // same duration as what was just entered

    voice.beats.splice(cursor.beatIndex + 1, 0, newBeat);
    const bar = voice.bar;
    if (bar) repairBarLinks(bar.staff);

    finishScore(score);
    return {...cursor, beatIndex: cursor.beatIndex + 1};
  }

  // Bar is full — advance to next bar's first beat
  const staff = score.tracks[cursor.trackIndex]?.staves[0];
  if (staff && cursor.barIndex < staff.bars.length - 1) {
    finishScore(score);
    return {...cursor, barIndex: cursor.barIndex + 1, beatIndex: 0};
  }

  // Last bar and it's full
  finishScore(score);
  return null;
}

/**
 * Insert a rest beat at the cursor position.
 * If the current beat is empty, it stays as a rest with the given duration.
 * If it has notes, insert a new rest beat after it.
 */
export function insertRest(score: Score, cursor: EditorCursor, duration: number): EditorCursor | null {
  const voice = getVoice(score, cursor);
  if (!voice) return null;
  const beat = getBeat(score, cursor);
  if (!beat) return null;

  if (beat.isEmpty && beat.notes.length === 0) {
    // Current beat is already a rest — just set its duration
    beat.duration = duration;
    finishScore(score);
    // Advance same as setNoteAndAdvance would
    if (cursor.beatIndex < voice.beats.length - 1) {
      return {...cursor, beatIndex: cursor.beatIndex + 1};
    }
    const capacity = barCapacity(score, cursor.barIndex);
    const filled = voiceFillAmount(voice);
    if (filled < capacity - 0.001) {
      const newBeat = new Beat();
      newBeat.isEmpty = true;
      newBeat.duration = duration;
      voice.beats.splice(cursor.beatIndex + 1, 0, newBeat);
      const bar = voice.bar;
      if (bar) repairBarLinks(bar.staff);
      finishScore(score);
      return {...cursor, beatIndex: cursor.beatIndex + 1};
    }
    const staff = score.tracks[cursor.trackIndex]?.staves[0];
    if (staff && cursor.barIndex < staff.bars.length - 1) {
      return {...cursor, barIndex: cursor.barIndex + 1, beatIndex: 0};
    }
    return null;
  }

  // Current beat has notes — insert a rest after it
  const capacity = barCapacity(score, cursor.barIndex);
  const filled = voiceFillAmount(voice);
  if (filled >= capacity - 0.001) return null; // bar full

  const restBeat = new Beat();
  restBeat.isEmpty = true;
  restBeat.duration = duration;
  voice.beats.splice(cursor.beatIndex + 1, 0, restBeat);
  const bar = voice.bar;
  if (bar) repairBarLinks(bar.staff);
  finishScore(score);
  return {...cursor, beatIndex: cursor.beatIndex + 1};
}

export function removeNote(score: Score, cursor: EditorCursor): void {
  const beat = getBeat(score, cursor);
  if (!beat) return;

  const noteIdx = beat.notes.findIndex((n: NoteInstance) => n.string === cursor.stringNumber);
  if (noteIdx >= 0) {
    beat.notes.splice(noteIdx, 1);
    if (beat.notes.length === 0) {
      beat.isEmpty = true;
    }
    finishScore(score);
  }
}

export function toggleRest(score: Score, cursor: EditorCursor): void {
  const beat = getBeat(score, cursor);
  if (!beat) return;

  if (beat.isEmpty) {
    // Make it a non-rest beat (but with no notes yet)
    beat.isEmpty = false;
  } else {
    // Clear all notes and make it a rest
    beat.notes.length = 0;
    beat.isEmpty = true;
  }
  finishScore(score);
}

// --- Duration operations ---

export function setBeatDuration(score: Score, cursor: EditorCursor, duration: number): void {
  const beat = getBeat(score, cursor);
  if (!beat) return;
  beat.duration = duration;
  finishScore(score);
}

export function toggleDot(score: Score, cursor: EditorCursor): void {
  const beat = getBeat(score, cursor);
  if (!beat) return;

  if (beat.dots === 0) {
    beat.dots = 1;
  } else if (beat.dots === 1) {
    beat.dots = 2; // double-dot
  } else {
    beat.dots = 0;
  }
  finishScore(score);
}

// --- Effect operations ---

export type NoteEffect =
  | 'hammerOn'
  | 'palmMute'
  | 'harmonic'
  | 'vibrato'
  | 'accent'
  | 'ghostNote'
  | 'tap';

export function toggleEffect(score: Score, cursor: EditorCursor, effect: NoteEffect): void {
  const beat = getBeat(score, cursor);
  if (!beat) return;

  const note = findNoteOnString(beat, cursor.stringNumber);
  if (!note) return;

  switch (effect) {
    case 'hammerOn':
      note.isHammerPullOrigin = !note.isHammerPullOrigin;
      break;
    case 'palmMute':
      note.isPalmMute = !note.isPalmMute;
      break;
    case 'harmonic':
      note.harmonicType =
        note.harmonicType === HarmonicType.Natural
          ? HarmonicType.None
          : HarmonicType.Natural;
      break;
    case 'vibrato':
      note.vibrato =
        note.vibrato === VibratoType.Slight
          ? VibratoType.None
          : VibratoType.Slight;
      break;
    case 'accent':
      note.accentuated =
        note.accentuated === AccentuationType.Normal
          ? AccentuationType.None
          : AccentuationType.Normal;
      break;
    case 'ghostNote':
      note.isGhost = !note.isGhost;
      break;
    case 'tap':
      beat.tap = !beat.tap;
      break;
  }
  finishScore(score);
}

export function toggleSlide(score: Score, cursor: EditorCursor): void {
  const beat = getBeat(score, cursor);
  if (!beat) return;
  const note = findNoteOnString(beat, cursor.stringNumber);
  if (!note) return;

  note.slideOutType =
    note.slideOutType === SlideOutType.Shift
      ? SlideOutType.None
      : SlideOutType.Shift;
  finishScore(score);
}

export function toggleBend(score: Score, cursor: EditorCursor): void {
  const beat = getBeat(score, cursor);
  if (!beat) return;
  const note = findNoteOnString(beat, cursor.stringNumber);
  if (!note) return;

  if (note.bendType === BendType.None) {
    // Add a full-step bend
    note.bendType = BendType.Bend;
    note.addBendPoint(new BendPoint(0, 0));
    note.addBendPoint(new BendPoint(60, 4)); // 4 quarter-tones = 1 full step
  } else {
    note.bendType = BendType.None;
    if (note.bendPoints) note.bendPoints.length = 0;
  }
  finishScore(score);
}

// --- Measure operations ---

/**
 * Rebuild parent references after splice operations.
 * alphaTab's addBar/addBeat set parent, index, and prev/next links.
 * After splicing, these are stale and must be repaired before finish().
 */
function repairBarLinks(staff: InstanceType<typeof model.Staff>) {
  for (let i = 0; i < staff.bars.length; i++) {
    const bar = staff.bars[i];
    bar.staff = staff;
    bar.index = i;
    bar.previousBar = i > 0 ? staff.bars[i - 1] : null;
    bar.nextBar = i < staff.bars.length - 1 ? staff.bars[i + 1] : null;
    // Repair voice/beat links within each bar
    for (const voice of bar.voices) {
      voice.bar = bar;
      for (let b = 0; b < voice.beats.length; b++) {
        const beat = voice.beats[b];
        beat.voice = voice;
        beat.index = b;
        beat.previousBeat = b > 0 ? voice.beats[b - 1] : null;
        beat.nextBeat = b < voice.beats.length - 1 ? voice.beats[b + 1] : null;
      }
    }
  }
}

function repairMasterBarLinks(score: Score) {
  for (let i = 0; i < score.masterBars.length; i++) {
    const mb = score.masterBars[i];
    mb.index = i;
    mb.previousMasterBar = i > 0 ? score.masterBars[i - 1] : null;
    mb.nextMasterBar = i < score.masterBars.length - 1 ? score.masterBars[i + 1] : null;
  }
}

export function insertMeasureAfter(score: Score, barIndex: number): void {
  const refMasterBar = score.masterBars[barIndex];
  const newMasterBar = new MasterBar();
  newMasterBar.timeSignatureNumerator = refMasterBar?.timeSignatureNumerator ?? 4;
  newMasterBar.timeSignatureDenominator = refMasterBar?.timeSignatureDenominator ?? 4;

  score.masterBars.splice(barIndex + 1, 0, newMasterBar);
  repairMasterBarLinks(score);

  for (const track of score.tracks) {
    for (const staff of track.staves) {
      const bar = new Bar();
      if (staff.isPercussion) {
        bar.clef = model.Clef.Neutral;
      }
      const voice = new Voice();
      bar.addVoice(voice);

      const rest = new Beat();
      rest.isEmpty = true;
      rest.duration = Duration.Whole;
      voice.addBeat(rest);

      staff.bars.splice(barIndex + 1, 0, bar);
      repairBarLinks(staff);
    }
  }

  finishScore(score);
}

export function deleteMeasure(score: Score, barIndex: number): void {
  if (score.masterBars.length <= 1) return;

  score.masterBars.splice(barIndex, 1);
  repairMasterBarLinks(score);

  for (const track of score.tracks) {
    for (const staff of track.staves) {
      staff.bars.splice(barIndex, 1);
      repairBarLinks(staff);
    }
  }

  finishScore(score);
}

export function duplicateMeasure(score: Score, barIndex: number): void {
  insertMeasureAfter(score, barIndex);
}

// --- Beat removal ---

/**
 * Remove a beat (column) from the bar entirely.
 * Returns the cursor to move to after removal, or null if removal isn't possible
 * (e.g. it's the only beat in the bar).
 */
export function removeBeat(score: Score, cursor: EditorCursor): EditorCursor | null {
  const voice = getVoice(score, cursor);
  if (!voice) return null;
  if (voice.beats.length <= 1) return null; // keep at least one beat per bar

  voice.beats.splice(cursor.beatIndex, 1);

  const bar = voice.bar;
  if (bar) repairBarLinks(bar.staff);

  finishScore(score);

  // Move cursor: stay at same index if possible, otherwise go back one
  const newBeatIndex = Math.min(cursor.beatIndex, voice.beats.length - 1);
  return {...cursor, beatIndex: newBeatIndex};
}

// --- Beat splitting (add a beat at cursor) ---

export function addBeatAfter(score: Score, cursor: EditorCursor, duration?: number): EditorCursor | null {
  const voice = getVoice(score, cursor);
  if (!voice) return null;

  // Check if bar has room for another beat
  const capacity = barCapacity(score, cursor.barIndex);
  const filled = voiceFillAmount(voice);
  const dur = duration ?? Duration.Quarter;
  const newBeatValue = DURATION_VALUES[dur] ?? 0.25;
  if (filled + newBeatValue > capacity + 0.001) return null; // bar full

  const newBeat = new Beat();
  newBeat.isEmpty = true;
  newBeat.duration = dur;

  // Use splice then repair links
  voice.beats.splice(cursor.beatIndex + 1, 0, newBeat);

  // Repair beat links within this voice
  const bar = voice.bar;
  if (bar) {
    repairBarLinks(bar.staff);
  } else {
    // Fallback: set minimum parent ref
    newBeat.voice = voice;
    newBeat.index = cursor.beatIndex + 1;
  }

  finishScore(score);

  return {
    ...cursor,
    beatIndex: cursor.beatIndex + 1,
  };
}

// --- Track operations ---

export interface TrackConfig {
  name: string;
  instrument: 'guitar' | 'bass' | 'drums';
  stringCount: number;
  tuning: number[]; // MIDI values low to high
  midiProgram?: number;
}

const GM_OVERDRIVEN_GUITAR = 29;
const GM_BASS_FINGER = 33;

export function addTrack(score: Score, config: TrackConfig): void {
  const {Track, Staff, PlaybackInformation, Tuning} = model;

  const track = new Track();
  track.name = config.name;
  track.shortName = config.name.substring(0, 3);

  const playback = new PlaybackInformation();
  playback.volume = 15;
  playback.balance = 8;
  playback.port = 0;
  playback.program = config.midiProgram ?? (config.instrument === 'bass' ? GM_BASS_FINGER : config.instrument === 'drums' ? 0 : GM_OVERDRIVEN_GUITAR);
  playback.primaryChannel = config.instrument === 'drums' ? 9 : score.tracks.length * 2;
  playback.secondaryChannel = playback.primaryChannel + (config.instrument === 'drums' ? 0 : 1);
  track.playbackInfo = playback;

  const staff = new Staff();
  if (config.instrument === 'drums') {
    staff.isPercussion = true;
    staff.showTablature = false;
    staff.showStandardNotation = true;
    // Leave percussionArticulations empty — alphaTab's built-in PercussionMapper handles it
  } else {
    staff.showTablature = true;
    staff.showStandardNotation = true;

    const reversed = [...config.tuning].reverse();
    const found = Tuning.findTuning(reversed);
    staff.stringTuning = found ?? new Tuning('Custom', reversed, false);
  }

  track.addStaff(staff);

  // Add bars matching existing master bars
  for (let m = 0; m < score.masterBars.length; m++) {
    const bar = new Bar();
    if (config.instrument === 'drums') {
      bar.clef = model.Clef.Neutral;
    }
    const voice = new Voice();
    bar.addVoice(voice);

    const rest = new Beat();
    rest.isEmpty = true;
    rest.duration = Duration.Whole;
    voice.addBeat(rest);

    staff.addBar(bar);
  }

  score.addTrack(track);
  finishScore(score);
}

export function removeTrack(score: Score, trackIndex: number): void {
  if (score.tracks.length <= 1) return; // Keep at least one track
  score.tracks.splice(trackIndex, 1);
  finishScore(score);
}

export function setTrackTuning(score: Score, trackIndex: number, tuning: number[]): void {
  const {Tuning} = model;
  const track = score.tracks[trackIndex];
  if (!track) return;
  const staff = track.staves[0];
  if (!staff) return;

  const reversed = [...tuning].reverse();
  const found = Tuning.findTuning(reversed);
  staff.stringTuning = found ?? new Tuning('Custom', reversed, false);
  finishScore(score);
}

export function setTempo(score: Score, bpm: number): void {
  const {Automation, AutomationType} = model;
  if (score.masterBars.length === 0) return;
  const firstBar = score.masterBars[0];

  const tempoAuto = new Automation();
  tempoAuto.isLinear = false;
  tempoAuto.ratioPosition = 0;
  tempoAuto.type = AutomationType.Tempo;
  tempoAuto.value = bpm;
  tempoAuto.text = '';
  firstBar.tempoAutomations = [tempoAuto];

  finishScore(score);
}

// --- Percussion note operations ---

/**
 * Toggle a percussion note on the current beat.
 * If the drum hit already exists, remove it. Otherwise add it.
 * Used for layering multiple drum hits (e.g., hi-hat + kick simultaneously).
 */
export function toggleDrumNote(score: Score, cursor: EditorCursor, midiNote: number): void {
  const beat = getBeat(score, cursor);
  if (!beat) return;

  // Check if this articulation is already on the beat — toggle it off
  const existingIdx = beat.notes.findIndex((n: NoteInstance) => n.percussionArticulation === midiNote);
  if (existingIdx >= 0) {
    beat.notes.splice(existingIdx, 1);
    if (beat.notes.length === 0) beat.isEmpty = true;
    finishScore(score);
    return;
  }

  // Add it
  const note = new Note();
  note.percussionArticulation = midiNote;
  beat.addNote(note);
  beat.isEmpty = false;

  finishScore(score);
}

/**
 * Place a percussion note and advance within the bar.
 * Uses percussionArticulation for proper drum rendering.
 */
export function setDrumNoteAndAdvance(
  score: Score,
  cursor: EditorCursor,
  midiNote: number,
  duration: number,
): EditorCursor | null {
  const voice = getVoice(score, cursor);
  if (!voice) return null;
  const beat = getBeat(score, cursor);
  if (!beat) return null;

  // Add percussion note — only set percussionArticulation, not string/fret
  const note = new Note();
  note.percussionArticulation = midiNote;
  beat.addNote(note);
  beat.isEmpty = false;
  beat.duration = duration;

  // Check if there's a next beat already
  if (cursor.beatIndex < voice.beats.length - 1) {
    finishScore(score);
    return {...cursor, beatIndex: cursor.beatIndex + 1};
  }

  // Check if bar has space for another beat
  const capacity = barCapacity(score, cursor.barIndex);
  const filled = voiceFillAmount(voice);

  if (filled < capacity - 0.001) {
    const newBeat = new Beat();
    newBeat.isEmpty = true;
    newBeat.duration = duration;
    voice.beats.splice(cursor.beatIndex + 1, 0, newBeat);
    const bar = voice.bar;
    if (bar) repairBarLinks(bar.staff);
    finishScore(score);
    return {...cursor, beatIndex: cursor.beatIndex + 1};
  }

  // Bar full — advance to next bar
  const staff = score.tracks[cursor.trackIndex]?.staves[0];
  if (staff && cursor.barIndex < staff.bars.length - 1) {
    finishScore(score);
    return {...cursor, barIndex: cursor.barIndex + 1, beatIndex: 0};
  }

  finishScore(score);
  return null;
}

// --- Chord operations ---

/**
 * Replace all notes on the current beat with a chord voicing.
 * Notes is an array of {stringNumber, fret} (1-based string numbers).
 */
export function setChord(
  score: Score,
  cursor: EditorCursor,
  notes: {stringNumber: number; fret: number}[],
  duration?: number,
): void {
  const beat = getBeat(score, cursor);
  if (!beat) return;

  // Clear existing notes
  beat.notes.length = 0;

  // Add chord notes
  for (const {stringNumber, fret} of notes) {
    const note = new Note();
    note.string = stringNumber;
    note.fret = fret;
    beat.addNote(note);
  }

  beat.isEmpty = false;
  if (duration !== undefined) beat.duration = duration;

  finishScore(score);
}

// --- Clipboard operations ---

export interface ClipboardCell {
  stringNumber: number;
  fret: number;
}

export interface ClipboardBeat {
  notes: ClipboardCell[];
  duration: number;
  isEmpty: boolean;
}

/** Copy a single note from the current cursor position. */
export function copyCell(score: Score, cursor: EditorCursor): ClipboardCell | null {
  const beat = getBeat(score, cursor);
  if (!beat) return null;
  const note = findNoteOnString(beat, cursor.stringNumber);
  if (!note) return null;
  return {stringNumber: cursor.stringNumber, fret: note.fret};
}

/** Copy the entire beat (all notes) at the cursor position. */
export function copyBeat(score: Score, cursor: EditorCursor): ClipboardBeat | null {
  const beat = getBeat(score, cursor);
  if (!beat) return null;
  return {
    notes: beat.notes.map((n: NoteInstance) => ({stringNumber: n.string, fret: n.fret})),
    duration: beat.duration,
    isEmpty: beat.isEmpty,
  };
}

/** Paste a single cell (fret value) at the cursor position. */
export function pasteCell(score: Score, cursor: EditorCursor, cell: ClipboardCell): void {
  setNote(score, cursor, cell.fret);
}

/** Paste a full beat at the cursor position — replaces all notes. */
export function pasteBeat(score: Score, cursor: EditorCursor, beatData: ClipboardBeat): void {
  const beat = getBeat(score, cursor);
  if (!beat) return;

  beat.notes.length = 0;
  beat.duration = beatData.duration;
  beat.isEmpty = beatData.isEmpty;

  for (const {stringNumber, fret} of beatData.notes) {
    const note = new Note();
    note.string = stringNumber;
    note.fret = fret;
    beat.addNote(note);
  }

  finishScore(score);
}

/** Cut a single cell — copies then removes. */
export function cutCell(score: Score, cursor: EditorCursor): ClipboardCell | null {
  const cell = copyCell(score, cursor);
  if (cell) removeNote(score, cursor);
  return cell;
}

/** Cut the entire beat — copies then clears all notes. */
export function cutBeat(score: Score, cursor: EditorCursor): ClipboardBeat | null {
  const beatData = copyBeat(score, cursor);
  if (!beatData) return null;

  const beat = getBeat(score, cursor);
  if (beat) {
    beat.notes.length = 0;
    beat.isEmpty = true;
    finishScore(score);
  }
  return beatData;
}

export { Duration };
