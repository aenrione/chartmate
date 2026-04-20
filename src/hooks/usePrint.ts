import {useCallback} from 'react';
import type {AlphaTabApi} from '@coderline/alphatab';

function isIOS(): boolean {
  return /iPhone|iPad/.test(navigator.userAgent) && navigator.maxTouchPoints > 0;
}

/**
 * Returns a stable print function for AlphaTab surfaces.
 * - Desktop / Android: calls api.print() which opens a print-optimised window.
 * - iOS: falls back to in-page window.print() with body.printing class.
 */
export function useAlphaTabPrint(getApi: () => AlphaTabApi | null) {
  return useCallback(() => {
    if (!isIOS()) {
      getApi()?.print();
      return;
    }
    document.body.classList.add('printing');
    const cleanup = () => document.body.classList.remove('printing');
    window.addEventListener('afterprint', cleanup, {once: true});
    window.print();
  }, [getApi]);
}

/**
 * Returns a stable print function for non-AlphaTab surfaces (e.g. SongView).
 * Adds body.printing, calls window.print(), cleans up on afterprint.
 */
export function useWindowPrint() {
  return useCallback(() => {
    document.body.classList.add('printing');
    const cleanup = () => document.body.classList.remove('printing');
    window.addEventListener('afterprint', cleanup, {once: true});
    window.print();
  }, []);
}
