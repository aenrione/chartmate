import type {
  RocksmithArrangement,
  RocksmithBeat,
  RocksmithNote,
  RocksmithChord,
  RocksmithChordTemplate,
  RocksmithSection,
  RocksmithPhrase,
  RocksmithPhraseIteration,
} from './types';

function attr(el: Element, name: string, fallback = ''): string {
  return el.getAttribute(name) ?? fallback;
}

function numAttr(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name);
  return v != null ? Number(v) : fallback;
}

function boolAttr(el: Element, name: string): boolean {
  return attr(el, name) === '1';
}

function selectAll(root: Element | Document, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector));
}

function parseTuning(el: Element | null): number[] {
  if (!el) return [0, 0, 0, 0, 0, 0];
  return [
    numAttr(el, 'string0'),
    numAttr(el, 'string1'),
    numAttr(el, 'string2'),
    numAttr(el, 'string3'),
    numAttr(el, 'string4'),
    numAttr(el, 'string5'),
  ];
}

function parseNote(el: Element): RocksmithNote {
  return {
    time: numAttr(el, 'time'),
    string: numAttr(el, 'string'),
    fret: numAttr(el, 'fret'),
    sustain: numAttr(el, 'sustain'),
    bend: numAttr(el, 'bend'),
    slideTo: numAttr(el, 'slideTo', -1),
    slideUnpitchTo: numAttr(el, 'slideUnpitchTo', -1),
    hammerOn: boolAttr(el, 'hammerOn'),
    pullOff: boolAttr(el, 'pullOff'),
    harmonic: boolAttr(el, 'harmonic'),
    harmonicPinch: boolAttr(el, 'harmonicPinch'),
    palmMute: boolAttr(el, 'palmMute'),
    mute: boolAttr(el, 'mute'),
    tremolo: boolAttr(el, 'tremolo'),
    vibrato: numAttr(el, 'vibrato') > 0,
    tap: boolAttr(el, 'tap'),
    accent: boolAttr(el, 'accent'),
    linkNext: boolAttr(el, 'linkNext'),
    ignore: boolAttr(el, 'ignore'),
    slap: boolAttr(el, 'slap'),
    pluck: boolAttr(el, 'pluck'),
    bendPoints: [],
  };
}

export function parseRocksmithXml(xmlString: string): RocksmithArrangement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const root = doc.documentElement;

  // Metadata
  const title = root.querySelector('title')?.textContent ?? '';
  const artistName = root.querySelector('artistName')?.textContent ?? '';
  const albumName = root.querySelector('albumName')?.textContent ?? '';
  const arrangementType = (root.querySelector('arrangement')?.textContent ?? 'Lead') as
    | 'Lead'
    | 'Rhythm'
    | 'Bass';
  const songLength = Number(root.querySelector('songLength')?.textContent ?? '0');
  const startBeat = Number(root.querySelector('startBeat')?.textContent ?? '0');
  const averageTempo = Number(root.querySelector('averageTempo')?.textContent ?? '120');
  const capoFret = Number(root.querySelector('capo')?.textContent ?? '0');
  const tuning = parseTuning(root.querySelector('tuning'));

  // Ebeats
  const beats: RocksmithBeat[] = selectAll(root, 'ebeats > ebeat').map(el => ({
    time: numAttr(el, 'time'),
    measure: numAttr(el, 'measure', -1),
  }));

  // Notes
  const notes: RocksmithNote[] = selectAll(root, 'transcriptionTrack > notes > note, levels > level > notes > note')
    .map(parseNote)
    .filter(n => !n.ignore);

  // Chord templates
  const chordTemplates: RocksmithChordTemplate[] = selectAll(
    root,
    'chordTemplates > chordTemplate',
  ).map((el, i) => ({
    chordId: i,
    chordName: attr(el, 'chordName'),
    displayName: attr(el, 'displayName', attr(el, 'chordName')),
    fingers: [
      numAttr(el, 'finger0', -1),
      numAttr(el, 'finger1', -1),
      numAttr(el, 'finger2', -1),
      numAttr(el, 'finger3', -1),
      numAttr(el, 'finger4', -1),
      numAttr(el, 'finger5', -1),
    ],
    frets: [
      numAttr(el, 'fret0', -1),
      numAttr(el, 'fret1', -1),
      numAttr(el, 'fret2', -1),
      numAttr(el, 'fret3', -1),
      numAttr(el, 'fret4', -1),
      numAttr(el, 'fret5', -1),
    ],
  }));

  // Chords
  const chords: RocksmithChord[] = selectAll(
    root,
    'transcriptionTrack > chords > chord, levels > level > chords > chord',
  ).map(el => {
    const chordNotes = selectAll(el, 'chordNote').map(parseNote);
    return {
      time: numAttr(el, 'time'),
      chordId: numAttr(el, 'chordId'),
      strum: attr(el, 'strum', 'down') as 'up' | 'down',
      highDensity: boolAttr(el, 'highDensity'),
      chordNotes,
    };
  });

  // Sections
  const sectionEls = selectAll(root, 'sections > section');
  const sections: RocksmithSection[] = sectionEls.map((el, i) => ({
    name: attr(el, 'name'),
    number: numAttr(el, 'number'),
    startTime: numAttr(el, 'startTime'),
    endTime:
      i + 1 < sectionEls.length
        ? numAttr(sectionEls[i + 1], 'startTime')
        : songLength,
  }));

  // Phrases
  const phrases: RocksmithPhrase[] = selectAll(root, 'phrases > phrase').map(el => ({
    name: attr(el, 'name'),
    maxDifficulty: numAttr(el, 'maxDifficulty'),
  }));

  // Phrase iterations
  const piEls = selectAll(root, 'phraseIterations > phraseIteration');
  const phraseIterations: RocksmithPhraseIteration[] = piEls.map((el, i) => ({
    phraseId: numAttr(el, 'phraseId'),
    time: numAttr(el, 'time'),
    endTime:
      i + 1 < piEls.length ? numAttr(piEls[i + 1], 'time') : songLength,
  }));

  return {
    arrangementType,
    title,
    artistName,
    albumName,
    tuning,
    capoFret,
    songLength,
    startBeat,
    averageTempo,
    beats,
    notes,
    chords,
    chordTemplates,
    sections,
    phrases,
    phraseIterations,
  };
}
