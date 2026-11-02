/**
 * ASCII Tab Importer
 *
 * Converts plain-text guitar tablature (as found on classtab.org,
 * Ultimate Guitar, and similar sources) into an AlphaTab Score.
 *
 * Supports:
 *   - 4-string (bass) and 6/7-string (guitar) tabs
 *   - Single and double-digit fret numbers
 *   - Bar lines (|) to delimit measures
 *   - Basic techniques: hammer-on (h), pull-off (p), slide (/ \),
 *     vibrato (~), bend (b) — applied as note effects
 *   - Multiple systems on one page
 *   - Bar lines written as whitespace gaps ("--0---0-  --------0-")
 *   - Tuning (from a `Tuning:` line or the string-name labels) and `Capo:`
 *   - Letter frets (a=10 … f=15) when the text declares them ("a = 10")
 *
 * Timing: ASCII tabs rarely encode exact rhythm, so each beat
 * defaults to Duration.Quarter. The user can refine in the editor.
 */

import {model, Settings} from '@coderline/alphatab';

const {
  Score, Track, Staff, Bar, Voice, Beat, MasterBar, Note,
  PlaybackInformation, Automation, AutomationType, Duration,
  Tuning, SlideOutType, Section,
} = model;

type ScoreInstance = InstanceType<typeof Score>;

const DEFAULT_TEMPO = 120;
const MAX_FRET = 24;
const TUNING_STANDARD_6 = [64, 59, 55, 50, 45, 40]; // E4 B3 G3 D3 A2 E2
const TUNING_STANDARD_7 = [64, 59, 55, 50, 45, 40, 35]; // E4 B3 G3 D3 A2 E2 B1
const TUNING_BASS_4 = [43, 38, 33, 28]; // G2 D2 A1 E1
const MIDI_PROGRAM_GUITAR = 25; // Acoustic Steel Guitar
const MIDI_PROGRAM_BASS = 33;   // Electric Bass (finger)

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AsciiImportOptions {
  title?: string;
  artist?: string;
  tempo?: number;
  youtubeUrl?: string;
  thumbnailUrl?: string;
  /** Force 4/4 time even if the bar beat count suggests otherwise. */
  forceFourFour?: boolean;
  /** MIDI tuning, top tab line (highest string) first. Ignored if the length ≠ string count. */
  tuning?: number[];
  capo?: number;
}

/**
 * A `Tuning:` declaration, before octaves are assigned (that needs the string count).
 * `pcs` are pitch classes top line first; `offset` is semitones from standard.
 */
type DeclaredTuning = {pcs: number[]} | {offset: number};

interface TabBlockParsed {
  tabText: string;
  extractedOptions: AsciiImportOptions;
  declaredTuning: DeclaredTuning | null;
  /** The text declares "a = 10, b = 11, ..." — letters a–f are frets 10–15. */
  letterFrets: boolean;
}

const PITCH_CLASS: Record<string, number> = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};

/** Pitch classes of a note-name run ("DADGAD", "D A D F# A D", "Db-Ab-Db-F-Bb-Eb", "EBEG#Be"). */
function parseNoteNames(s: string): number[] | null {
  const m = s.match(/^\s*((?:#?[A-Ga-g][#b]?[\s-]*){4,7})(?![A-Za-z#])/);
  if (!m) return null;
  const pcs: number[] = [];
  for (const [, pre, letter, acc] of m[1].matchAll(/(#)?([A-Ga-g])([#b])?/g)) {
    const pc = PITCH_CLASS[letter.toUpperCase()] + (pre || acc === '#' ? 1 : acc === 'b' ? -1 : 0);
    pcs.push((pc + 12) % 12);
  }
  return pcs;
}

/** Parse the value of a `Tuning:` line. Note names are listed low → high. */
function parseTuningDecl(value: string): DeclaredTuning | null {
  const v = value.replace(/^(\s*tuning\s*:)+/i, '').trim();
  // Text in parentheses or after a comma is commentary ("DGCFAD (whole step down)")
  const pcs = parseNoteNames(v.split(/[(,;]|\band\b/)[0]);
  if (pcs) return {pcs: pcs.reverse()};
  const lower = v.toLowerCase();
  if (/\bdown\b/.test(lower) && /half[\s-]*step/.test(lower)) return {offset: -1};
  if (/\bdown\b/.test(lower) && /(whole|full|one)[\s-]*step/.test(lower)) return {offset: -2};
  if (/^standard\b/.test(lower)) return {offset: 0};
  return null;
}

/** Pick the octave of each pitch class nearest to the standard pitch at that position. */
function pcsToMidi(pcs: number[], standard: number[]): number[] {
  return pcs.map((pc, i) => {
    const up = (((pc - standard[i]) % 12) + 12) % 12;
    return standard[i] + (up < 6 ? up : up - 12);
  });
}

function standardTuning(stringCount: number): number[] {
  return stringCount === 4 ? TUNING_BASS_4 : stringCount === 7 ? TUNING_STANDARD_7 : TUNING_STANDARD_6;
}

/** Leading string name of a tab line ("e|", "C#|", "E-|"), or null. */
function stringLabel(line: string): string | null {
  return line.match(/^\s*([A-Ga-g][#b♭]?)\s*-?\s*[|:]/)?.[1] ?? null;
}

/** Options override > `Tuning:` line > string-name labels of the first system > standard. */
function resolveTuning(
  stringCount: number,
  optionTuning: number[] | undefined,
  declared: DeclaredTuning | null,
  systems: System[],
): number[] {
  const standard = standardTuning(stringCount);
  if (optionTuning?.length === stringCount) return optionTuning;
  if (declared && 'offset' in declared) return standard.map(p => p + declared.offset);
  if (declared?.pcs.length === stringCount) return pcsToMidi(declared.pcs, standard);
  const labels = systems[0]?.lines.map(stringLabel);
  if (labels?.length === stringCount && labels.every(l => l !== null)) {
    const pcs = parseNoteNames(labels.join(' ').replace(/♭/g, 'b'));
    if (pcs?.length === stringCount) return pcsToMidi(pcs, standard);
  }
  return standard;
}

/**
 * Strip a leading metadata header (Title/Artist/Tempo lines) from the input.
 * Returns the remaining tab text and whatever options were extracted.
 * The caller merges extracted options with any explicitly passed options;
 * explicitly passed options win on conflict.
 */
function parseTabBlock(input: string): TabBlockParsed {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const extracted: AsciiImportOptions = {};
  let i = 0;

  // Tuning / Capo / letter-fret declarations can appear anywhere in the text (often after a By: line)
  let declaredTuning: DeclaredTuning | null = null;
  for (const line of lines) {
    const t = line.match(/^\s*tuning\b\s*:?(.*)$/i);
    if (t && (declaredTuning = parseTuningDecl(t[1]))) break;
  }
  for (const line of lines) {
    const c = line.match(/^\s*capo\b\s*:?\s*(?:capo\s*)?(\d+)/i);
    if (c) { extracted.capo = parseInt(c[1], 10); break; }
  }
  const letterFrets = /\ba\s*=\s*10/i.test(input);

  // Skip leading blank lines before the header
  while (i < lines.length && lines[i].trim() === '') i++;

  // Consume header lines (Key: Value) — stop at first non-matching non-blank line
  while (i < lines.length) {
    const line = lines[i].trim();
    const m = line.match(/^(Title|Artist|Tempo|YouTube|Thumbnail):\s*(.+)$/i);
    if (m) {
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === 'title') extracted.title = val;
      else if (key === 'artist') extracted.artist = val;
      else if (key === 'youtube') extracted.youtubeUrl = val;
      else if (key === 'thumbnail') extracted.thumbnailUrl = val;
      else if (key === 'tempo') {
        const n = parseInt(val, 10);
        if (!isNaN(n)) extracted.tempo = n;
      }
      i++;
    } else if (line === '') {
      // Blank separator line between header and tab body — consume and stop
      i++;
      break;
    } else {
      // Non-matching non-blank line: header is done, leave this line in tabText
      break;
    }
  }

  return {tabText: lines.slice(i).join('\n'), extractedOptions: extracted, declaredTuning, letterFrets};
}

/** Extract metadata from an ASCII tab header without building the full score. */
export function extractAsciiTabMeta(text: string): AsciiImportOptions {
  return parseTabBlock(text).extractedOptions;
}

/** Like importFromAsciiTab but also returns the extracted metadata without a second parse. */
export function importFromAsciiTabWithMeta(
  text: string,
  options: AsciiImportOptions = {},
): {score: ScoreInstance; meta: AsciiImportOptions} {
  const parsed = parseTabBlock(text);
  const merged: AsciiImportOptions = {...parsed.extractedOptions, ...options};
  const score = buildScoreFromParsed(parsed, merged);
  return {score, meta: merged};
}

function buildScoreFromParsed(parsed: TabBlockParsed, merged: AsciiImportOptions): ScoreInstance {
  const {title = 'Imported Tab', artist = '', tempo = DEFAULT_TEMPO} = merged;
  const {letterFrets} = parsed;
  let text = parsed.tabText;

  text = text
    .replace(/\[tab\]([\s\S]*?)\[\/tab\]/gi, '$1')
    .replace(/\[ch\](.*?)\[\/ch\]/gi, '$1')
    .split('\n')
    // A whole-line [Intro] / [Verse 2] is a section label (see sectionLabel); strip the rest
    .map(l => (/^\s*\[[^\]]+\]\s*$/.test(l) ? l : l.replace(/\[[A-Za-z0-9 _/-]+\]/g, '')))
    .join('\n');

  const systems = detectSystems(text, letterFrets);
  // The section label goes on the first bar of its system (or the next system that has notes)
  let pendingSection: string | undefined;
  const allBars = systems.flatMap(s => {
    const bars = parseSystem(s, letterFrets);
    pendingSection = s.section ?? pendingSection;
    if (bars.length > 0 && pendingSection) {
      bars[0].section = pendingSection;
      pendingSection = undefined;
    }
    return bars;
  });

  const stringCount = systems[0]?.lines.length ?? 6;
  const isBass = stringCount === 4;
  const tuningMidi = resolveTuning(stringCount, merged.tuning, parsed.declaredTuning, systems);

  const score = new Score();
  score.title = title;
  score.artist = artist;

  const track = new Track();
  track.name = isBass ? 'Bass' : 'Guitar';
  track.shortName = track.name.slice(0, 3);

  const playback = new PlaybackInformation();
  playback.volume = 15;
  playback.balance = 8;
  playback.program = isBass ? MIDI_PROGRAM_BASS : MIDI_PROGRAM_GUITAR;
  playback.primaryChannel = 0;
  playback.secondaryChannel = 1;
  track.playbackInfo = playback;

  const staff = new Staff();
  staff.showTablature = true;
  staff.showStandardNotation = true;

  // Avoid Tuning.findTuning — it requires an initialised AlphaTab context and
  // crashes with "candidates.find" when called outside one (e.g. in the browse flow).
  staff.stringTuning = new Tuning('Custom', tuningMidi, false);
  staff.capo = merged.capo ?? 0;
  track.addStaff(staff);
  score.addTrack(track);

  if (allBars.length === 0) {
    addEmptyBar(score, staff, tempo, 4, 4);
  } else {
    const expandedBars = allBars.flatMap(splitToStandardBars);
    expandedBars.forEach((parsedBar, i) => {
      const beatCount = parsedBar.beats.length;
      const {num, denom, beatDuration} = pickTimeSig(beatCount);
      addParsedBar(score, staff, parsedBar, i, tempo, num, denom, beatDuration, stringCount);
    });
  }

  score.finish(new Settings());
  return score;
}

export function importFromAsciiTab(
  text: string,
  options: AsciiImportOptions = {},
): ScoreInstance {
  const parsed = parseTabBlock(text);
  const merged: AsciiImportOptions = {...parsed.extractedOptions, ...options};
  return buildScoreFromParsed(parsed, merged);
}

// ---------------------------------------------------------------------------
// System detection — find groups of consecutive string-like lines
// ---------------------------------------------------------------------------

interface System {
  lines: string[];
  /** Section label found above this system ("Intro", "Verse 2"). */
  section?: string;
}

/** Heuristic: a line is a tab string line if it has lots of dashes + digits */
function isTabLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 6) return false;
  // Explicit string-name prefix — handles both "e|" and "E-|" (Barrios/La Catedral style)
  if (/^[A-Ga-g]-?\s*[|:]/.test(t)) return true;
  // Lines starting with | are fingering/annotation markers (e.g. |----4---|), not tab lines
  if (t.startsWith('|')) return false;
  // Without a string-name prefix: require high dash density (≥50%) to avoid false positives
  const dashes = (t.match(/-/g) ?? []).length;
  const total = t.replace(/\s/g, '').length;
  return dashes / total >= 0.50 && /\d/.test(t);
}

/**
 * A string line with no digits: an empty string ("----------------"), or one holding only
 * letter frets / mutes. Only accepted next to a tab line of similar length (see detectSystems),
 * so prose rules ("-----", "_____X2") don't become strings.
 */
function isDigitlessTabLine(line: string, letterFrets: boolean): boolean {
  const t = line.trim();
  if (t.length < 6 || t.startsWith('|')) return false;
  const allowed = letterFrets ? /^[-|\sa-fxX/\\~hpP()*.]+$/ : /^[-|\sxX/\\~()*.]+$/;
  const dashes = (t.match(/-/g) ?? []).length;
  return allowed.test(t) && dashes / t.replace(/\s/g, '').length >= 0.6;
}

function detectSystems(text: string, letterFrets = false): System[] {
  const lines = text.split('\n');
  const systems: System[] = [];
  let group: string[] = [];
  // Last label seen since the previous system; survives blank lines and prose
  let pendingSection: string | undefined;
  const flush = () => {
    if (group.length < 4) return;
    // Split group into sub-groups of 4, 6, or 7 lines
    for (const [gi, sub] of splitToStringGroups(group).entries()) {
      systems.push(gi === 0 && pendingSection ? {lines: sub, section: pendingSection} : {lines: sub});
      pendingSection = undefined;
    }
  };

  // Grow each run of tab lines into adjacent digitless string lines of similar length
  const accepted = lines.map(isTabLine);
  const len = (i: number) => lines[i].trimEnd().length;
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < lines.length; i++) {
      if (accepted[i] || !isDigitlessTabLine(lines[i], letterFrets)) continue;
      const near = [i - 1, i + 1].some(j => accepted[j] && Math.abs(len(j) - len(i)) <= 3);
      if (near) accepted[i] = changed = true;
    }
  }

  for (const [li, line] of lines.entries()) {
    if (accepted[li]) {
      group.push(line);
    } else {
      flush();
      group = [];
      pendingSection = sectionLabel(line) ?? pendingSection;
    }
  }
  flush();
  return systems;
}

const SECTION_KEYWORD =
  /^(intro|verse|chorus|bridge|pre-?chorus|outro|solo|instrumental|interlude|riff|coda|ending|refrain|rubato)\b/i;
const NOT_A_SECTION =
  /^(title|artist|tuning|capo|by|album|notes?|notations?|tempo|key|difficulty|description|tabbed by|e-?mail)\b/i;
const SENTENCE_WORD = /\b(then|this|is|on|with|play|played|goes|times|when|before|after|from|here's|twice)\b/i;

/**
 * Section name if the line is a section label, else null. Conservative so prose isn't taken:
 * "[Verse 2]"; a short "INTRO :" / "Instrumental #1 :"; or a keyword followed only by a number,
 * "#n", "(x2)" ("Chorus 2", "Solo (x2)"). Header keys and "Notations:" are never labels.
 */
function sectionLabel(line: string): string | null {
  const t = line.trim();
  let label: string | null = null;
  const bracketed = t.match(/^\[([^\]]+)\]$/);
  if (bracketed) label = bracketed[1];
  else if (t.length <= 30 && t.endsWith(':') && t.split(/\s+/).length <= 4) {
    // Reject the tail of a wrapped sentence ("goes:", "Then:", "End on:", "Main Riff is this:")
    const head = t.slice(0, -1);
    const startsLikeHeading = /^["\d\p{Lu}]/u.test(head) || SECTION_KEYWORD.test(head);
    const balanced = (head.match(/\(/g) ?? []).length === (head.match(/\)/g) ?? []).length;
    if (startsLikeHeading && balanced && !SENTENCE_WORD.test(head)) label = head;
  }
  else if (SECTION_KEYWORD.test(t) && /^[\s\d#:()xX.,&/-]*$/.test(t.replace(SECTION_KEYWORD, ''))) label = t;
  if (!label || label.length > 30 || NOT_A_SECTION.test(label.trim())) return null;
  label = label.replace(/[\s:]+$/, '').replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z]/.test(label)) return null;
  // "INTRO" → "Intro"; mixed case is kept as written
  return label === label.toUpperCase() ? label.charAt(0) + label.slice(1).toLowerCase() : label;
}

/** Split a block of N consecutive tab lines into groups of 4/6/7 */
function splitToStringGroups(lines: string[]): string[][] {
  // Common string counts for guitar (6), bass (4), 7-string (7)
  const preferred = [6, 4, 7];
  for (const n of preferred) {
    if (lines.length % n === 0) {
      const groups: string[][] = [];
      for (let i = 0; i < lines.length; i += n) groups.push(lines.slice(i, i + n));
      return groups;
    }
  }
  // Fallback: use 6 if ≥6, else 4
  const n = lines.length >= 6 ? 6 : 4;
  const groups: string[][] = [];
  for (let i = 0; i + n <= lines.length; i += n) groups.push(lines.slice(i, i + n));
  return groups;
}

// ---------------------------------------------------------------------------
// System parser — extract bars and beats from a group of string lines
// ---------------------------------------------------------------------------

interface ParsedNote {
  /** 0 = top line (highest pitch, AlphaTab string 1) */
  lineIdx: number;
  fret: number;
  col: number;
  technique?: 'h' | 'p' | '/' | '\\' | '~' | 'b';
}

interface ParsedBeat {
  notes: ParsedNote[];
  col: number;
}

interface ParsedBar {
  beats: ParsedBeat[];
  section?: string;
}

function parseSystem(system: System, letterFrets = false): ParsedBar[] {
  const {lines} = system;

  // Strip string-name prefix from each line, then find content
  const contents = extractContents(lines);
  const maxLen = Math.max(...contents.map(c => c.length));

  // Pad shorter lines
  const padded = contents.map(c => c.padEnd(maxLen, '-'));

  // Per-string: parse raw events (2-digit flagged), then resolve ambiguous frets
  const rawStringEvents = padded.map(l => parseStringLine(l, letterFrets));

  // Context: single-digit frets are unambiguous — use them to judge 2-digit candidates
  const contextFrets = rawStringEvents.flat().filter(e => !e.is2digit).map(e => e.fret);

  type StrEvent = {col: number; fret: number; technique?: ParsedNote['technique']};
  const stringEvents: StrEvent[][] = rawStringEvents.map(
    (evs, li) => resolveStringEvents(evs, contextFrets, padded, li),
  );

  // Find bar-line positions in the content
  const barCols = new Set<number>();
  for (const line of padded) {
    for (let x = 0; x < line.length; x++) {
      if (line[x] === '|') barCols.add(x);
    }
  }

  // Collect all events across strings
  const allEvents: (StrEvent & {lineIdx: number})[] = [];
  stringEvents.forEach((evs, li) => evs.forEach(ev => allEvents.push({...ev, lineIdx: li})));
  allEvents.sort((a, b) => a.col - b.col);

  // Group by proximity (notes within `tolerance` cols of each other = same beat). Normally 2,
  // so sloppy chords still line up; but the tolerance must stay below the system's typical
  // spacing between successive note columns. Tight fingerpicking 2 apart ("-0---0-4-0-0-3-")
  // only chords same-column or off-by-one notes; picking 1 apart only chords same-column notes.
  const cols = [...new Set(allEvents.map(e => e.col))].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < cols.length; i++) {
    if (!isBarBetween(cols[i - 1], cols[i], barCols)) gaps.push(cols[i] - cols[i - 1]);
  }
  const medianGap = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  // Gaps of 1 are either picking 1 apart (long runs: 4+ columns in a row) or off-by-one
  // chord notes (isolated pairs), which must still merge.
  const pickingRun = gaps.some((g, i) => g === 1 && gaps[i + 1] === 1 && gaps[i + 2] === 1);
  const tolerance = medianGap === undefined || medianGap >= 3 ? 2
    : medianGap === 2 || !pickingRun ? 1 : 0;

  const beatGroups: {col: number; notes: (StrEvent & {lineIdx: number})[]}[] = [];
  for (const ev of allEvents) {
    // Only merge into an existing beat if no note already occupies the same string —
    // AlphaTab overwrites when two notes share the same string in a single beat.
    const g = beatGroups.find(
      g => Math.abs(g.col - ev.col) <= tolerance
        && !isBarBetween(g.col, ev.col, barCols)
        && !g.notes.some(n => n.lineIdx === ev.lineIdx),
    );
    if (g) {
      g.notes.push(ev);
      g.col = Math.min(g.col, ev.col);
    } else {
      beatGroups.push({col: ev.col, notes: [ev]});
    }
  }

  // Sort by column
  beatGroups.sort((a, b) => a.col - b.col);

  // Split into bars using barCols
  const sortedBarCols = Array.from(barCols).sort((a, b) => a - b);

  const bars: ParsedBar[] = [];
  let segStart = 0;

  for (const bc of [...sortedBarCols, Infinity]) {
    const beats = beatGroups
      .filter(g => g.col >= segStart && g.col < bc)
      .map(g => ({
        col: g.col,
        notes: g.notes.map(n => ({
          lineIdx: n.lineIdx,
          fret: n.fret,
          col: n.col,
          technique: n.technique,
        })),
      }));
    if (beats.length > 0) bars.push({beats});
    // A note can sit on another string's bar column when measures don't line up — keep it
    segStart = bc;
  }

  return bars;
}

/** True if any bar line falls strictly between colA and colB */
function isBarBetween(colA: number, colB: number, barCols: Set<number>): boolean {
  const lo = Math.min(colA, colB);
  const hi = Math.max(colA, colB);
  for (const bc of barCols) {
    if (bc > lo && bc < hi) return true;
  }
  return false;
}

/**
 * Strip each line's string-name prefix (e.g. "E|", "e|", "B |", "E-|", "C#|") and return the
 * system's content lines. Whitespace gaps count as bar lines ("--0---0-  --------0-"); when every
 * string has the same number of measures, each measure is padded to its widest string so a stray
 * extra dash or space on one string can't shift everything after it.
 */
function extractContents(lines: string[]): string[] {
  const tokenized = lines.map(line => {
    // String name + pipe. Without the pipe a leading letter may be a letter fret ("a---f---").
    const m = line.match(/^\s*(?:[A-Ga-g][#b♭]?\s*-?\s*[|:])?(.*)/);
    const tokens = (m ? m[1] : line).split(/\s+/).filter(Boolean);
    // Drop annotations with no dashes around the tab: "(x2)", "x4", a pipe-less "e" label
    while (tokens.length > 0 && !tokens[tokens.length - 1].includes('-')) tokens.pop();
    while (tokens.length > 0 && !tokens[0].includes('-')) tokens.shift();
    return tokens;
  });
  const measures = tokenized.map(tokens => tokens.flatMap(t => t.split('|')).filter(Boolean));
  const count = measures[0].length;
  if (count === 0 || measures.some(ms => ms.length !== count)) {
    // Measures don't line up across strings — just drop whitespace, keep the pipes in place
    return tokenized.map(tokens => tokens.join('').replace(/\|$/, ''));
  }
  const widths = measures[0].map((_, k) => Math.max(...measures.map(ms => ms[k].length)));
  return measures.map(ms => ms.map((seg, k) => seg.padEnd(widths[k], '-')).join('|'));
}

type RawStrEvent = {
  col: number;
  fret: number;
  technique?: ParsedNote['technique'];
  is2digit: boolean;
};

const isDigit = (ch: string | undefined) => ch !== undefined && ch >= '0' && ch <= '9';

/**
 * Parse a single string's content line into raw note events, flagging 2-digit reads.
 * With `letterFrets`, a–f are frets 10–15 and every digit is a single fret ("2320" = 2,3,2,0).
 */
function parseStringLine(line: string, letterFrets = false): RawStrEvent[] {
  const events: RawStrEvent[] = [];
  let x = 0;
  while (x < line.length) {
    const ch = line[x];
    const isLetterFret = letterFrets && ch >= 'a' && ch <= 'f';
    if (isDigit(ch) || isLetterFret) {
      let fretStr = ch;
      let is2digit = false;
      // No fret is written with a leading zero, so "02" is always 0 then 2
      if (!letterFrets && ch !== '0' && isDigit(line[x + 1])) {
        fretStr += line[x + 1];
        is2digit = true;
        x++;
      }
      const fret = isLetterFret ? ch.charCodeAt(0) - 87 : parseInt(fretStr, 10);
      let technique: ParsedNote['technique'] | undefined;
      const ahead = line[x + 1];
      if (ahead === 'h') technique = 'h';
      else if (ahead === 'p') technique = 'p';
      else if (ahead === '/') technique = '/';
      else if (ahead === '\\') technique = '\\';
      else if (ahead === '~') technique = '~';
      else if (ahead === 'b' && !letterFrets) technique = 'b';
      events.push({col: x - (fretStr.length - 1), fret, technique, is2digit});
    }
    x++;
  }
  return events;
}

/**
 * True when a 2-digit fret is likely a misread of two consecutive single-digit frets.
 * Uses the 90th-percentile of single-digit context frets as a baseline:
 * if the context is clearly low-position (p90 < 12) and the candidate sits
 * more than 10 frets above that baseline, splitting is safer than keeping.
 * Never splits when the system leaves room for a 2-digit fret (see hasRoomFor2Digit).
 */
function shouldSplitFret(fret: number, contextFrets: number[], hasRoom: boolean): boolean {
  if (fret > MAX_FRET) return true;
  if (hasRoom) return false;
  if (contextFrets.length < 3) return false;
  const sorted = [...contextFrets].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  // p90 === 0 means all context is open strings — no position information,
  // so fret 14 is indistinguishable from notes 1+4. Prefer keeping it whole.
  return p90 > 0 && p90 < 12 && fret > p90 + 10;
}

/**
 * True when the 2-digit read at `col` on line `li` is column-aligned like a real fret:
 * the digit pair isn't part of a longer digit run on its own string ("2320"), and no other
 * string has a single-digit note in its second column (which would make it a beat of its own).
 */
function hasRoomFor2Digit(lines: string[], li: number, col: number): boolean {
  if (isDigit(lines[li][col - 1]) || isDigit(lines[li][col + 2])) return false;
  return lines.every((l, j) => j === li || !isDigit(l[col + 1]) || isDigit(l[col]) || isDigit(l[col + 2]));
}

/**
 * Resolve potentially ambiguous 2-digit events.
 * Splits "20" into frets [2, 0] when context suggests low-position playing.
 * Technique (h/p/slide etc.) is preserved on the second (lower) note after a split.
 */
function resolveStringEvents(
  evs: RawStrEvent[],
  contextFrets: number[],
  lines: string[],
  li: number,
): {col: number; fret: number; technique?: ParsedNote['technique']}[] {
  const out: {col: number; fret: number; technique?: ParsedNote['technique']}[] = [];
  for (const ev of evs) {
    if (ev.is2digit && shouldSplitFret(ev.fret, contextFrets, hasRoomFor2Digit(lines, li, ev.col))) {
      const hi = Math.floor(ev.fret / 10);
      const lo = ev.fret % 10;
      out.push({col: ev.col, fret: hi});
      out.push({col: ev.col + 1, fret: lo, technique: ev.technique});
    } else {
      out.push({col: ev.col, fret: Math.min(ev.fret, MAX_FRET), technique: ev.technique});
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Score builder
// ---------------------------------------------------------------------------

/** Choose a beat duration for a 4/4 bar that fits all beats without overflow. */
function pickTimeSig(beatCount: number): {num: number; denom: number; beatDuration: number} {
  if (beatCount <= 1) return {num: 4, denom: 4, beatDuration: Duration.Whole};
  if (beatCount <= 2) return {num: 4, denom: 4, beatDuration: Duration.Half};
  if (beatCount <= 4) return {num: 4, denom: 4, beatDuration: Duration.Quarter};
  if (beatCount <= 8) return {num: 4, denom: 4, beatDuration: Duration.Eighth};
  return {num: 4, denom: 4, beatDuration: Duration.Sixteenth};
}

/**
 * Split a parsed bar with more than 16 beats into multiple bars of max 16 beats each.
 * This ensures no bar overflows its 4/4 capacity and avoids artificial trailing silence
 * from using wider note values (32nd/64th) to fit all beats into one bar.
 */
function splitToStandardBars(parsedBar: ParsedBar): ParsedBar[] {
  const MAX_BEATS = 16;
  if (parsedBar.beats.length <= MAX_BEATS) return [parsedBar];
  const result: ParsedBar[] = [];
  for (let i = 0; i < parsedBar.beats.length; i += MAX_BEATS) {
    const beats = parsedBar.beats.slice(i, i + MAX_BEATS);
    result.push(i === 0 ? {beats, section: parsedBar.section} : {beats});
  }
  return result;
}

function addEmptyBar(
  score: ScoreInstance,
  staff: InstanceType<typeof Staff>,
  tempo: number,
  num: number,
  denom: number,
) {
  const mb = new MasterBar();
  mb.timeSignatureNumerator = num;
  mb.timeSignatureDenominator = denom;
  if (score.masterBars.length === 0) {
    const ta = new Automation();
    ta.isLinear = false;
    ta.ratioPosition = 0;
    ta.type = AutomationType.Tempo;
    ta.value = tempo;
    ta.text = '';
    mb.tempoAutomations = [ta];
  }
  score.addMasterBar(mb);

  const bar = new Bar();
  staff.addBar(bar);
  const voice = new Voice();
  bar.addVoice(voice);
  const rest = new Beat();
  rest.isEmpty = true;
  rest.duration = Duration.Whole;
  voice.addBeat(rest);
}

function addParsedBar(
  score: ScoreInstance,
  staff: InstanceType<typeof Staff>,
  parsedBar: ParsedBar,
  barIdx: number,
  tempo: number,
  num: number,
  denom: number,
  beatDuration: number,
  stringCount: number,
) {
  const mb = new MasterBar();
  mb.timeSignatureNumerator = num;
  mb.timeSignatureDenominator = denom;

  if (parsedBar.section) {
    mb.section = new Section();
    mb.section.marker = '';
    mb.section.text = parsedBar.section;
  }

  if (barIdx === 0) {
    const ta = new Automation();
    ta.isLinear = false;
    ta.ratioPosition = 0;
    ta.type = AutomationType.Tempo;
    ta.value = tempo;
    ta.text = '';
    mb.tempoAutomations = [ta];
  }

  score.addMasterBar(mb);

  const bar = new Bar();
  staff.addBar(bar);

  const voice = new Voice();
  bar.addVoice(voice);

  for (const parsedBeat of parsedBar.beats) {
    const beat = new Beat();
    beat.isEmpty = false;
    beat.duration = beatDuration;

    for (const pn of parsedBeat.notes) {
      const note = new Note();
      // AlphaTab: string 1 = bottom line (lowest pitch), string N = top line (highest pitch).
      // tunings[0] = topmost tab line = high e. lineIdx 0 = first ASCII line = high e.
      // So lineIdx 0 must map to string N (top), lineIdx N-1 maps to string 1 (bottom).
      note.string = stringCount - pn.lineIdx;
      note.fret = pn.fret;

      // Apply basic techniques
      if (pn.technique === 'h') {
        note.isHammerPullOrigin = true;
      } else if (pn.technique === 'p') {
        note.isHammerPullOrigin = true;
      } else if (pn.technique === '/') {
        note.slideOutType = SlideOutType.Legato;
      } else if (pn.technique === '\\') {
        note.slideOutType = SlideOutType.Shift;
      } else if (pn.technique === '~') {
        note.vibrato = model.VibratoType.Slight;
      }

      beat.addNote(note);
    }

    if (beat.notes.length === 0) {
      beat.isEmpty = true;
    }

    voice.addBeat(beat);
  }

  // Pad bar if empty
  if (voice.beats.length === 0) {
    const rest = new Beat();
    rest.isEmpty = true;
    rest.duration = Duration.Whole;
    voice.addBeat(rest);
  }
}
