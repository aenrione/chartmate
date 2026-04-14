/**
 * Tests for importFromAsciiTab using real-world source content.
 *
 * Sources used:
 *   [1] classtab.org – Jean Absil, Op 123 Pieces Caracteristiques – 1. Prelude
 *       https://www.classtab.org/absil_op123_pieces_caracteristiques_01_prelude.txt
 *   [2] classtab.org – J.S. Bach, BWV 1007 Cello Suite No.1 in G – 1. Prelude
 *       https://www.classtab.org/bach_js_bwv1007_cello_suite_no1_in_g_1_prelude.txt
 *   [3] classtab.org – Agustín Barrios, La Catedral – 1. Preludio Saudade
 *       https://www.classtab.org/barrios_la_catedral_1_prelude.txt
 *   [4] classtab.org – Dionisio Aguado, Op.7 Quatre Valses Faciles – No.1
 *       https://www.classtab.org/aguado_op07_quatre_valses_faciles_no1_in_e.txt
 *   [5] Ultimate Guitar – Pink Floyd, Wish You Were Here (representative snippet)
 *       https://tabs.ultimate-guitar.com/tab/pink-floyd/wish-you-were-here-tabs-984061
 *       (UG is Cloudflare-protected; snippet mirrors the tab format returned by getTextContent)
 *
 * Tricky format features covered:
 *   Absil:  fingering annotation lines |----4---|, = tied notes, double-digit frets (11/13)
 *   Bach:   drop-D low string ("D|"), dense single-digit runs, tilde header line
 *   Barrios: "E-|" dash-before-pipe prefix, high frets (10-15), measure dot-lines
 *   Aguado: * repeat markers, p/h techniques, 3-string-per-column arpeggios
 *   UG:     [tab]/[/tab] markup stripping, [Intro]/[Verse] section labels, [ch] chord names
 */

import {describe, it, expect} from 'vitest';
import {model} from '@coderline/alphatab';
import {importFromAsciiTab} from '../asciiTabImporter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countNotes(score: ReturnType<typeof importFromAsciiTab>): number {
  return score.tracks[0].staves[0].bars.reduce((sum, bar) =>
    sum + bar.voices.reduce((vs, voice) =>
      vs + voice.beats.reduce((bs, beat) => bs + beat.notes.length, 0), 0), 0);
}

function barCount(score: ReturnType<typeof importFromAsciiTab>): number {
  return score.tracks[0].staves[0].bars.length;
}

function allFrets(score: ReturnType<typeof importFromAsciiTab>): number[] {
  return score.tracks[0].staves[0].bars
    .flatMap(b => b.voices.flatMap(v => v.beats.flatMap(bt => bt.notes.map(n => n.fret))));
}

// ---------------------------------------------------------------------------
// [1] Absil Op 123 – Prelude  (measures 1–2 from the real file)
// ---------------------------------------------------------------------------

const ABSIL_EXCERPT = `
Op 123, Pieces Caracteristiques - 1. Prelude - Jean Absil (1893-1974)
tab by weed@wussu.com - 26th December 2025
standard tuning: E A D G B E      key: C major      time: 12/8

 Maestoso (majestic, dignified, noble)

1  |   .   .   |   .   .   |   .   .   |   .   .
e|-------------3-----------4-----------1-----------|
B|-------------1-----------4-----------3-----------|
G|-------------0-----------5-----------3-----------|
D|-------------2-----------6-----------3-----------|
A|-------------3-----------6-----------1-----------|
E|-------------------------4-----------------------|
           f

               m  i  m  i  rit.
               |----4---|  |----4---|  |----4---|
2  |   .   .   |   .   .   |   .   .   |   .   .
e|-0===========-===========------------0-----3--0--|
B|-1===========-===========------1--------1--------|
G|-0===========-===========0--------0--------------|
D|-2===========-=====2--------2--------------------|
A|-3===========3--------3--------------------------|
E|---------0------3--------------------------------|
               3  4  2  3     2  1        1  4
               > > > > > > > > > > > > > > > > > >
`;

describe('importFromAsciiTab – Absil Op 123 (classtab.org)', () => {
  it('parses without throwing', () => {
    expect(() => importFromAsciiTab(ABSIL_EXCERPT)).not.toThrow();
  });

  it('honours title/artist options', () => {
    const score = importFromAsciiTab(ABSIL_EXCERPT, {title: 'Prelude', artist: 'Absil'});
    expect(score.title).toBe('Prelude');
    expect(score.artist).toBe('Absil');
  });

  it('detects a 6-string track', () => {
    const score = importFromAsciiTab(ABSIL_EXCERPT);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(6);
  });

  it('produces at least 2 bars', () => {
    expect(barCount(importFromAsciiTab(ABSIL_EXCERPT))).toBeGreaterThanOrEqual(2);
  });

  it('annotation lines |----4---| are not parsed as tab strings', () => {
    // If they were, the system would have 7 strings instead of 6
    const score = importFromAsciiTab(ABSIL_EXCERPT);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(6);
  });

  it('= tied characters produce no extra notes', () => {
    const n = countNotes(importFromAsciiTab(ABSIL_EXCERPT));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(200);
  });

  it('parses double-digit frets 11 and 13 from measure 5', () => {
    const TAB = `
5  |   .   .   |   .   .   |   .   .   |   .   .
e|-11----------------------------------2-----------|
B|-13----------4-----------5-----------4-----------|
G|-------------5-----------6-----------4-----------|
D|-------------6-----------6-----------4-----------|
A|-------------6-----------4-----------2-----------|
E|-------------4-----------------------------------|
`;
    const frets = allFrets(importFromAsciiTab(TAB));
    expect(frets).toContain(11);
    expect(frets).toContain(13);
  });
});

// ---------------------------------------------------------------------------
// [2] Bach BWV 1007 – Cello Suite No.1 Prelude  (measures 1–2, George Lin arr.)
// ---------------------------------------------------------------------------

// Notes: drop-D tuning — both the lowest and 4th strings use "D|".
// Tilde lines (~~~~) in the header must NOT be treated as tab lines.
const BACH_EXCERPT = `
BWV 1007, Cello Suite No 1 in G - 1. Prelude - Johann Sebastian Bach (1685-1750)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
1st version - by George Lin, in D, + LHF

1
e|-----2-0-2---2-------2-0-2---2---|-----3-2-3---3-------3-2-3---3---|
B|---------------------------------|---0-------0---0---0-------0---0-|
G|---2-------2---2---2-------2---2-|---------------------------------|
D|-0-------------------------------|-0-------------------------------|
A|---------------------------------|---------------------------------|
D|-----------------0---------------|-----------------0---------------|
     1 2                                 2 1

3
e|-----3-2-3---3-------3-2-3---3---|-----2-0-2---2-------2-0-2---2---|
B|---2-------2---2---2-------2---2-|---3-------3---3---3-------3---2-|
G|---------------------------------|---------------------------------|
D|-0-------------------------------|-0-------------------------------|
A|---------------------------------|---------------------------------|
D|-----------------0---------------|-----------------0---------------|
     1 2 1                             3 2
`;

describe('importFromAsciiTab – Bach BWV 1007 (classtab.org)', () => {
  it('parses without throwing', () => {
    expect(() => importFromAsciiTab(BACH_EXCERPT)).not.toThrow();
  });

  it('does not treat tilde header line as a tab line', () => {
    // ~~~~~~~~~~~~~~ has no digits → not a tab line → 6-string system (not 7)
    const score = importFromAsciiTab(BACH_EXCERPT);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(6);
  });

  it('produces notes from both systems', () => {
    expect(countNotes(importFromAsciiTab(BACH_EXCERPT))).toBeGreaterThan(10);
  });

  it('parses fret 2 from the first beat of string e', () => {
    const frets = allFrets(importFromAsciiTab(BACH_EXCERPT));
    expect(frets).toContain(2);
  });
});

// ---------------------------------------------------------------------------
// [3] Barrios – La Catedral, Preludio Saudade  (measures 1–4)
// ---------------------------------------------------------------------------

// Uses "E-|" format (dash separator between string name and pipe).
// High fret numbers up to 15.  Measure lines "1   |   .   |" must be ignored.
const BARRIOS_EXCERPT = `
La Catedral, 1st movement Preludio Saudade (Lente) - Agustin Barrios

1   |          |            |          |
E-|-14--------------14----|-14--------------14-----|
B-|----0----------0----0--|----0----------0----0---|
G-|------11----11---------|------12----12----------|
D-|---------12------------|---------11-------------|
A-|-----------------------|------------------------|
E-|-----------------------|------------------------|

3   |          |            |          |
E-|-12--------------12----|-15--------------15-----|
B-|----0----------0----0--|----0----------0----0---|
G-|------12----12---------|------12----12----------|
D-|---------11------------|---------11-------------|
A-|-----------------------|------------------------|
E-|-----------------------|------------------------|
`;

describe('importFromAsciiTab – Barrios La Catedral (classtab.org, E-| format)', () => {
  it('parses without throwing', () => {
    expect(() => importFromAsciiTab(BARRIOS_EXCERPT)).not.toThrow();
  });

  it('detects 6 strings despite E-| dash-prefix format', () => {
    const score = importFromAsciiTab(BARRIOS_EXCERPT);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(6);
  });

  it('parses high frets 11, 12, 14, 15', () => {
    const frets = allFrets(importFromAsciiTab(BARRIOS_EXCERPT));
    expect(frets).toContain(11);
    expect(frets).toContain(12);
    expect(frets).toContain(14);
    expect(frets).toContain(15);
  });

  it('produces notes from both systems', () => {
    expect(countNotes(importFromAsciiTab(BARRIOS_EXCERPT))).toBeGreaterThan(10);
  });

  it('measure dot-lines are not parsed as tab lines', () => {
    // "1   |   .   |" has no dashes → should not be a tab line
    const score = importFromAsciiTab(BARRIOS_EXCERPT);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// [4] Aguado Op.7 – Valse No.1  (measures 1–3)
// ---------------------------------------------------------------------------

// Uses * for repeat signs inside tab lines (G|*--), p pull-off, h hammer-on.
// Measure lines " 1 |   .   |   .   |" must be ignored.
const AGUADO_EXCERPT = `
Dionisio Aguado: Quatre Valses Faciles Op.7 - 1. Valse

 1 |   .   |   .   |   .     |   .   |   .   |   .     |   .   |   .   |   .
E|-7----p4-0-------4-------|-------------------------|-7----p4-0-------4-------|
B|-------------------------|-0=======================|-------------------------|
G|*------------------------|---------1-------1-------|-------------------------|
D|*------------------------|---------2-------2-------|-------------------------|
A|-------------------------|-------------------------|-------------------------|
E|-------------------------|-------------------------|-------------------------|
        1          4
`;

describe('importFromAsciiTab – Aguado Op.7 Valse (classtab.org)', () => {
  it('parses without throwing', () => {
    expect(() => importFromAsciiTab(AGUADO_EXCERPT)).not.toThrow();
  });

  it('detects 6 strings', () => {
    const score = importFromAsciiTab(AGUADO_EXCERPT);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(6);
  });

  it('parses frets 7, 4, 0', () => {
    const frets = allFrets(importFromAsciiTab(AGUADO_EXCERPT));
    expect(frets).toContain(7);
    expect(frets).toContain(4);
    expect(frets).toContain(0);
  });

  it('* repeat markers do not create extra notes or crash', () => {
    const n = countNotes(importFromAsciiTab(AGUADO_EXCERPT));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// [5] Ultimate Guitar format – Pink Floyd, Wish You Were Here (intro excerpt)
// ---------------------------------------------------------------------------

// UG wraps tab content in [tab]/[/tab], chord names in [ch]/[/ch], and adds
// [Section] labels like [Intro], [Verse].  Our pre-processor strips all of these.
// (UG pages are Cloudflare-protected so the real page cannot be fetched from
// tests — this snippet mirrors the ASCII content returned by getTextContent.)
const UG_WYWH = `[Intro]

[tab]
e|---0-------0-0-0---0-0-0---0-0-0---|
B|-------0-0-----0-0-----0-0-----0---|
G|---0-0---0-0-0---0-0-0---0-0-0-----|
D|-----------------------------------|
A|-----------------------------------|
E|-----------------------------------|

e|---0-------0-0-0---0-0-0---0-0-0---|
B|-------0-0-----0-0-----0-0-----0---|
G|---0-0---0-0-0---0-0-0---0-0-0-----|
D|-----------------------------------|
A|-----------------------------------|
E|-----------------------------------|
[/tab]

[Verse]
[ch]C[/ch]   [ch]D[/ch]   [ch]Am[/ch]
[tab]
e|---0---2---0---|
B|---1---3---1---|
G|---0---2---2---|
D|---2---0---2---|
A|---3-------0---|
E|---------------|
[/tab]
`;

describe('importFromAsciiTab – Ultimate Guitar format (Pink Floyd – Wish You Were Here)', () => {
  it('parses without throwing', () => {
    expect(() => importFromAsciiTab(UG_WYWH)).not.toThrow();
  });

  it('strips [tab]/[/tab] wrappers and [Intro]/[Verse] section labels', () => {
    const score = importFromAsciiTab(UG_WYWH);
    // Should find note content, not crash on markup
    expect(countNotes(score)).toBeGreaterThan(0);
  });

  it('strips [ch] chord name markers', () => {
    // If [ch]C[/ch] were not stripped it might confuse the line detector;
    // the score should still have exactly 6 strings per track
    const score = importFromAsciiTab(UG_WYWH);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(6);
  });

  it('parses the intro open-string arpeggio (fret 0 notes)', () => {
    const frets = allFrets(importFromAsciiTab(UG_WYWH));
    expect(frets).toContain(0);
  });

  it('parses the verse chord shapes (frets 1, 2, 3)', () => {
    const frets = allFrets(importFromAsciiTab(UG_WYWH));
    expect(frets).toContain(1);
    expect(frets).toContain(2);
    expect(frets).toContain(3);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('importFromAsciiTab – edge cases', () => {
  it('empty input returns one empty bar', () => {
    const score = importFromAsciiTab('');
    expect(barCount(score)).toBe(1);
  });

  it('plain prose with no tab lines returns one empty bar', () => {
    expect(barCount(importFromAsciiTab('Hello world\nNo tabs here'))).toBe(1);
  });

  it('minimal 6-string snippet', () => {
    const tab = ['e|---0---2---|', 'B|---1---3---|', 'G|---0---2---|',
                 'D|---2---0---|', 'A|---3-------|', 'E|-----------|'].join('\n');
    const score = importFromAsciiTab(tab);
    expect(barCount(score)).toBeGreaterThanOrEqual(1);
    expect(countNotes(score)).toBeGreaterThan(0);
  });

  it('4-string bass snippet produces a 4-string track', () => {
    const tab = ['G|---5---7---|', 'D|---5---7---|',
                 'A|---3---5---|', 'E|-----------|'].join('\n');
    expect(importFromAsciiTab(tab).tracks[0].staves[0].stringTuning.tunings).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// [6] Ultimate Guitar format – The Beatles, Blackbird
//     https://tabs.ultimate-guitar.com/tab/the-beatles/blackbird-tabs-180986
//     (UG is Cloudflare-protected; snippet mirrors the ASCII content returned
//     by getTextContent — [tab]/[/tab] wrapped, [Intro] section label,
//     two systems, fingerpicking pattern in G, frets 0-5 across 4 strings)
// ---------------------------------------------------------------------------

const UG_BLACKBIRD = `[Intro]

[tab]
e|------------------------|------------------------|
B|------1-0---------------|------1-0---------------|
G|----0-------0-----------|----0-------0-----------|
D|--2---2---2---2---------|--2---2---2---2---------|
A|3-----------3---3-2-0---|3-----------3---3-2-0---|
E|------------------------|------------------------|

e|------------------------|------------------------|
B|------1-0---------------|------3-1---------------|
G|----0-------0-----------|----0-------0-----------|
D|--2---2---2---2---------|--4---4---4---4---------|
A|0-----------0---0-------|5-----------5---5-------|
E|------------------------|------------------------|
[/tab]
`;

describe('importFromAsciiTab – UG format (The Beatles – Blackbird)', () => {
  it('parses without throwing', () => {
    expect(() => importFromAsciiTab(UG_BLACKBIRD)).not.toThrow();
  });

  it('strips [tab]/[/tab] and [Intro] labels, finds 6-string track', () => {
    const score = importFromAsciiTab(UG_BLACKBIRD);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(6);
  });

  it('produces notes from both systems', () => {
    expect(countNotes(importFromAsciiTab(UG_BLACKBIRD))).toBeGreaterThan(10);
  });

  it('parses open strings (fret 0)', () => {
    expect(allFrets(importFromAsciiTab(UG_BLACKBIRD))).toContain(0);
  });

  it('parses frets 1, 2, 3, 4, 5 from fingerpicking pattern', () => {
    const frets = allFrets(importFromAsciiTab(UG_BLACKBIRD));
    expect(frets).toContain(1);
    expect(frets).toContain(2);
    expect(frets).toContain(3);
    expect(frets).toContain(4);
    expect(frets).toContain(5);
  });

  it('honours title/artist options', () => {
    const score = importFromAsciiTab(UG_BLACKBIRD, {title: 'Blackbird', artist: 'The Beatles'});
    expect(score.title).toBe('Blackbird');
    expect(score.artist).toBe('The Beatles');
  });

  it('produces multiple bars from two systems', () => {
    expect(barCount(importFromAsciiTab(UG_BLACKBIRD))).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Metadata header parsing (parseTabBlock)
// ---------------------------------------------------------------------------

describe('importFromAsciiTab – metadata header', () => {
  const TAB_WITH_HEADER = `Title: Stairway to Heaven
Artist: Led Zeppelin
Tempo: 72

e|---0---2---|
B|---1---3---|
G|---0---2---|
D|---2---0---|
A|---3-------|
E|-----------|`;

  it('parses Title from header', () => {
    const score = importFromAsciiTab(TAB_WITH_HEADER);
    expect(score.title).toBe('Stairway to Heaven');
  });

  it('parses Artist from header', () => {
    const score = importFromAsciiTab(TAB_WITH_HEADER);
    expect(score.artist).toBe('Led Zeppelin');
  });

  it('parses Tempo from header and applies it', () => {
    const score = importFromAsciiTab(TAB_WITH_HEADER);
    expect(score.masterBars[0].tempoAutomations[0].value).toBe(72);
  });

  it('passed-in options override extracted header values', () => {
    const score = importFromAsciiTab(TAB_WITH_HEADER, {title: 'Override', artist: 'Override Artist', tempo: 200});
    expect(score.title).toBe('Override');
    expect(score.artist).toBe('Override Artist');
    expect(score.masterBars[0].tempoAutomations[0].value).toBe(200);
  });

  it('still parses tab notes after the header', () => {
    const score = importFromAsciiTab(TAB_WITH_HEADER);
    expect(countNotes(score)).toBeGreaterThan(0);
  });

  it('tab with no header still works', () => {
    const tab = `e|---0---2---|\nB|---1---3---|\nG|---0---2---|\nD|---2---0---|\nA|---3-------|\nE|-----------|`;
    const score = importFromAsciiTab(tab, {title: 'Plain', artist: 'NoHeader'});
    expect(score.title).toBe('Plain');
    expect(countNotes(score)).toBeGreaterThan(0);
  });

  it('invalid Tempo value is ignored, falls back to default', () => {
    const tab = `Title: Test\nTempo: notanumber\n\ne|---0---|\nB|-------|\nG|-------|\nD|-------|\nA|-------|\nE|-------|`;
    const score = importFromAsciiTab(tab);
    expect(score.masterBars[0].tempoAutomations[0].value).toBe(120);
  });

  it('header keys are case-insensitive', () => {
    const tab = `title: My Song\nartist: My Artist\ntempo: 100\n\ne|---0---|\nB|-------|\nG|-------|\nD|-------|\nA|-------|\nE|-------|`;
    const score = importFromAsciiTab(tab);
    expect(score.title).toBe('My Song');
    expect(score.artist).toBe('My Artist');
  });
});

// ---------------------------------------------------------------------------
// Technique detection
// ---------------------------------------------------------------------------

describe('importFromAsciiTab – techniques', () => {
  function firstNote(score: ReturnType<typeof importFromAsciiTab>) {
    return score.tracks[0].staves[0].bars[0].voices[0].beats
      .find(b => b.notes.length > 0)!.notes[0];
  }

  it('h marks note as hammerPullOrigin', () => {
    // Single origin note with h — avoids two notes on same string in same beat
    const tab = `e|---5h---7---|\nB|-------------|\nG|-------------|\nD|-------------|\nA|-------------|\nE|-------------|`;
    const note = firstNote(importFromAsciiTab(tab));
    expect(note.fret).toBe(5);
    expect(note.isHammerPullOrigin).toBe(true);
  });

  it('p marks note as hammerPullOrigin', () => {
    const tab = `e|---7p---5---|\nB|-------------|\nG|-------------|\nD|-------------|\nA|-------------|\nE|-------------|`;
    const note = firstNote(importFromAsciiTab(tab));
    expect(note.fret).toBe(7);
    expect(note.isHammerPullOrigin).toBe(true);
  });

  it('/ sets slideOutType to Legato', () => {
    const tab = `e|---5/---7---|\nB|-------------|\nG|-------------|\nD|-------------|\nA|-------------|\nE|-------------|`;
    const note = firstNote(importFromAsciiTab(tab));
    expect(note.slideOutType).toBe(model.SlideOutType.Legato);
  });

  it('\\ sets slideOutType to Shift', () => {
    const tab = `e|---7\\---5---|\nB|-------------|\nG|-------------|\nD|-------------|\nA|-------------|\nE|-------------|`;
    const note = firstNote(importFromAsciiTab(tab));
    expect(note.slideOutType).toBe(model.SlideOutType.Shift);
  });

  it('~ sets vibrato to Slight', () => {
    const tab = `e|---5~----|\nB|---------|\nG|---------|\nD|---------|\nA|---------|\nE|---------|`;
    const note = firstNote(importFromAsciiTab(tab));
    expect(note.vibrato).toBe(model.VibratoType.Slight);
  });

  it('note with no technique has no effects set', () => {
    const tab = `e|---5-----|\nB|---------|\nG|---------|\nD|---------|\nA|---------|\nE|---------|`;
    const note = firstNote(importFromAsciiTab(tab));
    expect(note.isHammerPullOrigin).toBe(false);
    expect(note.slideOutType).toBe(model.SlideOutType.None);
    expect(note.vibrato).toBe(model.VibratoType.None);
  });
});

// ---------------------------------------------------------------------------
// Time signature detection
// ---------------------------------------------------------------------------

describe('importFromAsciiTab – time signature detection', () => {
  function timeSig(score: ReturnType<typeof importFromAsciiTab>) {
    const mb = score.masterBars[0];
    return {num: mb.timeSignatureNumerator, denom: mb.timeSignatureDenominator};
  }

  it('4 beats per bar → 4/4', () => {
    const tab = `e|---0---2---4---5---|\nB|-------------------|\nG|-------------------|\nD|-------------------|\nA|-------------------|\nE|-------------------|`;
    expect(timeSig(importFromAsciiTab(tab))).toEqual({num: 4, denom: 4});
  });

  it('3 beats per bar → 3/4', () => {
    const tab = `e|---0---2---4---|\nB|---------------|\nG|---------------|\nD|---------------|\nA|---------------|\nE|---------------|`;
    expect(timeSig(importFromAsciiTab(tab))).toEqual({num: 3, denom: 4});
  });

  it('6 beats per bar → 6/8', () => {
    const tab = `e|---0---2---3---5---7---9---|\nB|---------------------------|\nG|---------------------------|\nD|---------------------------|\nA|---------------------------|\nE|---------------------------|`;
    expect(timeSig(importFromAsciiTab(tab))).toEqual({num: 6, denom: 8});
  });

  it('2 beats per bar → 2/4', () => {
    const tab = `e|---0---5---|\nB|-----------|\nG|-----------|\nD|-----------|\nA|-----------|\nE|-----------|`;
    expect(timeSig(importFromAsciiTab(tab))).toEqual({num: 2, denom: 4});
  });
});

// ---------------------------------------------------------------------------
// Chords (multiple notes on same beat) and 7-string
// ---------------------------------------------------------------------------

describe('importFromAsciiTab – chords and string counts', () => {
  it('notes aligned in same column form a chord (multiple notes per beat)', () => {
    const tab = [
      'e|---2---|',
      'B|---3---|',
      'G|---2---|',
      'D|---4---|',
      'A|---4---|',
      'E|---2---|',
    ].join('\n');
    const score = importFromAsciiTab(tab);
    const firstBeat = score.tracks[0].staves[0].bars[0].voices[0].beats
      .find(b => b.notes.length > 0)!;
    expect(firstBeat.notes.length).toBeGreaterThanOrEqual(4);
  });

  it('7-string snippet produces a 7-string track', () => {
    const tab = [
      'e|---0---|',
      'B|---0---|',
      'G|---0---|',
      'D|---0---|',
      'A|---0---|',
      'E|---0---|',
      'B|---0---|',
    ].join('\n');
    const score = importFromAsciiTab(tab);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Markup stripping and whitespace edge cases
// ---------------------------------------------------------------------------

describe('importFromAsciiTab – markup and whitespace', () => {
  it('strips [tab][/tab] wrappers', () => {
    const tab = `[tab]\ne|---0---2---|\nB|---1---3---|\nG|---0---2---|\nD|---2---0---|\nA|---3-------|\nE|-----------|\n[/tab]`;
    expect(() => importFromAsciiTab(tab)).not.toThrow();
    expect(countNotes(importFromAsciiTab(tab))).toBeGreaterThan(0);
  });

  it('strips [ch] chord names', () => {
    const tab = `[ch]Am[/ch]\ne|---0---|\nB|---1---|\nG|---2---|\nD|---2---|\nA|---0---|\nE|-------|`;
    const score = importFromAsciiTab(tab);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(6);
  });

  it('trailing whitespace on tab lines does not break parsing', () => {
    const tab = `e|---0---2---|   \nB|---1---3---|   \nG|---0---2---|   \nD|---2---0---|   \nA|---3-------|   \nE|-----------|   `;
    expect(() => importFromAsciiTab(tab)).not.toThrow();
    expect(countNotes(importFromAsciiTab(tab))).toBeGreaterThan(0);
  });

  it('mixed-case string labels (e vs E) are both recognised', () => {
    const lowerTab = `e|---0---|\nb|---1---|\ng|---0---|\nd|---2---|\na|---3---|\ne|-------|`;
    const score = importFromAsciiTab(lowerTab);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(6);
    expect(countNotes(score)).toBeGreaterThan(0);
  });
});
