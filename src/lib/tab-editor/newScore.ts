import {model, Settings} from '@coderline/alphatab';
// Percussion uses alphaTab's built-in PercussionMapper (no custom articulations needed)

const {
  Score,
  Track,
  Staff,
  Bar,
  Voice,
  Beat,
  MasterBar,
  PlaybackInformation,
  Automation,
  AutomationType,
  Duration,
  Tuning,
  Clef,
} = model;

// Standard tunings (MIDI note values, low to high string)
const TUNINGS: Record<string, number[]> = {
  'guitar-standard': [40, 45, 50, 55, 59, 64],       // E2 A2 D3 G3 B3 E4
  'guitar-drop-d': [38, 45, 50, 55, 59, 64],          // D2 A2 D3 G3 B3 E4
  'guitar-7-standard': [35, 40, 45, 50, 55, 59, 64],  // B1 E2 A2 D3 G3 B3 E4
  'guitar-8-standard': [30, 35, 40, 45, 50, 55, 59, 64], // F#1 B1 E2 A2 D3 G3 B3 E4
  'bass-standard': [28, 33, 38, 43],                   // E1 A1 D2 G2
  'bass-5-standard': [23, 28, 33, 38, 43],             // B0 E1 A1 D2 G2
  'bass-drop-d': [26, 33, 38, 43],                     // D1 A1 D2 G2
};

// GM MIDI programs (0-indexed)
const GM_OVERDRIVEN_GUITAR = 29;
const GM_BASS_FINGER = 33;

export type InstrumentType = 'guitar' | 'bass' | 'drums';

export interface NewScoreOptions {
  title?: string;
  artist?: string;
  tempo?: number;
  measureCount?: number;
  timeSignatureNumerator?: number;
  timeSignatureDenominator?: number;
  instrument?: InstrumentType;
  stringCount?: number;
  tuningKey?: string;
  customTuning?: number[];
}

function getMidiProgram(instrument: InstrumentType): number {
  if (instrument === 'bass') return GM_BASS_FINGER;
  if (instrument === 'drums') return 0;
  return GM_OVERDRIVEN_GUITAR;
}

function getDefaultTuning(instrument: InstrumentType, stringCount: number): number[] {
  if (instrument === 'bass') {
    return stringCount === 5 ? TUNINGS['bass-5-standard'] : TUNINGS['bass-standard'];
  }
  if (instrument === 'guitar') {
    if (stringCount === 7) return TUNINGS['guitar-7-standard'];
    if (stringCount === 8) return TUNINGS['guitar-8-standard'];
    return TUNINGS['guitar-standard'];
  }
  // Drums don't use tuning
  return [];
}

export function createBlankScore(options: NewScoreOptions = {}): InstanceType<typeof Score> {
  const {
    title = 'Untitled',
    artist = '',
    tempo = 120,
    measureCount = 4,
    timeSignatureNumerator = 4,
    timeSignatureDenominator = 4,
    instrument = 'guitar',
    stringCount = instrument === 'bass' ? 4 : 6,
    tuningKey,
    customTuning,
  } = options;

  const score = new Score();
  score.title = title;
  score.artist = artist;
  score.tab = 'Created in Chartmate';
  score.stylesheet.hideDynamics = true;

  const track = new Track();
  track.name = instrument === 'drums' ? 'Drums' : instrument === 'bass' ? 'Bass' : 'Guitar';
  track.shortName = track.name.substring(0, 3);

  const playback = new PlaybackInformation();
  playback.volume = 15;
  playback.balance = 8;
  playback.port = 0;
  playback.program = getMidiProgram(instrument);
  playback.primaryChannel = instrument === 'drums' ? 9 : 0;
  playback.secondaryChannel = instrument === 'drums' ? 9 : 1;
  track.playbackInfo = playback;

  const staff = new Staff();
  if (instrument === 'drums') {
    staff.isPercussion = true;
    staff.showTablature = false;
    staff.showStandardNotation = true;
    // Leave percussionArticulations empty — alphaTab's built-in PercussionMapper handles it
  } else {
    staff.showTablature = true;
    staff.showStandardNotation = true;
    staff.isPercussion = false;

    // Set tuning
    const tuningValues: number[] = customTuning
      ?? (tuningKey ? TUNINGS[tuningKey] : undefined)
      ?? getDefaultTuning(instrument, stringCount);

    // alphaTab expects highest string first
    const reversed = [...tuningValues].reverse();
    const found = Tuning.findTuning(reversed);
    staff.stringTuning = found ?? new Tuning('Custom', reversed, false);
  }

  track.addStaff(staff);
  score.addTrack(track);

  // Create measures
  for (let m = 0; m < measureCount; m++) {
    const masterBar = new MasterBar();
    masterBar.timeSignatureNumerator = timeSignatureNumerator;
    masterBar.timeSignatureDenominator = timeSignatureDenominator;

    if (m === 0) {
      const tempoAuto = new Automation();
      tempoAuto.isLinear = false;
      tempoAuto.ratioPosition = 0;
      tempoAuto.type = AutomationType.Tempo;
      tempoAuto.value = tempo;
      tempoAuto.text = '';
      masterBar.tempoAutomations = [tempoAuto];
    }

    score.addMasterBar(masterBar);

    const bar = new Bar();
    if (instrument === 'drums') {
      bar.clef = Clef.Neutral;
    }
    staff.addBar(bar);

    const voice = new Voice();
    bar.addVoice(voice);

    // Fill with whole-note rests
    const rest = new Beat();
    rest.isEmpty = true;
    rest.duration = Duration.Whole;
    voice.addBeat(rest);
  }

  score.finish(new Settings());
  return score;
}

export { TUNINGS };
