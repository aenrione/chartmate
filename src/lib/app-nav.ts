/**
 * The "My Studio" app navigation rail (the `<aside>` in `Layout.tsx`).
 *
 * The nav is 256 px of permanent chrome. That is the right trade on a browsing
 * page, and the wrong one while practising a tab: AlphaTab lays the score out to
 * the width it is given, so every pixel the nav keeps is a pixel of staff the
 * player does not get. Collapsing it to an icon rail hands ~200 px back without
 * taking navigation more than one click away.
 *
 * The collapsed flag round-trips through `localStorage`, so — like the tab
 * editor's own practice settings — the parser is defensive: a stale or
 * hand-edited value must never be able to leave the nav in a broken state.
 */

/** Versioned, same scheme as `chartmate.tabEditor.sidebarCollapsed.v1`. */
export const APP_NAV_COLLAPSED_KEY = 'chartmate.appNav.collapsed.v1';

/** Tailwind `w-64` — the expanded nav. */
export const APP_NAV_EXPANDED_WIDTH_PX = 256;
/** Tailwind `w-14` — the icon rail, matching the existing landscape rail. */
export const APP_NAV_RAIL_WIDTH_PX = 56;

/**
 * Only a literal `true` collapses the nav. Anything else — `null`, `"true"`,
 * `1`, a leftover object from an older schema — means "expanded", which is the
 * state that can always be recovered from.
 */
export function parseAppNavCollapsed(raw: unknown): boolean {
  return raw === true;
}

/** What the nav currently occupies, for callers that need the number. */
export function appNavWidthPx(collapsed: boolean): number {
  return collapsed ? APP_NAV_RAIL_WIDTH_PX : APP_NAV_EXPANDED_WIDTH_PX;
}

/** Tooltip / `aria-label` for the toggle, naming the *result* of pressing it. */
export function appNavToggleLabel(collapsed: boolean): string {
  return collapsed ? 'Expand navigation (Alt+N)' : 'Collapse navigation (Alt+N)';
}
