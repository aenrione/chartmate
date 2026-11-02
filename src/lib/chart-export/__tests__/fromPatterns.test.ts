import {describe, it, expect} from 'vitest';
import {parseChartFile} from '@eliwhite/scan-chart';
import {pieceFromChartNote} from '@/lib/drums/pieces';
import {
  patternsToChartDocument,
  pieceForTrackName,
  MIN_LEAD_IN_MS,
} from '../fromDrumPattern';
import {lessonToChartDocument, isExportable, drumPatternsOf} from '../fromLesson';
import {parseSticking, rudimentToChartDocument} from '../fromRudiment';
import {writeChart} from '../writeChart';
import {validateChartDocument, hasErrors} from '../validate';
import {buildChartFolder, safeFolderName, zipChartFolders} from '../chartFolder';
import {CHART_RESOLUTION} from '../types';
import type {Lesson} from '@/lib/curriculum/types';

function parse(doc: Parameters<typeof writeChart>[0]) {
  const chart = parseChartFile(new TextEncoder().encode(writeChart(doc)), 'chart', {
    pro_drums: true,
  });
  const track = chart.trackData.find(
    t => t.instrument === 'drums' && t.difficulty === 'expert',
  );
  if (!track) throw new Error('no expert drums track');
  return {chart, track};
}

describe('pieceForTrackName', () => {
  it('maps every track name the drum curriculum actually uses', () => {
    expect(pieceForTrackName('Hi-Hat')).toBe('hihat');
    expect(pieceForTrackName('Snare')).toBe('snare');
    expect(pieceForTrackName('Kick')).toBe('kick');
    expect(pieceForTrackName('Ride')).toBe('ride');
    expect(pieceForTrackName('Clave')).toBe('high-tom');
  });

  it('returns null for a name it cannot place, instead of guessing', () => {
    expect(pieceForTrackName('Vocals')).toBeNull();
  });
});

describe('patternsToChartDocument', () => {
  const basicRock = {
    title: 'Basic Rock',
    subdivisions: 8,
    bpm: 90,
    tracks: [
      {name: 'Hi-Hat', pattern: 'xxxxxxxx'},
      {name: 'Snare', pattern: '--x---x-'},
      {name: 'Kick', pattern: 'x---x---'},
    ],
    repeats: 2,
  };

  it('places notes on the grid the lesson draws', () => {
    const {doc} = patternsToChartDocument([basicRock], {name: 'Test'});
    const cell = CHART_RESOLUTION / 2; // eighth-note grid in 4/4
    const bar = CHART_RESOLUTION * 4;
    const start = doc.notes.Expert![0].tick;

    const kicks = doc.notes.Expert!.filter(n => n.piece === 'kick').map(n => n.tick - start);
    expect(kicks).toEqual([0, 4 * cell, bar, bar + 4 * cell]);

    const snares = doc.notes.Expert!.filter(n => n.piece === 'snare').map(n => n.tick - start);
    expect(snares).toEqual([2 * cell, 6 * cell, bar + 2 * cell, bar + 6 * cell]);
  });

  it('uses a sixteenth grid when the activity says so', () => {
    const {doc} = patternsToChartDocument(
      [{title: 'Sixteenths', subdivisions: 16, tracks: [{name: 'Hi-Hat', pattern: 'x'.repeat(16)}], repeats: 1}],
      {name: 'Test'},
    );
    const ticks = doc.notes.Expert!.map(n => n.tick);
    expect(ticks).toHaveLength(16);
    expect(ticks[1] - ticks[0]).toBe(CHART_RESOLUTION / 4);
  });

  it('reads X as an accent and o as a ghost', () => {
    const {doc} = patternsToChartDocument(
      [{title: 'Dynamics', subdivisions: 8, tracks: [{name: 'Snare', pattern: 'xXo-----'}], repeats: 1}],
      {name: 'Test'},
    );
    expect(doc.notes.Expert!.map(n => [n.accent, n.ghost])).toEqual([
      [false, false],
      [true, false],
      [false, true],
    ]);
  });

  it('leaves enough leading silence for Encore', () => {
    const {doc} = patternsToChartDocument([basicRock], {name: 'Test'});
    const firstTick = doc.notes.Expert![0].tick;
    const ms = (firstTick / CHART_RESOLUTION) * (60000 / 90);
    expect(ms).toBeGreaterThanOrEqual(MIN_LEAD_IN_MS);
  });

  it('handles a time signature change between blocks', () => {
    const {doc} = patternsToChartDocument(
      [
        {title: 'In four', timeSignature: '4/4', tracks: [{name: 'Snare', pattern: 'x-------'}], repeats: 1},
        {title: 'In six', timeSignature: '6/8', tracks: [{name: 'Snare', pattern: 'x-----'}], repeats: 1},
      ],
      {name: 'Test'},
    );
    const {chart} = parse(doc);
    expect(chart.timeSignatures.map(t => [t.numerator, t.denominator]))
      .toEqual([[4, 4], [6, 8]]);
  });

  it('reports track names it could not map rather than dropping them quietly', () => {
    const {unmappedTracks} = patternsToChartDocument(
      [{title: 'Odd', tracks: [{name: 'Djembe', pattern: 'x-------'}, {name: 'Kick', pattern: 'x-------'}]}],
      {name: 'Test'},
    );
    expect(unmappedTracks).toEqual(['Djembe']);
  });

  it('names each block as a section', () => {
    const {doc} = patternsToChartDocument(
      [basicRock, {...basicRock, title: 'Variation'}],
      {name: 'Test'},
    );
    expect(doc.sections.map(s => s.name)).toEqual(['Basic Rock', 'Variation']);
  });

  it('survives the round trip into scan-chart', () => {
    const {doc} = patternsToChartDocument([basicRock], {name: 'Test'});
    const {track} = parse(doc);
    const pieces = track.noteEventGroups.flat().map(pieceFromChartNote);
    expect(new Set(pieces)).toEqual(new Set(['hihat', 'snare', 'kick']));
  });
});

describe('lessonToChartDocument', () => {
  const lesson: Lesson = {
    id: '01-four-four',
    title: 'The 4/4 Beat',
    xp: 15,
    activities: [
      {type: 'theory-card', markdown: '# ignored'},
      {
        type: 'drum-pattern',
        title: 'Rock beat',
        subdivisions: 8,
        bpm: 80,
        tracks: [
          {name: 'Hi-Hat', pattern: 'xxxxxxxx'},
          {name: 'Snare', pattern: '--x---x-'},
          {name: 'Kick', pattern: 'x---x---'},
        ],
      },
    ],
  };

  it('ignores activities that carry no rhythm', () => {
    expect(drumPatternsOf(lesson)).toHaveLength(1);
    expect(isExportable(lesson)).toBe(true);
    expect(isExportable({...lesson, activities: [lesson.activities[0]]})).toBe(false);
  });

  it('produces a playable, valid chart', () => {
    const {doc} = lessonToChartDocument(lesson, {unitTitle: 'Basic Beats'});
    expect(doc.song.name).toBe('The 4/4 Beat');
    expect(doc.song.album).toBe('Basic Beats');
    expect(hasErrors(validateChartDocument(doc))).toBe(false);
  });
});

describe('rudimentToChartDocument', () => {
  it('parses the sticking grammar', () => {
    expect(parseSticking('R L R R · L R L L')).toHaveLength(8);
    expect(parseSticking('lR rL')).toEqual([
      {graces: 1, buzz: false},
      {graces: 1, buzz: false},
    ]);
    expect(parseSticking('llR rrL')).toEqual([
      {graces: 2, buzz: false},
      {graces: 2, buzz: false},
    ]);
    expect(parseSticking('zz zz')).toEqual([
      {graces: 0, buzz: true},
      {graces: 0, buzz: true},
    ]);
  });

  it('rejects a token it does not understand', () => {
    expect(() => parseSticking('R L ???')).toThrow(/Unrecognised/);
  });

  it('puts every stroke on the snare at the chosen subdivision', () => {
    const {doc} = rudimentToChartDocument({
      name: 'Single Stroke Roll',
      sticking: 'R L R L R L R L',
      subdivision: '16th',
      repeats: 1,
    });
    const notes = doc.notes.Expert!;
    expect(notes).toHaveLength(8);
    expect(new Set(notes.map(n => n.piece))).toEqual(new Set(['snare']));
    expect(notes[1].tick - notes[0].tick).toBe(48);
  });

  it('writes a flam as a ghost stroke just before the main one', () => {
    const {doc} = rudimentToChartDocument({
      name: 'Flam',
      sticking: 'lR rL',
      subdivision: 'quarter',
      repeats: 1,
    });
    const notes = doc.notes.Expert!;
    expect(notes).toHaveLength(4);
    expect(notes[0].ghost).toBe(true);
    expect(notes[1].ghost).toBeFalsy();
    expect(notes[1].tick - notes[0].tick).toBeGreaterThan(0);
  });

  it('writes a drag as two ghost strokes', () => {
    const {doc} = rudimentToChartDocument({
      name: 'Drag',
      sticking: 'llR rrL',
      subdivision: 'quarter',
      repeats: 1,
    });
    const ghosts = doc.notes.Expert!.filter(n => n.ghost);
    expect(ghosts).toHaveLength(4);
  });

  it('keeps grace strokes far enough apart to not read as broken notes', () => {
    const {doc} = rudimentToChartDocument({
      name: 'Drag',
      sticking: 'llR rrL',
      subdivision: '16th',
      bpm: 90,
      repeats: 4,
    });
    expect(validateChartDocument(doc).filter(i => i.type === 'brokenNote')).toEqual([]);
  });

  it('never writes a broken note, at any tempo or subdivision', () => {
    // A 64th-note grace stroke is under 8 ms at 240 BPM, which scan-chart
    // reads as a charting mistake rather than a drag.
    for (const bpm of [60, 120, 180, 240]) {
      for (const subdivision of ['quarter', '8th', 'triplet', '16th', '32nd'] as const) {
        const {doc, gracesDropped} = rudimentToChartDocument({
          name: 'Triple Ratamacue',
          sticking: 'llR llR llR L R · rrL rrL rrL R L',
          subdivision,
          bpm,
          repeats: 2,
        });
        const broken = validateChartDocument(doc).filter(i => i.type === 'brokenNote');
        expect({bpm, subdivision, broken}).toEqual({bpm, subdivision, broken: []});
        // Whatever it decided, the main strokes are always all there.
        const expectedMain = 10 * 2;
        const mains = doc.notes.Expert!.filter(n => !n.ghost).length;
        expect(mains).toBe(expectedMain);
        if (gracesDropped) {
          expect(doc.notes.Expert!.some(n => n.ghost)).toBe(false);
        }
      }
    }
  });

  it('drops grace strokes rather than crowding them at a fast 32nd', () => {
    const fast = rudimentToChartDocument({
      name: 'Drag', sticking: 'llR rrL', subdivision: '32nd', bpm: 240, repeats: 1,
    });
    expect(fast.gracesDropped).toBe(true);

    const slow = rudimentToChartDocument({
      name: 'Drag', sticking: 'llR rrL', subdivision: 'quarter', bpm: 90, repeats: 1,
    });
    expect(slow.gracesDropped).toBe(false);
  });
});

describe('chart folder', () => {
  const {doc, lengthMs} = rudimentToChartDocument({
    name: 'Single Paradiddle',
    sticking: 'R L R R · L R L L',
  });

  it('writes notes.chart, song.ini and a stem', () => {
    const folder = buildChartFolder(doc, {lengthMs});
    expect(folder.files.map(f => f.name).sort()).toEqual([
      'album.png', 'notes.chart', 'song.ini', 'song.wav',
    ]);
    expect(folder.audioIsSilent).toBe(true);
  });

  it('declares pro_drums so the cymbal markers are honoured', () => {
    const folder = buildChartFolder(doc, {lengthMs});
    const ini = new TextDecoder().decode(
      folder.files.find(f => f.name === 'song.ini')!.data,
    );
    expect(ini).toContain('pro_drums = True');
    expect(ini).toContain('delay = 0');
    expect(ini).toMatch(/song_length = \d+/);
    expect(ini).toMatch(/diff_drums = \d+/);
  });

  it('points MusicStream at the stem it actually wrote', () => {
    const folder = buildChartFolder(doc, {lengthMs, audioFileName: 'song.ogg', audio: new Uint8Array([1])});
    const chart = new TextDecoder().decode(
      folder.files.find(f => f.name === 'notes.chart')!.data,
    );
    expect(chart).toContain('MusicStream = "song.ogg"');
    expect(chart).toContain('Offset = 0');
  });

  it('keeps folder names filesystem-safe without mangling them', () => {
    expect(safeFolderName('AC/DC - Back in Black')).toBe('ACDC - Back in Black');
    expect(safeFolderName('   ')).toBe('Untitled');
  });

  it('never lets one folder overwrite another in a zip', () => {
    const a = buildChartFolder(doc, {lengthMs});
    const b = buildChartFolder(doc, {lengthMs});
    const zip = zipChartFolders([a, b]);
    expect(zip.byteLength).toBeGreaterThan(0);
    // Two entries of the same base name must land in different directories.
    const text = new TextDecoder('latin1').decode(zip);
    expect(text).toContain(`${a.name}/notes.chart`);
    expect(text).toContain(`${a.name} (2)/notes.chart`);
  });
});
