import {describe, it, expect} from 'vitest';
import {model, Settings} from '@coderline/alphatab';
import {
  deriveStrummingRuns,
  analyzeStrumming,
  formatStrummingRun,
  describeRunRange,
  markForSlot,
  type StrumBarInput,
  type StrumBeatInput,
  type StrokeDirection,
} from '../strummingPattern';
import {createBlankScore} from '../newScore';

const EIGHTH = 480;
const QUARTER = 960;
const SIXTEENTH = 240;

function beat(
  start: number,
  duration: number,
  brush: StrokeDirection | null,
  stringCount: number,
  extra: Partial<StrumBeatInput> = {},
): StrumBeatInput {
  return {start, duration, brush, stringCount, muted: false, accented: false, ...extra};
}

/** A bar of alternating eighth strums; `widths` is the string count per slot. */
function strummedBar(
  index: number,
  widths: number[],
  opts: {numerator?: number; denominator?: number; unit?: number} = {},
): StrumBarInput {
  const unit = opts.unit ?? EIGHTH;
  return {
    index,
    numerator: opts.numerator ?? 4,
    denominator: opts.denominator ?? 4,
    beats: widths.map((w, i) =>
      beat(i * unit, unit, i % 2 === 0 ? 'down' : 'up', w),
    ),
  };
}

/** Society's bar: full down, full up, 3-string graze, then full strums. */
const SOCIETY_SIX = [6, 5, 3, 5, 6, 5, 6, 5];
const SOCIETY_FIVE = [5, 5, 3, 5, 5, 5, 5, 5];

describe('deriveStrummingRuns', () => {
  it('reports nothing for a fingerpicked score', () => {
    const bars: StrumBarInput[] = [0, 1, 2, 3].map(index => ({
      index,
      numerator: 4,
      denominator: 4,
      beats: [0, 1, 2, 3, 4, 5, 6, 7].map(i => beat(i * EIGHTH, EIGHTH, null, 1)),
    }));

    const analysis = deriveStrummingRuns(bars);

    expect(analysis.runs).toEqual([]);
    expect(analysis.strummedBars).toBe(0);
    expect(analysis.skippedBars).toEqual([]);
  });

  it('reports nothing for an empty score', () => {
    expect(deriveStrummingRuns([]).runs).toEqual([]);
  });

  it('groups Society-style bars into one run across different chord shapes', () => {
    // Bars 1-4 use a six-string shape, bars 5-8 a five-string shape. The hand
    // does the same thing in both, so it must read as a single pattern.
    const bars = [
      ...[0, 1, 2, 3].map(i => strummedBar(i, SOCIETY_SIX)),
      ...[4, 5, 6, 7].map(i => strummedBar(i, SOCIETY_FIVE)),
    ];

    const analysis = deriveStrummingRuns(bars);

    expect(analysis.runs).toHaveLength(1);
    const [run] = analysis.runs;
    expect(run.startBar).toBe(1);
    expect(run.endBar).toBe(8);
    expect(run.barCount).toBe(8);
    expect(run.timeSignature).toBe('4/4');
    expect(run.counts).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
    expect(run.marks.join('')).toBe('DUdUDUDU');
    expect(run.hasAccents).toBe(false);
    expect(analysis.strummedBars).toBe(8);
  });

  it('lays the run out as a count row over a stroke row', () => {
    const run = deriveStrummingRuns([strummedBar(0, SOCIETY_SIX)]).runs[0];

    expect(formatStrummingRun(run)).toBe(
      ['1  &  2  &  3  &  4  &', 'D  U  d  U  D  U  D  U'].join('\n'),
    );
    expect(describeRunRange(run)).toBe('bar 1');
  });

  it('adds an accent row when strokes are accented', () => {
    // Society's upstrokes are the strong ones.
    const bar = strummedBar(0, SOCIETY_SIX);
    bar.beats.forEach((b, i) => {
      if (i % 2 === 1) b.accented = true;
    });

    const run = deriveStrummingRuns([bar]).runs[0];

    expect(run.hasAccents).toBe(true);
    expect(formatStrummingRun(run)).toBe(
      [
        '   >     >     >     >',
        '1  &  2  &  3  &  4  &',
        'D  U  d  U  D  U  D  U',
      ].join('\n'),
    );
  });

  it('starts a new run when the accents change', () => {
    const plain = [0, 1].map(i => strummedBar(i, SOCIETY_SIX));
    const accented = [2, 3].map(i => {
      const bar = strummedBar(i, SOCIETY_SIX);
      bar.beats.forEach((b, n) => {
        if (n % 2 === 1) b.accented = true;
      });
      return bar;
    });

    const analysis = deriveStrummingRuns([...plain, ...accented]);

    expect(analysis.runs.map(r => [r.startBar, r.endBar])).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(analysis.runs[1].differsFromPrevious).toEqual([1, 3, 5, 7]);
  });

  describe('stroke widths', () => {
    it('marks a narrow stroke as partial and a slightly narrower one as full', () => {
      const run = deriveStrummingRuns([strummedBar(0, SOCIETY_SIX)]).runs[0];

      // 6/6 and 5/6 are both "full"; 3/6 is the deliberate graze.
      expect(run.slots.map(s => s.width)).toEqual([
        'full', 'full', 'partial', 'full', 'full', 'full', 'full', 'full',
      ]);
    });

    it('normalises width against the widest stroke of the same bar', () => {
      // In a five-string shape 5/5 is full and 3/5 is still partial, so the
      // marks match the six-string bar exactly.
      const six = deriveStrummingRuns([strummedBar(0, SOCIETY_SIX)]).runs[0];
      const five = deriveStrummingRuns([strummedBar(0, SOCIETY_FIVE)]).runs[0];

      expect(five.marks).toEqual(six.marks);
      expect(five.signature).toBe(six.signature);
    });

    it('treats a single-string bar as full rather than partial', () => {
      const bar: StrumBarInput = {
        index: 0,
        numerator: 4,
        denominator: 4,
        beats: [beat(0, QUARTER, 'down', 1)],
      };

      expect(deriveStrummingRuns([bar]).runs[0].marks[0]).toBe('D');
    });
  });

  describe('muted strokes', () => {
    it('marks dead strokes with X (down) and x (up)', () => {
      const bar = strummedBar(0, [6, 5, 6, 5, 6, 5, 6, 5]);
      bar.beats[2].muted = true;
      bar.beats[3].muted = true;

      const run = deriveStrummingRuns([bar]).runs[0];

      expect(run.marks.join('')).toBe('DUXxDUDU');
    });

    it('breaks the run when a bar mutes a stroke the previous one did not', () => {
      const plain = strummedBar(0, SOCIETY_SIX);
      const muted = strummedBar(1, SOCIETY_SIX);
      muted.beats[6].muted = true;

      const analysis = deriveStrummingRuns([plain, muted]);

      expect(analysis.runs).toHaveLength(2);
      expect(analysis.runs[1].differsFromPrevious).toEqual([6]);
      expect(analysis.runs[1].marks[6]).toBe('X');
    });
  });

  describe('skipped and non-brushed slots', () => {
    it('leaves a blank mark where nothing sounds', () => {
      const bar: StrumBarInput = {
        index: 0,
        numerator: 4,
        denominator: 4,
        beats: [
          beat(0, QUARTER, 'down', 6),
          beat(QUARTER, EIGHTH, null, 0), // rest on beat 2
          beat(QUARTER + EIGHTH, EIGHTH, 'up', 5), // the "2 &"
          beat(2 * QUARTER, 2 * QUARTER, 'down', 6),
        ],
      };

      const run = deriveStrummingRuns([bar]).runs[0];

      expect(run.counts).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
      expect(run.marks).toEqual(['D', ' ', ' ', 'U', 'D', ' ', ' ', ' ']);
    });

    it('uses the coarsest grid the sounding onsets allow', () => {
      // Four quarter-note strums do not need an "&" row.
      const bar: StrumBarInput = {
        index: 0,
        numerator: 4,
        denominator: 4,
        beats: [0, 1, 2, 3].map(i =>
          beat(i * QUARTER, QUARTER, i % 2 === 0 ? 'down' : 'up', 6),
        ),
      };

      const run = deriveStrummingRuns([bar]).runs[0];

      expect(run.counts).toEqual(['1', '2', '3', '4']);
      expect(run.marks.join('')).toBe('DUDU');
    });

    it('marks a plucked beat inside a strummed bar with o', () => {
      const bar = strummedBar(0, SOCIETY_SIX);
      bar.beats[4].brush = null;
      bar.beats[4].stringCount = 1;

      expect(deriveStrummingRuns([bar]).runs[0].marks.join('')).toBe('DUdUoUDU');
    });

    it('breaks a run across a fingerpicked bar', () => {
      const picked: StrumBarInput = {
        index: 2,
        numerator: 4,
        denominator: 4,
        beats: [0, 1, 2, 3].map(i => beat(i * QUARTER, QUARTER, null, 1)),
      };
      const bars = [
        strummedBar(0, SOCIETY_SIX),
        strummedBar(1, SOCIETY_SIX),
        picked,
        strummedBar(3, SOCIETY_SIX),
        strummedBar(4, SOCIETY_SIX),
      ];

      const analysis = deriveStrummingRuns(bars);

      expect(analysis.runs.map(r => [r.startBar, r.endBar])).toEqual([
        [1, 2],
        [4, 5],
      ]);
      // Not adjacent, so the second run has nothing to diff against.
      expect(analysis.runs[1].differsFromPrevious).toBeNull();
      expect(analysis.strummedBars).toBe(4);
    });
  });

  describe('meters other than 4/4', () => {
    it('counts 6/8 in eighths', () => {
      const bar = strummedBar(0, [6, 5, 5, 6, 5, 5], {numerator: 6, denominator: 8});

      const run = deriveStrummingRuns([bar]).runs[0];

      expect(run.timeSignature).toBe('6/8');
      expect(run.counts).toEqual(['1', '2', '3', '4', '5', '6']);
      expect(run.marks.join('')).toBe('DUDUDU');
    });

    it('counts 3/4 in eighths with & off-beats', () => {
      const bar = strummedBar(0, [6, 5, 3, 5, 6, 5], {numerator: 3, denominator: 4});

      const run = deriveStrummingRuns([bar]).runs[0];

      expect(run.timeSignature).toBe('3/4');
      expect(run.counts).toEqual(['1', '&', '2', '&', '3', '&']);
      expect(run.marks.join('')).toBe('DUdUDU');
    });

    it('counts sixteenths as 1 e & a', () => {
      const bar = strummedBar(0, [6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5], {
        unit: SIXTEENTH,
      });

      const run = deriveStrummingRuns([bar]).runs[0];

      expect(run.counts.slice(0, 8)).toEqual(['1', 'e', '&', 'a', '2', 'e', '&', 'a']);
      expect(run.marks).toHaveLength(16);
    });

    it('never merges bars in different meters', () => {
      const analysis = deriveStrummingRuns([
        strummedBar(0, [6, 5, 3, 5, 6, 5, 6, 5]),
        strummedBar(1, [6, 5, 3, 5, 6, 5], {numerator: 3, denominator: 4}),
      ]);

      expect(analysis.runs).toHaveLength(2);
      expect(analysis.runs.map(r => r.timeSignature)).toEqual(['4/4', '3/4']);
      expect(analysis.runs[1].differsFromPrevious).toBeNull();
    });

    it('skips a bar whose subdivision is finer than sixteenths', () => {
      const bar: StrumBarInput = {
        index: 0,
        numerator: 4,
        denominator: 4,
        beats: [
          beat(0, 120, 'down', 6),
          beat(120, 120, 'up', 5),
          beat(240, 3600, 'down', 6),
        ],
      };

      const analysis = deriveStrummingRuns([bar]);

      expect(analysis.runs).toEqual([]);
      expect(analysis.skippedBars).toEqual([0]);
      expect(analysis.strummedBars).toBe(1);
    });
  });

  it('splits a long song into runs and keeps the bar numbers 1-based', () => {
    const bars = [
      ...Array.from({length: 56}, (_, i) => strummedBar(i, SOCIETY_SIX)),
      // bars 57-76 drop the graze: straight eighths all the way down.
      ...Array.from({length: 20}, (_, i) => strummedBar(56 + i, [6, 5, 6, 5, 6, 5, 6, 5])),
    ];

    const analysis = deriveStrummingRuns(bars);

    expect(analysis.runs.map(r => [r.startBar, r.endBar, r.barCount])).toEqual([
      [1, 56, 56],
      [57, 76, 20],
    ]);
    expect(describeRunRange(analysis.runs[1])).toBe('bars 57–76 (20 bars)');
    expect(analysis.runs[1].differsFromPrevious).toEqual([2]);
  });
});

describe('markForSlot', () => {
  it('maps every slot shape to its character', () => {
    const base = {label: '1', sounds: true, muted: false, accented: false};
    expect(markForSlot({...base, direction: 'down', width: 'full'})).toBe('D');
    expect(markForSlot({...base, direction: 'up', width: 'full'})).toBe('U');
    expect(markForSlot({...base, direction: 'down', width: 'partial'})).toBe('d');
    expect(markForSlot({...base, direction: 'up', width: 'partial'})).toBe('u');
    expect(markForSlot({...base, direction: 'down', width: 'full', muted: true})).toBe('X');
    expect(markForSlot({...base, direction: 'up', width: 'full', muted: true})).toBe('x');
    expect(markForSlot({...base, direction: null, width: 'full'})).toBe('o');
    expect(markForSlot({...base, sounds: false, direction: null, width: null})).toBe(' ');
  });
});

describe('analyzeStrumming (AlphaTab adapter)', () => {
  const {Beat, Note, Duration, BrushType, AccentuationType} = model;

  /** Build a real AlphaTab score of Society-style strummed bars. */
  function buildScore(barCount: number, widths: number[], accentUpstrokes = false) {
    const score = createBlankScore({measureCount: barCount});
    const staff = score.tracks[0].staves[0];
    for (let bar = 0; bar < barCount; bar++) {
      const voice = staff.bars[bar].voices[0];
      voice.beats.length = 0;
      widths.forEach((width, i) => {
        const b = new Beat();
        b.duration = Duration.Eighth;
        b.brushType = i % 2 === 0 ? BrushType.BrushDown : BrushType.BrushUp;
        b.brushDuration = 60;
        // Strings 1..width, i.e. the low side of the shape downward.
        for (let s = 1; s <= width; s++) {
          const n = new Note();
          n.string = s;
          n.fret = s;
          if (accentUpstrokes && i % 2 === 1) n.accentuated = AccentuationType.Normal;
          b.addNote(n);
        }
        voice.addBeat(b);
      });
    }
    score.finish(new Settings());
    return score;
  }

  it('reads brush direction, width and accents off a real score', () => {
    const score = buildScore(4, SOCIETY_SIX, true);

    const analysis = analyzeStrumming(score);

    expect(analysis.runs).toHaveLength(1);
    const [run] = analysis.runs;
    expect(run.startBar).toBe(1);
    expect(run.endBar).toBe(4);
    expect(run.marks.join('')).toBe('DUdUDUDU');
    expect(run.counts).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
    expect(run.slots.filter(s => s.accented)).toHaveLength(4);
  });

  it('returns nothing for a score with no brush strokes', () => {
    const score = createBlankScore({measureCount: 4});
    const staff = score.tracks[0].staves[0];
    for (const bar of staff.bars) {
      const voice = bar.voices[0];
      voice.beats.length = 0;
      for (let i = 0; i < 4; i++) {
        const b = new Beat();
        b.duration = Duration.Quarter;
        const n = new Note();
        n.string = 1;
        n.fret = 0;
        b.addNote(n);
        voice.addBeat(b);
      }
    }
    score.finish(new Settings());

    expect(analyzeStrumming(score).runs).toEqual([]);
  });

  it('returns nothing for a percussion track', () => {
    const score = createBlankScore({measureCount: 2, instrument: 'drums'});
    expect(analyzeStrumming(score).runs).toEqual([]);
  });

  it('returns nothing for a track index that does not exist', () => {
    expect(analyzeStrumming(createBlankScore({measureCount: 2}), 9).runs).toEqual([]);
    expect(analyzeStrumming(null).runs).toEqual([]);
  });
});
