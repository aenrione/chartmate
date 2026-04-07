/**
 * Famous drum fills encoded as NoteEntry arrays at 192 PPQ, 4/4 time.
 *
 * Tick math reference (192 PPQ):
 *   Quarter note  = 192 ticks
 *   8th note      =  96 ticks
 *   16th note     =  48 ticks
 *   32nd note     =  24 ticks
 *   Triplet-8th   =  64 ticks  (192 / 3)
 *   Triplet-16th  =  32 ticks  (192 / 6)
 *   Dotted-8th    = 144 ticks
 *   1 measure     = 768 ticks  (192 × 4)
 *
 * Drum type map (Clone Hero / scan-chart):
 *   0 = kick
 *   1 = snare (red)
 *   2 = hi-hat / yellow cymbal
 *   3 = blue tom (rack tom)
 *   4 = green / floor tom
 *   5 = crash
 */

import type { NoteEntry } from './generateFillChartText';

export interface FillEntry {
  id: string;
  name: string;
  artist: string;
  song: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  /** Original song BPM — for reference display only */
  bpmOriginal: number;
  /** Fill pattern at 192 PPQ, 4/4 */
  notes: NoteEntry[];
  lengthMeasures: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper constants for readability
// ─────────────────────────────────────────────────────────────────────────────
const KICK  = 0;
const SNARE = 1;
const HIHAT = 2;
const RACK  = 3; // blue / rack tom
const FLOOR = 4; // green / floor tom
const CRASH = 5;

const Q  = 192; // quarter
const E  =  96; // 8th
const S  =  48; // 16th
const T  =  64; // triplet-8th (192/3)
const M  =  32; // triplet-16th / 32nd-adjacent  (192/6)
const TT =  24; // 32nd note

const BAR = 768; // one measure

// ─────────────────────────────────────────────────────────────────────────────
// Fill patterns
// ─────────────────────────────────────────────────────────────────────────────

export const fills: FillEntry[] = [
  // ── 1. John Bonham — When the Levee Breaks ──────────────────────────────────
  // Half-time feel at ~76 BPM; classic floor-tom / rack-tom cascade.
  // Encode at 120 BPM using triplet-8th spacing to represent the triplet feel.
  // Beat 1: floor tom triplets, Beat 2: rack, Beat 3: floor, Beat 4: rack + snare
  {
    id: 'bonham-levee-breaks',
    name: 'When the Levee Breaks Fill',
    artist: 'John Bonham',
    song: 'When the Levee Breaks',
    tags: ['rock', 'tom-run', 'triplet'],
    difficulty: 'advanced',
    bpmOriginal: 76,
    lengthMeasures: 1,
    notes: [
      // Beat 1 — floor tom triplets
      [0,        FLOOR],
      [T,        FLOOR],
      [T * 2,    FLOOR],
      // Beat 2 — rack tom triplets
      [Q,        RACK],
      [Q + T,    RACK],
      [Q + T*2,  RACK],
      // Beat 3 — floor tom triplets
      [Q*2,      FLOOR],
      [Q*2 + T,  FLOOR],
      [Q*2+T*2,  FLOOR],
      // Beat 4 — rack tom triplets into snare accent
      [Q*3,      RACK],
      [Q*3 + T,  RACK],
      [Q*3+T*2,  SNARE],
      // Crash on downbeat of next measure
      [BAR,      CRASH],
    ],
  },

  // ── 2. John Bonham — Whole Lotta Love ───────────────────────────────────────
  // Driving 16th-note fill: rack → floor toms, snare accent at end.
  {
    id: 'bonham-whole-lotta-love',
    name: 'Whole Lotta Love Fill',
    artist: 'John Bonham',
    song: 'Whole Lotta Love',
    tags: ['rock', '16th-note'],
    difficulty: 'intermediate',
    bpmOriginal: 90,
    lengthMeasures: 1,
    notes: [
      // 16 sixteenth notes cycling rack → floor → snare
      [0,      RACK],
      [S,      RACK],
      [S*2,    FLOOR],
      [S*3,    FLOOR],
      [S*4,    RACK],
      [S*5,    RACK],
      [S*6,    FLOOR],
      [S*7,    FLOOR],
      [S*8,    RACK],
      [S*9,    SNARE],
      [S*10,   FLOOR],
      [S*11,   SNARE],
      [S*12,   FLOOR],
      [S*13,   SNARE],
      [S*14,   FLOOR],
      [S*15,   SNARE],
      [BAR,    CRASH],
    ],
  },

  // ── 3. Phil Collins — In the Air Tonight ────────────────────────────────────
  // The legendary 8-beat tom cascade (simplified to the iconic hit sequence).
  // 8th-note tom run: rack tom descending to floor tom then snare crashes.
  {
    id: 'collins-air-tonight',
    name: 'In the Air Tonight Fill',
    artist: 'Phil Collins',
    song: 'In the Air Tonight',
    tags: ['rock', 'tom-run', '8th-note'],
    difficulty: 'beginner',
    bpmOriginal: 86,
    lengthMeasures: 1,
    notes: [
      [0,    RACK],
      [E,    RACK],
      [E*2,  RACK],
      [E*3,  RACK],
      [E*4,  FLOOR],
      [E*5,  FLOOR],
      [E*6,  FLOOR],
      [E*7,  SNARE],
      [BAR,  CRASH],
    ],
  },

  // ── 4. Neil Peart — Tom Sawyer ──────────────────────────────────────────────
  // Syncopated 16th-note fill with kick + snare polyrhythm.
  {
    id: 'peart-tom-sawyer',
    name: 'Tom Sawyer Fill',
    artist: 'Neil Peart',
    song: 'Tom Sawyer',
    tags: ['rock', 'progressive', '16th-note', 'syncopated'],
    difficulty: 'advanced',
    bpmOriginal: 176,
    lengthMeasures: 1,
    notes: [
      // 16th-note tom run with kick accents
      [0,    RACK],
      [S,    RACK],
      [S*2,  KICK],
      [S*3,  SNARE],
      [S*4,  RACK],
      [S*5,  FLOOR],
      [S*6,  KICK],
      [S*7,  RACK],
      [S*8,  SNARE],
      [S*9,  FLOOR],
      [S*10, KICK],
      [S*11, RACK],
      [S*12, FLOOR],
      [S*13, SNARE],
      [S*14, KICK],
      [S*15, SNARE],
      [BAR,  CRASH],
      [BAR,  KICK],
    ],
  },

  // ── 5. Steve Gadd — Aja ─────────────────────────────────────────────────────
  // Ultra-complex 16th-note triplet fill from the famous Aja drum break.
  // Rapid-fire 16th triplets cycling rack / snare / floor with kick.
  {
    id: 'gadd-aja',
    name: 'Aja Fill',
    artist: 'Steve Gadd',
    song: 'Aja',
    tags: ['jazz-rock', '16th-note', 'triplet', 'complex'],
    difficulty: 'advanced',
    bpmOriginal: 116,
    lengthMeasures: 1,
    notes: [
      // Triplet-16th (32 ticks each) — 24 notes per measure
      [0,      SNARE],
      [M,      RACK],
      [M*2,    FLOOR],
      [M*3,    SNARE],
      [M*4,    RACK],
      [M*5,    FLOOR],
      [M*6,    SNARE],
      [M*7,    RACK],
      [M*8,    FLOOR],
      [M*9,    KICK],
      [M*10,   SNARE],
      [M*11,   RACK],
      [M*12,   FLOOR],
      [M*13,   SNARE],
      [M*14,   RACK],
      [M*15,   FLOOR],
      [M*16,   KICK],
      [M*17,   SNARE],
      [M*18,   RACK],
      [M*19,   FLOOR],
      [M*20,   SNARE],
      [M*21,   RACK],
      [M*22,   FLOOR],
      [M*23,   SNARE],
      [BAR,    CRASH],
      [BAR,    KICK],
    ],
  },

  // ── 6. John Bonham — Good Times Bad Times ───────────────────────────────────
  // Famous for rapid kick triplets. Here: a one-measure fill with kick triplets
  // and snare accents on beats 2 & 4.
  {
    id: 'bonham-good-times',
    name: 'Good Times Bad Times Fill',
    artist: 'John Bonham',
    song: 'Good Times Bad Times',
    tags: ['rock', 'kick', 'triplet'],
    difficulty: 'intermediate',
    bpmOriginal: 96,
    lengthMeasures: 1,
    notes: [
      // Beat 1 — kick triplets
      [0,       KICK],
      [T,       KICK],
      [T*2,     KICK],
      // Beat 2 — snare + kick triplets
      [Q,       SNARE],
      [Q + T,   KICK],
      [Q + T*2, KICK],
      // Beat 3 — kick triplets
      [Q*2,     KICK],
      [Q*2+T,   KICK],
      [Q*2+T*2, KICK],
      // Beat 4 — snare accent + kick triplets
      [Q*3,     SNARE],
      [Q*3+T,   KICK],
      [Q*3+T*2, KICK],
      [BAR,     CRASH],
      [BAR,     KICK],
    ],
  },

  // ── 7. Keith Moon — Won't Get Fooled Again ──────────────────────────────────
  // Explosive crash/tom fill. 8th-note toms with crash accents.
  {
    id: 'moon-wont-get-fooled',
    name: "Won't Get Fooled Again Fill",
    artist: 'Keith Moon',
    song: "Won't Get Fooled Again",
    tags: ['rock', 'crash', 'tom-run'],
    difficulty: 'intermediate',
    bpmOriginal: 120,
    lengthMeasures: 1,
    notes: [
      [0,    CRASH],
      [0,    RACK],
      [E,    RACK],
      [E*2,  FLOOR],
      [E*2,  CRASH],
      [E*3,  SNARE],
      [E*4,  RACK],
      [E*4,  CRASH],
      [E*5,  FLOOR],
      [E*6,  RACK],
      [E*6,  CRASH],
      [E*7,  SNARE],
      [BAR,  CRASH],
      [BAR,  KICK],
    ],
  },

  // ── 8. Jeff Porcaro — Rosanna ───────────────────────────────────────────────
  // Half-time shuffle fill ending the famous groove. Triplet-based with ghost notes.
  {
    id: 'porcaro-rosanna',
    name: 'Rosanna Fill',
    artist: 'Jeff Porcaro',
    song: 'Rosanna',
    tags: ['funk', 'shuffle', 'displaced'],
    difficulty: 'advanced',
    bpmOriginal: 93,
    lengthMeasures: 1,
    notes: [
      // Triplet-8th shuffle fill
      [0,       SNARE],   // ghost
      [T,       RACK],
      [T*2,     SNARE],
      [Q,       KICK],
      [Q + T,   SNARE],   // ghost
      [Q + T*2, RACK],
      [Q*2,     SNARE],
      [Q*2+T,   FLOOR],
      [Q*2+T*2, SNARE],   // ghost
      [Q*3,     KICK],
      [Q*3+T,   RACK],
      [Q*3+T*2, SNARE],
      [BAR,     CRASH],
      [BAR,     KICK],
    ],
  },

  // ── 9. Phil Rudd — Back in Black ────────────────────────────────────────────
  // Simple, driving 8th-note rock fill into the iconic riff.
  {
    id: 'rudd-back-in-black',
    name: 'Back in Black Fill',
    artist: 'Phil Rudd',
    song: 'Back in Black',
    tags: ['rock', 'simple', '8th-note'],
    difficulty: 'beginner',
    bpmOriginal: 92,
    lengthMeasures: 1,
    notes: [
      [0,    SNARE],
      [E,    SNARE],
      [E*2,  RACK],
      [E*3,  RACK],
      [E*4,  FLOOR],
      [E*5,  FLOOR],
      [E*6,  SNARE],
      [E*7,  SNARE],
      [BAR,  CRASH],
      [BAR,  KICK],
    ],
  },

  // ── 10. Ringo Starr — Come Together ─────────────────────────────────────────
  // Laid-back, loose tom fill. 8th-note rack/floor pattern.
  {
    id: 'starr-come-together',
    name: 'Come Together Fill',
    artist: 'Ringo Starr',
    song: 'Come Together',
    tags: ['rock', 'tom-run', 'laid-back'],
    difficulty: 'beginner',
    bpmOriginal: 82,
    lengthMeasures: 1,
    notes: [
      [0,    RACK],
      [E,    RACK],
      [E*2,  RACK],
      [E*3,  FLOOR],
      [E*4,  FLOOR],
      [E*5,  SNARE],
      [E*6,  RACK],
      [E*7,  SNARE],
      [BAR,  CRASH],
      [BAR,  KICK],
    ],
  },

  // ── 11. Neil Peart — YYZ ────────────────────────────────────────────────────
  // Complex polyrhythmic fill — 5-over-4 feel encoded as 16th-note groupings.
  {
    id: 'peart-yyz',
    name: 'YYZ Fill',
    artist: 'Neil Peart',
    song: 'YYZ',
    tags: ['progressive', 'polyrhythm', 'complex'],
    difficulty: 'advanced',
    bpmOriginal: 186,
    lengthMeasures: 1,
    notes: [
      // Groups of 5 sixteenth notes cycling across the measure
      [0,    RACK],
      [S,    RACK],
      [S*2,  SNARE],
      [S*3,  FLOOR],
      [S*4,  KICK],
      [S*5,  RACK],
      [S*6,  RACK],
      [S*7,  SNARE],
      [S*8,  FLOOR],
      [S*9,  KICK],
      [S*10, RACK],
      [S*11, RACK],
      [S*12, SNARE],
      [S*13, FLOOR],
      [S*14, KICK],
      [S*15, SNARE],
      [BAR,  CRASH],
      [BAR,  KICK],
    ],
  },

  // ── 12. Alex Van Halen — Hot for Teacher ────────────────────────────────────
  // Very fast 16th-note fill. Rapid single-stroke roll across toms.
  {
    id: 'van-halen-hot-teacher',
    name: 'Hot for Teacher Fill',
    artist: 'Alex Van Halen',
    song: 'Hot for Teacher',
    tags: ['rock', '16th-note', 'fast'],
    difficulty: 'advanced',
    bpmOriginal: 185,
    lengthMeasures: 1,
    notes: [
      [0,    RACK],
      [S,    SNARE],
      [S*2,  RACK],
      [S*3,  SNARE],
      [S*4,  RACK],
      [S*5,  FLOOR],
      [S*6,  RACK],
      [S*7,  FLOOR],
      [S*8,  SNARE],
      [S*9,  RACK],
      [S*10, SNARE],
      [S*11, KICK],
      [S*12, RACK],
      [S*13, FLOOR],
      [S*14, RACK],
      [S*15, SNARE],
      [BAR,  CRASH],
      [BAR,  KICK],
    ],
  },

  // ── 13. John Bonham — Moby Dick ─────────────────────────────────────────────
  // Extended triplet-feel tom solo fill — two measures, heavy and rolling.
  {
    id: 'bonham-moby-dick',
    name: 'Moby Dick Fill',
    artist: 'John Bonham',
    song: 'Moby Dick',
    tags: ['rock', 'triplet', 'tom-run'],
    difficulty: 'intermediate',
    bpmOriginal: 100,
    lengthMeasures: 2,
    notes: [
      // Measure 1 — triplet 8th roll: floor → rack alternating
      [0,         FLOOR],
      [T,         RACK],
      [T*2,       FLOOR],
      [Q,         RACK],
      [Q+T,       FLOOR],
      [Q+T*2,     RACK],
      [Q*2,       FLOOR],
      [Q*2+T,     RACK],
      [Q*2+T*2,   FLOOR],
      [Q*3,       RACK],
      [Q*3+T,     FLOOR],
      [Q*3+T*2,   RACK],
      // Measure 2 — escalate with snare accents
      [BAR,       FLOOR],
      [BAR+T,     RACK],
      [BAR+T*2,   FLOOR],
      [BAR+Q,     SNARE],
      [BAR+Q+T,   RACK],
      [BAR+Q+T*2, FLOOR],
      [BAR+Q*2,   FLOOR],
      [BAR+Q*2+T, RACK],
      [BAR+Q*2+T*2, SNARE],
      [BAR+Q*3,   FLOOR],
      [BAR+Q*3+T, RACK],
      [BAR+Q*3+T*2, SNARE],
      [BAR*2,     CRASH],
      [BAR*2,     KICK],
    ],
  },

  // ── 14. Keith Moon — My Generation ──────────────────────────────────────────
  // Chaotic, explosive fill with crashes and rapid 16th-note bursts.
  {
    id: 'moon-my-generation',
    name: 'My Generation Fill',
    artist: 'Keith Moon',
    song: 'My Generation',
    tags: ['rock', 'crash', '16th-note'],
    difficulty: 'intermediate',
    bpmOriginal: 107,
    lengthMeasures: 1,
    notes: [
      [0,    CRASH],
      [0,    RACK],
      [S,    RACK],
      [S*2,  SNARE],
      [S*3,  CRASH],
      [S*4,  RACK],
      [S*5,  FLOOR],
      [S*6,  SNARE],
      [S*7,  RACK],
      [S*8,  CRASH],
      [S*8,  FLOOR],
      [S*9,  RACK],
      [S*10, SNARE],
      [S*11, FLOOR],
      [S*12, CRASH],
      [S*13, RACK],
      [S*14, SNARE],
      [S*15, KICK],
      [BAR,  CRASH],
      [BAR,  KICK],
    ],
  },

  // ── 15. Ringo Starr — A Day in the Life ─────────────────────────────────────
  // Crescendo build-up fill — 16th-note density increasing across the measure.
  {
    id: 'starr-day-life',
    name: 'A Day in the Life Fill',
    artist: 'Ringo Starr',
    song: 'A Day in the Life',
    tags: ['rock', 'build', 'crescendo'],
    difficulty: 'intermediate',
    bpmOriginal: 77,
    lengthMeasures: 1,
    notes: [
      // Sparse at first (quarter notes), densifying to 16ths
      [0,    SNARE],
      [Q,    RACK],
      [Q + S, SNARE],
      [Q*2,  FLOOR],
      [Q*2+S, RACK],
      [Q*2+S*2, FLOOR],
      [Q*3,  SNARE],
      [Q*3+S, RACK],
      [Q*3+S*2, SNARE],
      [Q*3+S*3, FLOOR],
      [BAR,  CRASH],
      [BAR,  KICK],
    ],
  },

  // ── 16. John Bonham — Kashmir ───────────────────────────────────────────────
  // Heavy half-time feel fill. Long, lumbering triplet tom descent.
  {
    id: 'bonham-kashmir',
    name: 'Kashmir Fill',
    artist: 'John Bonham',
    song: 'Kashmir',
    tags: ['rock', 'half-time', 'tom-run'],
    difficulty: 'intermediate',
    bpmOriginal: 78,
    lengthMeasures: 1,
    notes: [
      // Beats 1-2: kick + rack triplet run
      [0,       KICK],
      [T,       RACK],
      [T*2,     RACK],
      [Q,       RACK],
      [Q+T,     RACK],
      [Q+T*2,   FLOOR],
      // Beats 3-4: floor tom cascade into snare
      [Q*2,     FLOOR],
      [Q*2+T,   FLOOR],
      [Q*2+T*2, RACK],
      [Q*3,     RACK],
      [Q*3+T,   SNARE],
      [Q*3+T*2, KICK],
      [BAR,     CRASH],
    ],
  },

  // ── 17. John Densmore — Five to One ─────────────────────────────────────────
  // Triplet-feel rock fill in 4/4.
  {
    id: 'densmore-five-one',
    name: 'Five to One Fill',
    artist: 'John Densmore',
    song: 'Five to One',
    tags: ['rock', 'triplet'],
    difficulty: 'beginner',
    bpmOriginal: 98,
    lengthMeasures: 1,
    notes: [
      // 4 beats of triplet 8th notes on snare and toms
      [0,       SNARE],
      [T,       RACK],
      [T*2,     SNARE],
      [Q,       FLOOR],
      [Q+T,     SNARE],
      [Q+T*2,   RACK],
      [Q*2,     SNARE],
      [Q*2+T,   FLOOR],
      [Q*2+T*2, SNARE],
      [Q*3,     RACK],
      [Q*3+T,   SNARE],
      [Q*3+T*2, FLOOR],
      [BAR,     CRASH],
      [BAR,     KICK],
    ],
  },

  // ── 18. The Surfaris — Wipe Out ──────────────────────────────────────────────
  // Classic snare roll fill — 16th-note single-stroke snare the whole measure.
  {
    id: 'wipe-out',
    name: 'Wipe Out Fill',
    artist: 'The Surfaris',
    song: 'Wipe Out',
    tags: ['surf', '16th-note', 'classic', 'snare-roll'],
    difficulty: 'beginner',
    bpmOriginal: 130,
    lengthMeasures: 1,
    notes: [
      [0,    SNARE],
      [S,    SNARE],
      [S*2,  SNARE],
      [S*3,  SNARE],
      [S*4,  SNARE],
      [S*5,  SNARE],
      [S*6,  SNARE],
      [S*7,  SNARE],
      [S*8,  SNARE],
      [S*9,  SNARE],
      [S*10, SNARE],
      [S*11, SNARE],
      [S*12, SNARE],
      [S*13, SNARE],
      [S*14, SNARE],
      [S*15, SNARE],
      [BAR,  CRASH],
      [BAR,  KICK],
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getFillById(id: string): FillEntry | undefined {
  return fills.find((f) => f.id === id);
}

/** Return every unique tag across all fills, sorted alphabetically. */
export function getAllTags(): string[] {
  const tagSet = new Set<string>();
  for (const fill of fills) {
    for (const tag of fill.tags) {
      tagSet.add(tag);
    }
  }
  return Array.from(tagSet).sort();
}
