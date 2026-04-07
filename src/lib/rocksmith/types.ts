export interface RocksmithArrangement {
  arrangementType: 'Lead' | 'Rhythm' | 'Bass';
  title: string;
  artistName: string;
  albumName: string;
  tuning: number[]; // per-string offset from standard tuning
  capoFret: number;
  songLength: number; // seconds
  startBeat: number;
  averageTempo: number;
  beats: RocksmithBeat[];
  notes: RocksmithNote[];
  chords: RocksmithChord[];
  chordTemplates: RocksmithChordTemplate[];
  sections: RocksmithSection[];
  phrases: RocksmithPhrase[];
  phraseIterations: RocksmithPhraseIteration[];
}

export interface RocksmithBeat {
  time: number; // seconds
  measure: number; // -1 = not a measure start
}

export interface RocksmithBendPoint {
  time: number; // seconds (absolute time of bend keyframe)
  step: number; // bend amount in semitones (1.0 = full bend)
}

export interface RocksmithNote {
  time: number;
  string: number; // 0-5 (0 = low E)
  fret: number; // 0-24
  sustain: number; // seconds
  bend: number; // max bend in semitones
  bendPoints: RocksmithBendPoint[]; // full bend curve keyframes
  slideTo: number; // target fret, -1 = none
  slideUnpitchTo: number; // unpitched slide target, -1 = none
  hammerOn: boolean;
  pullOff: boolean;
  harmonic: boolean;
  harmonicPinch: boolean;
  palmMute: boolean;
  mute: boolean;
  tremolo: boolean;
  vibrato: boolean;
  tap: boolean;
  accent: boolean;
  linkNext: boolean;
  ignore: boolean;
  slap: boolean;
  pluck: boolean;
}

export interface RocksmithChord {
  time: number;
  chordId: number;
  strum: 'up' | 'down';
  highDensity: boolean;
  chordNotes: RocksmithNote[];
}

export interface RocksmithChordTemplate {
  chordId: number;
  chordName: string;
  displayName: string;
  fingers: number[]; // finger assignments per string, -1 = not used
  frets: number[]; // fret per string, -1 = not played
}

export interface RocksmithSection {
  name: string;
  number: number;
  startTime: number;
  endTime: number;
}

export interface RocksmithPhrase {
  name: string;
  maxDifficulty: number;
}

export interface RocksmithPhraseIteration {
  phraseId: number;
  time: number;
  endTime: number;
}
