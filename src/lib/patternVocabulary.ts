import type {Measure, Note} from '@/pages/sheet-music/drumTypes';

export interface PatternEntry {
  id: string;
  fuzzyId: string;
  label: string;
  color: string;
  measureIndices: number[];
  frequency: number;
  firstOccurrence: number;
  startMs: number;
  endMs: number;
  noteCount: number;
  isRest: boolean;
}

export interface PatternVocabulary {
  patterns: PatternEntry[];
  measureToPatternId: Map<number, string>;
  coverage: {count: number; percentage: number}[];
  totalMeasures: number;
  uniqueCount: number;
}

// 10-color palette for pattern highlighting
const PATTERN_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
];

const REST_COLOR = '#9ca3af'; // gray

// Map VexFlow pitch strings to voice categories for fuzzy matching
const PITCH_TO_VOICE: Record<string, string> = {
  'e/4': 'K', // kick
  'f/4': 'K', // kick variant
  'c/5': 'S', // snare
  'g/5/x2': 'C', // hihat → cymbal category for fuzzy
  'f/5/x2': 'C', // ride → cymbal category for fuzzy
  'a/5/x2': 'C', // crash → cymbal category for fuzzy
  'e/5': 'T', // high-tom
  'd/5': 'T', // mid-tom
  'a/4': 'T', // floor-tom
};

function hashNote(note: Note, fuzzy: boolean): string {
  const pitches = fuzzy
    ? note.notes
        .map(p => PITCH_TO_VOICE[p] || p)
        .sort()
        .join(',')
    : [...note.notes].sort().join(',');

  return `${note.duration}|${note.dotted ? 1 : 0}|${note.isTriplet ? 1 : 0}|${note.isRest ? 1 : 0}|${pitches}`;
}

function hashMeasure(measure: Measure, fuzzy: boolean): string {
  return measure.notes.map(n => hashNote(n, fuzzy)).join(';');
}

function generateLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export function buildPatternVocabulary(measures: Measure[]): PatternVocabulary {
  if (measures.length === 0) {
    return {
      patterns: [],
      measureToPatternId: new Map(),
      coverage: [],
      totalMeasures: 0,
      uniqueCount: 0,
    };
  }

  // Step 1: Fingerprint each measure
  const exactHashes = measures.map(m => hashMeasure(m, false));
  const fuzzyHashes = measures.map(m => hashMeasure(m, true));

  // Step 2: Group by exactHash
  const groups = new Map<string, number[]>();
  for (let i = 0; i < exactHashes.length; i++) {
    const hash = exactHashes[i];
    const existing = groups.get(hash);
    if (existing) {
      existing.push(i);
    } else {
      groups.set(hash, [i]);
    }
  }

  // Step 3: Create PatternEntry[], sorted by frequency desc
  const entries: PatternEntry[] = [];
  for (const [hash, indices] of groups) {
    const firstIdx = indices[0];
    const measure = measures[firstIdx];
    const isRest = measure.notes.every(n => n.isRest);
    const noteCount = measure.notes.filter(n => !n.isRest).length;

    entries.push({
      id: hash,
      fuzzyId: fuzzyHashes[firstIdx],
      label: '', // assigned below
      color: '', // assigned below
      measureIndices: indices,
      frequency: indices.length,
      firstOccurrence: firstIdx,
      startMs: measure.startMs,
      endMs: measure.endMs,
      noteCount,
      isRest,
    });
  }

  // Sort: rest-only last, then by frequency desc, then by first occurrence
  entries.sort((a, b) => {
    if (a.isRest !== b.isRest) return a.isRest ? 1 : -1;
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    return a.firstOccurrence - b.firstOccurrence;
  });

  // Step 4: Assign labels (skip rest-only patterns)
  let labelIdx = 0;
  for (const entry of entries) {
    if (entry.isRest) {
      entry.label = '-';
      entry.color = REST_COLOR;
    } else {
      entry.label = generateLabel(labelIdx);
      entry.color = PATTERN_COLORS[labelIdx % PATTERN_COLORS.length];
      labelIdx++;
    }
  }

  // Step 5: Build measure→pattern map
  const measureToPatternId = new Map<number, string>();
  for (const entry of entries) {
    for (const idx of entry.measureIndices) {
      measureToPatternId.set(idx, entry.id);
    }
  }

  // Step 6: Compute cumulative coverage
  const totalMeasures = measures.length;
  const nonRestEntries = entries.filter(e => !e.isRest);
  let coveredCount = 0;
  const coverage = nonRestEntries.map((entry, i) => {
    coveredCount += entry.frequency;
    return {
      count: i + 1,
      percentage: Math.round((coveredCount / totalMeasures) * 100),
    };
  });

  return {
    patterns: entries,
    measureToPatternId,
    coverage,
    totalMeasures,
    uniqueCount: nonRestEntries.length,
  };
}
