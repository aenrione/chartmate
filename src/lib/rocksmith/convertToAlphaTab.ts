import {model, Settings} from '@coderline/alphatab';
import type {RocksmithArrangement, RocksmithNote, RocksmithChord} from './types';

const {
  Score,
  Track,
  Staff,
  Bar,
  Voice,
  Beat,
  Note,
  MasterBar,
  BendPoint,
  PlaybackInformation,
  Automation,
  Section,
  Duration,
  SlideOutType,
  HarmonicType,
  VibratoType,
  AutomationType,
  BendType,
  AccentuationType,
} = model;

// Standard guitar tuning MIDI values (E2 A2 D3 G3 B3 E4)
const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];

// General MIDI program numbers (0-indexed)
const GM_ACOUSTIC_NYLON = 24;
const GM_ACOUSTIC_STEEL = 25;
const GM_ELECTRIC_CLEAN = 27;
const GM_OVERDRIVEN = 29;
const GM_DISTORTION = 30;
const GM_BASS_FINGER = 33;
const GM_BASS_PICK = 34;

/**
 * Choose a MIDI program based on arrangement type and tuning offsets.
 * Lower/drop tunings typically indicate heavier tones.
 */
function chooseMidiProgram(
  arrangementType: 'Lead' | 'Rhythm' | 'Bass',
  tuning: number[],
): number {
  if (arrangementType === 'Bass') {
    const minOffset = Math.min(...tuning.slice(0, 4));
    return minOffset <= -2 ? GM_BASS_PICK : GM_BASS_FINGER;
  }

  const minOffset = Math.min(...tuning.slice(0, 6));
  const allEqual = tuning.slice(0, 6).every(v => v === tuning[0]);

  // Drop tuning: lowest string is dropped more than others (e.g. Drop D: [-2,0,0,0,0,0])
  const isDrop = !allEqual && tuning[0] <= -2 && tuning[1] > tuning[0];

  if (minOffset <= -3 || isDrop) {
    // Heavy drop or very low tuning → distortion
    return arrangementType === 'Lead' ? GM_DISTORTION : GM_OVERDRIVEN;
  }

  if (minOffset <= -1) {
    // Slightly lowered (Eb standard, D standard) → overdriven
    return arrangementType === 'Lead' ? GM_OVERDRIVEN : GM_ELECTRIC_CLEAN;
  }

  // Standard tuning → clean electric
  return arrangementType === 'Lead' ? GM_OVERDRIVEN : GM_ELECTRIC_CLEAN;
}

/**
 * Quantize a time-in-seconds value to the nearest beat duration.
 */
function quantizeDuration(seconds: number, bpm: number): number {
  const quarterNoteSec = 60 / bpm;
  const ratio = seconds / quarterNoteSec;

  if (ratio >= 3.5) return Duration.Whole;
  if (ratio >= 1.75) return Duration.Half;
  if (ratio >= 0.875) return Duration.Quarter;
  if (ratio >= 0.4375) return Duration.Eighth;
  if (ratio >= 0.21875) return Duration.Sixteenth;
  if (ratio >= 0.109375) return Duration.ThirtySecond;
  return Duration.SixtyFourth;
}

/**
 * Build the measure map from Rocksmith ebeats.
 */
function buildMeasures(arrangement: RocksmithArrangement) {
  const measures: {
    startTime: number;
    endTime: number;
    beatTimes: number[];
  }[] = [];

  let currentMeasureBeats: number[] = [];
  for (const beat of arrangement.beats) {
    if (beat.measure >= 0 && currentMeasureBeats.length > 0) {
      measures.push({
        startTime: currentMeasureBeats[0],
        endTime: beat.time,
        beatTimes: currentMeasureBeats,
      });
      currentMeasureBeats = [];
    }
    currentMeasureBeats.push(beat.time);
  }

  if (currentMeasureBeats.length > 0) {
    measures.push({
      startTime: currentMeasureBeats[0],
      endTime: arrangement.songLength,
      beatTimes: currentMeasureBeats,
    });
  }

  return measures;
}

interface MeasureRange {
  startTime: number;
  endTime: number;
}

interface TimedItem {
  time: number;
}

/**
 * Assign each item to the measure it belongs to by time.
 */
function assignToMeasures<T extends TimedItem>(
  items: T[],
  measures: MeasureRange[],
): T[][] {
  const result: T[][] = measures.map(() => []);
  let mIdx = 0;

  for (const item of items) {
    while (mIdx < measures.length - 1 && item.time >= measures[mIdx].endTime) {
      mIdx++;
    }
    if (mIdx < measures.length) {
      result[mIdx].push(item);
    }
  }

  return result;
}

type TimelineItem =
  | {type: 'note'; time: number; data: RocksmithNote}
  | {type: 'chord'; time: number; data: RocksmithChord};

function createAlphaTabNote(
  rsNote: RocksmithNote,
  beat: InstanceType<typeof Beat>,
): InstanceType<typeof Note> {
  const note = new Note();
  // alphaTab strings are 1-based, with 1 = highest string
  // Rocksmith strings are 0-based, with 0 = lowest string (low E)
  note.string = 6 - rsNote.string;
  note.fret = rsNote.fret;

  if (rsNote.hammerOn || rsNote.pullOff) {
    note.isHammerPullOrigin = true;
  }

  if (rsNote.harmonic) {
    note.harmonicType = HarmonicType.Natural;
  } else if (rsNote.harmonicPinch) {
    note.harmonicType = HarmonicType.Pinch;
  }

  if (rsNote.palmMute) {
    note.isPalmMute = true;
  }

  if (rsNote.mute) {
    note.isGhost = true;
    note.fret = 0;
  }

  if (rsNote.vibrato) {
    note.vibrato = VibratoType.Slight;
  }

  if (rsNote.accent) {
    note.accentuated = AccentuationType.Normal;
  }

  if (rsNote.linkNext) {
    // Set as tie destination on the *next* note during finish()
    note.isTieDestination = false;
    // We can't set isTieOrigin directly (it's a getter).
    // alphaTab's finish() resolves ties via tieDestination.
    // For now, we'll rely on the sustain-based approach below.
  }

  if (rsNote.slideTo >= 0) {
    note.slideOutType = SlideOutType.Shift;
  } else if (rsNote.slideUnpitchTo >= 0) {
    note.slideOutType =
      rsNote.slideUnpitchTo > rsNote.fret
        ? SlideOutType.OutUp
        : SlideOutType.OutDown;
  }

  if (rsNote.bendPoints && rsNote.bendPoints.length > 0) {
    // Use full bend curve data for accurate rendering
    // AlphaTab bend points use positions 0-60 (ratio within the note) and values in quarter-tones
    const noteStart = rsNote.time;
    const noteDuration = rsNote.sustain > 0 ? rsNote.sustain : 0.25; // fallback 250ms

    note.addBendPoint(new BendPoint(0, 0)); // always start at zero

    for (const bp of rsNote.bendPoints) {
      const relativePos = Math.round(((bp.time - noteStart) / noteDuration) * 60);
      const clampedPos = Math.max(1, Math.min(60, relativePos));
      const quarterTones = Math.round(bp.step * 4);
      note.addBendPoint(new BendPoint(clampedPos, quarterTones));
    }

    // Detect bend type from the curve shape
    const lastBend = rsNote.bendPoints[rsNote.bendPoints.length - 1];
    const firstBend = rsNote.bendPoints[0];
    if (firstBend.step > 0 && firstBend.time <= noteStart + 0.05) {
      // Pre-bend: starts bent
      note.bendType = BendType.Prebend;
      if (lastBend.step < firstBend.step) {
        note.bendType = BendType.PrebendRelease;
      }
    } else if (lastBend.step < rsNote.bend * 0.5) {
      // Ends lower than max — bend and release
      note.bendType = BendType.BendRelease;
    } else {
      note.bendType = BendType.Bend;
    }
  } else if (rsNote.bend > 0) {
    // Fallback: simple bend from maxBend value
    note.bendType = BendType.Bend;
    const bendValue = Math.round(rsNote.bend * 4);
    note.addBendPoint(new BendPoint(0, 0));
    note.addBendPoint(new BendPoint(60, bendValue));
  }

  // Tap is on the Beat level in alphaTab
  if (rsNote.tap) {
    beat.tap = true;
  }

  beat.addNote(note);
  return note;
}

export function convertToAlphaTab(arrangement: RocksmithArrangement): InstanceType<typeof Score> {
  const score = new Score();
  score.title = arrangement.title;
  score.artist = arrangement.artistName;
  score.album = arrangement.albumName;
  score.tab = 'Converted from Rocksmith';

  const tempoBpm = arrangement.averageTempo || 120;

  // Create track
  const track = new Track();
  track.name = arrangement.arrangementType;
  track.shortName = arrangement.arrangementType.substring(0, 3);

  const playback = new PlaybackInformation();
  playback.volume = 15;
  playback.balance = 8;
  playback.port = 0;
  playback.program = chooseMidiProgram(arrangement.arrangementType, arrangement.tuning);
  playback.primaryChannel = 0;
  playback.secondaryChannel = 1;
  track.playbackInfo = playback;

  // Staff setup
  const staff = new Staff();
  staff.showTablature = true;
  staff.showStandardNotation = true;
  staff.isPercussion = false;

  // Set tuning (alphaTab expects MIDI note values, highest string first)
  const stringCount = arrangement.arrangementType === 'Bass' ? 4 : 6;
  const tuningValues: number[] = [];
  for (let i = stringCount - 1; i >= 0; i--) {
    tuningValues.push(STANDARD_TUNING[i] + (arrangement.tuning[i] || 0));
  }

  // Use stringTuning (Tuning object) to set tuning
  const tuning = model.Tuning.findTuning(tuningValues);
  if (tuning) {
    staff.stringTuning = tuning;
  } else {
    // Create a custom tuning
    const customTuning = new model.Tuning('Custom', tuningValues, false);
    staff.stringTuning = customTuning;
  }
  staff.capo = arrangement.capoFret;

  track.addStaff(staff);
  score.addTrack(track);

  // Build measures from ebeats
  const measures = buildMeasures(arrangement);
  if (measures.length === 0) return score;

  // Merge notes and chords into a single sorted timeline
  const allItems: TimelineItem[] = [
    ...arrangement.notes.map(n => ({type: 'note' as const, time: n.time, data: n})),
    ...arrangement.chords.map(c => ({type: 'chord' as const, time: c.time, data: c})),
  ].sort((a, b) => a.time - b.time);

  const itemsByMeasure = assignToMeasures(allItems, measures);

  // Create master bars and bars for each measure
  for (let m = 0; m < measures.length; m++) {
    const measure = measures[m];
    const masterBar = new MasterBar();
    const beatsInMeasure = measure.beatTimes.length;

    masterBar.timeSignatureNumerator = beatsInMeasure;
    masterBar.timeSignatureDenominator = 4;

    if (m === 0) {
      const tempoAuto = new Automation();
      tempoAuto.isLinear = false;
      tempoAuto.ratioPosition = 0;
      tempoAuto.type = AutomationType.Tempo;
      tempoAuto.value = tempoBpm;
      tempoAuto.text = '';
      masterBar.tempoAutomations = [tempoAuto];
    }

    // Check for section marker
    const sectionMatch = arrangement.sections.find(
      s => s.startTime >= measure.startTime && s.startTime < measure.endTime,
    );
    if (sectionMatch) {
      const sec = new Section();
      sec.text = sectionMatch.name;
      sec.marker = '';
      masterBar.section = sec;
    }

    score.addMasterBar(masterBar);

    // Create bar for our track's staff
    const bar = new Bar();
    staff.addBar(bar);

    const voice = new Voice();
    bar.addVoice(voice);

    const measureItems = itemsByMeasure[m];

    if (measureItems.length === 0) {
      const restBeat = new Beat();
      restBeat.isEmpty = true;
      restBeat.duration = Duration.Whole;
      voice.addBeat(restBeat);
    } else {
      // Group items that occur at nearly the same time (within 10ms)
      const groups: TimelineItem[][] = [];
      let currentGroup: TimelineItem[] = [measureItems[0]];

      for (let i = 1; i < measureItems.length; i++) {
        if (Math.abs(measureItems[i].time - currentGroup[0].time) < 0.01) {
          currentGroup.push(measureItems[i]);
        } else {
          groups.push(currentGroup);
          currentGroup = [measureItems[i]];
        }
      }
      groups.push(currentGroup);

      for (let gIdx = 0; gIdx < groups.length; gIdx++) {
        const group = groups[gIdx];
        const beat = new Beat();

        // Estimate duration from gap to next event or measure end
        const currentTime = group[0].time;
        const nextGroupTime =
          gIdx + 1 < groups.length
            ? groups[gIdx + 1][0].time
            : measure.endTime;
        const gapSec = nextGroupTime - currentTime;
        beat.duration = quantizeDuration(gapSec, tempoBpm);

        for (const item of group) {
          if (item.type === 'note') {
            createAlphaTabNote(item.data, beat);
          } else {
            const chord = item.data;
            if (chord.chordNotes.length > 0) {
              for (const cn of chord.chordNotes) {
                createAlphaTabNote(cn, beat);
              }
            } else if (chord.chordId < arrangement.chordTemplates.length) {
              const tpl = arrangement.chordTemplates[chord.chordId];
              for (let s = 0; s < tpl.frets.length; s++) {
                if (tpl.frets[s] >= 0) {
                  const note = new Note();
                  note.string = 6 - s;
                  note.fret = tpl.frets[s];
                  beat.addNote(note);
                }
              }
            }
          }
        }

        voice.addBeat(beat);
      }
    }
  }

  // Finalize score (resolves ties, calculates timing, etc.)
  score.finish(new Settings());
  return score;
}
