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
 *
 * Timing: ASCII tabs rarely encode exact rhythm, so each beat
 * defaults to Duration.Quarter. The user can refine in the editor.
 */

import {model, Settings} from '@coderline/alphatab';

const {
  Score, Track, Staff, Bar, Voice, Beat, MasterBar, Note,
  PlaybackInformation, Automation, AutomationType, Duration,
  Tuning, SlideOutType,
} = model;

type ScoreInstance = InstanceType<typeof Score>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AsciiImportOptions {
  title?: string;
  artist?: string;
  tempo?: number;
  /** Force 4/4 time even if the bar beat count suggests otherwise. */
  forceFourFour?: boolean;
}

interface TabBlockParsed {
  tabText: string;
  extractedOptions: AsciiImportOptions;
}

/**
 * Strip a leading metadata header (Title/Artist/Tempo lines) from the input.
 * Returns the remaining tab text and whatever options were extracted.
 * The caller merges extracted options with any explicitly passed options;
 * explicitly passed options win on conflict.
 */
function parseTabBlock(input: string): TabBlockParsed {
  const lines = input.split('\n');
  const extracted: AsciiImportOptions = {};
  let i = 0;

  // Skip leading blank lines before the header
  while (i < lines.length && lines[i].trim() === '') i++;

  // Consume header lines (Key: Value) — stop at first non-matching non-blank line
  while (i < lines.length) {
    const line = lines[i].trim();
    const m = line.match(/^(Title|Artist|Tempo):\s*(.+)$/i);
    if (m) {
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === 'title') extracted.title = val;
      else if (key === 'artist') extracted.artist = val;
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

  return {tabText: lines.slice(i).join('\n'), extractedOptions: extracted};
}

export function importFromAsciiTab(
  text: string,
  options: AsciiImportOptions = {},
): ScoreInstance {
  const {tabText, extractedOptions} = parseTabBlock(text);
  const merged: AsciiImportOptions = {...extractedOptions, ...options};
  const {title = 'Imported Tab', artist = '', tempo = 120} = merged;
  text = tabText;

  // Strip Ultimate Guitar markup so pasted UG content works in the editor
  text = text
    .replace(/\[tab\]([\s\S]*?)\[\/tab\]/gi, '$1')
    .replace(/\[ch\](.*?)\[\/ch\]/gi, '$1')
    .replace(/\[[A-Za-z0-9 _/-]+\]/g, '');

  const systems = detectSystems(text);
  const allBars = systems.flatMap(s => parseSystem(s));

  const stringCount = systems[0]?.lines.length ?? 6;
  const isBass = stringCount === 4;
  const is7String = stringCount === 7;
  const tuningMidi = isBass
    ? [43, 38, 33, 28]             // G2 D2 A1 E1  (alphaTab: highest first)
    : is7String
      ? [64, 59, 55, 50, 45, 40, 35] // E4 B3 G3 D3 A2 E2 B1  (7-string)
      : [64, 59, 55, 50, 45, 40];    // E4 B3 G3 D3 A2 E2

  // Build Score
  const score = new Score();
  score.title = title;
  score.artist = artist;

  const track = new Track();
  track.name = isBass ? 'Bass' : 'Guitar';
  track.shortName = track.name.slice(0, 3);

  const playback = new PlaybackInformation();
  playback.volume = 15;
  playback.balance = 8;
  playback.program = isBass ? 33 : 25; // Acoustic Guitar (steel)
  playback.primaryChannel = 0;
  playback.secondaryChannel = 1;
  track.playbackInfo = playback;

  const staff = new Staff();
  staff.showTablature = true;
  staff.showStandardNotation = true;

  // Avoid Tuning.findTuning — it requires an initialised AlphaTab context and
  // crashes with "candidates.find" when called outside one (e.g. in the browse flow).
  // We already know the exact MIDI values, so create the tuning directly.
  staff.stringTuning = new Tuning('Custom', tuningMidi, false);
  track.addStaff(staff);
  score.addTrack(track);

  if (allBars.length === 0) {
    // Fallback: one empty bar
    addEmptyBar(score, staff, tempo, 4, 4);
  } else {
    allBars.forEach((parsedBar, i) => {
      const beatCount = parsedBar.beats.length;
      const {num, denom, beatDuration} = pickTimeSig(beatCount);
      addParsedBar(score, staff, parsedBar, i, tempo, num, denom, beatDuration, stringCount);
    });
  }

  score.finish(new Settings());
  return score;
}

// ---------------------------------------------------------------------------
// System detection — find groups of consecutive string-like lines
// ---------------------------------------------------------------------------

interface System {
  lines: string[];
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

function detectSystems(text: string): System[] {
  const lines = text.split('\n');
  const systems: System[] = [];
  let group: string[] = [];

  for (const line of lines) {
    if (isTabLine(line)) {
      group.push(line);
    } else {
      if (group.length >= 4) {
        // Split group into sub-groups of 4, 6, or 7 lines
        for (const sub of splitToStringGroups(group)) {
          systems.push({lines: sub});
        }
      }
      group = [];
    }
  }
  if (group.length >= 4) {
    for (const sub of splitToStringGroups(group)) {
      systems.push({lines: sub});
    }
  }
  return systems;
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
}

function parseSystem(system: System): ParsedBar[] {
  const {lines} = system;

  // Strip string-name prefix from each line, then find content
  const contents = lines.map(extractContent);
  const maxLen = Math.max(...contents.map(c => c.length));

  // Pad shorter lines
  const padded = contents.map(c => c.padEnd(maxLen, '-'));

  // Per-string: collect note events {col, fret, technique}
  type StrEvent = {col: number; fret: number; technique?: ParsedNote['technique']};
  const stringEvents: StrEvent[][] = padded.map(line => parseStringLine(line));

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

  // Group by proximity (notes within 2 cols of each other = same beat)
  const beatGroups: {col: number; notes: (StrEvent & {lineIdx: number})[]}[] = [];
  for (const ev of allEvents) {
    const g = beatGroups.find(g => Math.abs(g.col - ev.col) <= 2 && !isBarBetween(g.col, ev.col, barCols));
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
    segStart = bc + 1;
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

/** Strip the string-name prefix (e.g. "E|", "e|", "B |", "E-|") and return content. */
function extractContent(line: string): string {
  // Match optional string name (with optional dash separator, e.g. "E-|") + pipe
  const m = line.match(/^[^\S\n]*[A-Ga-g#♭]?-?\s*\|?(.*)/);
  const content = m ? m[1] : line;
  // Remove trailing | and whitespace
  return content.replace(/\|\s*$/, '').replace(/\s/g, '');
}

/** Parse a single string's content line into note events. */
function parseStringLine(line: string): {col: number; fret: number; technique?: ParsedNote['technique']}[] {
  const events: {col: number; fret: number; technique?: ParsedNote['technique']}[] = [];
  let x = 0;
  while (x < line.length) {
    const ch = line[x];
    if (ch >= '0' && ch <= '9') {
      let fretStr = ch;
      if (x + 1 < line.length && line[x + 1] >= '0' && line[x + 1] <= '9') {
        fretStr += line[x + 1];
        x++;
      }
      const fret = parseInt(fretStr, 10);
      // Look ahead for technique symbol
      let technique: ParsedNote['technique'] | undefined;
      const ahead = line[x + 1];
      if (ahead === 'h') technique = 'h';
      else if (ahead === 'p') technique = 'p';
      else if (ahead === '/') technique = '/';
      else if (ahead === '\\') technique = '\\';
      else if (ahead === '~') technique = '~';
      else if (ahead === 'b') technique = 'b';
      events.push({col: x - (fretStr.length - 1), fret, technique});
    }
    x++;
  }
  return events;
}

// ---------------------------------------------------------------------------
// Score builder
// ---------------------------------------------------------------------------

/** Choose a time signature and beat duration based on beat count. */
function pickTimeSig(beatCount: number): {num: number; denom: number; beatDuration: number} {
  // Map beat count → time sig + beat duration
  if (beatCount <= 1)  return {num: 4, denom: 4, beatDuration: Duration.Whole};
  if (beatCount === 2) return {num: 2, denom: 4, beatDuration: Duration.Half};
  if (beatCount === 3) return {num: 3, denom: 4, beatDuration: Duration.Quarter};
  if (beatCount === 4) return {num: 4, denom: 4, beatDuration: Duration.Quarter};
  if (beatCount === 6) return {num: 6, denom: 8, beatDuration: Duration.Eighth};
  if (beatCount <= 8) return {num: 4, denom: 4, beatDuration: Duration.Eighth};
  if (beatCount <= 12) return {num: 3, denom: 4, beatDuration: Duration.Sixteenth};
  return {num: 4, denom: 4, beatDuration: Duration.Sixteenth};
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
      // alphaTab strings are 1-indexed, 1 = highest pitch = lineIdx 0
      note.string = pn.lineIdx + 1;
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
