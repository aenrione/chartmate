import {model, Settings} from '@coderline/alphatab';
import {
  NoteEvent,
  parseChartFile,
} from '@eliwhite/scan-chart';
import {tickToMs} from './chartUtils';
import {type DrumNoteInstrument, convertNoteToDrumInstrument} from './drumTypes';

type ParsedChart = ReturnType<typeof parseChartFile>;

const {
  Score,
  Track,
  Staff,
  Bar,
  Voice,
  Beat,
  Note,
  MasterBar,
  PlaybackInformation,
  Automation,
  Section,
  Duration,
  AutomationType,
  Clef,
} = model;

// Map drum instruments to General MIDI percussion note numbers
const DRUM_MIDI_MAP: Record<DrumNoteInstrument, number> = {
  kick: 36,       // Bass Drum 1
  snare: 38,      // Acoustic Snare
  hihat: 42,      // Closed Hi-Hat
  ride: 51,       // Ride Cymbal 1
  crash: 49,      // Crash Cymbal 1
  'high-tom': 48, // Hi-Mid Tom
  'mid-tom': 45,  // Low Tom
  'floor-tom': 41, // Low Floor Tom
};

// Map tick duration ratios to AlphaTab Duration enum values
function ticksToDuration(durationTicks: number, ppq: number): {duration: number; dots: number; isTuplet: boolean} {
  // Exact matches first
  const ratios: Array<{ratio: number; duration: number; dots: number; isTuplet: boolean}> = [
    {ratio: 4,       duration: Duration.Whole,        dots: 0, isTuplet: false},
    {ratio: 3,       duration: Duration.Half,         dots: 1, isTuplet: false},  // dotted half
    {ratio: 2,       duration: Duration.Half,         dots: 0, isTuplet: false},
    {ratio: 1.5,     duration: Duration.Quarter,      dots: 1, isTuplet: false},  // dotted quarter
    {ratio: 1,       duration: Duration.Quarter,      dots: 0, isTuplet: false},
    {ratio: 2/3,     duration: Duration.Quarter,      dots: 0, isTuplet: true},   // triplet quarter
    {ratio: 0.75,    duration: Duration.Eighth,       dots: 1, isTuplet: false},  // dotted eighth
    {ratio: 0.5,     duration: Duration.Eighth,       dots: 0, isTuplet: false},
    {ratio: 1/3,     duration: Duration.Eighth,       dots: 0, isTuplet: true},   // triplet eighth
    {ratio: 0.375,   duration: Duration.Sixteenth,    dots: 1, isTuplet: false},  // dotted 16th
    {ratio: 0.25,    duration: Duration.Sixteenth,    dots: 0, isTuplet: false},
    {ratio: 1/6,     duration: Duration.Sixteenth,    dots: 0, isTuplet: true},   // triplet 16th
    {ratio: 0.1875,  duration: Duration.ThirtySecond, dots: 1, isTuplet: false},  // dotted 32nd
    {ratio: 0.125,   duration: Duration.ThirtySecond, dots: 0, isTuplet: false},
    {ratio: 1/12,    duration: Duration.ThirtySecond, dots: 0, isTuplet: true},   // triplet 32nd
    {ratio: 0.0625,  duration: Duration.SixtyFourth,  dots: 0, isTuplet: false},
  ];

  const tickRatio = durationTicks / ppq;

  // Find closest match
  let bestMatch = ratios[ratios.length - 1];
  let bestDiff = Infinity;
  for (const r of ratios) {
    const diff = Math.abs(tickRatio - r.ratio);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestMatch = r;
    }
  }

  return bestMatch;
}

interface ConvertOptions {
  noteAnnotations?: string[];
  lyrics?: {tick: number; text: string; msTime: number}[];
  sections?: {tick: number; name: string; msTime: number; msLength: number}[];
}

/**
 * Convert a ParsedChart (from @eliwhite/scan-chart) to an AlphaTab Score for percussion rendering.
 */
export default function convertToAlphaTabDrums(
  chart: ParsedChart,
  track: ParsedChart['trackData'][0],
  options: ConvertOptions = {},
): InstanceType<typeof Score> {
  const {noteAnnotations, lyrics, sections} = options;
  const ppq = chart.resolution;

  // Build score
  const score = new Score();
  score.title = '';
  score.artist = '';
  score.stylesheet.hideDynamics = true;

  // Create percussion track
  const alphaTrack = new Track();
  alphaTrack.name = 'Drums';
  alphaTrack.shortName = 'Dr.';

  const playback = new PlaybackInformation();
  playback.volume = 15;
  playback.balance = 8;
  playback.port = 0;
  playback.program = 0;
  playback.primaryChannel = 9;
  playback.secondaryChannel = 9;
  alphaTrack.playbackInfo = playback;

  const staff = new Staff();
  staff.isPercussion = true;
  staff.showTablature = false;
  staff.showStandardNotation = true;

  alphaTrack.addStaff(staff);
  score.addTrack(alphaTrack);

  // Build measure boundaries from time signatures
  const measureInfos = buildMeasureBoundaries(chart, track);

  // Helper to find which measure an event at a given msTime belongs to
  function findMeasureIndex(msTime: number): number {
    let idx = measureInfos.findIndex(mi => msTime >= mi.startMs && msTime < mi.endMs);
    if (idx === -1 && msTime < (measureInfos[0]?.startMs ?? 0)) idx = 0;
    if (idx === -1) {
      idx = measureInfos.findIndex(mi => mi.startMs >= msTime);
      if (idx === -1) idx = measureInfos.length - 1;
    }
    return idx;
  }

  // Build section map (measureIndex → section name)
  const sectionMap = new Map<number, string>();
  if (sections) {
    for (const section of sections) {
      const idx = findMeasureIndex(section.msTime);
      if (idx >= 0 && !sectionMap.has(idx)) {
        sectionMap.set(idx, section.name);
      }
    }
  }

  // Build lyrics map (measureIndex → lyric entries)
  const lyricsMap = new Map<number, {text: string; tick: number}[]>();
  if (lyrics) {
    for (const lyric of lyrics) {
      const idx = findMeasureIndex(lyric.msTime);
      if (idx >= 0) {
        if (!lyricsMap.has(idx)) lyricsMap.set(idx, []);
        lyricsMap.get(idx)!.push({text: lyric.text, tick: lyric.tick});
      }
    }
  }

  // Index into noteEventGroups
  let noteGroupIndex = 0;
  const noteGroups = track.noteEventGroups;
  let annotationIndex = 0;

  // Create AlphaTab bars for each measure
  measureInfos.forEach((mi, measureIndex) => {
    const masterBar = new MasterBar();
    masterBar.timeSignatureNumerator = mi.timeSigNum;
    masterBar.timeSignatureDenominator = mi.timeSigDen;

    // Add tempo automation on first bar
    if (measureIndex === 0) {
      const tempoAuto = new Automation();
      tempoAuto.isLinear = false;
      tempoAuto.ratioPosition = 0;
      tempoAuto.type = AutomationType.Tempo;
      tempoAuto.value = Math.round(chart.tempos[0]?.beatsPerMinute ?? 120);
      tempoAuto.text = '';
      masterBar.tempoAutomations = [tempoAuto];
    }

    // Add section marker
    const sectionName = sectionMap.get(measureIndex);
    if (sectionName) {
      masterBar.section = new Section();
      masterBar.section.text = sectionName;
      masterBar.section.marker = '';
    }

    score.addMasterBar(masterBar);

    const bar = new Bar();
    bar.clef = Clef.Neutral;
    staff.addBar(bar);

    const voice = new Voice();
    bar.addVoice(voice);

    // Collect note groups that fall within this measure
    const measureNoteGroups: {tick: number; notes: NoteEvent[]}[] = [];
    while (
      noteGroupIndex < noteGroups.length &&
      noteGroups[noteGroupIndex][0].tick >= mi.startTick &&
      noteGroups[noteGroupIndex][0].tick < mi.endTick
    ) {
      measureNoteGroups.push({
        tick: noteGroups[noteGroupIndex][0].tick,
        notes: noteGroups[noteGroupIndex],
      });
      noteGroupIndex++;
    }

    // Get lyrics for this measure
    const measureLyrics = lyricsMap.get(measureIndex) ?? [];
    let lyricIdx = 0;

    if (measureNoteGroups.length === 0) {
      // Empty measure — whole rest
      const restBeat = new Beat();
      restBeat.isEmpty = true;
      restBeat.duration = Duration.Whole;
      voice.addBeat(restBeat);
    } else {
      // Create beats from note groups, filling gaps with rests
      let currentTick = mi.startTick;

      for (let i = 0; i < measureNoteGroups.length; i++) {
        const group = measureNoteGroups[i];
        const nextTick = measureNoteGroups[i + 1]?.tick ?? mi.endTick;

        // Insert rest if there's a gap before this note group
        if (group.tick > currentTick) {
          const gapTicks = group.tick - currentTick;
          const restBeats = splitIntoBeats(gapTicks, ppq);
          for (const rb of restBeats) {
            const restBeat = new Beat();
            restBeat.isEmpty = true;
            restBeat.duration = rb.duration;
            restBeat.dots = rb.dots;
            voice.addBeat(restBeat);
          }
        }

        // Create the note beat
        const noteDurationTicks = nextTick - group.tick;
        const dur = ticksToDuration(noteDurationTicks, ppq);

        const beat = new Beat();
        beat.duration = dur.duration;
        beat.dots = dur.dots;

        // Add percussion notes
        for (const noteEvent of group.notes) {
          const instrument = convertNoteToDrumInstrument(noteEvent);
          const midiNote = DRUM_MIDI_MAP[instrument];

          const note = new Note();
          note.percussionArticulation = midiNote;
          // For percussion, string/fret are not meaningful but need valid values
          note.string = -1;
          note.fret = -1;
          beat.addNote(note);
        }

        // Add sticking annotation as lyrics
        if (noteAnnotations && noteAnnotations.length > 0) {
          const ann = noteAnnotations[annotationIndex % noteAnnotations.length];
          beat.lyrics = [ann];
          annotationIndex++;
        }

        // Add song lyrics if a lyric falls near this beat's tick
        if (!noteAnnotations && measureLyrics.length > 0 && lyricIdx < measureLyrics.length) {
          const lyric = measureLyrics[lyricIdx];
          // Check if this lyric is closest to the current beat
          if (lyric.tick >= currentTick && lyric.tick < nextTick) {
            beat.lyrics = [lyric.text];
            lyricIdx++;
          }
        }

        voice.addBeat(beat);
        currentTick = nextTick;
      }

      // Fill any remaining gap after last note group
      if (currentTick < mi.endTick) {
        const gapTicks = mi.endTick - currentTick;
        const restBeats = splitIntoBeats(gapTicks, ppq);
        for (const rb of restBeats) {
          const restBeat = new Beat();
          restBeat.isEmpty = true;
          restBeat.duration = rb.duration;
          restBeat.dots = rb.dots;
          voice.addBeat(restBeat);
        }
      }
    }
  });

  score.finish(new Settings());
  return score;
}

/**
 * Split a tick duration into one or more beat durations that sum to the total.
 * Used for rest fills.
 */
function splitIntoBeats(
  totalTicks: number,
  ppq: number,
): Array<{duration: number; dots: number}> {
  const result: Array<{duration: number; dots: number}> = [];
  let remaining = totalTicks;

  // Standard durations in descending order (in ticks)
  const standardDurations = [
    {ticks: ppq * 4,  duration: Duration.Whole,        dots: 0},
    {ticks: ppq * 3,  duration: Duration.Half,         dots: 1},
    {ticks: ppq * 2,  duration: Duration.Half,         dots: 0},
    {ticks: ppq * 1.5, duration: Duration.Quarter,     dots: 1},
    {ticks: ppq,      duration: Duration.Quarter,      dots: 0},
    {ticks: ppq / 2,  duration: Duration.Eighth,       dots: 0},
    {ticks: ppq / 4,  duration: Duration.Sixteenth,    dots: 0},
    {ticks: ppq / 8,  duration: Duration.ThirtySecond, dots: 0},
    {ticks: ppq / 16, duration: Duration.SixtyFourth,  dots: 0},
  ];

  while (remaining > 0) {
    let found = false;
    for (const sd of standardDurations) {
      if (sd.ticks <= remaining + 0.5) { // small tolerance for float imprecision
        result.push({duration: sd.duration, dots: sd.dots});
        remaining -= sd.ticks;
        found = true;
        break;
      }
    }
    if (!found) {
      // Fallback: use smallest duration
      result.push({duration: Duration.SixtyFourth, dots: 0});
      break;
    }
  }

  return result;
}

/**
 * Measure timing info used for practice mode overlays and measure click handling.
 */
export interface DrumMeasureInfo {
  startMs: number;
  endMs: number;
  startTick: number;
  endTick: number;
  timeSigNum: number;
  timeSigDen: number;
  barIndex: number;
}

export function buildMeasureBoundaries(
  chart: ParsedChart,
  track: ParsedChart['trackData'][0],
): DrumMeasureInfo[] {
  const ppq = chart.resolution;
  const endOfTrackTicks =
    track.noteEventGroups.length > 0
      ? track.noteEventGroups[track.noteEventGroups.length - 1][0].tick
      : 0;

  const result: DrumMeasureInfo[] = [];
  let startTick = 0;
  let barIndex = 0;

  chart.timeSignatures.forEach((timeSig, index) => {
    const pulsesPerDivision = ppq / (timeSig.denominator / 4);
    const nextTimeSigTick = chart.timeSignatures[index + 1]?.tick ?? endOfTrackTicks;
    const totalTimeSigTicks = nextTimeSigTick - timeSig.tick;
    const numberOfMeasures = Math.ceil(
      totalTimeSigTicks / pulsesPerDivision / timeSig.numerator,
    );

    for (let m = 0; m < numberOfMeasures; m++) {
      const endTick = startTick + timeSig.numerator * pulsesPerDivision;
      result.push({
        startMs: tickToMs(chart, startTick),
        endMs: tickToMs(chart, endTick),
        startTick,
        endTick,
        timeSigNum: timeSig.numerator,
        timeSigDen: timeSig.denominator,
        barIndex,
      });
      startTick = endTick;
      barIndex++;
    }
  });

  return result;
}
