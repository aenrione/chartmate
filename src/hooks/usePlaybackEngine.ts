import {useState, useCallback, useRef} from 'react';
import type React from 'react';
import {AlphaTabApi, model} from '@coderline/alphatab';
import {computeSeekTick, tickToSeconds} from '@/lib/tab-editor/seekUtils';
import type {useStemPlayer} from '@/hooks/useStemPlayer';

type Score = InstanceType<typeof model.Score>;

// ── Constants ────────────────────────────────────────────────────────────────
const ALPHATAB_PLAY_STARTUP_GUARD_MS = 650;
const ALPHATAB_MUTATION_SETTLE_MS = 25;
const ALPHATAB_TRANSIENT_STOP_SUPPRESS_MS = 1_200;
const PLAYBACK_SCROLL_THRESHOLD_PX = 20;

// ── Discriminated union for seek intent ──────────────────────────────────────
type PlaybackIntent = {type: 'idle'} | {type: 'seeking'; tick: number; secs: number};

export interface UsePlaybackEngineParams {
  apiRef: React.MutableRefObject<AlphaTabApi | null>;
  scoreRef: React.RefObject<Score | null>;
  stemPlayer: ReturnType<typeof useStemPlayer>;
  canvasScrollRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<{alphaTab: {stop: () => void; clearPlaybackRange: () => void} | null} | null>;
  ytSyncSuppressRef?: React.MutableRefObject<boolean>;
  youtubeSyncRef?: React.RefObject<{onPause: () => void; onResume: () => void} | null>;
  /** Called when a render should be triggered (e.g. after stop during pending render) */
  onRenderNeeded: () => void;
  /** getApi helper — allows canvas handle override */
  getApi: () => AlphaTabApi | null;
  /** Called when playback starts */
  onPlaybackStarted?: () => void;
  /** Called when playback pauses or stops */
  onPlaybackPaused?: () => void;
  /** Called when the engine stops (e.g. user pressed stop) */
  onStop?: () => void;
  /** Called when a score render finishes (after engine concerns are handled) */
  onRenderFinished?: () => void;
}

export function usePlaybackEngine(params: UsePlaybackEngineParams) {
  const {
    apiRef: _apiRef,
    scoreRef,
    stemPlayer,
    canvasScrollRef,
    canvasRef,
    ytSyncSuppressRef,
    youtubeSyncRef,
    onRenderNeeded,
    getApi,
  } = params;

  // ── State ─────────────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const midiReloadNeeded = useRef(false);
  const seekStateRef = useRef<PlaybackIntent>({type: 'idle'});
  const lastPlaybackYRef = useRef(0);
  const pendingPlayRef = useRef(false);
  const pendingPlayTickRef = useRef<number | null>(null);
  const playbackReadyPollRef = useRef<number | null>(null);
  const pendingScoreRenderRef = useRef(false);
  const scoreRenderTimerRef = useRef<number | null>(null);
  const playStartupGuardUntilRef = useRef(0);
  const playStartupTimerRef = useRef<number | null>(null);
  const suppressTransientStopUntilRef = useRef(0);
  const alphaTabPlayerStateRef = useRef(0);
  const isPlayingRef = useRef(false);
  const isPlayerReadyRef = useRef(false);
  const renderFinishedRef = useRef(false);
  // Position / tick mapping refs (consumed externally via return)
  const positionRef = useRef({currentTimeMs: 0});
  const tickMappingRef = useRef({endTick: 1, endTimeMs: 0});

  // ── Startup guard ─────────────────────────────────────────────────────────
  const isAlphaTabStartupGuardActive = useCallback(() => {
    return Date.now() < playStartupGuardUntilRef.current;
  }, []);

  const getAlphaTabStartupGuardDelay = useCallback(() => {
    return Math.max(0, playStartupGuardUntilRef.current - Date.now() + ALPHATAB_MUTATION_SETTLE_MS);
  }, []);

  const armAlphaTabStartupGuard = useCallback(() => {
    playStartupGuardUntilRef.current = Date.now() + ALPHATAB_PLAY_STARTUP_GUARD_MS;
    if (playStartupTimerRef.current !== null) {
      window.clearTimeout(playStartupTimerRef.current);
    }
    playStartupTimerRef.current = window.setTimeout(() => {
      playStartupGuardUntilRef.current = 0;
      playStartupTimerRef.current = null;
    }, ALPHATAB_PLAY_STARTUP_GUARD_MS);
  }, []);

  const deferUntilAlphaTabStartupSettles = useCallback((fn: () => void) => {
    if (!isAlphaTabStartupGuardActive()) {
      fn();
      return;
    }
    window.setTimeout(fn, getAlphaTabStartupGuardDelay());
  }, [getAlphaTabStartupGuardDelay, isAlphaTabStartupGuardActive]);

  // ── Polling / timer helpers ───────────────────────────────────────────────
  const clearPlaybackReadyPoll = useCallback(() => {
    if (playbackReadyPollRef.current === null) return;
    window.clearInterval(playbackReadyPollRef.current);
    playbackReadyPollRef.current = null;
  }, []);

  const clearScoreRenderTimer = useCallback(() => {
    if (scoreRenderTimerRef.current === null) return;
    window.clearTimeout(scoreRenderTimerRef.current);
    scoreRenderTimerRef.current = null;
  }, []);

  const markRenderPending = useCallback(() => {
    renderFinishedRef.current = false;
  }, []);

  const markPlaying = useCallback(() => {
    alphaTabPlayerStateRef.current = 1;
    isPlayingRef.current = true;
    setIsPlaying(true);
  }, []);

  // ── Core playback primitives ───────────────────────────────────────────────
  const playAlphaTab = useCallback((tick?: number) => {
    const api = getApi();
    if (typeof tick === 'number') {
      pendingPlayTickRef.current = tick;
    }
    if (!api || !api.isReadyForPlayback || !renderFinishedRef.current || api.playerState === 1) return false;
    pendingPlayRef.current = false;
    clearPlaybackReadyPoll();
    const startTick = pendingPlayTickRef.current;
    pendingPlayTickRef.current = null;
    if (typeof startTick === 'number') {
      api.tickPosition = startTick;
    } else if (api.tickPosition <= 1) {
      api.tickPosition = 0;
    }
    armAlphaTabStartupGuard();
    suppressTransientStopUntilRef.current = Date.now() + ALPHATAB_TRANSIENT_STOP_SUPPRESS_MS;
    api.play();
    markPlaying();
    window.setTimeout(() => {
      const latestApi = getApi();
      if (
        latestApi &&
        latestApi.playerState !== 1 &&
        pendingPlayRef.current === false
      ) {
        latestApi.playPause();
      }
    }, 100);
    return true;
  }, [armAlphaTabStartupGuard, clearPlaybackReadyPoll, getApi, markPlaying]);

  const startPlaybackWhenReady = useCallback(() => {
    if (!pendingPlayRef.current) return;
    window.setTimeout(() => { playAlphaTab(); }, 0);
  }, [playAlphaTab]);

  const pollPlaybackReady = useCallback(() => {
    if (playbackReadyPollRef.current !== null) return;
    playbackReadyPollRef.current = window.setInterval(startPlaybackWhenReady, 50);
  }, [startPlaybackWhenReady]);

  const requestAlphaTabPlay = useCallback((tick?: number) => {
    pendingPlayRef.current = true;
    if (typeof tick === 'number') {
      pendingPlayTickRef.current = tick;
    }
    const api = getApi();
    if (!api?.isReadyForPlayback || !renderFinishedRef.current) {
      pollPlaybackReady();
      return false;
    }
    return playAlphaTab();
  }, [getApi, playAlphaTab, pollPlaybackReady]);

  const pauseAlphaTab = useCallback(() => {
    pendingPlayRef.current = false;
    pendingPlayTickRef.current = null;
    suppressTransientStopUntilRef.current = 0;
    clearPlaybackReadyPoll();
    deferUntilAlphaTabStartupSettles(() => {
      const api = getApi();
      if (api?.playerState === 1) {
        api.playPause();
      }
    });
    alphaTabPlayerStateRef.current = 0;
  }, [clearPlaybackReadyPoll, deferUntilAlphaTabStartupSettles, getApi]);

  const stopAlphaTab = useCallback(() => {
    pendingPlayRef.current = false;
    pendingPlayTickRef.current = null;
    suppressTransientStopUntilRef.current = 0;
    clearPlaybackReadyPoll();
    deferUntilAlphaTabStartupSettles(() => {
      canvasRef.current?.alphaTab?.stop();
    });
    alphaTabPlayerStateRef.current = 0;
  }, [clearPlaybackReadyPoll, canvasRef, deferUntilAlphaTabStartupSettles]);

  const prepareForScoreRender = useCallback(() => {
    const currentApi = getApi();
    if (alphaTabPlayerStateRef.current !== 1 && currentApi?.playerState !== 1) return false;
    pendingPlayRef.current = false;
    pendingPlayTickRef.current = null;
    clearPlaybackReadyPoll();
    const stopForRender = () => {
      const api = getApi();
      if (api?.playerState === 1) {
        api.stop();
      }
    };
    deferUntilAlphaTabStartupSettles(stopForRender);
    alphaTabPlayerStateRef.current = 0;
    setIsPlaying(false);
    void stemPlayer.pause();
    params.onPlaybackPaused?.();
    return true;
  }, [
    clearPlaybackReadyPoll,
    deferUntilAlphaTabStartupSettles,
    getApi,
    stemPlayer,
    params,
  ]);

  const loadMidiForCurrentScore = useCallback(() => {
    const api = getApi();
    if (!api || !scoreRef.current) return;
    if (
      alphaTabPlayerStateRef.current === 1 ||
      isAlphaTabStartupGuardActive() ||
      !isPlayerReadyRef.current ||
      !renderFinishedRef.current
    ) {
      midiReloadNeeded.current = true;
      return;
    }
    try {
      api.loadMidiForScore();
      midiReloadNeeded.current = false;
      if (pendingPlayRef.current) {
        pollPlaybackReady();
      }
    } catch {
      midiReloadNeeded.current = true;
    }
  }, [getApi, isAlphaTabStartupGuardActive, pollPlaybackReady, scoreRef]);

  const flushMidiReloadIfNeeded = useCallback(() => {
    if (midiReloadNeeded.current) {
      loadMidiForCurrentScore();
    }
  }, [loadMidiForCurrentScore]);

  // ── seek intent ───────────────────────────────────────────────────────────
  const startSeekTo = useCallback((tick: number, secs: number) => {
    seekStateRef.current = {type: 'seeking', tick, secs};
  }, []);

  // ── Public event handlers ─────────────────────────────────────────────────
  const handlePositionChanged = useCallback((currentTime: number, endTime: number, _currentTick: number, endTick: number) => {
    positionRef.current.currentTimeMs = currentTime;
    if (endTick > 0) tickMappingRef.current = {endTick, endTimeMs: endTime};
  }, []);

  const handlePlayPause = useCallback(() => {
    const api = getApi();
    if (isPlayingRef.current) {
      if (ytSyncSuppressRef) {
        ytSyncSuppressRef.current = true;
        window.setTimeout(() => { ytSyncSuppressRef.current = false; }, 800);
      }
      pauseAlphaTab();
      youtubeSyncRef?.current?.onPause();
      params.onPlaybackPaused?.();
      return;
    }

    if (ytSyncSuppressRef) {
      ytSyncSuppressRef.current = true;
      window.setTimeout(() => { ytSyncSuppressRef.current = false; }, 800);
    }
    requestAlphaTabPlay();
    if (!api?.isReadyForPlayback) {
      loadMidiForCurrentScore();
      pollPlaybackReady();
    }
    youtubeSyncRef?.current?.onResume();
    params.onPlaybackStarted?.();
  }, [
    getApi,
    loadMidiForCurrentScore,
    pauseAlphaTab,
    pollPlaybackReady,
    requestAlphaTabPlay,
    ytSyncSuppressRef,
    youtubeSyncRef,
    params,
  ]);

  const handleYoutubeStateChange = useCallback((state: number) => {
    if (ytSyncSuppressRef?.current) return;
    if (state === 1 && !isPlayingRef.current) {
      if (!requestAlphaTabPlay()) {
        loadMidiForCurrentScore();
        pollPlaybackReady();
      }
    } else if (state === 2 && isPlayingRef.current) {
      pauseAlphaTab();
    }
  }, [
    loadMidiForCurrentScore,
    pauseAlphaTab,
    pollPlaybackReady,
    requestAlphaTabPlay,
    ytSyncSuppressRef,
  ]);

  const handlePlayerStateChanged = useCallback((state: number) => {
    if (state === 0 && Date.now() < suppressTransientStopUntilRef.current) {
      return;
    }
    suppressTransientStopUntilRef.current = 0;
    alphaTabPlayerStateRef.current = state;
    if (state === 0 && seekStateRef.current.type === 'seeking') {
      const {tick, secs} = seekStateRef.current;
      seekStateRef.current = {type: 'idle'};
      const api = getApi();
      setTimeout(() => {
        if (api && !requestAlphaTabPlay(tick)) {
          pollPlaybackReady();
        }
        if (stemPlayer.stemsReady) void stemPlayer.seek(secs);
      }, 0);
      return;
    }
    if (state === 0 && pendingScoreRenderRef.current) {
      window.setTimeout(() => {
        if (pendingScoreRenderRef.current) onRenderNeeded();
      }, 0);
    }
    const playing = state === 1;
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  }, [getApi, pollPlaybackReady, onRenderNeeded, requestAlphaTabPlay, stemPlayer]);

  const handlePlayerReady = useCallback(() => {
    setIsPlayerReady(true);
    isPlayerReadyRef.current = true;
    loadMidiForCurrentScore();
    startPlaybackWhenReady();
  }, [loadMidiForCurrentScore, startPlaybackWhenReady]);

  const handlePlayerFinished = useCallback(() => {
    void stemPlayer.stopAndReset();
    flushMidiReloadIfNeeded();
  }, [stemPlayer, flushMidiReloadIfNeeded]);

  const handleStop = useCallback((setPracticeRange?: (range: {startBar: number; endBar: number} | null) => void) => {
    stopAlphaTab();
    setIsPlaying(false);
    isPlayingRef.current = false;
    youtubeSyncRef?.current?.onPause();
    params.onPlaybackPaused?.();
    void stemPlayer.stopAndReset();
    canvasRef.current?.alphaTab?.clearPlaybackRange();
    setPracticeRange?.(null);
    params.onStop?.();
    flushMidiReloadIfNeeded();
  }, [params, stemPlayer, canvasRef, flushMidiReloadIfNeeded, stopAlphaTab, youtubeSyncRef]);

  const handleBeatClickWithSeek = useCallback((
    beat: InstanceType<typeof model.Beat>,
    handleBeatClick: (beat: InstanceType<typeof model.Beat>) => void,
  ) => {
    handleBeatClick(beat);
    if (!isPlayingRef.current) return;

    const api = getApi();
    const {endTick, endTimeMs} = tickMappingRef.current;
    if (!api || endTick <= 0 || endTimeMs <= 0) return;

    const totalBars = scoreRef.current?.masterBars.length ?? 1;
    const beatTick = computeSeekTick(beat, totalBars, endTick);
    const targetSecs = tickToSeconds(beatTick, endTick, endTimeMs);

    const stopForSeek = () => {
      seekStateRef.current = {type: 'seeking', tick: beatTick, secs: targetSecs};
      api.stop();
    };
    deferUntilAlphaTabStartupSettles(stopForSeek);
  }, [deferUntilAlphaTabStartupSettles, getApi, scoreRef]);

  const handleActiveBeatsChanged = useCallback((
    beats: InstanceType<typeof model.Beat>[],
  ) => {
    if (!isPlayingRef.current) return;
    const beat = beats[0];
    if (!beat) return;
    const api = getApi();
    const beatBounds = api?.boundsLookup?.findBeat(beat);
    if (!beatBounds) return;
    const y = beatBounds.visualBounds.y;
    if (Math.abs(y - lastPlaybackYRef.current) < PLAYBACK_SCROLL_THRESHOLD_PX) return;
    lastPlaybackYRef.current = y;
    const container = canvasScrollRef.current;
    if (!container) return;
    container.scrollTo({top: Math.max(0, y - container.clientHeight / 3), behavior: 'smooth'});
  }, [getApi, canvasScrollRef]);

  const handleRenderFinished = useCallback((
    initScore?: () => void,
    updateCursorBounds?: () => void,
  ) => {
    if (!scoreRef.current) {
      initScore?.();
    }
    renderFinishedRef.current = true;
    updateCursorBounds?.();
    flushMidiReloadIfNeeded();
    startPlaybackWhenReady();
    params.onRenderFinished?.();
  }, [scoreRef, flushMidiReloadIfNeeded, startPlaybackWhenReady, params]);

  // ── Unmount cleanup ───────────────────────────────────────────────────────
  const unmount = useCallback(() => {
    clearPlaybackReadyPoll();
    clearScoreRenderTimer();
    if (playStartupTimerRef.current !== null) {
      window.clearTimeout(playStartupTimerRef.current);
      playStartupTimerRef.current = null;
    }
  }, [clearPlaybackReadyPoll, clearScoreRenderTimer]);

  return {
    // State
    isPlaying,
    isPlayerReady,
    isReady, setIsReady,
    isPlayingRef,
    isPlayerReadyRef,
    renderFinishedRef,
    midiReloadNeeded,
    seekStateRef,
    pendingScoreRenderRef,
    alphaTabPlayerStateRef,
    clearPlaybackReadyPoll,
    clearScoreRenderTimer,
    isAlphaTabStartupGuardActive,
    getAlphaTabStartupGuardDelay,
    playStartupTimerRef,
    scoreRenderTimerRef,
    // Exposed refs needed by external consumers
    tickMappingRef,
    positionRef,
    // Engine primitives (public API)
    prepareForScoreRender,
    markRenderPending,
    loadMidiForCurrentScore,
    flushMidiReloadIfNeeded,
    pollPlaybackReady,
    requestAlphaTabPlay,
    pauseAlphaTab,
    stopAlphaTab,
    deferUntilAlphaTabStartupSettles,
    startSeekTo,
    markPlaying,
    // Public callbacks / event handlers
    handlePlayPause,
    handleStop,
    handlePlayerStateChanged,
    handlePlayerReady,
    handlePlayerFinished,
    handlePositionChanged,
    handleBeatClickWithSeek,
    handleActiveBeatsChanged,
    handleYoutubeStateChange,
    handleRenderFinished,
    // Lifecycle
    unmount,
  };
}
