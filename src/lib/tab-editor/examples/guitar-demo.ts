import {model, Settings} from '@coderline/alphatab';

const {
  Score, Track, Staff, Bar, Voice: VoiceClass, Beat: BeatClass, Note: NoteClass,
  MasterBar, PlaybackInformation, Automation, AutomationType, Duration, Tuning,
} = model;

type BeatDef = InstanceType<typeof BeatClass>;

function noteBeat(
  duration: number,
  notes: {string: number; fret: number; palmMute?: boolean}[],
): BeatDef {
  const beat = new BeatClass();
  beat.duration = duration;
  for (const n of notes) {
    const note = new NoteClass();
    note.string = n.string;
    note.fret = n.fret;
    if (n.palmMute) note.isPalmMute = true;
    beat.addNote(note);
  }
  return beat;
}

function restBeat(duration: number): BeatDef {
  const beat = new BeatClass();
  beat.duration = duration;
  beat.isEmpty = true;
  return beat;
}

function buildBar(staff: InstanceType<typeof Staff>, beats: BeatDef[]) {
  const bar = new Bar();
  staff.addBar(bar);
  const voice = new VoiceClass();
  bar.addVoice(voice);
  for (const beat of beats) {
    voice.addBeat(beat);
  }
}

/**
 * Creates "Smoke on the Water" intro riff (Deep Purple).
 * Built entirely with proper alphaTab API calls — no rebuildBar hacks.
 */
export function createGuitarDemo(): InstanceType<typeof Score> {
  const score = new Score();
  score.title = 'Smoke on the Water';
  score.artist = 'Deep Purple';
  score.tab = 'Created in Chartmate';
  score.stylesheet.hideDynamics = true;

  // Track setup
  const track = new Track();
  track.name = 'Guitar';
  track.shortName = 'Gtr';
  const playback = new PlaybackInformation();
  playback.volume = 15;
  playback.balance = 8;
  playback.program = 29; // GM Overdriven Guitar — sounds right for rock riffs
  playback.primaryChannel = 0;
  playback.secondaryChannel = 1;
  track.playbackInfo = playback;

  const staff = new Staff();
  staff.showTablature = true;
  staff.showStandardNotation = true;
  // Standard tuning (high to low): E4 B3 G3 D3 A2 E2
  const tuning = Tuning.findTuning([64, 59, 55, 50, 45, 40]);
  if (tuning) staff.stringTuning = tuning;
  track.addStaff(staff);
  score.addTrack(track);

  // Power chord helper: two notes on strings 5(A) and 4(D) at same fret
  const pw = (fret: number) => [{string: 5, fret}, {string: 4, fret}];

  // Bar definitions
  const barDefs: BeatDef[][] = [
    // Bar 1: G5 - Bb5 - C5
    [noteBeat(Duration.Quarter, pw(0)), noteBeat(Duration.Quarter, pw(3)), noteBeat(Duration.Half, pw(5))],
    // Bar 2: G5 - Bb5 - Db5 C5 - rest
    [noteBeat(Duration.Quarter, pw(0)), noteBeat(Duration.Quarter, pw(3)), noteBeat(Duration.Eighth, pw(6)), noteBeat(Duration.Eighth, pw(5)), restBeat(Duration.Half)],
    // Bar 3: G5 - Bb5 - C5
    [noteBeat(Duration.Quarter, pw(0)), noteBeat(Duration.Quarter, pw(3)), noteBeat(Duration.Half, pw(5))],
    // Bar 4: Bb5 - G5
    [noteBeat(Duration.Half, pw(3)), noteBeat(Duration.Half, pw(0))],
    // Bar 5-8: repeat
    [noteBeat(Duration.Quarter, pw(0)), noteBeat(Duration.Quarter, pw(3)), noteBeat(Duration.Half, pw(5))],
    [noteBeat(Duration.Quarter, pw(0)), noteBeat(Duration.Quarter, pw(3)), noteBeat(Duration.Eighth, pw(6)), noteBeat(Duration.Eighth, pw(5)), restBeat(Duration.Half)],
    [noteBeat(Duration.Quarter, pw(0)), noteBeat(Duration.Quarter, pw(3)), noteBeat(Duration.Half, pw(5))],
    // Bar 8: ending G5 whole note
    [noteBeat(Duration.Whole, pw(0))],
  ];

  // Build master bars and staff bars
  for (let m = 0; m < barDefs.length; m++) {
    const mb = new MasterBar();
    mb.timeSignatureNumerator = 4;
    mb.timeSignatureDenominator = 4;
    if (m === 0) {
      const tempo = new Automation();
      tempo.isLinear = false;
      tempo.ratioPosition = 0;
      tempo.type = AutomationType.Tempo;
      tempo.value = 112;
      tempo.text = '';
      mb.tempoAutomations = [tempo];
    }
    score.addMasterBar(mb);
    buildBar(staff, barDefs[m]);
  }

  score.finish(new Settings());
  return score;
}
