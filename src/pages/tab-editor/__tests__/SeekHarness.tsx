/**
 * Test harness for alphatab-seek.ct.tsx.
 * Must live in its own file — Playwright CT cannot mount components defined in test files.
 *
 * Replicates the critical seek path from TabEditorPage:
 *   api.stop() → onPlayerStateChanged detects seekState → api.tickPosition = tick → api.play()
 *
 * Exposes window.__at and window.__atReady for page.evaluate() in the tests.
 *
 * Initialization sequence:
 *   1. apiReady       → renderScore() + subscribe to midiLoaded / midiLoadFailed
 *   2. renderFinished → set renderReadyFlag; if playerReady already fired, call loadMidiForScore()
 *   3. playerReady    → set playerReadyFlag; if renderFinished already fired, call loadMidiForScore()
 *   4. midiLoaded     → set __atReady = true (test can now call play())
 *
 * We use renderFinished rather than scoreLoaded because renderScore(score) renders an
 * in-memory AlphaTab model and does not emit the file-load scoreLoaded event.
 */
import {useRef, useEffect, useCallback} from 'react';
import type {AlphaTabApi} from '@coderline/alphatab';
import AlphaTabWrapper, {type AlphaTabHandle} from '@/pages/guitar/AlphaTabWrapper';
import {createGuitarDemo} from '@/lib/tab-editor/examples/guitar-demo';

type WinExt = Record<string, unknown>;

export function SeekHarness() {
  const ref = useRef<AlphaTabHandle>(null);
  const seekTickRef = useRef<number | null>(null);

  // Coordination flags — both must be true before loadMidiForScore() is safe.
  const renderFinishedRef = useRef(false);
  const playerReadyRef = useRef(false);
  const midiLoadStartedRef = useRef(false);
  const readyPollRef = useRef<number | null>(null);

  const tryLoadMidi = useCallback(() => {
    (window as unknown as WinExt).__atDiag = {
      ...((window as unknown as WinExt).__atDiag as Record<string, unknown> | undefined),
      renderFinished: renderFinishedRef.current,
      playerReady: playerReadyRef.current,
      midiLoadStarted: midiLoadStartedRef.current,
    };
    if (!renderFinishedRef.current || !playerReadyRef.current || midiLoadStartedRef.current) return;
    midiLoadStartedRef.current = true;
    const api = ref.current?.getApi();
    console.log('[SeekHarness] loadMidiForScore — render+player ready, api=', !!api);
    (window as unknown as WinExt).__atDiag = {
      ...((window as unknown as WinExt).__atDiag as Record<string, unknown> | undefined),
      midiLoadStarted: true,
    };
    api?.loadMidiForScore();
    if (api) {
      readyPollRef.current = window.setInterval(() => {
        if (!api.isReadyForPlayback) return;
        if (readyPollRef.current !== null) {
          window.clearInterval(readyPollRef.current);
          readyPollRef.current = null;
        }
        console.log('[SeekHarness] isReadyForPlayback → __atReady = true');
        (window as unknown as WinExt).__atReady = true;
        (window as unknown as WinExt).__atMidiLoaded = true;
      }, 50);
    }
  }, []);

  const handleApiReady = useCallback((api: AlphaTabApi) => {
    console.log('[SeekHarness] apiReady');
    (window as unknown as WinExt).__atApiReady = true;
    try {
      console.log('[SeekHarness] apiReady api=', !!api);

      console.log('[SeekHarness] renderScore');
      api.renderScore(createGuitarDemo(), [0]);
    } catch (e) {
      console.error('[SeekHarness] apiReady setup failed', String(e));
      (window as unknown as WinExt).__atRenderError = String(e);
    }
  }, [tryLoadMidi]);

  const handlePlayerReady = useCallback(() => {
    console.log('[SeekHarness] playerReady');
    (window as unknown as WinExt).__atPlayerReady = true;
    const api = ref.current?.getApi();
    if (!api) return;

    (window as unknown as WinExt).__at = {
      play: () => {
        if (!api.isReadyForPlayback) {
          console.log('[SeekHarness] play skipped: not ready for playback');
          return false;
        }
        return api.play();
      },
      stop: () => api.stop(),
      // Mirrors handleBeatClickWithSeek: store tick target, fire stop → handler restarts
      seekTo: (tick: number) => {
        seekTickRef.current = tick;
        api.stop();
      },
    };

    playerReadyRef.current = true;
    tryLoadMidi();
  }, [tryLoadMidi]);

  const handleRenderFinished = useCallback(() => {
    console.log('[SeekHarness] renderFinished');
    renderFinishedRef.current = true;
    (window as unknown as WinExt).__atRenderFinished = true;
    tryLoadMidi();
  }, [tryLoadMidi]);

  const handleStateChanged = useCallback((state: number) => {
    (window as unknown as WinExt).__atState = state;
    console.log('[SeekHarness] stateChanged', state, 'seekTick', seekTickRef.current);

    if (state === 0 && seekTickRef.current !== null) {
      const tick = seekTickRef.current;
      seekTickRef.current = null;
      const handle = ref.current;
      console.log('[SeekHarness] seek restart deferred: tick=', tick);
      // Defer to next tick so AlphaTab finishes its stop() cleanup before we restart
      setTimeout(() => {
        const api = handle?.getApi();
        console.log('[SeekHarness] seek restart executing: api=', !!api);
        if (api) {
          api.tickPosition = tick;
          api.play();
        }
      }, 0);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (readyPollRef.current !== null) {
        window.clearInterval(readyPollRef.current);
      }
      delete (window as unknown as WinExt).__at;
      delete (window as unknown as WinExt).__atReady;
      delete (window as unknown as WinExt).__atState;
      delete (window as unknown as WinExt).__atPlayerReady;
      delete (window as unknown as WinExt).__atApiReady;
      delete (window as unknown as WinExt).__atRenderFinished;
      delete (window as unknown as WinExt).__atRenderError;
      delete (window as unknown as WinExt).__atMidiLoaded;
      delete (window as unknown as WinExt).__atMidiError;
      delete (window as unknown as WinExt).__atDiag;
    };
  }, []);

  return (
    <div style={{width: 900, height: 500}}>
      <AlphaTabWrapper
        ref={ref}
        enablePlayer
        onApiReady={handleApiReady}
        onRenderFinished={handleRenderFinished}
        onPlayerReady={handlePlayerReady}
        onPlayerStateChanged={handleStateChanged}
      />
    </div>
  );
}
