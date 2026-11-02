import {describe, it, expect} from 'vitest';
import {
  APP_NAV_COLLAPSED_KEY,
  APP_NAV_EXPANDED_WIDTH_PX,
  APP_NAV_RAIL_WIDTH_PX,
  appNavToggleLabel,
  appNavWidthPx,
  parseAppNavCollapsed,
} from '../app-nav';

describe('parseAppNavCollapsed', () => {
  it('collapses only for a literal true', () => {
    expect(parseAppNavCollapsed(true)).toBe(true);
  });

  it('defaults to expanded for a missing or junk value', () => {
    expect(parseAppNavCollapsed(undefined)).toBe(false);
    expect(parseAppNavCollapsed(null)).toBe(false);
    expect(parseAppNavCollapsed(false)).toBe(false);
    // Values a hand-edited or older localStorage entry could hold.
    expect(parseAppNavCollapsed('true')).toBe(false);
    expect(parseAppNavCollapsed(1)).toBe(false);
    expect(parseAppNavCollapsed({collapsed: true})).toBe(false);
    expect(parseAppNavCollapsed([])).toBe(false);
  });

  it('round-trips through JSON the way useLocalStorage stores it', () => {
    for (const value of [true, false]) {
      expect(parseAppNavCollapsed(JSON.parse(JSON.stringify(value)))).toBe(value);
    }
  });
});

describe('app nav geometry', () => {
  it('reclaims width when collapsed', () => {
    expect(appNavWidthPx(false)).toBe(APP_NAV_EXPANDED_WIDTH_PX);
    expect(appNavWidthPx(true)).toBe(APP_NAV_RAIL_WIDTH_PX);
    expect(APP_NAV_RAIL_WIDTH_PX).toBeLessThan(APP_NAV_EXPANDED_WIDTH_PX);
  });

  it('uses a versioned storage key', () => {
    expect(APP_NAV_COLLAPSED_KEY).toMatch(/^chartmate\..*\.v\d+$/);
  });
});

describe('appNavToggleLabel', () => {
  it('names the result of pressing it, with the shortcut', () => {
    expect(appNavToggleLabel(true)).toBe('Expand navigation (Alt+N)');
    expect(appNavToggleLabel(false)).toBe('Collapse navigation (Alt+N)');
  });

  it('does not collide with the tab editor sidebar shortcut', () => {
    expect(appNavToggleLabel(true)).not.toContain('Alt+B');
    expect(appNavToggleLabel(false)).not.toContain('Alt+B');
  });
});
