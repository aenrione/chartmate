export interface TuningPreset {
  name: string;
  /** MIDI note values from lowest to highest string */
  values: number[];
  instrument: 'guitar' | 'bass';
  stringCount: number;
}

// Guitar tunings (6-string)
const GUITAR_6: TuningPreset[] = [
  {name: 'Standard (E A D G B E)', values: [40, 45, 50, 55, 59, 64], instrument: 'guitar', stringCount: 6},
  {name: 'Drop D (D A D G B E)', values: [38, 45, 50, 55, 59, 64], instrument: 'guitar', stringCount: 6},
  {name: 'Eb Standard', values: [39, 44, 49, 54, 58, 63], instrument: 'guitar', stringCount: 6},
  {name: 'D Standard', values: [38, 43, 48, 53, 57, 62], instrument: 'guitar', stringCount: 6},
  {name: 'Drop C', values: [36, 43, 48, 53, 57, 62], instrument: 'guitar', stringCount: 6},
  {name: 'C Standard', values: [36, 41, 46, 51, 55, 60], instrument: 'guitar', stringCount: 6},
  {name: 'Open G (D G D G B D)', values: [38, 43, 50, 55, 59, 62], instrument: 'guitar', stringCount: 6},
  {name: 'Open D (D A D F# A D)', values: [38, 45, 50, 54, 57, 62], instrument: 'guitar', stringCount: 6},
  {name: 'DADGAD', values: [38, 45, 50, 55, 57, 62], instrument: 'guitar', stringCount: 6},
  {name: 'Open E (E B E G# B E)', values: [40, 47, 52, 56, 59, 64], instrument: 'guitar', stringCount: 6},
];

// Guitar tunings (7-string)
const GUITAR_7: TuningPreset[] = [
  {name: 'Standard (B E A D G B E)', values: [35, 40, 45, 50, 55, 59, 64], instrument: 'guitar', stringCount: 7},
  {name: 'Drop A', values: [33, 40, 45, 50, 55, 59, 64], instrument: 'guitar', stringCount: 7},
];

// Guitar tunings (8-string)
const GUITAR_8: TuningPreset[] = [
  {name: 'Standard (F# B E A D G B E)', values: [30, 35, 40, 45, 50, 55, 59, 64], instrument: 'guitar', stringCount: 8},
  {name: 'Drop E', values: [28, 35, 40, 45, 50, 55, 59, 64], instrument: 'guitar', stringCount: 8},
];

// Bass tunings (4-string)
const BASS_4: TuningPreset[] = [
  {name: 'Standard (E A D G)', values: [28, 33, 38, 43], instrument: 'bass', stringCount: 4},
  {name: 'Drop D (D A D G)', values: [26, 33, 38, 43], instrument: 'bass', stringCount: 4},
  {name: 'D Standard', values: [26, 31, 36, 41], instrument: 'bass', stringCount: 4},
];

// Bass tunings (5-string)
const BASS_5: TuningPreset[] = [
  {name: 'Standard (B E A D G)', values: [23, 28, 33, 38, 43], instrument: 'bass', stringCount: 5},
  {name: 'Drop A', values: [21, 28, 33, 38, 43], instrument: 'bass', stringCount: 5},
];

// Bass tunings (6-string)
const BASS_6: TuningPreset[] = [
  {name: 'Standard (B E A D G C)', values: [23, 28, 33, 38, 43, 48], instrument: 'bass', stringCount: 6},
];

export const ALL_TUNINGS: TuningPreset[] = [
  ...GUITAR_6,
  ...GUITAR_7,
  ...GUITAR_8,
  ...BASS_4,
  ...BASS_5,
  ...BASS_6,
];

export function getTuningsForInstrument(instrument: 'guitar' | 'bass', stringCount: number): TuningPreset[] {
  return ALL_TUNINGS.filter(t => t.instrument === instrument && t.stringCount === stringCount);
}

export function getDefaultTuningPreset(instrument: 'guitar' | 'bass', stringCount: number): TuningPreset {
  const presets = getTuningsForInstrument(instrument, stringCount);
  return presets[0] ?? {
    name: 'Standard',
    values: instrument === 'bass' ? [28, 33, 38, 43] : [40, 45, 50, 55, 59, 64],
    instrument,
    stringCount,
  };
}
