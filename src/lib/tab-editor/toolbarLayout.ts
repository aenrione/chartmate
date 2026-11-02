/**
 * What the tab editor's toolbar shows, and where everything else went.
 *
 * The toolbar is a single non-wrapping flex row, so its contents are a budget,
 * not a wish list. When every action lived in it the row ran out of width and
 * the browser did the only thing left: it wrapped the *text inside* the items —
 * the cursor read-out broke across four lines and the fingering button stacked
 * "p i m a" one letter per line.
 *
 * The fix is an explicit priority, encoded here so the row's contents can be
 * tested instead of eyeballed:
 *
 * - **Transport and practice controls stay.** Play/stop, practice speed, loop,
 *   the audio source, the View/Edit switch and the sidebar collapse are what a
 *   practice session touches every minute.
 * - **Two editing actions stay, in Edit mode only.** The chord finder and the
 *   fretboard/drum-pad are the note-entry surfaces; they make Edit mode visibly
 *   wider than View mode, which is the point of having two modes.
 * - **Everything occasional moves to the `⋮` overflow menu** — new tab, stave
 *   mode, fingering, demos, import, export, print, YouTube, help. That menu
 *   already existed for mobile; it is now the single overflow for all widths
 *   rather than a second desktop-only pattern.
 * - **The cursor read-out moved to the status bar.** It is a continuous
 *   read-out, not an action, and the status bar is where mode, BPM, practice
 *   speed and loop already report themselves.
 */

import type {EditorMode} from './practiceSettings';

/** Every control the toolbar row can contain, plus the one that left it. */
export type ToolbarActionId =
  | 'back'
  | 'title'
  | 'playPause'
  | 'stop'
  | 'speed'
  | 'loop'
  | 'audioSource'
  | 'modeSwitch'
  | 'collapseSidebar'
  | 'save'
  | 'chordFinder'
  | 'fretboard'
  | 'overflowMenu'
  | 'cursorPosition';

export interface ToolbarContext {
  mode: EditorMode;
  /** Percussion tracks have no fretboard and no chords. */
  isDrumTrack: boolean;
}

/** Visible in both modes — the practice core, in render order. */
export const PRACTICE_TOOLBAR_ACTIONS = [
  'back',
  'title',
  'playPause',
  'stop',
  'speed',
  'loop',
  'audioSource',
  'modeSwitch',
  'collapseSidebar',
  'save',
  'overflowMenu',
] as const satisfies readonly ToolbarActionId[];

/** Shown inline only while editing, so View mode reads leaner. */
export const EDIT_ONLY_TOOLBAR_ACTIONS = [
  'chordFinder',
  'fretboard',
] as const satisfies readonly ToolbarActionId[];

/** Read-outs that belong to the status bar, never to the toolbar. */
export const STATUS_BAR_ITEMS = [
  'track',
  'mode',
  'tempo',
  'practiceSpeed',
  'loop',
  'cursorPosition',
] as const;

/** Occasional actions, reachable from the `⋮` menu at every width. */
export const OVERFLOW_MENU_ACTIONS = [
  'newTab',
  'staveMode',
  'fingering',
  'autoFingering',
  'chordFinder',
  'fretboard',
  'demos',
  'import',
  'export',
  'print',
  'youtube',
  'help',
] as const;

export type OverflowMenuActionId = (typeof OVERFLOW_MENU_ACTIONS)[number];

export function isToolbarActionVisible(id: ToolbarActionId, ctx: ToolbarContext): boolean {
  // The cursor read-out lives in the status bar now. Keeping it in the union
  // (rather than deleting the name) is what makes "never in the toolbar"
  // something a test can assert.
  if (id === 'cursorPosition') return false;
  if ((PRACTICE_TOOLBAR_ACTIONS as readonly ToolbarActionId[]).includes(id)) return true;
  if (ctx.mode !== 'edit') return false;
  // Chords and frets are meaningless on a percussion staff; the drum pad is
  // reached from the same `fretboard` control, so only the chord finder drops.
  if (id === 'chordFinder') return !ctx.isDrumTrack;
  return (EDIT_ONLY_TOOLBAR_ACTIONS as readonly ToolbarActionId[]).includes(id);
}

/** The toolbar's contents for a given mode, in render order. */
export function visibleToolbarActions(ctx: ToolbarContext): ToolbarActionId[] {
  const ordered: ToolbarActionId[] = [
    'back',
    'title',
    'playPause',
    'stop',
    'speed',
    'loop',
    'audioSource',
    'modeSwitch',
    'collapseSidebar',
    'chordFinder',
    'fretboard',
    'save',
    'overflowMenu',
  ];
  return ordered.filter(id => isToolbarActionVisible(id, ctx));
}
