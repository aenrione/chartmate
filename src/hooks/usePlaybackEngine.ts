import {useState, useCallback, useRef} from 'react';
import type React from 'react';
import {AlphaTabApi, model} from '@coderline/alphatab';
import {computeSeekTick} from '@/lib/tab-editor/seekUtils';
import type {useStemPlayer} from '@/hooks/useStemPlayer';

type Score = InstanceType<typeof model.Score>;

// Rendering during AlphaTab's initial player startup can invalidate its buffers.
// This guard applies to score mutations, never to a user's Pause or Stop command.
const ALPHATAB_PLAY_STARTUP_GUARD_MS = 650;
const ALPHATAB_MUTATION_SETTLE_MS = 25;
const PLAYBACK_SCROLL_THRESHOLD_PX = 20;

type PlaybackIntent = {type: 'idle'} | {type: 'seeking'; tick: number; secs: number};

export interface UsePlaybackEngineParams {
  apiRef: React.MutableRefObject<AlphaTabApi | null>;
  scoreRef: React.RefObject<Score | null>;
  stemPlayer: ReturnType<typeof useStemPlayer>;
  canvasScrollRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<{alphaTab: {stop: () => void; clearPlaybackRange: () => void} | null} | null>;
  ytSyncSuppressRef?: React.MutableRefObject<boolean>;
  youtubeSyncRef?: React.RefObject<{onPause: () => void; onResume: () => void} | null>;
  onRenderNeeded: () => void;
  getApi: () => AlphaTabApi | null;
  onPlaybackStarted?: () => void;
  onPlaybackPaused?: () => void;
  /** The player has acknowledged a seek, including the score's tempo/repeat map. */
  onPlaybackSeek?: (seconds: number) => void;
  onStop?: () => void;
  onRenderFinished?: () => void;
}

export function usePlaybackEngine(params: UsePlaybackEngineParams) {
  const {scoreRef, canvasScrollRef, canvasRef, getApi} = params;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const midiReloadNeeded = useRef(false);
  const midiLoadingRef = useRef(false);
  const seekStateRef = useRef<PlaybackIntent>({type: 'idle'});
  const lastPlaybackYRef = useRef(0);
  const desiredPlayingRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const pendingPlayTickRef = useRef<number | null>(null);
  const playbackReadyPollRef = useRef<number | null>(null);
  const pendingScoreRenderRef = useRef(false);
  const scoreRenderTimerRef = useRef<number | null>(null);
  const playStartupGuardUntilRef = useRef(0);
  const playStartupTimerRef = useRef<number | null>(null);
  const alphaTabPlayerStateRef = useRef(0);
  const isPlayingRef = useRef(false);
  const isPlayerReadyRef = useRef(false);
  const renderFinishedRef = useRef(false);
  const positionRef = useRef({currentTimeMs: 0});
  const tickMappingRef = useRef({endTick: 1, endTimeMs: 0});
  const deferredTimersRef = useRef(new Set<number>());

  const isAlphaTabStartupGuardActive = useCallback(() => Date.now() < playStartupGuardUntilRef.current, []);
  const getAlphaTabStartupGuardDelay = useCallback(() => (
    Math.max(0, playStartupGuardUntilRef.current - Date.now() + ALPHATAB_MUTATION_SETTLE_MS)
  ), []);

  const armAlphaTabStartupGuard = useCallback(() => {
    playStartupGuardUntilRef.current = Date.now() + ALPHATAB_PLAY_STARTUP_GUARD_MS;
    if (playStartupTimerRef.current !== null) window.clearTimeout(playStartupTimerRef.current);
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
    const timer = window.setTimeout(() => {
      deferredTimersRef.current.delete(timer);
      fn();
    }, getAlphaTabStartupGuardDelay());
    deferredTimersRef.current.add(timer);
  }, [getAlphaTabStartupGuardDelay, isAlphaTabStartupGuardActive]);

  const clearPlaybackReadyPoll = useCallback(() => {
    if (playbackReadyPollRef.current !== null) window.clearInterval(playbackReadyPollRef.current);
    playbackReadyPollRef.current = null;
  }, []);
  const clearScoreRenderTimer = useCallback(() => {
    if (scoreRenderTimerRef.current !== null) window.clearTimeout(scoreRenderTimerRef.current);
    scoreRenderTimerRef.current = null;
  }, []);
  const markRenderPending = useCallback(() => { renderFinishedRef.current = false; }, []);

  const publishPlaying = useCallback((playing: boolean) => {
    const changed = isPlayingRef.current !== playing;
    alphaTabPlayerStateRef.current = playing ? 1 : 0;
    isPlayingRef.current = playing;
    setIsPlaying(playing);
    if (changed) {
      if (playing) paramsRef.current.onPlaybackStarted?.();
      else paramsRef.current.onPlaybackPaused?.();
    }
  }, []);

  // Keep this public helper safe for callers: readiness is not proof of playback.
  const markPlaying = useCallback(() => {
    if (getApi()?.playerState === 1) publishPlaying(true);
  }, [getApi, publishPlaying]);

  const seekToTick = useCallback((tick: number) => {
    const api = getApi();
    if (!api) return;
    if (pendingScoreRenderRef.current || midiLoadingRef.current || pendingPlayRef.current || !api.isReadyForPlayback) {
      // A MIDI reload resets the old player's position. Apply this selection
      // only after the replacement MIDI is ready, even across Pause/Resume.
      pendingPlayTickRef.current = tick;
      return;
    }
    // A newer ready-player selection supersedes the position retained by Pause.
    pendingPlayTickRef.current = null;
    seekStateRef.current = {type: 'seeking', tick, secs: 0};
    // AlphaTab supports seeking a running player. Stopping first resets its cursor
    // and introduces a race between the new seek and a delayed startup callback.
    api.tickPosition = tick;
  }, [getApi]);

  const playAlphaTab = useCallback(() => {
    const api = getApi();
    if (!desiredPlayingRef.current || pendingScoreRenderRef.current || midiLoadingRef.current || !api?.isReadyForPlayback || !renderFinishedRef.current) return false;
    const tick = pendingPlayTickRef.current;
    pendingPlayTickRef.current = null;
    pendingPlayRef.current = false;
    clearPlaybackReadyPoll();
    if (tick !== null) seekToTick(tick);
    if (api.playerState === 1) {
      publishPlaying(true);
      return true;
    }
    armAlphaTabStartupGuard();
    // Invoke directly from the user gesture when ready. Do not retry with
    // playPause(): a delayed toggle can undo Play or revive a cancelled request.
    const accepted = api.play();
    if (accepted === false) {
      desiredPlayingRef.current = false;
      publishPlaying(false);
      return false;
    }
    markPlaying();
    return true;
  }, [armAlphaTabStartupGuard, clearPlaybackReadyPoll, getApi, markPlaying, publishPlaying, seekToTick]);

  const startPlaybackWhenReady = useCallback(() => {
    if (pendingPlayRef.current) playAlphaTab();
  }, [playAlphaTab]);
  const pollPlaybackReady = useCallback(() => {
    if (playbackReadyPollRef.current === null) {
      playbackReadyPollRef.current = window.setInterval(startPlaybackWhenReady, 50);
    }
  }, [startPlaybackWhenReady]);
  const requestAlphaTabPlay = useCallback((tick?: number) => {
    desiredPlayingRef.current = true;
    pendingPlayRef.current = true;
    if (typeof tick === 'number') pendingPlayTickRef.current = tick;
    if (pendingScoreRenderRef.current || midiLoadingRef.current || !getApi()?.isReadyForPlayback || !renderFinishedRef.current) {
      pollPlaybackReady();
      return false;
    }
    return playAlphaTab();
  }, [getApi, playAlphaTab, pollPlaybackReady]);

  const cancelPendingPlay = useCallback(() => {
    desiredPlayingRef.current = false;
    pendingPlayRef.current = false;
    pendingPlayTickRef.current = null;
    seekStateRef.current = {type: 'idle'};
    clearPlaybackReadyPoll();
  }, [clearPlaybackReadyPoll]);

  const pauseAlphaTab = useCallback(() => {
    const resumeTick = pendingPlayTickRef.current ?? getApi()?.tickPosition ?? null;
    cancelPendingPlay();
    pendingPlayTickRef.current = resumeTick;
    // Publish before the API command so a synchronous pause event cannot
    // notify external media twice. The pause command itself is idempotent.
    const wasPlaying = isPlayingRef.current;
    publishPlaying(false);
    getApi()?.pause();
    // Silence external media even when AlphaTab never reached Playing.
    void paramsRef.current.stemPlayer.pause();
    paramsRef.current.youtubeSyncRef?.current?.onPause();
    if (!wasPlaying) paramsRef.current.onPlaybackPaused?.();
  }, [cancelPendingPlay, getApi, publishPlaying]);

  const stopAlphaTab = useCallback(() => {
    cancelPendingPlay();
    getApi()?.stop();
    publishPlaying(false);
  }, [cancelPendingPlay, getApi, publishPlaying]);

  const prepareForScoreRender = useCallback(() => {
    const api = getApi();
    const wasActive = desiredPlayingRef.current || isPlayingRef.current || api?.playerState === 1;
    if (!wasActive) return false;
    pauseAlphaTab();
    return true;
  }, [getApi, pauseAlphaTab]);

  const loadMidiForCurrentScore = useCallback(() => {
    const api = getApi();
    if (!api || !scoreRef.current) return;
    if (pendingScoreRenderRef.current || midiLoadingRef.current || api.playerState === 1 || isAlphaTabStartupGuardActive() || !isPlayerReadyRef.current || !renderFinishedRef.current) {
      midiReloadNeeded.current = true;
      return;
    }
    try {
      // Reset before loading: readyForPlayback may be raised synchronously.
      midiReloadNeeded.current = false;
      // Worker-backed players may still report the OLD MIDI as ready until
      // the load command is processed. Wait for its readiness acknowledgement.
      midiLoadingRef.current = true;
      api.loadMidiForScore();
    } catch {
      midiLoadingRef.current = false;
      midiReloadNeeded.current = true;
    }
  }, [getApi, isAlphaTabStartupGuardActive, scoreRef]);
  const flushMidiReloadIfNeeded = useCallback(() => {
    if (midiReloadNeeded.current) loadMidiForCurrentScore();
  }, [loadMidiForCurrentScore]);

  const startSeekTo = useCallback((tick: number, _secs: number) => { seekToTick(tick); }, [seekToTick]);

  const handlePositionChanged = useCallback((currentTime: number, endTime: number, currentTick: number, endTick: number) => {
    positionRef.current.currentTimeMs = currentTime;
    if (endTick > 0) tickMappingRef.current = {endTick, endTimeMs: endTime};
    const intent = seekStateRef.current;
    if (intent.type === 'seeking' && Math.abs(currentTick - intent.tick) < 1) {
      seekStateRef.current = {type: 'idle'};
      const seconds = currentTime / 1000;
      // Use the player's acknowledged time, not a whole-song proportional
      // estimate, which is wrong for tempo changes and repeated measures.
      const current = paramsRef.current;
      if (isPlayingRef.current && current.stemPlayer.stemsReady) void current.stemPlayer.seek(seconds);
      current.onPlaybackSeek?.(seconds);
    }
  }, []);

  const handlePlayPause = useCallback(() => {
    if (desiredPlayingRef.current || isPlayingRef.current || getApi()?.playerState === 1) {
      pauseAlphaTab();
      return;
    }
    requestAlphaTabPlay();
    if (!getApi()?.isReadyForPlayback) loadMidiForCurrentScore();
  }, [getApi, loadMidiForCurrentScore, pauseAlphaTab, requestAlphaTabPlay]);

  const handleYoutubeStateChange = useCallback((state: number) => {
    if (paramsRef.current.ytSyncSuppressRef?.current) return;
    if (state === 1 && !desiredPlayingRef.current) {
      requestAlphaTabPlay();
      if (!getApi()?.isReadyForPlayback) loadMidiForCurrentScore();
    } else if ((state === 2 || state === 0) && (desiredPlayingRef.current || isPlayingRef.current)) {
      pauseAlphaTab();
    }
  }, [getApi, loadMidiForCurrentScore, pauseAlphaTab, requestAlphaTabPlay]);

  const handlePlayerStateChanged = useCallback((state: number) => {
    if (state === 1 && (!desiredPlayingRef.current || pendingScoreRenderRef.current || midiLoadingRef.current)) {
      // A late acknowledgement must not resurrect playback after Pause/Stop
      // or start external audio while a newer score render is queued.
      getApi()?.pause();
      publishPlaying(false);
      return;
    }
    publishPlaying(state === 1);
    if (state === 0) {
      // A stopped event from the outgoing MIDI/render must not cancel a
      // newer Play request waiting for its replacement to become ready.
      if (!pendingPlayRef.current) desiredPlayingRef.current = false;
      if (pendingScoreRenderRef.current) paramsRef.current.onRenderNeeded();
    }
  }, [getApi, publishPlaying]);

  const handlePlayerReady = useCallback(() => {
    midiLoadingRef.current = false;
    setIsPlayerReady(true);
    isPlayerReadyRef.current = true;
    flushMidiReloadIfNeeded();
    startPlaybackWhenReady();
  }, [flushMidiReloadIfNeeded, startPlaybackWhenReady]);

  const handlePlayerFinished = useCallback(() => {
    cancelPendingPlay();
    publishPlaying(false);
    void paramsRef.current.stemPlayer.stopAndReset();
    paramsRef.current.youtubeSyncRef?.current?.onPause();
    flushMidiReloadIfNeeded();
  }, [cancelPendingPlay, flushMidiReloadIfNeeded, publishPlaying]);

  const handleStop = useCallback((setPracticeRange?: (range: {startBar: number; endBar: number} | null) => void) => {
    const wasPlaying = isPlayingRef.current;
    stopAlphaTab();
    paramsRef.current.youtubeSyncRef?.current?.onPause();
    if (!wasPlaying) paramsRef.current.onPlaybackPaused?.();
    void paramsRef.current.stemPlayer.stopAndReset();
    positionRef.current.currentTimeMs = 0;
    canvasRef.current?.alphaTab?.clearPlaybackRange();
    setPracticeRange?.(null);
    paramsRef.current.onStop?.();
    flushMidiReloadIfNeeded();
  }, [canvasRef, flushMidiReloadIfNeeded, stopAlphaTab]);

  const handleBeatClickWithSeek = useCallback((beat: InstanceType<typeof model.Beat>, handleBeatClick: (beat: InstanceType<typeof model.Beat>) => void) => {
    handleBeatClick(beat);
    const api = getApi();
    if (!api) return;
    const tick = api.tickCache?.getBeatStart(beat)
      ?? computeSeekTick(beat, scoreRef.current?.masterBars.length ?? 1, tickMappingRef.current.endTick);
    seekToTick(tick);
  }, [getApi, scoreRef, seekToTick]);

  const handleActiveBeatsChanged = useCallback((beats: InstanceType<typeof model.Beat>[]) => {
    if (!isPlayingRef.current || !beats[0]) return;
    const bounds = getApi()?.boundsLookup?.findBeat(beats[0]);
    if (!bounds || Math.abs(bounds.visualBounds.y - lastPlaybackYRef.current) < PLAYBACK_SCROLL_THRESHOLD_PX) return;
    const y = bounds.visualBounds.y;
    lastPlaybackYRef.current = y;
    const container = canvasScrollRef.current;
    container?.scrollTo({top: Math.max(0, y - container.clientHeight / 3), behavior: 'smooth'});
  }, [getApi, canvasScrollRef]);

  const handleRenderFinished = useCallback((initScore?: () => void, updateCursorBounds?: () => void) => {
    if (!scoreRef.current) initScore?.();
    renderFinishedRef.current = true;
    updateCursorBounds?.();
    flushMidiReloadIfNeeded();
    startPlaybackWhenReady();
    paramsRef.current.onRenderFinished?.();
  }, [scoreRef, flushMidiReloadIfNeeded, startPlaybackWhenReady]);

  const unmount = useCallback(() => {
    cancelPendingPlay();
    clearScoreRenderTimer();
    if (playStartupTimerRef.current !== null) window.clearTimeout(playStartupTimerRef.current);
    playStartupTimerRef.current = null;
    playStartupGuardUntilRef.current = 0;
    for (const timer of deferredTimersRef.current) window.clearTimeout(timer);
    deferredTimersRef.current.clear();
    getApi()?.pause();
    void paramsRef.current.stemPlayer.pause();
    paramsRef.current.youtubeSyncRef?.current?.onPause();
  }, [cancelPendingPlay, clearScoreRenderTimer, getApi]);

  return {
    isPlaying, isPlayerReady, isReady, setIsReady,
    isPlayingRef, isPlayerReadyRef, renderFinishedRef, midiReloadNeeded, midiLoadingRef, seekStateRef,
    pendingScoreRenderRef, alphaTabPlayerStateRef, clearPlaybackReadyPoll, clearScoreRenderTimer,
    isAlphaTabStartupGuardActive, getAlphaTabStartupGuardDelay, playStartupTimerRef, scoreRenderTimerRef,
    tickMappingRef, positionRef, prepareForScoreRender, markRenderPending,
    loadMidiForCurrentScore, flushMidiReloadIfNeeded, pollPlaybackReady, requestAlphaTabPlay,
    pauseAlphaTab, stopAlphaTab, deferUntilAlphaTabStartupSettles, startSeekTo, markPlaying,
    handlePlayPause, handleStop, handlePlayerStateChanged, handlePlayerReady, handlePlayerFinished,
    handlePositionChanged, handleBeatClickWithSeek, handleActiveBeatsChanged,
    handleYoutubeStateChange, handleRenderFinished, unmount,
  };
}
