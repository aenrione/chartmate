import {model} from '@coderline/alphatab';

type Score = InstanceType<typeof model.Score>;
type BeatInstance = InstanceType<typeof model.Beat>;
type NoteInstance = InstanceType<typeof model.Note>;

const PATTERN_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

export type DetectedPattern = {
  label: string;
  barLength: number;
  instances: number[];
  color: string;
};

function generateLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

function hashNote(note: NoteInstance): string {
  // string is 1-based for fretted; percussion notes leave string at 0
  if ((note as {string: number}).string > 0) {
    return `s${(note as {string: number}).string}:f${(note as {fret: number}).fret}`;
  }
  return `p${(note as {percussionArticulation: number}).percussionArticulation}`;
}

function hashBeat(beat: BeatInstance): string {
  const noteHashes = beat.notes.map((n: NoteInstance) => hashNote(n)).sort().join(',');
  return `${beat.duration}|${beat.dots}|${beat.isEmpty ? 'r' : 'n'}|${noteHashes}`;
}

function hashBar(score: Score, barIndex: number): string {
  return score.tracks.map(track => {
    const bar = track.staves[0]?.bars[barIndex];
    if (!bar) return 'empty';
    const voice = bar.voices[0];
    if (!voice) return 'empty';
    return voice.beats.map((beat: BeatInstance) => hashBeat(beat)).join(';');
  }).join('||');
}

export function detectPatterns(score: Score): DetectedPattern[] {
  const totalBars = score.masterBars.length;
  if (totalBars === 0) return [];

  const hashes = Array.from({length: totalBars}, (_, i) => hashBar(score, i));

  const groups = new Map<string, number[]>();
  for (let i = 0; i < hashes.length; i++) {
    const h = hashes[i];
    const existing = groups.get(h);
    if (existing) existing.push(i);
    else groups.set(h, [i]);
  }

  const repeating = [...groups.entries()]
    .filter(([, indices]) => indices.length >= 2)
    .sort((a, b) => {
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return a[1][0] - b[1][0];
    });

  return repeating.map(([, indices], i) => ({
    label: generateLabel(i),
    barLength: 1,
    instances: indices,
    color: PATTERN_COLORS[i % PATTERN_COLORS.length],
  }));
}
