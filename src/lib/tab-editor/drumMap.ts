/**
 * General MIDI Percussion Map (Channel 10)
 * Maps drum kit pieces to their MIDI note numbers.
 */
export interface DrumPiece {
  name: string;
  shortName: string;
  midiNote: number;
  category: 'kick' | 'snare' | 'hihat' | 'tom' | 'cymbal';
}

export const DRUM_KIT: DrumPiece[] = [
  // Kick
  {name: 'Bass Drum', shortName: 'BD', midiNote: 36, category: 'kick'},
  {name: 'Bass Drum 2', shortName: 'BD2', midiNote: 35, category: 'kick'},

  // Snare
  {name: 'Snare', shortName: 'SD', midiNote: 38, category: 'snare'},
  {name: 'Snare Rim', shortName: 'SR', midiNote: 37, category: 'snare'},
  {name: 'Snare Cross', shortName: 'SX', midiNote: 40, category: 'snare'},

  // Hi-hat
  {name: 'Hi-Hat Closed', shortName: 'HH', midiNote: 42, category: 'hihat'},
  {name: 'Hi-Hat Open', shortName: 'HO', midiNote: 46, category: 'hihat'},
  {name: 'Hi-Hat Pedal', shortName: 'HP', midiNote: 44, category: 'hihat'},

  // Toms
  {name: 'High Tom', shortName: 'HT', midiNote: 50, category: 'tom'},
  {name: 'Mid Tom', shortName: 'MT', midiNote: 47, category: 'tom'},
  {name: 'Low Tom', shortName: 'LT', midiNote: 45, category: 'tom'},
  {name: 'Floor Tom', shortName: 'FT', midiNote: 41, category: 'tom'},

  // Cymbals
  {name: 'Crash 1', shortName: 'CC', midiNote: 49, category: 'cymbal'},
  {name: 'Crash 2', shortName: 'C2', midiNote: 57, category: 'cymbal'},
  {name: 'Ride', shortName: 'RC', midiNote: 51, category: 'cymbal'},
  {name: 'Ride Bell', shortName: 'RB', midiNote: 53, category: 'cymbal'},
  {name: 'Splash', shortName: 'SP', midiNote: 55, category: 'cymbal'},
  {name: 'China', shortName: 'CH', midiNote: 52, category: 'cymbal'},
];

/**
 * Get the keyboard shortcut key for quick drum input.
 * These are mapped for fast entry during playback.
 */
export const DRUM_SHORTCUTS: Record<string, number> = {
  k: 36, // kick
  s: 38, // snare
  h: 42, // hi-hat closed
  o: 46, // hi-hat open
  c: 49, // crash
  d: 51, // ride (d for "ding")
  t: 50, // high tom
  m: 47, // mid tom
  n: 45, // low tom
  f: 41, // floor tom
};

export function getDrumPieceByMidi(midiNote: number): DrumPiece | undefined {
  return DRUM_KIT.find(d => d.midiNote === midiNote);
}

export function getDrumPiecesByCategory(category: DrumPiece['category']): DrumPiece[] {
  return DRUM_KIT.filter(d => d.category === category);
}

// Top-to-bottom visual order of the percussion staff (lane 1 = top = Crash, lane N = bottom = Pedal HH).
// Derived from DRUM_KIT so there's only one place to update piece metadata.
const DRUM_LANE_MIDI_ORDER = [49, 46, 42, 51, 50, 47, 38, 45, 41, 36, 44] as const;
export const DRUM_LANES: DrumPiece[] = DRUM_LANE_MIDI_ORDER.map(
  midi => DRUM_KIT.find(d => d.midiNote === midi)!,
);

export const DRUM_LANE_COUNT = DRUM_LANES.length;

export function getDrumLane(laneIndex: number): DrumPiece | undefined {
  return DRUM_LANES[laneIndex - 1];
}
