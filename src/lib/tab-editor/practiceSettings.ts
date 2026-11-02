/**
 * Practice preferences for the tab editor.
 *
 * The editor is two tools sharing one screen: a *notation editor* that writes to
 * the Guitar Pro file, and a *practice surface* that only changes how the file is
 * played back and displayed. Everything in this module belongs to the second
 * tool, so none of it ever touches the score:
 *
 * - **Playback speed** — a percentage applied to AlphaTab's synth. This is *not*
 *   the song's tempo. The sidebar's BPM field edits `score.tempo` and is saved;
 *   this slider is temporary and is never written anywhere.
 * - **Loop range** — a pair of bar indexes turned into a MIDI tick range for
 *   `api.playbackRange` / `api.isLooping`.
 * - **Editor mode** — `view` (practise: nothing can mutate the score) or `edit`
 *   (the full editor).
 * - **Sidebar section state** — which collapsible sidebar sections are open.
 *
 * The parsing helpers are deliberately defensive: all of these values round-trip
 * through `localStorage`, where a stale or hand-edited value must never be able
 * to put the editor into a broken state.
 */

import {barIndexToTick} from './seekUtils';

// ── localStorage keys ────────────────────────────────────────────────────────
export const EDITOR_MODE_KEY = 'chartmate.tabEditor.mode.v1';
export const SIDEBAR_COLLAPSED_KEY = 'chartmate.tabEditor.sidebarCollapsed.v1';
export const SIDEBAR_SECTIONS_KEY = 'chartmate.tabEditor.sidebarSections.v1';

// ── Playback speed ───────────────────────────────────────────────────────────
/** Matches the playbook's CompositionViewer slider (25–200 %, 5 % steps). */
export const MIN_PLAYBACK_SPEED = 25;
export const MAX_PLAYBACK_SPEED = 200;
export const DEFAULT_PLAYBACK_SPEED = 100;
export const PLAYBACK_SPEED_STEP = 5;

/** Clamp to the slider's range and snap to its step. */
export function clampPlaybackSpeed(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PLAYBACK_SPEED;
  const snapped = Math.round(value / PLAYBACK_SPEED_STEP) * PLAYBACK_SPEED_STEP;
  return Math.max(MIN_PLAYBACK_SPEED, Math.min(MAX_PLAYBACK_SPEED, snapped));
}

/** Nudge the speed by whole percent — used by the +/- buttons and `[` / `]`. */
export function adjustPlaybackSpeed(current: number, deltaPercent: number): number {
  return clampPlaybackSpeed(clampPlaybackSpeed(current) + deltaPercent);
}

/** `api.playbackSpeed` wants a factor, the UI talks in percent. */
export function playbackSpeedFactor(percent: number): number {
  return clampPlaybackSpeed(percent) / 100;
}

// ── Editor mode ──────────────────────────────────────────────────────────────
export type EditorMode = 'view' | 'edit';

export function parseEditorMode(raw: unknown): EditorMode {
  return raw === 'edit' ? 'edit' : 'view';
}

/**
 * The single predicate every mutating path checks. View mode must leave the
 * score byte-identical, so this gates note entry, effects, fingering, tempo,
 * key, tuning, tracks, sections, undo/redo and the clipboard's cut/paste.
 */
export function canMutateScore(mode: EditorMode): boolean {
  return mode === 'edit';
}

export function otherMode(mode: EditorMode): EditorMode {
  return mode === 'edit' ? 'view' : 'edit';
}

// ── Loop range ───────────────────────────────────────────────────────────────
/** Inclusive bar range, 0-based — the same shape `practiceRange` already uses. */
export interface BarRange {
  startBar: number;
  endBar: number;
}

/** Clamp a range into the score and put its ends the right way round. */
export function normalizeLoopRange(range: BarRange | null, totalBars: number): BarRange | null {
  if (!range || totalBars <= 0) return null;
  const lastBar = totalBars - 1;
  const a = Math.round(range.startBar);
  const b = Math.round(range.endBar);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const startBar = Math.max(0, Math.min(lastBar, Math.min(a, b)));
  const endBar = Math.max(0, Math.min(lastBar, Math.max(a, b)));
  return {startBar, endBar};
}

/**
 * What `Alt+L` loops: the selected bars when the user dragged a selection,
 * otherwise the single bar the cursor sits in.
 */
export function computeLoopRange(options: {
  selectedBarRange?: {start: number; end: number} | null;
  cursorBarIndex: number;
  totalBars: number;
}): BarRange | null {
  const {selectedBarRange, cursorBarIndex, totalBars} = options;
  const candidate: BarRange = selectedBarRange
    ? {startBar: selectedBarRange.start, endBar: selectedBarRange.end}
    : {startBar: cursorBarIndex, endBar: cursorBarIndex};
  return normalizeLoopRange(candidate, totalBars);
}

interface MasterBarLike {
  calculateDuration(): number;
}

interface LoopScoreLike {
  tracks: Array<{
    staves: Array<{
      bars: Array<{voices: Array<{beats: Array<{absolutePlaybackStart: number}>}>}>;
    }>;
  }>;
  masterBars: MasterBarLike[];
}

export interface TickRange {
  startTick: number;
  endTick: number;
}

/**
 * Turn an inclusive bar range into the half-open tick range AlphaTab wants in
 * `api.playbackRange`.
 *
 * Bars map to ticks through `api.tickCache` (`getMasterBarStart`), which is the
 * only mapping that accounts for repeats and alternate endings; `barIndexToTick`
 * falls back to a proportional estimate when the MIDI has not been generated
 * yet. The end of the loop is the *start of the bar after* `endBar`. When
 * `endBar` is the last bar there is no such bar, and `scoreEndTick` is often 0
 * until playback has run once, so we add the bar's own duration instead.
 */
export function loopRangeToTicks(
  score: LoopScoreLike,
  range: BarRange,
  totalBars: number,
  scoreEndTick: number,
  tickLookup?: {getMasterBarStart(masterBar: unknown): number} | null,
): TickRange | null {
  const normalized = normalizeLoopRange(range, totalBars);
  if (!normalized) return null;

  const startTick = barIndexToTick(score, normalized.startBar, totalBars, scoreEndTick, tickLookup);

  let endTick = normalized.endBar + 1 < totalBars
    ? barIndexToTick(score, normalized.endBar + 1, totalBars, scoreEndTick, tickLookup)
    : scoreEndTick;

  if (endTick <= startTick) {
    // Last bar of the score, or no tick mapping yet: measure the looped bars.
    let duration = 0;
    for (let bar = normalized.startBar; bar <= normalized.endBar; bar++) {
      duration += score.masterBars[bar]?.calculateDuration() ?? 0;
    }
    endTick = startTick + duration;
  }

  if (endTick <= startTick) return null;
  return {startTick, endTick};
}

/** Human label for the toolbar chip — bars are 1-based for the player. */
export function formatLoopRange(range: BarRange): string {
  return range.startBar === range.endBar
    ? `Bar ${range.startBar + 1}`
    : `Bars ${range.startBar + 1}–${range.endBar + 1}`;
}

// ── Sidebar sections ─────────────────────────────────────────────────────────
export const SIDEBAR_SECTION_IDS = [
  'stems',
  'tracks',
  'key',
  'readingAids',
  'sections',
  'patterns',
  'tuning',
] as const;

export type SidebarSectionId = (typeof SIDEBAR_SECTION_IDS)[number];
export type SidebarSectionState = Record<SidebarSectionId, boolean>;

/**
 * Defaults keep the practice-relevant sections open and the rarely-touched ones
 * folded away, so a fresh install starts with a sidebar that fits on screen.
 */
export const DEFAULT_SIDEBAR_SECTIONS: SidebarSectionState = {
  stems: false,
  tracks: true,
  key: true,
  readingAids: true,
  sections: true,
  patterns: false,
  tuning: false,
};

/** Merge a persisted blob over the defaults, ignoring anything unrecognised. */
export function parseSidebarSections(raw: unknown): SidebarSectionState {
  const result = {...DEFAULT_SIDEBAR_SECTIONS};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  const record = raw as Record<string, unknown>;
  for (const id of SIDEBAR_SECTION_IDS) {
    if (typeof record[id] === 'boolean') result[id] = record[id];
  }
  return result;
}
