/**
 * Strumming patterns: derive a readable "count + strokes" summary from a score.
 *
 * A strummed chart repeats the same hand movement for bar after bar. Guitar Pro
 * stores it the long way — every bar spells out every stroke — but a guitarist
 * reads it once:
 *
 * ```
 *   1   &   2   &   3   &   4   &
 *   D   U   d   U   D   U   D   U
 * ```
 *
 * and then knows it holds for the next N bars. This module turns a score into
 * exactly that: a list of **runs**, each one a stretch of consecutive bars whose
 * strumming is identical, with the count row and the stroke row already laid out.
 *
 * Nothing new is stored. Everything comes from what AlphaTab already has on the
 * beats (`brushType`, `brushDuration`, note count, `isDead`, `accentuated`), so
 * an existing Guitar Pro file gains the pattern line for free.
 *
 * ## What makes two bars "the same"
 *
 * The comparison is on the *hand*, not on the *chord*. Two bars match when they
 * agree on:
 *
 * - the rhythmic grid (meter and subdivision),
 * - which grid slots sound and which are skipped,
 * - the brush direction of each stroke (down / up / not brushed),
 * - the **width class** of each stroke (`full` / `partial`),
 * - whether each stroke is muted,
 * - whether each stroke is accented.
 *
 * Frets, strings and chord names are deliberately ignored — in Eddie Vedder's
 * "Society" the same strum carries a six-string shape in one bar and a
 * five-string shape in the next, and a guitarist calls that one pattern.
 *
 * Width is a *class*, not a string count, for the same reason. Within a bar the
 * widest stroke defines "full"; anything covering less than
 * {@link PARTIAL_RATIO} of it is "partial". So a 6-string downstroke next to a
 * 5-string upstroke is two full strokes, while the 3-string graze on beat 2 is
 * partial in both a six-string and a five-string bar.
 *
 * A bar that *nearly* matches is not smoothed over: it starts a new run, and the
 * run records {@link StrummingRun.differsFromPrevious} so the UI can point at
 * exactly which slots changed.
 */

/** AlphaTab's MIDI resolution: ticks in a quarter note. */
export const TICKS_PER_QUARTER = 960;
/** Ticks in a whole note. */
export const TICKS_PER_WHOLE = TICKS_PER_QUARTER * 4;

/**
 * A stroke narrower than this fraction of the bar's widest stroke counts as
 * partial. 0.75 keeps the natural "upstrokes skip the low E" narrowing as full
 * while catching a deliberate three-string graze.
 */
export const PARTIAL_RATIO = 0.75;

/** Subdivisions of one count that get real syllables. Finer bars are skipped. */
const SUPPORTED_DIVISIONS = [1, 2, 3, 4] as const;

/** Sub-count syllables, indexed by divisions-per-count. Slot 0 is the number. */
const DIVISION_LABELS: Record<number, string[]> = {
  1: [''],
  2: ['', '&'],
  3: ['', 'trip', 'let'],
  4: ['', 'e', '&', 'a'],
};

export type StrokeDirection = 'down' | 'up';
export type StrokeWidth = 'full' | 'partial';

// ── Input: a plain, AlphaTab-free description of a bar ──────────────────────

/** One beat of a bar, as the pattern derivation needs to see it. */
export interface StrumBeatInput {
  /** Offset from the start of the bar, in ticks. */
  start: number;
  /** Length of the beat, in ticks. */
  duration: number;
  /** Brush direction, or `null` when the beat is plucked / not brushed. */
  brush: StrokeDirection | null;
  /** How many strings sound. `0` for a rest. */
  stringCount: number;
  /** Every sounding note is dead / muted. */
  muted: boolean;
  /** At least one sounding note carries an accent. */
  accented: boolean;
}

/** One bar of a track. */
export interface StrumBarInput {
  /** 0-based index of the bar in the staff. */
  index: number;
  numerator: number;
  denominator: number;
  beats: StrumBeatInput[];
}

// ── Output ──────────────────────────────────────────────────────────────────

/** One slot of the rhythmic grid. */
export interface StrumSlot {
  /** Count syllable: `1`, `e`, `&`, `a`, `trip`, `let`. */
  label: string;
  /** True when something sounds here. */
  sounds: boolean;
  /** `null` when nothing sounds, or when the beat is plucked rather than brushed. */
  direction: StrokeDirection | null;
  /** `null` when nothing sounds. */
  width: StrokeWidth | null;
  muted: boolean;
  accented: boolean;
}

/**
 * The one-character shorthand for a slot.
 *
 * | mark | meaning                       |
 * |------|-------------------------------|
 * | `D`  | full downstroke               |
 * | `U`  | full upstroke                 |
 * | `d`  | partial downstroke            |
 * | `u`  | partial upstroke              |
 * | `X`  | muted / dead downstroke       |
 * | `x`  | muted / dead upstroke         |
 * | `o`  | sounds, but is not brushed     |
 * | ` `  | skipped slot                  |
 */
export function markForSlot(slot: StrumSlot): string {
  if (!slot.sounds) return ' ';
  if (slot.muted) return slot.direction === 'up' ? 'x' : 'X';
  if (slot.direction === null) return 'o';
  if (slot.direction === 'down') return slot.width === 'partial' ? 'd' : 'D';
  return slot.width === 'partial' ? 'u' : 'U';
}

/** A stretch of consecutive bars that all strum the same way. */
export interface StrummingRun {
  /** First bar of the run, 1-based and inclusive — what the user reads. */
  startBar: number;
  /** Last bar of the run, 1-based and inclusive. */
  endBar: number;
  /** How many bars the pattern repeats for. */
  barCount: number;
  /** `4/4`, `6/8`, … */
  timeSignature: string;
  /** Grid slots, in order. */
  slots: StrumSlot[];
  /** Count row, one entry per slot. */
  counts: string[];
  /** Stroke row, one entry per slot. See {@link markForSlot}. */
  marks: string[];
  /** True when any slot in the run is accented. */
  hasAccents: boolean;
  /** Stable key for the pattern; two runs with the same signature are identical. */
  signature: string;
  /**
   * Slot indices where this run differs from the run immediately before it, or
   * `null` when the two are not comparable (different meter or subdivision) or
   * when this is the first run. A near-miss shows up here as one or two indices.
   */
  differsFromPrevious: number[] | null;
}

export interface StrummingAnalysis {
  /** Empty for a score with no brush strokes at all (e.g. fingerpicking). */
  runs: StrummingRun[];
  /** How many bars carry at least one brush stroke. */
  strummedBars: number;
  /** 0-based indices of bars whose subdivision was too fine to summarise. */
  skippedBars: number[];
}

const EMPTY_ANALYSIS: StrummingAnalysis = {runs: [], strummedBars: 0, skippedBars: []};

// ── Derivation ──────────────────────────────────────────────────────────────

/** Ticks in one count (one denominator unit) of the given meter. */
function countTicks(denominator: number): number {
  return TICKS_PER_WHOLE / denominator;
}

/**
 * Lay a bar out on a grid.
 *
 * Returns `null` when the bar has no brush stroke at all, or when its onsets do
 * not fit any of the supported subdivisions (finer than sixteenths, or an
 * irregular tuplet the count row has no syllables for).
 */
function gridForBar(bar: StrumBarInput): {divisions: number; slots: StrumSlot[]} | null {
  const sounding = bar.beats.filter(b => b.stringCount > 0);
  if (!sounding.some(b => b.brush !== null)) return null;

  const unit = countTicks(bar.denominator);
  if (!Number.isFinite(unit) || unit <= 0) return null;

  const divisions = SUPPORTED_DIVISIONS.find(d => {
    const slotTicks = unit / d;
    if (!Number.isInteger(slotTicks)) return false;
    return sounding.every(b => b.start >= 0 && b.start % slotTicks === 0);
  });
  if (divisions === undefined) return null;

  const slotTicks = unit / divisions;
  const slotCount = bar.numerator * divisions;
  const labels = DIVISION_LABELS[divisions];

  // "Full" is relative to the widest stroke in this bar, so a chord shape that
  // happens to use one string fewer does not read as a different pattern.
  const widest = sounding.reduce((max, b) => Math.max(max, b.stringCount), 0);

  const slots: StrumSlot[] = [];
  for (let i = 0; i < slotCount; i++) {
    const sub = i % divisions;
    slots.push({
      label: sub === 0 ? String(Math.floor(i / divisions) + 1) : labels[sub],
      sounds: false,
      direction: null,
      width: null,
      muted: false,
      accented: false,
    });
  }

  for (const beat of sounding) {
    const index = beat.start / slotTicks;
    if (!Number.isInteger(index) || index < 0 || index >= slotCount) continue;
    slots[index] = {
      label: slots[index].label,
      sounds: true,
      direction: beat.brush,
      width: widest > 1 && beat.stringCount / widest < PARTIAL_RATIO ? 'partial' : 'full',
      muted: beat.muted,
      accented: beat.accented,
    };
  }

  return {divisions, slots};
}

function signatureFor(bar: StrumBarInput, divisions: number, slots: StrumSlot[]): string {
  const body = slots
    .map(s => `${markForSlot(s)}${s.accented ? '>' : ''}`)
    .join('|');
  return `${bar.numerator}/${bar.denominator}@${divisions}:${body}`;
}

/**
 * Group consecutive bars into runs that share a strumming pattern.
 *
 * Bars with no brush stroke are not part of any run and break the run around
 * them, so a strummed chorus between two fingerpicked verses is reported on its
 * own.
 */
export function deriveStrummingRuns(bars: StrumBarInput[]): StrummingAnalysis {
  if (bars.length === 0) return EMPTY_ANALYSIS;

  const runs: StrummingRun[] = [];
  const skippedBars: number[] = [];
  let strummedBars = 0;
  let open: {bar: StrumBarInput; divisions: number; slots: StrumSlot[]; signature: string} | null =
    null;
  let openEnd = 0;

  const close = () => {
    if (!open) return;
    const {bar, slots, signature} = open;
    const marks = slots.map(markForSlot);
    const previous = runs[runs.length - 1];
    const comparable =
      previous !== undefined &&
      previous.endBar === bar.index && // 1-based end == 0-based start ⇒ adjacent
      previous.marks.length === marks.length &&
      previous.timeSignature === `${bar.numerator}/${bar.denominator}`;
    runs.push({
      startBar: bar.index + 1,
      endBar: openEnd + 1,
      barCount: openEnd - bar.index + 1,
      timeSignature: `${bar.numerator}/${bar.denominator}`,
      slots,
      counts: slots.map(s => s.label),
      marks,
      hasAccents: slots.some(s => s.accented),
      signature,
      differsFromPrevious: comparable
        ? marks.reduce<number[]>((acc, m, i) => {
            const prev = previous.slots[i];
            const here = slots[i];
            if (m !== previous.marks[i] || prev.accented !== here.accented) acc.push(i);
            return acc;
          }, [])
        : null,
    });
    open = null;
  };

  for (const bar of bars) {
    const grid = gridForBar(bar);
    if (!grid) {
      // Either nothing is brushed here, or the grid is too fine to summarise.
      if (bar.beats.some(b => b.stringCount > 0 && b.brush !== null)) {
        skippedBars.push(bar.index);
        strummedBars++;
      }
      close();
      continue;
    }
    strummedBars++;
    const signature = signatureFor(bar, grid.divisions, grid.slots);
    if (open && open.signature === signature && bar.index === openEnd + 1) {
      openEnd = bar.index;
      continue;
    }
    close();
    open = {bar, divisions: grid.divisions, slots: grid.slots, signature};
    openEnd = bar.index;
  }
  close();

  return {runs, strummedBars, skippedBars};
}

// ── Rendering helpers (pure text, used by the UI and by tests) ──────────────

/** Column width used when laying the count row over the stroke row. */
function columnWidth(run: StrummingRun): number {
  return Math.max(2, ...run.counts.map(c => c.length)) + 1;
}

/**
 * Lay a run out as plain text: an optional accent row, the count row, and the
 * stroke row. Used for copy-to-clipboard and for tests; the UI renders the same
 * data as arrows.
 */
export function formatStrummingRun(run: StrummingRun): string {
  const w = columnWidth(run);
  const pad = (s: string) => s.padEnd(w, ' ');
  const lines: string[] = [];
  if (run.hasAccents) {
    lines.push(run.slots.map(s => pad(s.accented ? '>' : '')).join('').trimEnd());
  }
  lines.push(run.counts.map(pad).join('').trimEnd());
  lines.push(run.marks.map(pad).join('').trimEnd());
  return lines.join('\n');
}

/** `bars 57–76 (20 bars)`, or `bar 12` for a single bar. */
export function describeRunRange(run: StrummingRun): string {
  if (run.startBar === run.endBar) return `bar ${run.startBar}`;
  return `bars ${run.startBar}–${run.endBar} (${run.barCount} bars)`;
}

// ── AlphaTab adapter ────────────────────────────────────────────────────────

/**
 * Read a track's bars into the plain shape {@link deriveStrummingRuns} wants.
 *
 * Onsets are accumulated from the beat durations rather than read from
 * `playbackStart`, which is only filled in once a score has been through the
 * player and is bar-relative in some import paths.
 */
export function collectStrumBars(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  score: any,
  trackIndex = 0,
  voiceIndex = 0,
): StrumBarInput[] {
  const staff = score?.tracks?.[trackIndex]?.staves?.[0];
  if (!staff || staff.isPercussion) return [];

  const bars: StrumBarInput[] = [];
  for (let i = 0; i < staff.bars.length; i++) {
    const masterBar = score.masterBars?.[i];
    const voice = staff.bars[i]?.voices?.[voiceIndex];
    if (!voice) continue;

    let start = 0;
    const beats: StrumBeatInput[] = [];
    for (const beat of voice.beats) {
      const duration: number = beat.playbackDuration || beat.displayDuration || 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const notes = beat.isRest ? [] : beat.notes.filter((n: any) => n.isVisible !== false);
      beats.push({
        start,
        duration,
        brush: beat.brushType === 2 ? 'down' : beat.brushType === 1 ? 'up' : null,
        stringCount: notes.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        muted: notes.length > 0 && notes.every((n: any) => n.isDead === true),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accented: notes.some((n: any) => (n.accentuated ?? 0) !== 0),
      });
      start += duration;
    }

    bars.push({
      index: i,
      numerator: masterBar?.timeSignatureNumerator ?? 4,
      denominator: masterBar?.timeSignatureDenominator ?? 4,
      beats,
    });
  }
  return bars;
}

/** Derive the strumming runs of a track straight from an AlphaTab score. */
export function analyzeStrumming(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  score: any,
  trackIndex = 0,
  voiceIndex = 0,
): StrummingAnalysis {
  return deriveStrummingRuns(collectStrumBars(score, trackIndex, voiceIndex));
}
