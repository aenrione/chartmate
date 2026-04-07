import {model, Settings} from '@coderline/alphatab';
import {createBlankScore} from '../newScore';

const {Duration, Beat: BeatClass, Note: NoteClass, Voice: VoiceClass, Bar} = model;

const KICK = 36;
const SNARE = 38;
const HIHAT_CLOSED = 42;
const HIHAT_OPEN = 46;
const RIDE = 51;
const CRASH = 49;
const HIGH_TOM = 50;
const MID_TOM = 47;
const FLOOR_TOM = 41;

type BeatDef = InstanceType<typeof BeatClass>;

function drumBeat(duration: number, hits: number[]): BeatDef {
  const beat = new BeatClass();
  beat.duration = duration;
  for (const midi of hits) {
    const note = new NoteClass();
    note.percussionArticulation = midi;
    beat.addNote(note);
  }
  return beat;
}

function rebuildBar(staff: InstanceType<typeof model.Staff>, barIndex: number): InstanceType<typeof model.Voice> {
  const bar = staff.bars[barIndex];
  const voice = new VoiceClass();
  bar.voices[0] = voice;
  voice.bar = bar;
  return voice;
}

function writeRockBar(voice: InstanceType<typeof model.Voice>, variant: 'basic' | 'open-hh' | 'double-kick' | 'ride' | 'fill' | 'crash-end') {
  for (let i = 0; i < 8; i++) {
    const hits: number[] = [];

    if (variant === 'ride') hits.push(RIDE);
    else if (variant === 'fill') {
      if (i < 2) hits.push(HIHAT_CLOSED);
      else if (i < 4) hits.push(SNARE);
      else if (i < 6) hits.push(HIGH_TOM);
      else if (i === 6) hits.push(MID_TOM);
      else hits.push(FLOOR_TOM);
    } else if (variant === 'crash-end' && i === 0) {
      hits.push(CRASH);
    } else if (variant === 'open-hh' && i === 7) {
      hits.push(HIHAT_OPEN);
    } else {
      hits.push(HIHAT_CLOSED);
    }

    // Kick pattern
    if (variant === 'double-kick') {
      if (i === 0 || i === 1 || i === 4 || i === 5) hits.push(KICK);
    } else if (variant === 'fill') {
      if (i === 0) hits.push(KICK);
    } else {
      if (i === 0 || i === 4) hits.push(KICK);
    }

    // Snare on 2 and 4 (not for fill)
    if (variant !== 'fill') {
      if (i === 2 || i === 6) hits.push(SNARE);
    }

    voice.addBeat(drumBeat(Duration.Eighth, hits));
  }
}

/**
 * Creates a demo drum pattern: "Basic Rock Beat"
 * 8 bars in 4/4 at 120 BPM.
 * Uses createBlankScore to ensure proper AlphaTab layout group setup.
 */
export function createDrumsDemo(): InstanceType<typeof model.Score> {
  const score = createBlankScore({
    title: 'Basic Rock Beat',
    artist: 'Chartmate Demo',
    tempo: 120,
    measureCount: 8,
    instrument: 'drums',
  });

  const staff = score.tracks[0].staves[0];
  const variants: Array<'basic' | 'open-hh' | 'double-kick' | 'ride' | 'fill' | 'crash-end'> = [
    'basic', 'basic', 'open-hh', 'double-kick',
    'ride', 'ride', 'fill', 'crash-end',
  ];

  for (let m = 0; m < variants.length; m++) {
    const voice = rebuildBar(staff, m);
    writeRockBar(voice, variants[m]);
  }

  score.finish(new Settings());
  return score;
}
