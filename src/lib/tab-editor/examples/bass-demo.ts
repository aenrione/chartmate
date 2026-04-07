import {model, Settings} from '@coderline/alphatab';
import {createBlankScore} from '../newScore';

const {Duration, Beat: BeatClass, Note: NoteClass, Voice: VoiceClass} = model;

type BeatDef = InstanceType<typeof BeatClass>;

function noteBeat(duration: number, string: number, fret: number): BeatDef {
  const beat = new BeatClass();
  beat.duration = duration;
  const note = new NoteClass();
  note.string = string;
  note.fret = fret;
  beat.addNote(note);
  return beat;
}

function restBeat(duration: number): BeatDef {
  const beat = new BeatClass();
  beat.duration = duration;
  beat.isEmpty = true;
  return beat;
}

function rebuildBar(staff: InstanceType<typeof model.Staff>, barIndex: number): InstanceType<typeof model.Voice> {
  const bar = staff.bars[barIndex];
  const voice = new VoiceClass();
  bar.voices[0] = voice;
  voice.bar = bar;
  return voice;
}

/**
 * Creates a bass demo: classic rock bass line.
 * 8 bars in 4/4 at 110 BPM on a 4-string bass in standard tuning (E1 A1 D2 G2).
 *
 * AlphaTab bass strings: 1=G2(high), 2=D2, 3=A1, 4=E1(low)
 *
 * Simple root-fifth pattern following a I-IV-V-I progression in E:
 *   E (bars 1-2) → A (bars 3-4) → B (bars 5-6) → E (bars 7-8)
 */
export function createBassDemo(): InstanceType<typeof model.Score> {
  const score = createBlankScore({
    title: 'Rock Bass Line',
    artist: 'Chartmate Demo',
    tempo: 110,
    measureCount: 8,
    instrument: 'bass',
  });

  const staff = score.tracks[0].staves[0];
  // Bass strings: 1=G2, 2=D2, 3=A1, 4=E1

  // Bar 1: E root eighth note pattern — E(0) E(0) E(0) G(3) A(5) E(0) B(7) E(0)
  {
    const v = rebuildBar(staff, 0);
    const frets = [0, 0, 0, 3, 5, 0, 7, 0];
    for (const f of frets) v.addBeat(noteBeat(Duration.Eighth, 4, f));
  }

  // Bar 2: E with octave — E(0) on string 4, E(2) on string 2
  {
    const v = rebuildBar(staff, 1);
    v.addBeat(noteBeat(Duration.Quarter, 4, 0));
    v.addBeat(noteBeat(Duration.Quarter, 2, 2));
    v.addBeat(noteBeat(Duration.Quarter, 4, 0));
    v.addBeat(noteBeat(Duration.Quarter, 2, 2));
  }

  // Bar 3: A root pattern — A(0) on string 3
  {
    const v = rebuildBar(staff, 2);
    const frets = [0, 0, 0, 2, 4, 0, 5, 0];
    for (const f of frets) v.addBeat(noteBeat(Duration.Eighth, 3, f));
  }

  // Bar 4: A with walk-up to B
  {
    const v = rebuildBar(staff, 3);
    v.addBeat(noteBeat(Duration.Quarter, 3, 0));
    v.addBeat(noteBeat(Duration.Quarter, 3, 0));
    v.addBeat(noteBeat(Duration.Quarter, 3, 0));
    v.addBeat(noteBeat(Duration.Eighth, 3, 1));
    v.addBeat(noteBeat(Duration.Eighth, 3, 2));
  }

  // Bar 5: B root pattern — B(2) on string 3
  {
    const v = rebuildBar(staff, 4);
    const frets = [2, 2, 2, 4, 2, 2, 4, 2];
    for (const f of frets) v.addBeat(noteBeat(Duration.Eighth, 3, f));
  }

  // Bar 6: B with walk-down to A
  {
    const v = rebuildBar(staff, 5);
    v.addBeat(noteBeat(Duration.Quarter, 3, 2));
    v.addBeat(noteBeat(Duration.Quarter, 3, 2));
    v.addBeat(noteBeat(Duration.Quarter, 3, 2));
    v.addBeat(noteBeat(Duration.Eighth, 3, 1));
    v.addBeat(noteBeat(Duration.Eighth, 3, 0));
  }

  // Bar 7: Back to E — driving eighths
  {
    const v = rebuildBar(staff, 6);
    const frets = [0, 0, 3, 5, 7, 5, 3, 0];
    for (const f of frets) v.addBeat(noteBeat(Duration.Eighth, 4, f));
  }

  // Bar 8: E ending — whole note
  {
    const v = rebuildBar(staff, 7);
    v.addBeat(noteBeat(Duration.Whole, 4, 0));
  }

  score.finish(new Settings());
  return score;
}
