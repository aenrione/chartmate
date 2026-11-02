import {describe, it, expect} from 'vitest';
import {
  EDIT_ONLY_TOOLBAR_ACTIONS,
  OVERFLOW_MENU_ACTIONS,
  PRACTICE_TOOLBAR_ACTIONS,
  STATUS_BAR_ITEMS,
  isToolbarActionVisible,
  visibleToolbarActions,
  type ToolbarActionId,
} from '../toolbarLayout';

const view = {mode: 'view', isDrumTrack: false} as const;
const edit = {mode: 'edit', isDrumTrack: false} as const;
const editDrums = {mode: 'edit', isDrumTrack: true} as const;

describe('toolbar contents by mode', () => {
  it('keeps the practice controls in both modes', () => {
    for (const id of PRACTICE_TOOLBAR_ACTIONS) {
      expect(isToolbarActionVisible(id, view)).toBe(true);
      expect(isToolbarActionVisible(id, edit)).toBe(true);
    }
  });

  it('keeps play, stop, speed, loop, the mode switch and the collapse visible', () => {
    const essential: ToolbarActionId[] = [
      'playPause', 'stop', 'speed', 'loop', 'modeSwitch', 'collapseSidebar',
    ];
    for (const id of essential) {
      expect(visibleToolbarActions(view)).toContain(id);
      expect(visibleToolbarActions(edit)).toContain(id);
    }
  });

  it('shows the note-entry surfaces only while editing', () => {
    for (const id of EDIT_ONLY_TOOLBAR_ACTIONS) {
      expect(isToolbarActionVisible(id, view)).toBe(false);
      expect(isToolbarActionVisible(id, edit)).toBe(true);
    }
  });

  it('is strictly leaner in View mode', () => {
    const inView = visibleToolbarActions(view);
    const inEdit = visibleToolbarActions(edit);
    expect(inView.length).toBeLessThan(inEdit.length);
    // Leaner, not different: View mode must not gain anything Edit mode lacks.
    expect(inView.every(id => inEdit.includes(id))).toBe(true);
  });

  it('drops the chord finder on a percussion track', () => {
    expect(isToolbarActionVisible('chordFinder', editDrums)).toBe(false);
    // The same control opens the drum pad, so it stays.
    expect(isToolbarActionVisible('fretboard', editDrums)).toBe(true);
  });

  it('returns actions in render order with no duplicates', () => {
    const actions = visibleToolbarActions(edit);
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions[0]).toBe('back');
    expect(actions[actions.length - 1]).toBe('overflowMenu');
    expect(actions.indexOf('playPause')).toBeLessThan(actions.indexOf('stop'));
    expect(actions.indexOf('save')).toBeLessThan(actions.indexOf('overflowMenu'));
  });
});

describe('what left the toolbar', () => {
  it('never puts the cursor read-out back in the toolbar', () => {
    expect(isToolbarActionVisible('cursorPosition', view)).toBe(false);
    expect(isToolbarActionVisible('cursorPosition', edit)).toBe(false);
    expect(visibleToolbarActions(view)).not.toContain('cursorPosition');
    expect(visibleToolbarActions(edit)).not.toContain('cursorPosition');
  });

  it('reports the cursor in the status bar instead', () => {
    expect(STATUS_BAR_ITEMS).toContain('cursorPosition');
  });

  it('moves the occasional actions to the overflow menu', () => {
    for (const id of ['import', 'export', 'print', 'newTab', 'help', 'demos'] as const) {
      expect(OVERFLOW_MENU_ACTIONS).toContain(id);
    }
  });

  it('reaches every edit-only inline action from the menu too', () => {
    // The menu is the only route to them in View mode and on mobile.
    for (const id of EDIT_ONLY_TOOLBAR_ACTIONS) {
      expect(OVERFLOW_MENU_ACTIONS).toContain(id);
    }
  });

  it('does not duplicate a practice control into the menu', () => {
    const menu = new Set<string>(OVERFLOW_MENU_ACTIONS);
    for (const id of PRACTICE_TOOLBAR_ACTIONS) {
      expect(menu.has(id)).toBe(false);
    }
  });
});
