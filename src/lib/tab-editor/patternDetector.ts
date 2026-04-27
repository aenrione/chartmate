import {model} from '@coderline/alphatab';

type Score = InstanceType<typeof model.Score>;
type BeatInstance = InstanceType<typeof model.Beat>;
type NoteInstance = InstanceType<typeof model.Note>;

export type DetectedPattern = {
  label: string;
  barLength: number;
  instances: number[]; // start bar indices, non-overlapping
  unique?: true; // bars that don't belong to any repeating pattern
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
  if (note.string > 0) return `s${note.string}:f${note.fret}`;
  return `p${note.percussionArticulation}`;
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
  const N = score.masterBars.length;
  if (N < 2) return [];

  // Pre-compute single-bar hashes once — the expensive part
  const barHashes: string[] = Array.from({length: N}, (_, i) => hashBar(score, i));

  type RawPattern = {barLength: number; instances: number[]};
  const rawPatterns: RawPattern[] = [];

  // windowHashes[i] = hash of the window of current width starting at bar i.
  // Built incrementally: each iteration appends one more bar hash, so hash
  // construction is O(1) per position rather than O(w).
  let windowHashes = [...barHashes];
  const maxW = Math.floor(N / 2);

  for (let w = 1; w <= maxW; w++) {
    // Group window start positions by hash
    const hashToStarts = new Map<string, number[]>();
    const count = N - w + 1;
    for (let i = 0; i < count; i++) {
      const h = windowHashes[i];
      let arr = hashToStarts.get(h);
      if (!arr) { arr = []; hashToStarts.set(h, arr); }
      arr.push(i);
    }

    for (const starts of hashToStarts.values()) {
      if (starts.length < 2) continue;
      // Greedy left-to-right scan to collect non-overlapping instances.
      // starts is already ascending (we iterate i in order above).
      const instances: number[] = [];
      let lastEnd = -1;
      for (const s of starts) {
        if (s >= lastEnd) {
          instances.push(s);
          lastEnd = s + w;
        }
      }
      if (instances.length >= 2) {
        rawPatterns.push({barLength: w, instances});
      }
    }

    // Build window hashes for width w+1: append barHash(i+w) to each current window
    if (w < maxW) {
      const next: string[] = [];
      for (let i = 0; i < N - w; i++) {
        next.push(windowHashes[i] + '||' + barHashes[i + w]);
      }
      windowHashes = next;
    }
  }

  // Dominance filter: process longest patterns first.
  // Accept a pattern only if at least one of its instances contains a bar
  // not yet covered by an already-accepted (longer) pattern.
  // This keeps the fewest, largest patterns — exactly one per unique section of music.
  rawPatterns.sort((a, b) => b.barLength - a.barLength || b.instances.length - a.instances.length);

  const coveredBars = new Set<number>();
  const accepted: RawPattern[] = [];

  for (const p of rawPatterns) {
    const hasNewBars = p.instances.some(start => {
      for (let b = start; b < start + p.barLength; b++) {
        if (!coveredBars.has(b)) return true;
      }
      return false;
    });
    if (!hasNewBars) continue;
    accepted.push(p);
    for (const start of p.instances) {
      for (let b = start; b < start + p.barLength; b++) coveredBars.add(b);
    }
  }

  // Sort accepted by total coverage desc for label assignment (A = most significant)
  accepted.sort((a, b) => {
    const cA = a.barLength * a.instances.length;
    const cB = b.barLength * b.instances.length;
    return cB - cA || a.instances[0] - b.instances[0];
  });

  const repeating = accepted.map((p, i) => ({
    label: generateLabel(i),
    barLength: p.barLength,
    instances: p.instances,
  }));

  // Group consecutive uncovered bars into unique sections (U1, U2, …)
  const unique: DetectedPattern[] = [];
  let runStart = -1;
  for (let i = 0; i <= N; i++) {
    if (i < N && !coveredBars.has(i)) {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      unique.push({
        label: `U${unique.length + 1}`,
        barLength: i - runStart,
        instances: [runStart],
        unique: true,
      });
      runStart = -1;
    }
  }

  return [...repeating, ...unique];
}
