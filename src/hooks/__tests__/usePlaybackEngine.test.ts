import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, renderHook} from '@testing-library/react';
import type {AlphaTabApi, model} from '@coderline/alphatab';
import {usePlaybackEngine, type UsePlaybackEngineParams} from '../usePlaybackEngine';

type Beat = InstanceType<typeof model.Beat>;

function mountEngine({ready = true, stemsReady = true} = {}) {
  let tick = 0;
  const api = {
    playerState: 0,
    isReadyForPlayback: ready,
    timePosition: 0,
    get tickPosition() { return tick; },
    set tickPosition(value: number) { tick = value; },
    play: vi.fn(() => true),
    pause: vi.fn(() => { api.playerState = 0; }),
    stop: vi.fn(() => { api.playerState = 0; tick = 0; }),
    loadMidiForScore: vi.fn(),
    tickCache: {getBeatStart: vi.fn(() => 9876)},
  };
  const stems = {
    stemsReady,
    pause: vi.fn().mockResolvedValue(undefined),
    stopAndReset: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn().mockResolvedValue(undefined),
  };
  const callbacks = {
    onPlaybackStarted: vi.fn(),
    onPlaybackPaused: vi.fn(),
    onPlaybackSeek: vi.fn(),
    onRenderNeeded: vi.fn(),
  };
  const props = {
    apiRef: {current: api},
    getApi: () => api as unknown as AlphaTabApi,
    scoreRef: {current: {masterBars: [{}, {}, {}, {}]}},
    stemPlayer: stems,
    canvasScrollRef: {current: null},
    canvasRef: {current: {alphaTab: {stop: api.stop, clearPlaybackRange: vi.fn()}}},
    ...callbacks,
  } as unknown as UsePlaybackEngineParams;
  const hook = renderHook(() => usePlaybackEngine(props));
  act(() => {
    hook.result.current.isPlayerReadyRef.current = ready;
    hook.result.current.renderFinishedRef.current = ready;
  });
  function acknowledgePlaying() {
    act(() => {
      api.playerState = 1;
      hook.result.current.handlePlayerStateChanged(1);
    });
  }
  return {...hook, api, stems, callbacks, acknowledgePlaying};
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

describe('usePlaybackEngine transport', () => {
  it('does not claim playback or start external audio until AlphaTab acknowledges Playing', () => {
    const {result, api, callbacks, acknowledgePlaying} = mountEngine();
    act(() => { result.current.handlePlayPause(); });
    expect(api.play).toHaveBeenCalledOnce();
    expect(result.current.isPlaying).toBe(false);
    expect(callbacks.onPlaybackStarted).not.toHaveBeenCalled();
    acknowledgePlaying();
    expect(result.current.isPlaying).toBe(true);
    expect(callbacks.onPlaybackStarted).toHaveBeenCalledOnce();
  });

  it('pauses immediately during startup and a delayed start cannot resurrect playback', () => {
    const {result, api, stems, acknowledgePlaying} = mountEngine();
    act(() => { result.current.handlePlayPause(); });
    acknowledgePlaying();
    expect(result.current.isAlphaTabStartupGuardActive()).toBe(true);
    act(() => { result.current.handlePlayPause(); });
    expect(api.pause).toHaveBeenCalledOnce();
    expect(stems.pause).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
    // Simulate an acknowledgement already in flight when Pause was pressed.
    acknowledgePlaying();
    expect(result.current.isPlaying).toBe(false);
    expect(api.pause).toHaveBeenCalledTimes(2);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(api.play).toHaveBeenCalledOnce();
    expect(api.playerState).toBe(0);
  });

  it('a second Space cancels a pending startup even when the player never started', () => {
    const {result, api, stems} = mountEngine();
    act(() => { result.current.handlePlayPause(); });
    act(() => { result.current.handlePlayPause(); });
    expect(api.play).toHaveBeenCalledOnce();
    expect(api.pause).toHaveBeenCalledOnce();
    expect(stems.pause).toHaveBeenCalled();
    expect(result.current.isPlayingRef.current).toBe(false);
  });

  it('Stop cancels a request waiting for MIDI and rendering readiness', () => {
    const {result, api, stems} = mountEngine({ready: false});
    act(() => { result.current.handlePlayPause(); });
    expect(api.play).not.toHaveBeenCalled();
    act(() => { result.current.handleStop(); });
    act(() => {
      api.isReadyForPlayback = true;
      result.current.handleRenderFinished();
      vi.advanceTimersByTime(2000);
    });
    expect(api.play).not.toHaveBeenCalled();
    expect(stems.stopAndReset).toHaveBeenCalledOnce();
    expect(result.current.isPlaying).toBe(false);
  });

  it('resumes only after a queued score mutation renders, despite outgoing stopped events', () => {
    const {result, api, callbacks, acknowledgePlaying} = mountEngine();
    act(() => { result.current.handlePlayPause(); });
    acknowledgePlaying();
    act(() => {
      // Mutation is queued behind the startup guard; the old render still
      // reports ready until the page's runRender actually begins.
      result.current.pendingScoreRenderRef.current = true;
      result.current.prepareForScoreRender();
      result.current.requestAlphaTabPlay();
      result.current.handlePlayerStateChanged(0);
      vi.advanceTimersByTime(700);
    });
    expect(api.play).toHaveBeenCalledOnce();
    expect(result.current.isPlaying).toBe(false);
    expect(callbacks.onRenderNeeded).toHaveBeenCalled();
    act(() => {
      // The page clears this flag in runRender before invoking renderScore.
      result.current.pendingScoreRenderRef.current = false;
      result.current.markRenderPending();
      result.current.handlePlayerStateChanged(0);
      result.current.handleRenderFinished();
    });
    expect(api.play).toHaveBeenCalledTimes(2);
    acknowledgePlaying();
    expect(result.current.isPlaying).toBe(true);
  });

  it('rejects a late old-score start while a newer score render is queued', () => {
    const {result, api, callbacks} = mountEngine();
    act(() => {
      result.current.pendingScoreRenderRef.current = true;
      result.current.requestAlphaTabPlay();
      api.playerState = 1;
      result.current.handlePlayerStateChanged(1);
    });
    expect(api.pause).toHaveBeenCalledOnce();
    expect(result.current.isPlaying).toBe(false);
    expect(callbacks.onPlaybackStarted).not.toHaveBeenCalled();
    act(() => {
      result.current.pendingScoreRenderRef.current = false;
      result.current.handleRenderFinished();
    });
    expect(api.play).toHaveBeenCalledOnce();
  });

  it('does not retry a rejected Play with a delayed toggle', () => {
    const {result, api, callbacks} = mountEngine();
    api.play.mockReturnValue(false);
    act(() => { result.current.handlePlayPause(); vi.advanceTimersByTime(2000); });
    expect(api.play).toHaveBeenCalledOnce();
    expect(result.current.isPlaying).toBe(false);
    expect(callbacks.onPlaybackStarted).not.toHaveBeenCalled();
  });

  it('clears playback when the player finishes and stops external audio', () => {
    const {result, stems, acknowledgePlaying} = mountEngine();
    act(() => { result.current.handlePlayPause(); });
    acknowledgePlaying();
    act(() => { result.current.handlePlayerFinished(); });
    expect(result.current.isPlaying).toBe(false);
    expect(stems.stopAndReset).toHaveBeenCalledOnce();
  });

  it('waits for the new MIDI acknowledgement even when the worker still reports old MIDI ready', () => {
    const {result, api, acknowledgePlaying} = mountEngine();
    act(() => {
      result.current.markRenderPending();
      result.current.midiReloadNeeded.current = true;
      result.current.requestAlphaTabPlay(9000);
      result.current.handleRenderFinished();
    });
    expect(api.loadMidiForScore).toHaveBeenCalledOnce();
    expect(api.isReadyForPlayback).toBe(true); // stale worker state
    expect(result.current.midiLoadingRef.current).toBe(true);
    expect(api.play).not.toHaveBeenCalled();
    act(() => {
      result.current.handlePlayerStateChanged(0); // outgoing MIDI unloaded
      vi.advanceTimersByTime(1500);
    });
    expect(api.play).not.toHaveBeenCalled();
    act(() => { result.current.handlePlayerReady(); });
    expect(result.current.midiLoadingRef.current).toBe(false);
    expect(api.play).toHaveBeenCalledOnce();
    expect(api.tickPosition).toBe(9000);
    acknowledgePlaying();
    expect(result.current.isPlaying).toBe(true);
  });

  it('does not revive a Play cancelled while new MIDI is loading', () => {
    const {result, api} = mountEngine();
    act(() => {
      result.current.loadMidiForCurrentScore();
      result.current.handlePlayPause();
      result.current.handlePlayPause(); // cancel pending request
      result.current.handlePlayerReady();
      vi.advanceTimersByTime(1500);
    });
    expect(api.play).not.toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
  });

  it('does not recursively reload MIDI from a synchronous readiness event', () => {
    const {result, api} = mountEngine();
    api.loadMidiForScore.mockImplementation(() => { result.current.handlePlayerReady(); });
    act(() => {
      result.current.midiReloadNeeded.current = true;
      result.current.handlePlayerReady();
    });
    expect(api.loadMidiForScore).toHaveBeenCalledOnce();
    expect(result.current.midiReloadNeeded.current).toBe(false);
  });

  it('cancels deferred work on unmount', () => {
    const {result, api} = mountEngine();
    const delayed = vi.fn();
    act(() => {
      result.current.handlePlayPause();
      result.current.deferUntilAlphaTabStartupSettles(delayed);
      result.current.unmount();
      vi.advanceTimersByTime(3000);
    });
    expect(delayed).not.toHaveBeenCalled();
    expect(api.play).toHaveBeenCalledOnce();
    expect(api.pause).toHaveBeenCalledOnce();
  });
});

describe('usePlaybackEngine seek', () => {
  const beat = {absolutePlaybackStart: 0, voice: {bar: {masterBar: {index: 2}}}} as Beat;

  it('seeks a running player directly using its MIDI lookup, without resetting to the intro', () => {
    const {result, api, stems, callbacks, acknowledgePlaying} = mountEngine();
    act(() => { result.current.handlePlayPause(); });
    acknowledgePlaying();
    const select = vi.fn();
    act(() => { result.current.handleBeatClickWithSeek(beat, select); });
    expect(select).toHaveBeenCalledWith(beat);
    expect(api.tickCache.getBeatStart).toHaveBeenCalledWith(beat);
    expect(api.tickPosition).toBe(9876);
    expect(api.stop).not.toHaveBeenCalled();
    expect(api.play).toHaveBeenCalledOnce();
    // Playback has tempo changes/repeats: do not estimate seconds from endTick.
    act(() => { result.current.handlePositionChanged(22250, 120000, 9876, 40000); });
    expect(stems.seek).toHaveBeenCalledWith(22.25);
    expect(callbacks.onPlaybackSeek).toHaveBeenCalledWith(22.25);
    expect(result.current.isPlaying).toBe(true);
  });

  it('ignores an old position event after a newer note was clicked', () => {
    const {result, api, stems, acknowledgePlaying} = mountEngine();
    act(() => { result.current.handlePlayPause(); });
    acknowledgePlaying();
    act(() => {
      result.current.handleBeatClickWithSeek(beat, vi.fn());
      api.tickCache.getBeatStart.mockReturnValue(15000);
      result.current.handleBeatClickWithSeek(beat, vi.fn());
      result.current.handlePositionChanged(22250, 120000, 9876, 40000);
    });
    expect(stems.seek).not.toHaveBeenCalled();
    act(() => { result.current.handlePositionChanged(35000, 120000, 15000, 40000); });
    expect(stems.seek).toHaveBeenCalledExactlyOnceWith(35);
  });

  it('positions a paused player without starting stems, and resumes at that tick', () => {
    const {result, api, stems} = mountEngine();
    act(() => {
      result.current.handleBeatClickWithSeek(beat, vi.fn());
      result.current.handlePositionChanged(22250, 120000, 9876, 40000);
    });
    expect(api.tickPosition).toBe(9876);
    expect(stems.seek).not.toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
    act(() => { result.current.handlePlayPause(); });
    expect(api.tickPosition).toBe(9876);
  });

  it('retains a clicked note across queued render, MIDI reset, and Pause/Resume', () => {
    const {result, api, acknowledgePlaying} = mountEngine();
    act(() => { result.current.handlePlayPause(); });
    acknowledgePlaying();
    act(() => {
      api.tickPosition = 4000;
      result.current.pendingScoreRenderRef.current = true;
      result.current.prepareForScoreRender();
      result.current.requestAlphaTabPlay();
      result.current.handleBeatClickWithSeek(beat, vi.fn());
      result.current.handlePlayPause(); // cancel pending resume but keep selected note
      result.current.handlePlayPause(); // resume while render still queued
    });
    expect(api.play).toHaveBeenCalledOnce();
    expect(api.tickPosition).toBe(4000); // selection is deferred, not sent to old MIDI
    act(() => {
      vi.advanceTimersByTime(700);
      result.current.pendingScoreRenderRef.current = false;
      result.current.markRenderPending();
      result.current.midiReloadNeeded.current = true;
      result.current.handleRenderFinished();
      api.tickPosition = 0; // worker loads the replacement MIDI
      result.current.handlePlayerStateChanged(0);
      result.current.handlePlayerReady();
    });
    expect(api.play).toHaveBeenCalledTimes(2);
    expect(api.tickPosition).toBe(9876);
  });

  it('a newer paused note selection supersedes the position retained by Pause', () => {
    const {result, api, acknowledgePlaying} = mountEngine();
    act(() => { result.current.handlePlayPause(); });
    acknowledgePlaying();
    act(() => {
      api.tickPosition = 9000;
      result.current.handlePlayPause(); // retain current position while paused
      api.tickCache.getBeatStart.mockReturnValue(4800);
      result.current.handleBeatClickWithSeek(beat, vi.fn());
      result.current.handlePositionChanged(6000, 120000, 4800, 40000);
      result.current.handlePlayPause();
    });
    expect(api.play).toHaveBeenCalledTimes(2);
    expect(api.tickPosition).toBe(4800);
  });

  it('Stop clears a note queued while MIDI was loading', () => {
    const {result, api} = mountEngine();
    act(() => {
      result.current.loadMidiForCurrentScore();
      result.current.handleBeatClickWithSeek(beat, vi.fn());
      result.current.handleStop();
      result.current.handlePlayerReady();
      result.current.handlePlayPause();
    });
    expect(api.play).toHaveBeenCalledOnce();
    expect(api.tickPosition).toBe(0);
  });

  it('does not start unselected stems on seek', () => {
    const {result, stems, callbacks, acknowledgePlaying} = mountEngine({stemsReady: false});
    act(() => { result.current.handlePlayPause(); });
    acknowledgePlaying();
    act(() => {
      result.current.handleBeatClickWithSeek(beat, vi.fn());
      result.current.handlePositionChanged(22250, 120000, 9876, 40000);
    });
    expect(stems.seek).not.toHaveBeenCalled();
    expect(callbacks.onPlaybackSeek).toHaveBeenCalledWith(22.25);
  });
});
