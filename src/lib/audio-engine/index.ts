// ── Types (inline to avoid circular dependency before ear-training.ts exists) ──
export type PlaybackMode = 'melodic' | 'harmonic';
export type Direction = 'ascending' | 'descending' | 'both';
export type Speed = 'slow' | 'medium' | 'fast';

// ── Note data ────────────────────────────────────────────────────────────────

const CHROMATIC_NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const ENHARMONIC: Record<string, string> = {Db: 'C#', D$: 'Eb', Gb: 'F#', G$: 'Ab', A$: 'Bb'};

function normalizeNote(note: string): string {
  return ENHARMONIC[note] ?? note;
}

// ── MIDI / Frequency ─────────────────────────────────────────────────────────

export function noteToMidi(note: string, octave = 4): number {
  const n = normalizeNote(note);
  const idx = CHROMATIC_NOTES.indexOf(n as (typeof CHROMATIC_NOTES)[number]);
  if (idx === -1) throw new Error(`Unknown note: ${note}`);
  return (octave + 1) * 12 + idx;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Speed config ─────────────────────────────────────────────────────────────

const SPEED_CONFIG: Record<Speed, {noteDuration: number; gap: number}> = {
  slow:   {noteDuration: 1.2, gap: 0.4},
  medium: {noteDuration: 0.7, gap: 0.25},
  fast:   {noteDuration: 0.35, gap: 0.15},
};

// ── AudioContext singleton ───────────────────────────────────────────────────

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new AudioContext();
  }
  if (_ctx.state === 'suspended') {
    _ctx.resume();
  }
  return _ctx;
}

// ── Tone primitive ───────────────────────────────────────────────────────────

function scheduleTone(ctx: AudioContext, freq: number, startTime: number, duration: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.55, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration - 0.02);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Play a single note and resolve when done. */
export async function playNote(note: string, octave = 4, speed: Speed = 'medium'): Promise<void> {
  const ctx = getCtx();
  const {noteDuration} = SPEED_CONFIG[speed];
  const freq = midiToFreq(noteToMidi(note, octave));
  scheduleTone(ctx, freq, ctx.currentTime, noteDuration);
  await wait(noteDuration * 1000 + 100);
}

/** Play two notes as an interval — melodic (sequential) or harmonic (simultaneous). */
export async function playInterval(
  noteA: string,
  noteB: string,
  mode: PlaybackMode,
  direction: Direction,
  speed: Speed = 'medium',
): Promise<void> {
  const ctx = getCtx();
  const {noteDuration, gap} = SPEED_CONFIG[speed];
  const now = ctx.currentTime;

  // Determine octaves so the interval sounds natural
  const octaveA = 4;
  let octaveB = 4;
  const idxA = CHROMATIC_NOTES.indexOf(normalizeNote(noteA) as any);
  const idxB = CHROMATIC_NOTES.indexOf(normalizeNote(noteB) as any);
  if (idxB < idxA) octaveB = 5; // wrap up an octave

  const freqA = midiToFreq(noteToMidi(noteA, octaveA));
  const freqB = midiToFreq(noteToMidi(noteB, octaveB));

  const [firstFreq, secondFreq] =
    direction === 'descending' ? [freqB, freqA] : [freqA, freqB];

  if (mode === 'harmonic') {
    scheduleTone(ctx, freqA, now, noteDuration);
    scheduleTone(ctx, freqB, now, noteDuration);
    await wait(noteDuration * 1000 + 100);
  } else {
    scheduleTone(ctx, firstFreq, now, noteDuration);
    scheduleTone(ctx, secondFreq, now + noteDuration + gap, noteDuration);
    await wait((noteDuration * 2 + gap) * 1000 + 100);
  }
}

/** Play a chord (all notes simultaneously). */
export async function playChord(notes: string[], octave = 3, speed: Speed = 'medium'): Promise<void> {
  const ctx = getCtx();
  const {noteDuration} = SPEED_CONFIG[speed];
  const now = ctx.currentTime;
  for (const note of notes) {
    scheduleTone(ctx, midiToFreq(noteToMidi(note, octave)), now, noteDuration);
  }
  await wait(noteDuration * 1000 + 100);
}

/** Play an array of notes as a sequence (scale / melody). */
export async function playSequence(notes: string[], speed: Speed = 'medium', octave = 4): Promise<void> {
  const ctx = getCtx();
  const {noteDuration, gap} = SPEED_CONFIG[speed];
  const now = ctx.currentTime;
  notes.forEach((note, i) => {
    scheduleTone(ctx, midiToFreq(noteToMidi(note, octave)), now + i * (noteDuration + gap), noteDuration);
  });
  await wait((notes.length * (noteDuration + gap)) * 1000 + 100);
}

/** Play a chord progression: array of note arrays played in sequence. */
export async function playProgression(chords: string[][], speed: Speed = 'medium'): Promise<void> {
  for (const chord of chords) {
    await playChord(chord, 3, speed);
    await wait(200);
  }
}

export const audioEngine = {
  playNote,
  playInterval,
  playChord,
  playSequence,
  playProgression,
};
