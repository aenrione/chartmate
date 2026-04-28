// src/lib/alphaTabTheme.ts
//
// Shared dark/light AlphaTab color resources + theme-application helper. Both AlphaTabWrapper
// (the heavyweight player on /guitar) and TabSnippet (the read-only repertoire preview) wire
// these into their AlphaTab instances so the rendered notation respects the app's color scheme.

import type {AlphaTabApi} from '@coderline/alphatab';
import {useEffect} from 'react';

export const DARK_RESOURCES = {
  mainGlyphColor: '#e4e4e7ff',
  secondaryGlyphColor: '#a1a1aa66',
  staffLineColor: '#52525bff',
  barSeparatorColor: '#71717aff',
  scoreInfoColor: '#e4e4e7ff',
  barNumberColor: '#a1a1aaff',
};

export const LIGHT_RESOURCES = {
  mainGlyphColor: '#000000ff',
  secondaryGlyphColor: '#00000066',
  staffLineColor: '#a5a5a5ff',
  barSeparatorColor: '#222211ff',
  scoreInfoColor: '#000000ff',
  barNumberColor: '#c80000ff',
};

export function isDarkMode(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

export function currentResources(): typeof DARK_RESOURCES {
  return isDarkMode() ? DARK_RESOURCES : LIGHT_RESOURCES;
}

/**
 * Apply the current theme colors to an AlphaTab instance. `triggerRender` controls whether to
 * call `api.render()` afterwards — the initial application during init typically wants to skip
 * it (the first render fires anyway), while dark-mode toggling at runtime needs the re-render.
 */
export function applyAlphaTabTheme(api: AlphaTabApi, triggerRender: boolean = true): void {
  api.settings.fillFromJson({display: {resources: currentResources()}});
  api.updateSettings();
  if (triggerRender) api.render();
}

/**
 * React hook: applies the current theme to the given AlphaTab api as soon as it's available
 * AND watches the `<html>` element for dark-mode class changes, re-applying on every toggle.
 */
export function useAlphaTabTheme(apiRef: React.MutableRefObject<AlphaTabApi | null>): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      if (apiRef.current) applyAlphaTabTheme(apiRef.current, true);
    });
    observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class']});
    return () => observer.disconnect();
    // apiRef is stable; no deps needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
