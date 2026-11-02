import {useRef, useEffect, useState, useCallback, useMemo} from 'react';
import {useParams, useNavigate, useLocation} from 'react-router-dom';
import {AlphaTabApi, model, importer, Settings, StaveProfile} from '@coderline/alphatab';
import SaveCompositionDialog from './SaveCompositionDialog';
import {useUnsavedChanges} from './useUnsavedChanges';
import {recordEventSafely} from '@/lib/progression';
import TabEditorCanvas, {type TabEditorCanvasHandle, type PatternOverlay} from './TabEditorCanvas';
import NoteInputPanel from './NoteInputPanel';
import TabEditorSidebar from './TabEditorSidebar';
import FretboardGrid from './FretboardGrid';
import DrumPadGrid from './DrumPadGrid';
import EditorHelpDialog from './EditorHelpDialog';
import ChordFinderDialog from './ChordFinderDialog';
import {UnsavedChangesDialog} from './UnsavedChangesDialog';
import {useEditorCursor} from '@/lib/tab-editor/useEditorCursor';
import {useEditorKeyboard} from '@/lib/tab-editor/useEditorKeyboard';
import {createBlankScore, type InstrumentType} from '@/lib/tab-editor/newScore';
import {getDefaultTuningPreset, getTuningsForInstrument} from '@/lib/tab-editor/tunings';
import {
  setNoteAndAdvance,
  setChord,
  toggleDrumNote,
  insertRest,
  setBeatDuration,
  toggleDot,
  toggleEffect,
  cycleBeatAccent,
  toggleSlide,
  toggleBend,
  insertMeasureAfter,
  deleteMeasure,
  clearBar,
  addTrack,
  removeTrack,
  setTrackTuning,
  setTempo,
  getScoreTempo,
  getScoreKey,
  setScoreKey,
  setBeatChord,
  clearBeatChord,
  getBeatChordName,
  type NoteEffect,
  type TabSection,
} from '@/lib/tab-editor/scoreOperations';
import {
  applyRightHandFingering,
  clearRightHandFingering,
  clearNoteFingering,
  getNoteFingering,
  setLeftHandFinger,
  setRightHandFinger,
  type LeftHandFinger,
  type RightHandFinger,
} from '@/lib/tab-editor/fingering';
import {applyFingeringSettings} from '@/pages/guitar/AlphaTabWrapper';
import {useLocalStorage} from '@/lib/useLocalStorage';
import {
  DEFAULT_PLAYBACK_SPEED,
  EDITOR_MODE_KEY,
  MAX_PLAYBACK_SPEED,
  MIN_PLAYBACK_SPEED,
  PLAYBACK_SPEED_STEP,
  SIDEBAR_COLLAPSED_KEY,
  adjustPlaybackSpeed,
  clampPlaybackSpeed,
  computeLoopRange,
  formatLoopRange,
  loopRangeToTicks,
  normalizeLoopRange,
  otherMode,
  parseEditorMode,
  playbackSpeedFactor,
  type BarRange,
  type EditorMode,
} from '@/lib/tab-editor/practiceSettings';
import {visibleToolbarActions} from '@/lib/tab-editor/toolbarLayout';
import StrummingPatternPanel, {SHOW_STRUMMING_KEY} from '@/components/StrummingPatternPanel';
import {voicingToNotes, type ChordVoicing} from '@/lib/tab-editor/chordDb';
import {DRUM_LANE_COUNT, getDrumLane} from '@/lib/tab-editor/drumMap';
import {detectPatterns} from '@/lib/tab-editor/patternDetector';
import {extractAsciiTabMeta} from '@/lib/tab-editor/asciiTabImporter';
import {
  Music,
  Play,
  Pause,
  Square,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Save,
  Download,
  Upload,
  HelpCircle,
  Piano,
  Eye,
  BookOpen,
  Youtube,
  Unlink,
  Maximize2,
  Minimize2,
  Search,
  Plus,
  Printer,
  Menu,
  MoreVertical,
  Undo2,
  Redo2,
  Hand,
  X,
  Minus,
  Gauge,
  Repeat,
  Pencil,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {useHideHeaderOnMobile, useHideBottomNavOnMobile} from '@/contexts/LayoutContext';
import {saveScorePdfToLibrary} from '@/lib/pdf/save-score-pdf';
import {useYoutubeSync} from '@/hooks/useYoutubeSync';
import type {PlaybackClock} from '@/lib/youtube-sync';
import YouTubePlayer from '@/components/YouTubePlayer';
import {exportToGp7} from '@/lib/tab-editor/exporters';
import {barIndexToTick} from '@/lib/tab-editor/seekUtils';
import {getKeyInfo} from '@/lib/tab-editor/keyData';
import KeyChartDialog from './KeyChartDialog';
import {UndoManager} from '@/lib/tab-editor/undoManager';
import {loadComposition} from '@/lib/local-db/tab-compositions';
import {cn} from '@/lib/utils';
import {toast} from 'sonner';
import {useStemPlayer} from '@/hooks/useStemPlayer';
import {usePlaybackEngine} from '@/hooks/usePlaybackEngine';
import {useScoreIO} from '@/hooks/useScoreIO';
import {useSectionPatterns} from '@/hooks/useSectionPatterns';

type Score = InstanceType<typeof model.Score>;
const {Duration} = model;

// ── Named constants ────────────────────────────────────────────────────────────
const SCORE_INIT_DELAY_MS = 200;
const DEFAULT_TEMPO_BPM = 120;
const MAX_FRET = 24;
const QUARTER_NOTE_BEATS_PER_WHOLE = 4;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ── Typed interfaces ──────────────────────────────────────────────────────────
type LocationState = { from?: string; activeTab?: string };
type AudioSource = 'tracks' | 'stems' | 'youtube';

// Per-id caches — survive route changes without unmounting persistence
type EditorUIState = {
  staveMode: 'both' | 'tab' | 'notation';
  showFretboard: boolean;
  mutedTracks: Set<number>;
};
const _editorScoreCache = new Map<string, Uint8Array>();
const _editorUICache = new Map<string, EditorUIState>();

export default function TabEditorPage() {
  useHideHeaderOnMobile();
  useHideBottomNavOnMobile();

  const {id} = useParams<{id: string}>();
  const navigate = useNavigate();
  const location = useLocation();
  const canvasRef = useRef<TabEditorCanvasHandle>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const scoreRef = useRef<Score | null>(null);
  const handleDrumAdvanceRef = useRef<(() => void) | null>(null);
  const handleDrumHitRef = useRef<((midi: number) => void) | null>(null);
  const undoManagerRef = useRef(new UndoManager());
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const [currentDuration, setCurrentDuration] = useState(Duration.Quarter);
  const [scoreMutationVersion, setScoreMutationVersion] = useState(0);
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showChordFinder, setShowChordFinder] = useState(false);
  const [showFretboard, setShowFretboard] = useState(
    () => _editorUICache.get(id ?? 'new')?.showFretboard ?? false,
  );
  const [staveMode, setStaveMode] = useState<'both' | 'tab' | 'notation'>(
    () => _editorUICache.get(id ?? 'new')?.staveMode ?? 'tab',
  );
  const [mutedTracks, setMutedTracks] = useState<Set<number>>(
    () => new Set(_editorUICache.get(id ?? 'new')?.mutedTracks ?? []),
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Fingering display is a practice preference, so it outlives the session.
  const [showFingering, setShowFingering] = useLocalStorage('chartmate.showFingering.v1', false);
  const [showStrumming, setShowStrumming] = useLocalStorage(SHOW_STRUMMING_KEY, true);
  const showStrummingRef = useRef(showStrumming);
  showStrummingRef.current = showStrumming;
  const showFingeringRef = useRef(showFingering);
  showFingeringRef.current = showFingering;
  const [showKeyChart, setShowKeyChart] = useState(false);
  const [showYoutubePanel, setShowYoutubePanel] = useState(false);
  const [youtubeFullscreen, setYoutubeFullscreen] = useState(false);
  const [audioSource, setAudioSource] = useState<AudioSource>('tracks');
  const audioSourceRef = useRef(audioSource);
  audioSourceRef.current = audioSource;
  const sourceSwitchVersionRef = useRef(0);
  const ytSyncSuppressRef = useRef(false);
  const youtubeSuppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [showNewTabConfirm, setShowNewTabConfirm] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const {isDirty, markDirty, markClean, blocker} = useUnsavedChanges();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedBarRange, setSelectedBarRange] = useState<{start: number; end: number} | null>(null);

  // ── View / Edit mode ───────────────────────────────────────────────────────
  // Practising is the common case, so the remembered default is View. A brand
  // new, unsaved tab always opens in Edit: there is nothing to practise yet and
  // a read-only blank editor would just look broken.
  const [storedMode, setStoredMode] = useLocalStorage<EditorMode>(EDITOR_MODE_KEY, 'view');
  const [editorMode, setEditorModeState] = useState<EditorMode>(
    () => (id ? parseEditorMode(storedMode) : 'edit'),
  );
  const isEditMode = editorMode === 'edit';
  const isEditModeRef = useRef(isEditMode);
  isEditModeRef.current = isEditMode;

  const setEditorMode = useCallback((next: EditorMode) => {
    setEditorModeState(next);
    setStoredMode(next);
  }, [setStoredMode]);

  const handleToggleMode = useCallback(() => {
    const next = otherMode(isEditModeRef.current ? 'edit' : 'view');
    setEditorMode(next);
    toast(next === 'edit' ? 'Edit mode' : 'View mode — the score is locked', {
      id: 'tab-editor-mode',
    });
  }, [setEditorMode]);

  /**
   * The gate every mutating handler calls first. View mode must leave the score
   * byte-identical, so "hidden in the UI" is not enough — the handlers refuse.
   */
  const requireEditMode = useCallback((): boolean => {
    if (isEditModeRef.current) return true;
    toast('View mode — press Alt+E to edit', {id: 'tab-editor-view-mode'});
    return false;
  }, []);

  // ── Sidebar collapse (desktop) ─────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage(SIDEBAR_COLLAPSED_KEY, false);
  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed(v => !v);
  }, [setSidebarCollapsed]);

  // AlphaTab lays out to its container's width and relays out on resize, so the
  // collapse has to announce itself — once now, once after the CSS transition.
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
    const timer = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
    return () => window.clearTimeout(timer);
  }, [sidebarCollapsed]);

  // ── Practice playback speed ────────────────────────────────────────────────
  // Deliberately *not* persisted: it resets to 100 % for every composition. A
  // sticky 60 % silently applied to the next song is the same class of surprise
  // as editing the BPM to practise, which is the bug this control exists to fix.
  const [playbackSpeed, setPlaybackSpeedState] = useState(DEFAULT_PLAYBACK_SPEED);
  useEffect(() => { setPlaybackSpeedState(DEFAULT_PLAYBACK_SPEED); }, [id]);
  const proceedAfterSaveRef = useRef<(() => void) | null>(null);
  const [isResolvingBlockedNavigation, setIsResolvingBlockedNavigation] = useState(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // Sync UI prefs to cache on every change
  useEffect(() => {
    _editorUICache.set(id ?? 'new', {staveMode, showFretboard, mutedTracks});
  }, [id, staveMode, showFretboard, mutedTracks]);

  // On unmount: serialize dirty score to bytes so it survives navigation
  useEffect(() => {
    const cacheKey = id ?? 'new';
    return () => {
      if (isDirtyRef.current && scoreRef.current) {
        try {
          _editorScoreCache.set(cacheKey, exportToGp7(scoreRef.current));
        } catch { /* ignore serialization errors */ }
      } else {
        _editorScoreCache.delete(cacheKey);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // PlaybackClock adapter — isPlayingLocalRef mirrors the isPlaying state for the clock getter
  const isPlayingLocalRef = useRef(false);
  // positionLocalRef is a stable holder updated after playbackEngine is initialized
  const positionLocalRef = useRef({currentTimeMs: 0});
  const clockRef = useRef<PlaybackClock>({
    get currentTime() { return positionLocalRef.current.currentTimeMs / 1000; },
    get isPlaying() { return isPlayingLocalRef.current; },
  });

  const songKey = id ? `tab-editor:${id}` : 'tab-editor:new';
  const stemPlayer = useStemPlayer(songKey);

  // YouTube integration
  const {
    youtubeUrl,
    youtubeVideoId,
    youtubeOffsetMs,
    youtubeUrlInput,
    setYoutubeUrlInput,
    playerRef: youtubePlayerRef,
    syncRef: youtubeSyncRef,
    handleUrlSubmit: handleYoutubeUrlSubmit,
    handleRemove: handleYoutubeRemove,
    handleOffsetChange: handleYoutubeOffsetChange,
    handleReady: handleYoutubeReady,
    migrateKey: migrateYoutubeKey,
    seedFromDb: seedYoutubeFromDb,
  } = useYoutubeSync({songKey, clockRef, tempo: 1.0, enabled: audioSource === 'youtube'});

  const getApi = useCallback((): AlphaTabApi | null => {
    return canvasRef.current?.alphaTab?.getApi() ?? apiRef.current;
  }, []);

  // ── YouTube suppress helper ────────────────────────────────────────────────
  const suppressYoutubeSync = useCallback((durationMs = 800) => {
    if (youtubeSuppressTimerRef.current !== null) clearTimeout(youtubeSuppressTimerRef.current);
    ytSyncSuppressRef.current = true;
    youtubeSuppressTimerRef.current = setTimeout(() => {
      ytSyncSuppressRef.current = false;
      youtubeSuppressTimerRef.current = null;
    }, durationMs);
  }, [ytSyncSuppressRef]);

  useEffect(() => () => {
    ++sourceSwitchVersionRef.current;
    if (youtubeSuppressTimerRef.current !== null) clearTimeout(youtubeSuppressTimerRef.current);
  }, []);

  // ── Playback Engine ────────────────────────────────────────────────────────
  // commitMutation is defined below but usePlaybackEngine needs onRenderNeeded.
  // We use stable refs to break forward-reference cycles.
  const commitMutationRef = useRef<() => void>(() => { /* stub, replaced below */ });
  // Forward refs for functions defined after playbackEngine
  const setPracticeRangeRef = useRef<((r: {startBar: number; endBar: number} | null) => void)>(() => { /* stub */ });
  // Stop and re-render both clear AlphaTab's playback range; this puts the
  // user's loop back afterwards.
  const reapplyLoopRef = useRef<() => void>(() => { /* stub */ });
  const initScoreRef = useRef<() => Promise<void>>(async () => { /* stub */ });
  const updateCursorBoundsRef = useRef<() => void>(() => { /* stub */ });
  const computeSectionLabelsRef = useRef<() => void>(() => { /* stub */ });
  const computePatternOverlaysRef = useRef<() => void>(() => { /* stub */ });

  const playbackEngine = usePlaybackEngine({
    apiRef,
    scoreRef,
    stemPlayer: {...stemPlayer, stemsReady: audioSource === 'stems' && stemPlayer.stemsReady},
    canvasScrollRef,
    canvasRef: canvasRef as React.MutableRefObject<{alphaTab: {stop: () => void; clearPlaybackRange: () => void} | null} | null>,
    onRenderNeeded: () => { commitMutationRef.current(); },
    getApi,
    ytSyncSuppressRef,
    onPlaybackPaused: () => {
      suppressYoutubeSync();
      youtubeSyncRef.current?.onPause();
    },
    onPlaybackSeek: seconds => {
      if (audioSource === 'youtube') youtubeSyncRef.current?.onSeekTo(seconds);
    },
    onStop: () => {
      setPracticeRangeRef.current(null);
      // Stop cleared the playback range; the loop itself is still set.
      reapplyLoopRef.current();
    },
    onRenderFinished: () => {
      void initScoreRef.current();
      updateCursorBoundsRef.current();
      computeSectionLabelsRef.current();
      computePatternOverlaysRef.current();
      reapplyLoopRef.current();
    },
  });

  const {
    isPlaying,
    isPlayerReady,
    isReady, setIsReady,
    isPlayingRef,
    isPlayerReadyRef,
    renderFinishedRef,
    midiReloadNeeded,
    tickMappingRef,
    positionRef,
    pendingScoreRenderRef,
    alphaTabPlayerStateRef,
    prepareForScoreRender,
    markRenderPending,
    clearPlaybackReadyPoll,
    clearScoreRenderTimer,
    isAlphaTabStartupGuardActive,
    getAlphaTabStartupGuardDelay,
    deferUntilAlphaTabStartupSettles,
    loadMidiForCurrentScore,
    flushMidiReloadIfNeeded,
    pollPlaybackReady,
    requestAlphaTabPlay,
    playStartupTimerRef,
    scoreRenderTimerRef,
    handlePlayPause: _engineHandlePlayPause,
    handleStop: _engineHandleStop,
    handlePlayerStateChanged: _engineHandlePlayerStateChanged,
    handlePlayerReady,
    handlePlayerFinished,
    handlePositionChanged,
    handleBeatClickWithSeek: _engineHandleBeatClickWithSeek,
    handleActiveBeatsChanged,
    handleYoutubeStateChange: engineHandleYoutubeStateChange,
    handleRenderFinished,
    startSeekTo,
    unmount,
  } = playbackEngine;

  // Mirror isPlaying state into the local ref so clockRef getter stays current
  isPlayingLocalRef.current = isPlaying;
  // Mirror positionRef into positionLocalRef so clockRef has a stable target
  positionLocalRef.current = positionRef.current;

  // ── Stop (no-arg wrapper so button onClick does not receive a MouseEvent) ──
  const handleStop = useCallback(() => { _engineHandleStop(); }, [_engineHandleStop]);

  // ── Practice speed → AlphaTab ──────────────────────────────────────────────
  // `api.playbackSpeed` time-stretches the synth, which only the Tracks source
  // goes through. Stems and the YouTube player keep their own clocks, so the
  // control is inert (and shown disabled) for them rather than silently
  // desynchronising the score from the audio.
  const speedAppliesToAudio = audioSource === 'tracks';
  const effectivePlaybackSpeed = speedAppliesToAudio ? playbackSpeed : DEFAULT_PLAYBACK_SPEED;

  useEffect(() => {
    canvasRef.current?.alphaTab?.setPlaybackSpeed(playbackSpeedFactor(effectivePlaybackSpeed));
  }, [effectivePlaybackSpeed, isPlayerReady, isReady]);

  const handleSpeedChange = useCallback((percent: number) => {
    setPlaybackSpeedState(clampPlaybackSpeed(percent));
  }, []);

  const handleAdjustSpeed = useCallback((deltaPercent: number) => {
    setPlaybackSpeedState(prev => adjustPlaybackSpeed(prev, deltaPercent));
  }, []);

  const handleResetSpeed = useCallback(() => {
    setPlaybackSpeedState(DEFAULT_PLAYBACK_SPEED);
  }, []);

  // ── Loop ───────────────────────────────────────────────────────────────────
  const [loopRange, setLoopRange] = useState<BarRange | null>(null);
  const loopRangeRef = useRef(loopRange);
  loopRangeRef.current = loopRange;

  /**
   * Push a bar range onto the player. Bars become MIDI ticks through
   * `api.tickCache`, and `setPlaybackRange` also flips `api.isLooping` on.
   */
  const applyLoopToPlayer = useCallback((range: BarRange | null) => {
    const alphaTab = canvasRef.current?.alphaTab;
    if (!alphaTab) return;
    const score = scoreRef.current;
    if (!range || !score) {
      alphaTab.clearPlaybackRange();
      return;
    }
    const ticks = loopRangeToTicks(
      score,
      range,
      score.masterBars.length,
      tickMappingRef.current.endTick,
      getApi()?.tickCache,
    );
    if (!ticks) {
      alphaTab.clearPlaybackRange();
      return;
    }
    alphaTab.setPlaybackRange(ticks.startTick, ticks.endTick);
  }, [getApi, tickMappingRef]);

  // Setting a playback range seeks to its start, so only re-apply while the
  // player is idle — otherwise a re-render would yank the playhead backwards.
  const reapplyLoop = useCallback(() => {
    if (isPlayingRef.current) return;
    if (!loopRangeRef.current) return;
    applyLoopToPlayer(loopRangeRef.current);
  }, [applyLoopToPlayer, isPlayingRef]);
  reapplyLoopRef.current = reapplyLoop;

  const handleClearLoop = useCallback(() => {
    setLoopRange(null);
    applyLoopToPlayer(null);
  }, [applyLoopToPlayer]);

  const selectAudioSource = useCallback((source: AudioSource) => {
    const version = ++sourceSwitchVersionRef.current;
    // Silence the outgoing source synchronously before enabling its replacement.
    suppressYoutubeSync();
    const api = getApi();
    if (api) api.masterVolume = 0;
    youtubePlayerRef.current?.setMuted?.(true);
    youtubePlayerRef.current?.pause();
    void stemPlayer.pause().then(() => {
      if (version !== sourceSwitchVersionRef.current) return;
      setAudioSource(source);
      if (source === 'youtube') setShowYoutubePanel(true);
      if (source === audioSourceRef.current) {
        if (api) api.masterVolume = source === 'tracks' ? 1 : 0;
        youtubePlayerRef.current?.setMuted?.(source !== 'youtube');
        if (isPlayingRef.current && source === 'stems') {
          void stemPlayer.seek(positionRef.current.currentTimeMs / 1000);
        }
        if (isPlayingRef.current && source === 'youtube') {
          youtubeSyncRef.current?.onPlayFrom(positionRef.current.currentTimeMs / 1000);
        }
      }
    });
  }, [getApi, stemPlayer.pause, stemPlayer.seek, suppressYoutubeSync, youtubePlayerRef,
    youtubeSyncRef, isPlayingRef, positionRef]);

  useEffect(() => {
    if ((audioSource === 'stems' && !stemPlayer.stemsReady) ||
        (audioSource === 'youtube' && !youtubeVideoId)) {
      selectAudioSource('tracks');
    }
  }, [audioSource, stemPlayer.stemsReady, youtubeVideoId, selectAudioSource]);

  useEffect(() => {
    const api = getApi();
    if (api) api.masterVolume = audioSource === 'tracks' ? 1 : 0;
    if (audioSource === 'stems' && stemPlayer.stemsReady && isPlaying) {
      void stemPlayer.seek(positionRef.current.currentTimeMs / 1000);
    } else {
      void stemPlayer.pause();
    }
    if (audioSource === 'youtube' && isPlaying) {
      suppressYoutubeSync();
      youtubeSyncRef.current?.onPlayFrom(positionRef.current.currentTimeMs / 1000);
    } else {
      youtubePlayerRef.current?.pause();
    }
  }, [audioSource, isPlaying, stemPlayer.stemsReady, stemPlayer.seek, stemPlayer.pause,
    getApi, positionRef, youtubePlayerRef, youtubeSyncRef, suppressYoutubeSync]);

  const handleYoutubeStateChange = useCallback((state: number) => {
    if (audioSource !== 'youtube') {
      if (state === 1) youtubePlayerRef.current?.pause();
      return;
    }
    engineHandleYoutubeStateChange(state);
  }, [audioSource, engineHandleYoutubeStateChange, youtubePlayerRef]);

  const handleSelectedYoutubeReady = useCallback(() => {
    handleYoutubeReady();
    if (audioSource === 'youtube' && isPlayingRef.current) {
      youtubeSyncRef.current?.onPlayFrom(positionRef.current.currentTimeMs / 1000);
    }
  }, [handleYoutubeReady, audioSource, isPlayingRef, positionRef, youtubeSyncRef]);

  // ── Editor Cursor ──────────────────────────────────────────────────────────
  const {
    cursor,
    cursorBounds,
    setScore,
    moveTo,
    moveLeft,
    moveRight,
    moveUp,
    moveDown,
    moveToNextMeasure,
    moveToPrevMeasure,
    handleBeatClick,
    handleNoteClick,
    updateCursorBounds,
  } = useEditorCursor(apiRef);

  const cursorDebugRef = useRef(cursor);
  cursorDebugRef.current = cursor;
  const cursorBoundsDebugRef = useRef(cursorBounds);
  cursorBoundsDebugRef.current = cursorBounds;

  // ── Debug diagnostics ─────────────────────────────────────────────────────
  const writePlaybackDiag = useCallback((tag: string) => {
    const api = getApi();
    const diag = {
      tag,
      at: Date.now(),
      api: !!api,
      apiPlayerState: api?.playerState,
      apiTickPosition: api?.tickPosition,
      apiTimePosition: api?.timePosition,
      alphaTabPlayerState: alphaTabPlayerStateRef.current,
      isReadyForPlayback: api?.isReadyForPlayback,
      isPlayerReady: isPlayerReadyRef.current,
      renderFinished: renderFinishedRef.current,
      midiReloadNeeded: midiReloadNeeded.current,
      pendingScoreRender: pendingScoreRenderRef.current,
      startupGuardActive: isAlphaTabStartupGuardActive(),
      cursor: cursorDebugRef.current,
      cursorBounds: cursorBoundsDebugRef.current,
    };
    const target = window as unknown as {
      __tabEditorPlayback?: typeof diag;
      __tabEditorPlaybackEvents?: Array<typeof diag>;
    };
    target.__tabEditorPlayback = diag;
    target.__tabEditorPlaybackEvents = [...(target.__tabEditorPlaybackEvents ?? []).slice(-49), diag];
    if (window.localStorage.getItem('tabEditorDebug') === '1') {
      console.debug('[tab-editor:playback]', diag);
    }
  }, [getApi, alphaTabPlayerStateRef, isPlayerReadyRef, renderFinishedRef, midiReloadNeeded, pendingScoreRenderRef, isAlphaTabStartupGuardActive]);

  const handlePlayerStateChanged = useCallback((state: number) => {
    writePlaybackDiag(`playerState:${state}`);
    _engineHandlePlayerStateChanged(state);
  }, [_engineHandlePlayerStateChanged, writePlaybackDiag]);

  const handlePlayPause = useCallback(() => {
    writePlaybackDiag('transport:playPause');
    _engineHandlePlayPause();
  }, [_engineHandlePlayPause, writePlaybackDiag]);

  // ── commitMutation — core mutation trigger ──────────────────────────────────────
  const commitMutation = useCallback(() => {
    const api = getApi();
    const score = scoreRef.current;
    if (!api || !score) return;
    writePlaybackDiag('commitMutation:requested');

    const runRender = () => {
      const readyApi = getApi();
      const currentScore = scoreRef.current;
      if (!readyApi || !currentScore) return;
      pendingScoreRenderRef.current = false;
      clearScoreRenderTimer();
      markRenderPending();
      // Clamp — alphaTab's renderScore has an off-by-one (`<=` instead of `<`) that
      // pushes `undefined` into its tracks list if we pass an out-of-range index,
      // which then crashes its readyForPlayback handler (`track.playbackInfo`).
      const clampedIndex = Math.max(0, Math.min(activeTrackIndex, currentScore.tracks.length - 1));
      readyApi.renderScore(currentScore, [clampedIndex]);
      writePlaybackDiag('renderScore');
      loadMidiForCurrentScore();
      window.setTimeout(() => {
        const latestApi = getApi();
        if (!renderFinishedRef.current && latestApi) {
          writePlaybackDiag('renderFinished:watchdog');
          handleRenderFinished();
        }
      }, 500);
      setScoreMutationVersion(k => k + 1);
      markDirty();
    };

    if (
      alphaTabPlayerStateRef.current === 1 ||
      api.playerState === 1 ||
      isAlphaTabStartupGuardActive()
    ) {
      pendingScoreRenderRef.current = true;
      if (alphaTabPlayerStateRef.current === 1 || api.playerState === 1) {
        prepareForScoreRender();
      }
      writePlaybackDiag('commitMutation:queued');
      clearScoreRenderTimer();
      scoreRenderTimerRef.current = window.setTimeout(() => {
        scoreRenderTimerRef.current = null;
        if (!pendingScoreRenderRef.current) return;
        const readyApi = getApi();
        if (
          alphaTabPlayerStateRef.current === 1 ||
          readyApi?.playerState === 1 ||
          isAlphaTabStartupGuardActive()
        ) {
          return;
        }
        runRender();
      }, getAlphaTabStartupGuardDelay());
      return;
    }

    runRender();
  }, [
    activeTrackIndex,
    clearScoreRenderTimer,
    getAlphaTabStartupGuardDelay,
    getApi,
    isAlphaTabStartupGuardActive,
    loadMidiForCurrentScore,
    markDirty,
    markRenderPending,
    handleRenderFinished,
    prepareForScoreRender,
    renderFinishedRef,
    writePlaybackDiag,
    alphaTabPlayerStateRef,
    pendingScoreRenderRef,
    scoreRenderTimerRef,
  ]);

  // Keep the stable ref up-to-date so onRenderNeeded always calls the latest commitMutation
  commitMutationRef.current = commitMutation;

  // ── Score IO ───────────────────────────────────────────────────────────────
  // We need setDetectedPatterns from useSectionPatterns, but that hook comes after.
  // Use a stable callback ref so onScoreLoaded can be wired after both hooks init.
  const setDetectedPatternsRef = useRef<((patterns: ReturnType<typeof detectPatterns>) => void)>(() => { /* stub */ });

  const scoreIO = useScoreIO({
    scoreRef,
    apiRef,
    undoManagerRef,
    id,
    onScoreLoaded: useCallback((score: Score) => {
      const api = getApi();
      if (!api) return;
      writePlaybackDiag('loadScore');
      setScore(score);
      setActiveTrackIndex(0);
      setTrackVersion(v => v + 1);
      setSelectedKey(getScoreKey(score));
      // Percussion staves don't carry tablature; force StaveProfile.Score so the
      // first render produces a visible stave (StaveProfile.Tab on drums => empty
      // layout => `group.staves` undefined crash).
      const firstTrackIsDrums = score.tracks[0]?.staves[0]?.isPercussion ?? false;
      api.settings.display.staveProfile = firstTrackIsDrums
        ? StaveProfile.Score
        : staveMode === 'tab' ? StaveProfile.Tab
        : staveMode === 'notation' ? StaveProfile.Score
        : StaveProfile.Default;
      // Fingering placement depends on the stave profile, so re-derive it here.
      applyFingeringSettings(api, showFingeringRef.current);
      api.updateSettings();
      prepareForScoreRender();
      markRenderPending();
      api.renderScore(score, [0]);
      loadMidiForCurrentScore();
      setIsReady(true);
      setDetectedPatternsRef.current(detectPatterns(score));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getApi, writePlaybackDiag, setScore, prepareForScoreRender, markRenderPending, loadMidiForCurrentScore, setIsReady, staveMode]),
    onDirty: markDirty,
    onClean: markClean,
    onYoutubeUrl: useCallback((url: string) => { handleYoutubeUrlSubmit(url); }, [handleYoutubeUrlSubmit]),
    onShowYoutubePanel: useCallback(() => { setShowYoutubePanel(true); }, []),
    onSaved: useCallback((newId: number, isNew: boolean) => {
      if (isNew) void migrateYoutubeKey(`tab-editor:${newId}`);
      _editorScoreCache.delete(id ?? 'new');
      if (proceedAfterSaveRef.current) {
        const proceed = proceedAfterSaveRef.current;
        proceedAfterSaveRef.current = null;
        setIsResolvingBlockedNavigation(false);
        proceed();
        return;
      }
      if (isNew) {
        navigate(`/tab-editor/${newId}`, {replace: true});
      }
    }, [id, migrateYoutubeKey, navigate]),
  });

  const {
    title, setTitle,
    artist, setArtist,
    tempo, setTempoState,
    compositionId, setCompositionId,
    showSaveDialog, setShowSaveDialog,
    pendingPreviewImage, setPendingPreviewImage,
    // The export / import / demo popovers were the desktop-only toolbar
    // cluster; those actions are items in the ⋮ menu now.
    showAsciiImport, setShowAsciiImport,
    asciiImportText, setAsciiImportText,
    asciiImportTitle, setAsciiImportTitle,
    asciiImportArtist, setAsciiImportArtist,
    asciiTitleManual,
    asciiArtistManual,
    fileInputRef,
    psarcFileInputRef,
    loadScore,
    handleLoadGuitarDemo,
    handleLoadDrumsDemo,
    handleLoadBassDemo,
    handleExport,
    handleImportFile,
    handleImportAscii,
    handleImportPsarc,
    handleTitleChange,
    handleArtistChange,
    handleSaveComposition: _handleSaveComposition,
    resetToNew,
  } = scoreIO;

  const closeAsciiImport = useCallback(() => {
    setShowAsciiImport(false);
    setAsciiImportText('');
    setAsciiImportTitle('');
    setAsciiImportArtist('');
    asciiTitleManual.current = false;
    asciiArtistManual.current = false;
  }, [setShowAsciiImport, setAsciiImportText, setAsciiImportTitle, setAsciiImportArtist, asciiTitleManual, asciiArtistManual]);

  // ── Track management ──────────────────────────────────────────────────────
  const [trackVersion, setTrackVersion] = useState(0);

  const tracks = useMemo(() => {
    const score = scoreRef.current;
    if (!score) return [{name: 'Guitar', instrument: 'guitar' as InstrumentType, stringCount: 6, tuningName: 'Standard (E A D G B E)'}];
    return score.tracks.map(t => {
      const staff = t.staves[0];
      const isPercussion = staff?.isPercussion ?? false;
      const instrument: InstrumentType = isPercussion ? 'drums' : t.name.toLowerCase().includes('bass') ? 'bass' : 'guitar';
      const stringCount = staff?.stringTuning?.tunings?.length ?? (instrument === 'bass' ? 4 : 6);
      // Match presets by pitches, not name: alphaTab names tunings its own way ("Custom",
      // "Standard Tuning"), which never equals a preset name. Presets list low → high.
      const values = [...(staff?.stringTuning?.tunings ?? [])].reverse();
      const preset = instrument === 'drums'
        ? undefined
        : getTuningsForInstrument(instrument, stringCount).find(p => p.values.join() === values.join());
      const tuningName = preset?.name
        ?? (values.length ? `Custom (${values.map(v => NOTE_NAMES[v % 12]).join(' ')})` : 'Custom');
      return {name: t.name, instrument, stringCount, tuningName};
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, activeTrackIndex, trackVersion]);

  // ── Section Patterns ───────────────────────────────────────────────────────
  const totalBarsMemo = useMemo(
    () => scoreRef.current?.masterBars.length ?? 1,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoreMutationVersion, isReady],
  );

  const handleBeforeMutation = useCallback(() => {
    if (scoreRef.current) undoManagerRef.current.pushSnapshot(scoreRef.current);
  }, []);

  const sectionPatterns = useSectionPatterns({
    scoreRef,
    apiRef,
    canvasScrollRef,
    totalBars: totalBarsMemo,
    // "Practice this section" is a loop: it sets the same loop the toolbar
    // shows and clears, then starts playback at its first bar.
    onStartPlaybackAtBar: useCallback((startBar: number, endBar: number) => {
      const score = scoreRef.current;
      const api = getApi();
      if (!score || !api) return;
      const range = normalizeLoopRange({startBar, endBar}, score.masterBars.length);
      const ticks = range && loopRangeToTicks(
        score, range, score.masterBars.length, tickMappingRef.current.endTick, api.tickCache,
      );
      setLoopRange(range);
      if (ticks) canvasRef.current?.alphaTab?.setPlaybackRange(ticks.startTick, ticks.endTick);
      const startTick = ticks?.startTick
        ?? barIndexToTick(score, startBar, totalBarsMemo, tickMappingRef.current.endTick, api.tickCache);
      if (!requestAlphaTabPlay(startTick)) {
        loadMidiForCurrentScore();
        pollPlaybackReady();
      }
    }, [getApi, loadMidiForCurrentScore, pollPlaybackReady, requestAlphaTabPlay, tickMappingRef, totalBarsMemo]),
    onJumpToBar: useCallback((barIndex: number) => {
      moveTo({...cursor, barIndex, beatIndex: 0});
    }, [cursor, moveTo]),
    handleBeforeMutation,
    reRender: commitMutation,
  });

  const {
    sectionLabels,
    setSectionLabels,
    detectedPatterns,
    setDetectedPatterns,
    practiceRange,
    setPracticeRange,
    showPatternColors,
    patternOverlays,
    computeSectionLabels,
    computePatternOverlays,
    handleAddSection,
    handleRemoveSection,
    handleDetectPatterns,
    handlePracticeRange,
    handleJumpToBar,
    handleTogglePatternColors,
    getSectionsFromScore,
  } = sectionPatterns;

  // Wire up the stable ref now that setDetectedPatterns is available
  setDetectedPatternsRef.current = setDetectedPatterns;
  // Wire forward refs declared before playbackEngine
  setPracticeRangeRef.current = setPracticeRange;
  updateCursorBoundsRef.current = updateCursorBounds;
  computeSectionLabelsRef.current = computeSectionLabels;
  computePatternOverlaysRef.current = computePatternOverlays;

  // ── Bar selection / loop overlays ─────────────────────────────────────────
  // Selection is blue (what an edit would hit), the loop is amber (what the
  // player repeats). They can be on at once and read differently.
  const LOOP_OVERLAY_COLOR = '#f59e0b';
  const SELECTION_OVERLAY_COLOR = '#3b82f6';
  const [selectedBarOverlays, setSelectedBarOverlays] = useState<PatternOverlay[]>([]);
  useEffect(() => {
    if (!selectedBarRange && !loopRange) {
      setSelectedBarOverlays([]);
      return;
    }
    const api = getApi();
    if (!api?.boundsLookup) return;
    const overlays: PatternOverlay[] = [];
    for (const system of api.boundsLookup.staffSystems) {
      for (const barBounds of system.bars) {
        const idx = barBounds.index;
        const {x, y, w, h} = barBounds.visualBounds;
        if (loopRange && idx >= loopRange.startBar && idx <= loopRange.endBar) {
          overlays.push({
            x, y, w, h,
            color: LOOP_OVERLAY_COLOR,
            label: idx === loopRange.startBar ? `Loop ${formatLoopRange(loopRange)}` : '',
          });
        }
        if (selectedBarRange && idx >= selectedBarRange.start && idx <= selectedBarRange.end) {
          overlays.push({x, y, w, h, color: SELECTION_OVERLAY_COLOR, label: ''});
        }
      }
    }
    setSelectedBarOverlays(overlays);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBarRange, loopRange, scoreMutationVersion, sectionLabels]);

  const mergedPatternOverlays = useMemo(
    () => [...selectedBarOverlays, ...patternOverlays],
    [selectedBarOverlays, patternOverlays],
  );

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const applyUndoRedo = useCallback((score: Score) => {
    const api = getApi();
    if (!api) return;
    scoreRef.current = score;
    setScore(score);
    setTitle(score.title);
    setArtist(score.artist);
    const scoreTempo = getScoreTempo(score);
    if (scoreTempo > 0) setTempoState(scoreTempo);
    setSelectedKey(getScoreKey(score));
    prepareForScoreRender();
    markRenderPending();
    api.renderScore(score, [activeTrackIndex]);
    loadMidiForCurrentScore();
    if (undoManagerRef.current.isAtCleanState) {
      markClean();
    } else {
      markDirty();
    }
  }, [
    getApi,
    setScore,
    activeTrackIndex,
    loadMidiForCurrentScore,
    markClean,
    markDirty,
    markRenderPending,
    prepareForScoreRender,
    setTitle,
    setArtist,
    setTempoState,
  ]);

  const handleUndo = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    if (!requireEditMode()) return;
    const restored = undoManagerRef.current.undo(score);
    if (restored) applyUndoRedo(restored);
    else toast('Nothing to undo');
  }, [applyUndoRedo]);

  const handleRedo = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    if (!requireEditMode()) return;
    const restored = undoManagerRef.current.redo(score);
    if (restored) applyUndoRedo(restored);
    else toast('Nothing to redo');
  }, [applyUndoRedo]);

  // ── Bar selection ─────────────────────────────────────────────────────────
  const handleSelectAllBars = useCallback(() => {
    const total = scoreRef.current?.masterBars.length ?? 0;
    if (total > 0) setSelectedBarRange({start: 0, end: total - 1});
  }, []);

  /**
   * Alt+L / the toolbar button: loop the selected bars, or the bar the cursor
   * is in. Pressing it again clears the loop.
   */
  const handleToggleLoop = useCallback(() => {
    if (loopRangeRef.current) {
      handleClearLoop();
      toast('Loop cleared', {id: 'tab-editor-loop'});
      return;
    }
    const range = computeLoopRange({
      selectedBarRange,
      cursorBarIndex: cursor.barIndex,
      totalBars: scoreRef.current?.masterBars.length ?? 0,
    });
    if (!range) {
      toast('Nothing to loop yet', {id: 'tab-editor-loop'});
      return;
    }
    setLoopRange(range);
    applyLoopToPlayer(range);
    toast(`Looping ${formatLoopRange(range).toLowerCase()}`, {id: 'tab-editor-loop'});
  }, [applyLoopToPlayer, cursor.barIndex, handleClearLoop, selectedBarRange]);

  const handleClearSelectedBars = useCallback(() => {
    const score = scoreRef.current;
    if (!score || !selectedBarRange) return;
    if (!requireEditMode()) return;
    handleBeforeMutation();
    for (let i = selectedBarRange.start; i <= selectedBarRange.end; i++) {
      clearBar(score, activeTrackIndex, cursor.voiceIndex, i);
    }
    commitMutation();
    setSelectedBarRange(null);
    moveTo({...cursor, barIndex: selectedBarRange.start, beatIndex: 0});
  }, [selectedBarRange, activeTrackIndex, cursor, handleBeforeMutation, commitMutation, moveTo]);

  // ── Render finished callbacks ──────────────────────────────────────────────
  const handlePostRenderFinished = useCallback(() => {
    updateCursorBounds();
    computeSectionLabels();
    computePatternOverlays();
  }, [updateCursorBounds, computeSectionLabels, computePatternOverlays]);

  const handleScoreLoaded = useCallback((score: Score) => {
    writePlaybackDiag('scoreLoaded');
    scoreRef.current = score;
    setScore(score);
    setIsReady(true);
  }, [setScore, writePlaybackDiag, setIsReady]);

  // ── initScore ─────────────────────────────────────────────────────────────
  const initScore = useCallback(async () => {
    const api = getApi();
    if (!api || scoreRef.current) return;
    writePlaybackDiag('initScore');
    apiRef.current = api;

    const cacheKey = id ?? 'new';
    const cachedBytes = _editorScoreCache.get(cacheKey);
    if (cachedBytes) {
      try {
        const score = importer.ScoreLoader.loadScoreFromBytes(cachedBytes, new Settings());
        loadScore(score);
        markDirty();
        return;
      } catch { /* fall through */ }
    }

    if (id) {
      const composition = await loadComposition(Number(id));
      if (composition) {
        try {
          const data = new Uint8Array(composition.scoreData);
          const score = importer.ScoreLoader.loadScoreFromBytes(data, new Settings());
          loadScore(score);
          if (composition.meta.tempo > 0) setTempoState(composition.meta.tempo);
          if (composition.meta.previewImage) setPendingPreviewImage(composition.meta.previewImage);
          if (composition.meta.youtubeUrl) seedYoutubeFromDb(composition.meta.youtubeUrl);
          return;
        } catch { /* fall through */ }
      }
    }

    const score = createBlankScore({
      title: 'Untitled',
      tempo: DEFAULT_TEMPO_BPM,
      measureCount: 4,
      instrument: 'guitar',
    });
    scoreRef.current = score;
    setScore(score);
    markRenderPending();
    api.renderScore(score, [0]);
    loadMidiForCurrentScore();
    setIsReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getApi, id, loadScore, loadMidiForCurrentScore, markDirty, markRenderPending, setScore, resetKey, seedYoutubeFromDb, writePlaybackDiag]);

  // Wire initScore into the forward ref so onRenderFinished callback stays current
  initScoreRef.current = initScore;

  useEffect(() => {
    const timer = setTimeout(initScore, SCORE_INIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [initScore]);

  // ── Beat drag-select ──────────────────────────────────────────────────────
  const dragStartBeatRef = useRef<InstanceType<typeof model.Beat> | null>(null);

  const getBarIndexFromBeat = useCallback((beat: InstanceType<typeof model.Beat>): number => {
    const bar = beat.voice?.bar;
    if (!bar) return -1;
    return bar.staff.bars.indexOf(bar);
  }, []);

  // ── Beat click with seek ──────────────────────────────────────────────────
  const handleBeatClickWithSeek = useCallback((beat: InstanceType<typeof model.Beat>) => {
    dragStartBeatRef.current = beat;
    _engineHandleBeatClickWithSeek(beat, handleBeatClick);
  }, [_engineHandleBeatClickWithSeek, handleBeatClick]);

  const handleBeatMouseUp = useCallback((beat: InstanceType<typeof model.Beat> | null) => {
    const startBeat = dragStartBeatRef.current;
    dragStartBeatRef.current = null;
    // Only set selection if drag released on a different beat (not a simple click)
    if (!beat || !startBeat || beat === startBeat) return;
    const startBar = getBarIndexFromBeat(startBeat);
    const endBar = getBarIndexFromBeat(beat);
    if (startBar < 0 || endBar < 0) return;
    setSelectedBarRange({start: Math.min(startBar, endBar), end: Math.max(startBar, endBar)});
  }, [getBarIndexFromBeat]);

  // ── Cleanup timers on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => { unmount(); };
  }, [unmount]);

  // ── Auto-extend score bars for stem duration ───────────────────────────────
  useEffect(() => {
    if (audioSource !== 'stems' || !stemPlayer.stemsReady || stemPlayer.duration <= 0) return;
    const score = scoreRef.current;
    if (!score) return;
    // Adding bars is an edit: in view mode loading stems must not touch the file.
    if (!isEditModeRef.current) return;
    const masterBars = score.masterBars;
    const currentBars = masterBars.length;
    const refBar = masterBars[0];
    const num = refBar?.timeSignatureNumerator ?? 4;
    const den = refBar?.timeSignatureDenominator ?? 4;
    const secondsPerBar = (num / den) * QUARTER_NOTE_BEATS_PER_WHOLE * (60 / tempo);
    const barsNeeded = Math.ceil(stemPlayer.duration / secondsPerBar);
    if (barsNeeded <= currentBars) return;
    const toAdd = barsNeeded - currentBars;
    for (let i = 0; i < toAdd; i++) {
      insertMeasureAfter(score, score.masterBars.length - 1);
    }
    const resume = isPlayingRef.current;
    commitMutation();
    if (resume) requestAlphaTabPlay();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSource, stemPlayer.stemsReady, stemPlayer.duration]);

  // ── Track management callbacks ─────────────────────────────────────────────
  const applyTrackRender = useCallback((trackIndex: number, isPercussion: boolean, overrideStaveMode?: 'tab' | 'notation' | 'both') => {
    const api = getApi();
    const score = scoreRef.current;
    if (!api || !score) return;
    const effectiveMode = overrideStaveMode ?? staveMode;
    const profile = isPercussion ? StaveProfile.Score
      : effectiveMode === 'tab' ? StaveProfile.Tab
      : effectiveMode === 'notation' ? StaveProfile.Score
      : StaveProfile.Default;
    api.settings.display.staveProfile = profile;
    // Fingering placement depends on the stave profile, so re-derive it here.
    applyFingeringSettings(api, showFingeringRef.current);
    api.updateSettings();
    prepareForScoreRender();
    markRenderPending();
    const clampedIndex = Math.max(0, Math.min(trackIndex, score.tracks.length - 1));
    api.renderScore(score, [clampedIndex]);
    loadMidiForCurrentScore();
  }, [getApi, loadMidiForCurrentScore, markRenderPending, prepareForScoreRender, staveMode]);

  const handleStaveModeToggle = useCallback(() => {
    const modes: Array<'tab' | 'notation' | 'both'> = ['tab', 'notation', 'both'];
    const nextIdx = (modes.indexOf(staveMode) + 1) % modes.length;
    const next = modes[nextIdx];
    setStaveMode(next);
    const isPerc = scoreRef.current?.tracks[activeTrackIndex]?.staves[0]?.isPercussion ?? false;
    applyTrackRender(activeTrackIndex, isPerc, next);
  }, [staveMode, activeTrackIndex, applyTrackRender]);

  const handleTrackSelect = useCallback((index: number) => {
    setActiveTrackIndex(index);
    setTrackVersion(v => v + 1);
    setSectionLabels([]);
    const score = scoreRef.current;
    let isPerc = false;
    if (score && index < score.tracks.length) {
      isPerc = score.tracks[index].staves[0]?.isPercussion ?? false;
      applyTrackRender(index, isPerc);
    }
    // Default snare lane (lane 7) for drums; first string for stringed.
    moveTo({...cursor, trackIndex: index, barIndex: 0, beatIndex: 0, stringNumber: isPerc ? 7 : 1});
  }, [cursor, moveTo, applyTrackRender, setSectionLabels]);

  const handleAddTrack = useCallback((instrument: InstrumentType, stringCount: number) => {
    if (!requireEditMode()) return;
    const score = scoreRef.current;
    if (!score) return;
    const tuningPreset = instrument !== 'drums' ? getDefaultTuningPreset(instrument, stringCount) : null;
    addTrack(score, {
      name: instrument === 'drums' ? 'Drums' : instrument === 'bass' ? 'Bass' : 'Guitar',
      instrument,
      stringCount,
      tuning: tuningPreset?.values ?? [],
    });
    const newIndex = score.tracks.length - 1;
    setActiveTrackIndex(newIndex);
    setTrackVersion(v => v + 1);
    setSectionLabels([]);
    applyTrackRender(newIndex, instrument === 'drums');
    moveTo({...cursor, trackIndex: newIndex, barIndex: 0, beatIndex: 0, stringNumber: instrument === 'drums' ? 7 : 1});
  }, [cursor, moveTo, applyTrackRender, setSectionLabels]);

  const handleRemoveTrack = useCallback((index: number) => {
    if (!requireEditMode()) return;
    const score = scoreRef.current;
    if (!score) return;
    removeTrack(score, index);
    if (activeTrackIndex >= score.tracks.length) {
      setActiveTrackIndex(Math.max(0, score.tracks.length - 1));
    }
    setTrackVersion(v => v + 1);
    commitMutation();
  }, [activeTrackIndex, commitMutation]);

  const handleToggleMute = useCallback((trackIndex: number) => {
    const api = getApi();
    const score = scoreRef.current;
    if (!api || !score) return;
    const track = score.tracks[trackIndex];
    if (!track) return;
    setMutedTracks(prev => {
      const next = new Set(prev);
      const willMute = !next.has(trackIndex);
      if (willMute) next.add(trackIndex); else next.delete(trackIndex);
      try { api.changeTrackMute([track], willMute); } catch { /* player may not be ready */ }
      return next;
    });
  }, [getApi]);

  const handleTuningChange = useCallback((trackIndex: number, tuning: number[]) => {
    if (!requireEditMode()) return;
    const score = scoreRef.current;
    if (!score) return;
    setTrackTuning(score, trackIndex, tuning);
    commitMutation();
  }, [commitMutation]);

  const handleKeyChange = useCallback((key: string | null) => {
    if (!requireEditMode()) return;
    setSelectedKey(key);
    const score = scoreRef.current;
    if (!score) return;
    setScoreKey(score, key);
    commitMutation();
  }, [commitMutation]);

  const handleTempoChange = useCallback((bpm: number) => {
    if (!requireEditMode()) return;
    setTempoState(bpm);
    const score = scoreRef.current;
    if (!score) return;
    writePlaybackDiag('tempoChange:before');
    setTempo(score, bpm);
    commitMutation();
    window.setTimeout(() => writePlaybackDiag('tempoChange:after-tick'), 0);
  }, [commitMutation, writePlaybackDiag, setTempoState]);

  // ── Note input callbacks ───────────────────────────────────────────────────
  const handleDrumHit = useCallback((midiNote: number) => {
    const score = scoreRef.current;
    if (!score) return;
    if (!requireEditMode()) return;
    handleBeforeMutation();
    toggleDrumNote(score, cursor, midiNote);
    const beat = score.tracks[cursor.trackIndex]?.staves[0]?.bars[cursor.barIndex]?.voices[cursor.voiceIndex]?.beats[cursor.beatIndex];
    if (beat) beat.duration = currentDuration;
    commitMutation();
  }, [cursor, commitMutation, currentDuration, handleBeforeMutation]);

  const handleDrumAdvance = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    if (!requireEditMode()) return;
    handleBeforeMutation();
    const next = insertRest(score, cursor, currentDuration);
    commitMutation();
    if (next) moveTo(next);
    else moveRight();
  }, [cursor, currentDuration, commitMutation, moveTo, moveRight, handleBeforeMutation]);
  handleDrumAdvanceRef.current = handleDrumAdvance;
  handleDrumHitRef.current = handleDrumHit;

  const handleFretClick = useCallback((stringNumber: number, fret: number) => {
    const score = scoreRef.current;
    if (!score) return;
    if (!requireEditMode()) return;
    handleBeforeMutation();
    const targetCursor = {...cursor, stringNumber};
    const nextCursor = setNoteAndAdvance(score, targetCursor, fret, currentDuration);
    commitMutation();
    if (nextCursor) moveTo(nextCursor);
    else moveTo(targetCursor);
  }, [cursor, moveTo, commitMutation, currentDuration, handleBeforeMutation]);

  const handleChordSelect = useCallback((voicing: ChordVoicing, chordName: string) => {
    const score = scoreRef.current;
    if (!score) return;
    if (!requireEditMode()) return;
    handleBeforeMutation();
    const notes = voicingToNotes(voicing);
    setChord(score, cursor, notes, currentDuration);
    const strings = voicing.frets.map(f => f ?? -1);
    setBeatChord(score, cursor, chordName, strings);
    commitMutation();
    toast.success(`Chord ${chordName} inserted`);
  }, [cursor, currentDuration, commitMutation, handleBeforeMutation]);

  const handleChordNameCommit = useCallback((name: string) => {
    const score = scoreRef.current;
    if (!score) return;
    if (!requireEditMode()) return;
    handleBeforeMutation();
    setBeatChord(score, cursor, name);
    commitMutation();
  }, [cursor, commitMutation, handleBeforeMutation]);

  const handleChordClear = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    if (!requireEditMode()) return;
    handleBeforeMutation();
    clearBeatChord(score, cursor);
    commitMutation();
  }, [cursor, commitMutation, handleBeforeMutation]);

  const handleDurationChange = useCallback((duration: number) => {
    if (!requireEditMode()) return;
    setCurrentDuration(duration);
    const score = scoreRef.current;
    if (score) {
      setBeatDuration(score, cursor, duration);
      commitMutation();
    }
  }, [cursor, commitMutation]);

  const handleEffectToggle = useCallback((effect: NoteEffect | 'slide' | 'bend') => {
    const score = scoreRef.current;
    if (!score) return;
    if (!requireEditMode()) return;
    handleBeforeMutation();
    if (effect === 'slide') toggleSlide(score, cursor);
    else if (effect === 'bend') toggleBend(score, cursor);
    else if (
      effect === 'accent' &&
      !(score.tracks[activeTrackIndex]?.staves[0]?.isPercussion ?? false)
    ) {
      // On a pitched track a strum is one gesture, so the accent covers the
      // whole beat. Drums keep the per-note accent on the cursor's lane.
      if (cycleBeatAccent(score, cursor) === undefined) {
        toast('No notes on this beat to accent');
        return;
      }
    } else toggleEffect(score, cursor, effect);
    commitMutation();
  }, [cursor, commitMutation, handleBeforeMutation, activeTrackIndex]);

  const handleDotToggle = useCallback(() => {
    if (!requireEditMode()) return;
    const score = scoreRef.current;
    if (!score) return;
    toggleDot(score, cursor);
    commitMutation();
  }, [cursor, commitMutation]);

  // ── Fingering ─────────────────────────────────────────────────────────────
  const handleToggleFingering = useCallback(() => {
    const next = !showFingeringRef.current;
    showFingeringRef.current = next;
    setShowFingering(next);
    const isPerc = scoreRef.current?.tracks[activeTrackIndex]?.staves[0]?.isPercussion ?? false;
    applyTrackRender(activeTrackIndex, isPerc);
  }, [activeTrackIndex, applyTrackRender, setShowFingering]);

  const handleToggleStrumming = useCallback(() => {
    setShowStrumming(v => !v);
  }, [setShowStrumming]);

  const handleRightHandFinger = useCallback((finger: RightHandFinger | null) => {
    const score = scoreRef.current;
    if (!score) return;
    if (!requireEditMode()) return;
    handleBeforeMutation();
    if (!setRightHandFinger(score, cursor, finger)) {
      toast('No note under the cursor');
      return;
    }
    commitMutation();
  }, [cursor, handleBeforeMutation, commitMutation]);

  const handleLeftHandFinger = useCallback((finger: LeftHandFinger | null) => {
    const score = scoreRef.current;
    if (!score) return;
    if (!requireEditMode()) return;
    handleBeforeMutation();
    if (!setLeftHandFinger(score, cursor, finger)) {
      toast('No note under the cursor');
      return;
    }
    commitMutation();
  }, [cursor, handleBeforeMutation, commitMutation]);

  const handleClearNoteFingering = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    if (!requireEditMode()) return;
    handleBeforeMutation();
    if (!clearNoteFingering(score, cursor)) return;
    commitMutation();
  }, [cursor, handleBeforeMutation, commitMutation]);

  /** Auto-fingering for the current bar selection, or the whole track. */
  const handleAutoRightHandFingering = useCallback((scope: 'selection' | 'track') => {
    if (!requireEditMode()) return;
    const score = scoreRef.current;
    if (!score) return;
    const range = scope === 'selection' ? selectedBarRange : null;
    if (scope === 'selection' && !range) {
      toast('Select bars first (Cmd+A selects all)');
      return;
    }
    handleBeforeMutation();
    const changed = applyRightHandFingering(score, {
      trackIndex: activeTrackIndex,
      voiceIndex: cursor.voiceIndex,
      startBar: range?.start,
      endBar: range?.end,
    });
    if (changed === 0) {
      toast('Nothing to finger here');
      return;
    }
    if (!showFingeringRef.current) {
      showFingeringRef.current = true;
      setShowFingering(true);
    }
    commitMutation();
    const isPerc = score.tracks[activeTrackIndex]?.staves[0]?.isPercussion ?? false;
    applyTrackRender(activeTrackIndex, isPerc);
    toast(`Added right-hand fingering to ${changed} note${changed === 1 ? '' : 's'}`);
  }, [activeTrackIndex, cursor.voiceIndex, selectedBarRange, handleBeforeMutation, commitMutation, applyTrackRender, setShowFingering]);

  const handleClearTrackFingering = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    if (!requireEditMode()) return;
    handleBeforeMutation();
    const cleared = clearRightHandFingering(score, {
      trackIndex: activeTrackIndex,
      voiceIndex: cursor.voiceIndex,
      startBar: selectedBarRange?.start,
      endBar: selectedBarRange?.end,
    });
    if (cleared === 0) {
      toast('No right-hand fingering to clear');
      return;
    }
    commitMutation();
    toast(`Cleared fingering from ${cleared} note${cleared === 1 ? '' : 's'}`);
  }, [activeTrackIndex, cursor.voiceIndex, selectedBarRange, handleBeforeMutation, commitMutation]);

  const handleRestInsert = useCallback(() => {
    if (!requireEditMode()) return;
    const score = scoreRef.current;
    if (!score) return;
    const next = insertRest(score, cursor, currentDuration);
    commitMutation();
    if (next) moveTo(next);
  }, [cursor, currentDuration, commitMutation, moveTo]);

  const handleAddMeasure = useCallback(() => {
    if (!requireEditMode()) return;
    const score = scoreRef.current;
    if (!score) return;
    insertMeasureAfter(score, cursor.barIndex);
    commitMutation();
  }, [cursor.barIndex, commitMutation]);

  const handleDeleteMeasure = useCallback(() => {
    if (!requireEditMode()) return;
    const score = scoreRef.current;
    if (!score) return;
    deleteMeasure(score, cursor.barIndex);
    commitMutation();
  }, [cursor.barIndex, commitMutation]);

  // ── View-mode wrappers for the sidebar's writing controls ─────────────────
  // The sidebar already hides or disables these; the wrappers make sure a
  // stray event cannot reach the score anyway. Title and artist stay silent —
  // a toast per keystroke would be worse than the thing it warns about.
  const handleTitleChangeGuarded = useCallback((value: string) => {
    if (!isEditModeRef.current) return;
    handleTitleChange(value);
  }, [handleTitleChange]);

  const handleArtistChangeGuarded = useCallback((value: string) => {
    if (!isEditModeRef.current) return;
    handleArtistChange(value);
  }, [handleArtistChange]);

  const handleAddSectionGuarded = useCallback((startBar: number, name: string) => {
    if (!requireEditMode()) return;
    handleAddSection(startBar, name);
  }, [handleAddSection, requireEditMode]);

  const handleRemoveSectionGuarded = useCallback((startBar: number) => {
    if (!requireEditMode()) return;
    handleRemoveSection(startBar);
  }, [handleRemoveSection, requireEditMode]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEditorKeyboard({
    score: scoreRef.current,
    cursor,
    moveLeft,
    moveRight,
    moveUp,
    moveDown,
    moveToNextMeasure,
    moveToPrevMeasure,
    moveTo,
    onScoreChanged: commitMutation,
    onPlayPause: handlePlayPause,
    onShowHelp: () => setShowHelp(true),
    onAdvanceBeat: () => handleDrumAdvanceRef.current?.(),
    onDrumHit: (midi: number) => handleDrumHitRef.current?.(midi),
    isDrumTrack: scoreRef.current?.tracks[activeTrackIndex]?.staves[0]?.isPercussion ?? false,
    currentDuration,
    setCurrentDuration,
    onShowChordFinder: () => setShowChordFinder(true),
    onToast: (message: string) => toast(message),
    onBeforeMutation: handleBeforeMutation,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onScrollUp: () => canvasScrollRef.current?.scrollBy({top: -200, behavior: 'smooth'}),
    onScrollDown: () => canvasScrollRef.current?.scrollBy({top: 200, behavior: 'smooth'}),
    selectedBarRange,
    onSelectAllBars: handleSelectAllBars,
    onClearSelectedBars: handleClearSelectedBars,
    onClearBarSelection: () => setSelectedBarRange(null),
    onRightHandFinger: handleRightHandFinger,
    onLeftHandFinger: handleLeftHandFinger,
    onClearFingering: handleClearNoteFingering,
    onToggleFingering: handleToggleFingering,
    onToggleStrumming: handleToggleStrumming,
    readOnly: !isEditMode,
    onToggleMode: handleToggleMode,
    onToggleLoop: handleToggleLoop,
    onToggleSidebar: handleToggleSidebar,
    onAdjustSpeed: handleAdjustSpeed,
    onResetSpeed: handleResetSpeed,
  });

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSaveComposition = useCallback(async (meta: Parameters<typeof _handleSaveComposition>[0]) => {
    await _handleSaveComposition(meta, {tracks, activeTrackIndex});
    // Surface event — tab editing earns no recurring XP (composition isn't practice) but gets a
    // ledger row so the Cartographer achievement can recognise the surface as "touched."
    if (compositionId) {
      void recordEventSafely({kind: 'tab_session_finished', compositionId, measuresAdded: 0});
    }
  }, [_handleSaveComposition, tracks, activeTrackIndex, compositionId]);

  const handleSave = useCallback(() => {
    if (compositionId && isDirty) {
      void handleSaveComposition({
        title,
        artist,
        album: scoreRef.current?.album ?? '',
        tempo,
        instrument: tracks[activeTrackIndex]?.instrument ?? 'guitar',
        previewImage: pendingPreviewImage,
        youtubeUrl: youtubeUrl || null,
      });
    } else {
      setShowSaveDialog(true);
    }
  }, [compositionId, isDirty, handleSaveComposition, title, artist, tempo, tracks, activeTrackIndex, pendingPreviewImage, youtubeUrl, setShowSaveDialog]);

  const handleSaveDialogOpenChange = useCallback((open: boolean) => {
    setShowSaveDialog(open);
    if (!open && isResolvingBlockedNavigation) {
      proceedAfterSaveRef.current = null;
      setIsResolvingBlockedNavigation(false);
    }
  }, [isResolvingBlockedNavigation, setShowSaveDialog]);

  const handleBlockedNavigationCancel = useCallback(() => {
    proceedAfterSaveRef.current = null;
    setIsResolvingBlockedNavigation(false);
    blocker.reset?.();
  }, [blocker]);

  const handleBlockedNavigationDiscard = useCallback(() => {
    proceedAfterSaveRef.current = null;
    setIsResolvingBlockedNavigation(false);
    markClean();
    _editorScoreCache.delete(id ?? 'new');
    blocker.proceed?.();
  }, [blocker, id, markClean]);

  const handleBlockedNavigationSave = useCallback(() => {
    if (blocker.state !== 'blocked' || !blocker.proceed) return;
    proceedAfterSaveRef.current = blocker.proceed;
    setIsResolvingBlockedNavigation(true);

    if (compositionId) {
      void handleSaveComposition({
        title,
        artist,
        album: scoreRef.current?.album ?? '',
        tempo,
        instrument: tracks[activeTrackIndex]?.instrument ?? 'guitar',
        previewImage: pendingPreviewImage,
        youtubeUrl: youtubeUrl || null,
      });
      return;
    }

    setShowSaveDialog(true);
  }, [
    activeTrackIndex,
    artist,
    blocker,
    compositionId,
    handleSaveComposition,
    pendingPreviewImage,
    setShowSaveDialog,
    tempo,
    title,
    tracks,
    youtubeUrl,
  ]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── New tab ───────────────────────────────────────────────────────────────
  const doNewTab = useCallback(() => {
    scoreRef.current = null;
    _editorScoreCache.delete('new');
    resetToNew();
    setActiveTrackIndex(0);
    markClean();
    setResetKey(k => k + 1);
  }, [markClean, resetToNew]);

  const handleNewTab = useCallback(() => {
    if (id) { navigate('/tab-editor'); return; }
    if (isDirty) { setShowNewTabConfirm(true); return; }
    doNewTab();
  }, [id, isDirty, navigate, doNewTab]);

  const [exportingPdf, setExportingPdf] = useState(false);
  const handleExportPdf = useCallback(async () => {
    const score = scoreRef.current;
    if (!score || exportingPdf) return;
    setExportingPdf(true);
    try {
      const saved = await saveScorePdfToLibrary(score);
      toast.success(`${saved.filename} — ${saved.pageCount} page${saved.pageCount === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  }, [exportingPdf]);

  // ── Derived values ────────────────────────────────────────────────────────
  const currentFingering = useMemo(
    () => (scoreRef.current ? getNoteFingering(scoreRef.current, cursor) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cursor, scoreMutationVersion],
  );

  const currentChordName = useMemo(
    () => (scoreRef.current ? getBeatChordName(scoreRef.current, cursor) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cursor, scoreMutationVersion],
  );

  const currentTuning = useMemo(() => {
    const score = scoreRef.current;
    if (!score) return [64, 59, 55, 50, 45, 40];
    const staff = score.tracks[activeTrackIndex]?.staves[0];
    return staff?.stringTuning?.tunings ?? [64, 59, 55, 50, 45, 40];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, activeTrackIndex]);

  const activeTrackIsDrums = tracks[activeTrackIndex]?.instrument === 'drums';

  // Which controls the toolbar row may show. Single source of truth so the
  // priority is testable rather than spread across JSX conditions.
  const toolbarActions = useMemo(
    () => visibleToolbarActions({mode: editorMode, isDrumTrack: activeTrackIsDrums}),
    [editorMode, activeTrackIsDrums],
  );

  const sections = useMemo<TabSection[]>(() => {
    return getSectionsFromScore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreMutationVersion, isReady, getSectionsFromScore]);

  const stringLabel = useMemo(() => {
    if (activeTrackIsDrums) {
      const lane = getDrumLane(cursor.stringNumber);
      return lane ? `${lane.name} (Lane ${cursor.stringNumber})` : 'Drums';
    }
    const idx = cursor.stringNumber - 1;
    if (idx < 0 || idx >= currentTuning.length) return `String ${cursor.stringNumber}`;
    const midi = currentTuning[idx];
    const name = NOTE_NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${name}${octave} (String ${cursor.stringNumber})`;
  }, [currentTuning, cursor.stringNumber, activeTrackIsDrums]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar — one non-wrapping row. Every child is `shrink-0` and every
          label is `whitespace-nowrap`, so the row can never solve a width
          shortage by breaking text inside a control; the only elastic element
          is the spacer. Identity, labels and the speed slider drop out below
          `xl` so the whole row still fits a 768 px toolbar (a 1024 px window
          with the app nav expanded) — see toolbarLayout.ts.
          `overflow-x-auto` is the escape hatch for phone widths, where the row
          genuinely cannot fit: it keeps the ⋮ menu reachable instead of
          clipping it. It does not engage at or above the 768 px target. */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-container border-b border-outline-variant/20 overflow-x-auto overscroll-x-contain"
        style={{paddingTop: 'max(var(--sat), 0.5rem)'}}
      >
        <button
          onClick={() => navigate((location.state as LocationState | null)?.from ?? '/guitar', {state: {activeTab: (location.state as LocationState | null)?.activeTab}})}
          className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant shrink-0"
          title="Back"
          aria-label="Back"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="hidden xl:flex items-center gap-2 shrink-0">
          <Music className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-bold text-on-surface whitespace-nowrap">Tab Editor</h1>
        </div>

        <div className="hidden xl:block w-px h-6 bg-outline-variant/30 shrink-0" />

        {/* Transport */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handlePlayPause}
            className={cn(
              'p-2 rounded-lg transition-colors',
              isPlaying ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-high',
            )}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            disabled={!isPlayerReady}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={handleStop}
            className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
            title="Stop"
          >
            <Square className="h-3 w-3" />
          </button>
        </div>

        {/* Practice speed — playback only. The song's BPM lives in the sidebar
            and is saved with the file; this is not. */}
        <div
          className={cn(
            'flex items-center gap-1 rounded-lg px-1.5 py-1 border transition-colors shrink-0',
            playbackSpeed !== DEFAULT_PLAYBACK_SPEED && speedAppliesToAudio
              ? 'border-tertiary/50 bg-tertiary/10 text-tertiary'
              : 'border-outline-variant/30 text-on-surface-variant',
            !speedAppliesToAudio && 'opacity-50',
          )}
          title={speedAppliesToAudio
            ? 'Practice speed — playback only, never saved. The song’s tempo is the BPM field in the sidebar. ([ slower, ] faster, \\ reset)'
            : 'Practice speed only applies to the Tracks audio source'}
        >
          <Gauge className="h-3.5 w-3.5 shrink-0" />
          <button
            onClick={() => handleAdjustSpeed(-PLAYBACK_SPEED_STEP)}
            disabled={!speedAppliesToAudio}
            className="p-0.5 rounded hover:bg-surface-container-high disabled:cursor-not-allowed"
            title="Slower ([)"
            aria-label="Slower"
          >
            <Minus className="h-3 w-3" />
          </button>
          <input
            type="range"
            aria-label="Practice playback speed"
            min={MIN_PLAYBACK_SPEED}
            max={MAX_PLAYBACK_SPEED}
            step={PLAYBACK_SPEED_STEP}
            value={effectivePlaybackSpeed}
            disabled={!speedAppliesToAudio}
            onChange={e => handleSpeedChange(Number(e.target.value))}
            className="hidden xl:block w-20"
          />
          <button
            onClick={() => handleAdjustSpeed(PLAYBACK_SPEED_STEP)}
            disabled={!speedAppliesToAudio}
            className="p-0.5 rounded hover:bg-surface-container-high disabled:cursor-not-allowed"
            title="Faster (])"
            aria-label="Faster"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            onClick={handleResetSpeed}
            disabled={!speedAppliesToAudio}
            className="text-[11px] font-mono font-semibold tabular-nums w-10 shrink-0 text-center whitespace-nowrap hover:underline disabled:cursor-not-allowed"
            title="Back to 100 % (\)"
          >
            {effectivePlaybackSpeed}%
          </button>
        </div>

        {/* Loop */}
        <div className="flex items-center shrink-0">
          <button
            onClick={handleToggleLoop}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors',
              loopRange
                ? 'bg-amber-500/15 text-amber-500'
                : 'text-on-surface-variant hover:bg-surface-container-high',
            )}
            title={loopRange
              ? `Looping ${formatLoopRange(loopRange)} — click to clear (Alt+L)`
              : 'Loop the selected bars, or the current bar (Alt+L)'}
          >
            <Repeat className="h-3.5 w-3.5 shrink-0" />
            {loopRange && <span className="hidden xl:inline">{formatLoopRange(loopRange)}</span>}
          </button>
          {loopRange && (
            <button
              onClick={handleClearLoop}
              className="p-1 rounded text-amber-500 hover:bg-surface-container-high transition-colors shrink-0"
              title="Clear loop"
              aria-label="Clear loop"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <select
          aria-label="Audio source"
          value={audioSource}
          onChange={event => selectAudioSource(event.target.value as AudioSource)}
          className="w-24 shrink-0 bg-surface-container text-xs text-on-surface rounded px-2 py-1.5 border border-outline-variant/30"
        >
          <option value="tracks">Tracks</option>
          <option value="stems" disabled={!stemPlayer.stemsReady}>Stems</option>
          <option value="youtube" disabled={!youtubeVideoId}>YouTube</option>
        </select>

        {/* The cursor read-out used to sit here. It is a continuous read-out,
            not an action, and squeezed between two toolbar controls it was the
            thing that wrapped to four lines — it now lives in the status bar
            next to mode, BPM, speed and loop. */}
        <div className="flex-1 min-w-0" />

        {/* View / Edit — the switch that decides whether keys can change the file */}
        <div
          className="flex items-center rounded-lg border border-outline-variant/30 overflow-hidden shrink-0"
          role="group"
          aria-label="Editor mode"
        >
          <button
            onClick={() => setEditorMode('view')}
            aria-pressed={!isEditMode}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors',
              !isEditMode ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high',
            )}
            title="View mode — practise without changing the tab (Alt+E)"
            aria-label="View mode"
          >
            <Eye className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden xl:inline">View</span>
          </button>
          <button
            onClick={() => setEditorMode('edit')}
            aria-pressed={isEditMode}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors',
              isEditMode ? 'bg-tertiary text-on-tertiary' : 'text-on-surface-variant hover:bg-surface-container-high',
            )}
            title="Edit mode — note entry and effects are live (Alt+E)"
            aria-label="Edit mode"
          >
            <Pencil className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden xl:inline">Edit</span>
          </button>
        </div>

        <button
          onClick={handleToggleSidebar}
          className="hidden lg:inline-flex shrink-0 p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
          title={sidebarCollapsed ? 'Show sidebar (Alt+B)' : 'Hide sidebar for a full-width tab (Alt+B)'}
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>

        {/* Note-entry surfaces — inline in Edit mode only, which is what makes
            the View-mode row visibly leaner. Everything else occasional lives
            in the ⋮ menu. */}
        {toolbarActions.includes('chordFinder') && (
          <button
            onClick={() => setShowChordFinder(true)}
            className="hidden lg:inline-flex shrink-0 p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
            title="Chord Finder (Cmd+K)"
            aria-label="Chord Finder"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
        {toolbarActions.includes('fretboard') && (
          <button
            onClick={() => setShowFretboard(!showFretboard)}
            className={cn('hidden lg:inline-flex shrink-0 p-2 rounded-lg transition-colors', showFretboard ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-high')}
            title={activeTrackIsDrums ? 'Toggle Drum Pad' : 'Toggle Fretboard'}
            aria-label={activeTrackIsDrums ? 'Toggle Drum Pad' : 'Toggle Fretboard'}
          >
            <Piano className="h-4 w-4" />
          </button>
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors',
            isDirty ? 'bg-primary text-on-primary hover:bg-primary/90' : 'text-on-surface-variant hover:bg-surface-container-high',
          )}
          title={compositionId && isDirty ? 'Save (⌘S)' : 'Save to library (⌘S)'}
          aria-label="Save"
        >
          <Save className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden xl:inline">{isDirty ? 'Save*' : 'Saved'}</span>
          {isDirty && <span className="xl:hidden">*</span>}
        </button>

        {/* Overflow menu — one pattern at every width. It used to be mobile
            only, with a second, desktop-only row of buttons beside it; that row
            is what overflowed, and it also declared a duplicate pair of hidden
            file inputs that stole `fileInputRef` from this one. */}
        <div className="flex items-center gap-1 shrink-0">
          <input ref={fileInputRef} type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.alphatex,.tex" className="hidden" onChange={handleImportFile} />
          <input ref={psarcFileInputRef} type="file" accept=".psarc" className="hidden" onChange={handleImportPsarc} />
          <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
                title="More actions"
                aria-label="More actions"
                data-print-hide
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" className="min-w-[200px] max-h-[70vh] overflow-y-auto">
              <DropdownMenuItem onClick={handleNewTab}><Plus className="h-4 w-4 mr-2" />New tab</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleStaveModeToggle} disabled={activeTrackIsDrums}>
                <Eye className="h-4 w-4 mr-2" />View: {activeTrackIsDrums ? 'Score' : staveMode === 'tab' ? 'Tab' : staveMode === 'notation' ? 'Score' : 'Both'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleFingering} disabled={activeTrackIsDrums}>
                <Hand className="h-4 w-4 mr-2" />Fingering: {showFingering ? 'On' : 'Off'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleMode}>
                {isEditMode ? <Eye className="h-4 w-4 mr-2" /> : <Pencil className="h-4 w-4 mr-2" />}
                Switch to {isEditMode ? 'View' : 'Edit'} mode
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleLoop}>
                <Repeat className="h-4 w-4 mr-2" />{loopRange ? `Clear loop (${formatLoopRange(loopRange)})` : 'Loop current bar'}
              </DropdownMenuItem>
              {isEditMode && (
                <DropdownMenuItem onClick={() => handleAutoRightHandFingering('track')} disabled={activeTrackIsDrums}>
                  <Hand className="h-4 w-4 mr-2" />Add right-hand fingering
                </DropdownMenuItem>
              )}
              {!activeTrackIsDrums && isEditMode && (
                <DropdownMenuItem onClick={() => setShowChordFinder(true)}><Search className="h-4 w-4 mr-2" />Chord Finder</DropdownMenuItem>
              )}
              {isEditMode && (
                <DropdownMenuItem onClick={() => setShowFretboard(!showFretboard)}>
                  <Piano className="h-4 w-4 mr-2" />{showFretboard ? 'Hide' : 'Show'} {activeTrackIsDrums ? 'Drum Pad' : 'Fretboard'}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {!compositionId && !isDirty && (
                <>
                  <DropdownMenuItem onClick={handleLoadGuitarDemo}><BookOpen className="h-4 w-4 mr-2" />Guitar Demo</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLoadBassDemo}><BookOpen className="h-4 w-4 mr-2" />Bass Demo</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLoadDrumsDemo}><BookOpen className="h-4 w-4 mr-2" />Drums Demo</DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Import GP/AlphaTex...</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setMoreMenuOpen(false); setShowAsciiImport(true); }}><Upload className="h-4 w-4 mr-2" />Import ASCII Tab...</DropdownMenuItem>
              <DropdownMenuItem onClick={() => psarcFileInputRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Import PSARC...</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void handleExport('gp7')}><Download className="h-4 w-4 mr-2" />Export Guitar Pro</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExport('alphatex')}><Download className="h-4 w-4 mr-2" />Export AlphaTex</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExport('ascii')}><Download className="h-4 w-4 mr-2" />Export ASCII Tab</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExportPdf()} disabled={!isReady || exportingPdf}><Printer className="h-4 w-4 mr-2" />Export PDF</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowYoutubePanel(v => !v)}>
                <Youtube className="h-4 w-4 mr-2" />YouTube sync
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowHelp(true)}><HelpCircle className="h-4 w-4 mr-2" />Help</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => setIsSidebarOpen(v => !v)}
            className="lg:hidden p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
            title={isSidebarOpen ? 'Close panel' : 'Open panel'}
            aria-label={isSidebarOpen ? 'Close panel' : 'Open panel'}
          >
            {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile touch navigation bar */}
      <div className="lg:hidden flex items-center justify-between px-2 py-1 bg-surface-container border-b border-outline-variant/20 shrink-0">
        <div className="flex items-center gap-0.5">
          <button onClick={moveToPrevMeasure} className="p-2 rounded-lg hover:bg-surface-container-high active:bg-surface-container-highest transition-colors text-on-surface-variant" title="Previous measure">
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button onClick={moveLeft} className="p-2 rounded-lg hover:bg-surface-container-high active:bg-surface-container-highest transition-colors text-on-surface-variant" title="Previous beat">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={moveRight} className="p-2 rounded-lg hover:bg-surface-container-high active:bg-surface-container-highest transition-colors text-on-surface-variant" title="Next beat">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={moveToNextMeasure} className="p-2 rounded-lg hover:bg-surface-container-high active:bg-surface-container-highest transition-colors text-on-surface-variant" title="Next measure">
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={moveUp} className="p-2 rounded-lg hover:bg-surface-container-high active:bg-surface-container-highest transition-colors text-on-surface-variant" title="String up">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button onClick={moveDown} className="p-2 rounded-lg hover:bg-surface-container-high active:bg-surface-container-highest transition-colors text-on-surface-variant" title="String down">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          {isEditMode ? (
            <>
              <button onClick={handleUndo} className="p-2 rounded-lg hover:bg-surface-container-high active:bg-surface-container-highest transition-colors text-on-surface-variant" title="Undo">
                <Undo2 className="h-4 w-4" />
              </button>
              <button onClick={handleRedo} className="p-2 rounded-lg hover:bg-surface-container-high active:bg-surface-container-highest transition-colors text-on-surface-variant" title="Redo">
                <Redo2 className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              onClick={handleToggleLoop}
              className={cn(
                'p-2 rounded-lg transition-colors',
                loopRange ? 'text-amber-500 bg-amber-500/15' : 'text-on-surface-variant hover:bg-surface-container-high',
              )}
              title={loopRange ? 'Clear loop' : 'Loop current bar'}
            >
              <Repeat className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* YouTube Panel */}
      {showYoutubePanel && (
        <div className="flex items-start gap-3 px-4 py-2 bg-surface-container-low border-b border-outline-variant/20">
          {youtubeVideoId ? (
            <>
              <div
                className={cn(
                  'overflow-hidden border bg-black shrink-0 relative group',
                  youtubeFullscreen
                    ? 'fixed inset-0 z-[9999] rounded-none border-none'
                    : 'rounded-lg',
                )}
                style={youtubeFullscreen ? undefined : {width: 320, height: 180}}
              >
                <YouTubePlayer
                  ref={youtubePlayerRef}
                  videoId={youtubeVideoId}
                  muted={audioSource !== 'youtube'}
                  onReady={handleSelectedYoutubeReady}
                  onStateChange={handleYoutubeStateChange}
                  className="w-full h-full"
                />
                <button
                  onClick={() => setYoutubeFullscreen(v => !v)}
                  className="absolute top-2 right-2 p-1.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                  title={youtubeFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {youtubeFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-on-surface-variant truncate flex-1">{youtubeUrl}</span>
                  <button
                    onClick={handleYoutubeRemove}
                    className="p-1 rounded hover:bg-surface-container-high transition-colors text-on-surface-variant shrink-0"
                    title="Remove YouTube video"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-on-surface-variant">Offset</span>
                    <span className="text-xs font-mono text-on-surface-variant">
                      {youtubeOffsetMs >= 0 ? '+' : ''}{(youtubeOffsetMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleYoutubeOffsetChange(youtubeOffsetMs - 100)}
                      className="text-xs px-1.5 py-0.5 rounded border border-outline-variant/30 hover:bg-surface-container-high transition-colors"
                    >-</button>
                    <input
                      type="range"
                      min={-10000}
                      max={10000}
                      step={100}
                      value={youtubeOffsetMs}
                      onChange={e => handleYoutubeOffsetChange(Number(e.target.value))}
                      className="flex-1"
                    />
                    <button
                      onClick={() => handleYoutubeOffsetChange(youtubeOffsetMs + 100)}
                      className="text-xs px-1.5 py-0.5 rounded border border-outline-variant/30 hover:bg-surface-container-high transition-colors"
                    >+</button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 w-full">
              <Youtube className="h-4 w-4 text-on-surface-variant shrink-0" />
              <input
                type="text"
                placeholder="Paste YouTube URL and press Enter..."
                value={youtubeUrlInput}
                onChange={e => setYoutubeUrlInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleYoutubeUrlSubmit(); }}
                className="flex-1 text-xs px-2 py-1 rounded border border-outline-variant/30 bg-surface-container"
              />
              <button
                onClick={handleYoutubeUrlSubmit}
                className="text-xs px-3 py-1 rounded bg-primary text-on-primary hover:bg-primary/90 transition-colors"
              >
                Link
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 min-h-0 relative">
        {isSidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
        )}

        {/* On desktop the sidebar can be collapsed away entirely so the tab gets
            the full width; on mobile it stays the slide-over drawer. */}
        <div className={cn(
          'shrink-0 z-40 transition-transform duration-300 ease-in-out',
          'fixed inset-y-0 left-0 lg:static lg:translate-x-0',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed && 'lg:hidden',
        )}
          style={{
            paddingTop: 'var(--sat)',
            paddingBottom: 'var(--sab)',
          }}
        >
          <TabEditorSidebar
            tracks={tracks}
            activeTrackIndex={activeTrackIndex}
            compositionId={compositionId ?? null}
            onTrackSelect={(i) => { handleTrackSelect(i); setIsSidebarOpen(false); }}
            onAddTrack={handleAddTrack}
            onRemoveTrack={handleRemoveTrack}
            onToggleMute={handleToggleMute}
            mutedTracks={mutedTracks}
            onTuningChange={handleTuningChange}
            tempo={tempo}
            onTempoChange={handleTempoChange}
            title={title}
            onTitleChange={handleTitleChangeGuarded}
            artist={artist}
            onArtistChange={handleArtistChangeGuarded}
            stemPlayer={stemPlayer}
            sections={sections}
            detectedPatterns={detectedPatterns}
            totalBars={totalBarsMemo}
            practiceRange={practiceRange}
            onDetectPatterns={handleDetectPatterns}
            onAddSection={handleAddSectionGuarded}
            onRemoveSection={handleRemoveSectionGuarded}
            onPracticeRange={handlePracticeRange}
            onJumpToBar={handleJumpToBar}
            showPatternColors={showPatternColors}
            onTogglePatternColors={handleTogglePatternColors}
            selectedKey={selectedKey}
            onKeyChange={handleKeyChange}
            onOpenKeyChart={() => setShowKeyChart(true)}
            showFingering={showFingering}
            onToggleFingering={handleToggleFingering}
            onAutoRightHandFingering={handleAutoRightHandFingering}
            onClearTrackFingering={handleClearTrackFingering}
            hasBarSelection={selectedBarRange != null}
            showStrumming={showStrumming}
            onToggleStrumming={handleToggleStrumming}
            readOnly={!isEditMode}
          />
        </div>

        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {/* Strumming pattern strip — renders nothing for a fingerpicked score */}
          {showStrumming && scoreRef.current && (
            <StrummingPatternPanel
              score={scoreRef.current}
              trackIndex={activeTrackIndex}
              version={scoreMutationVersion}
              currentBarIndex={cursor.barIndex}
              orientation="horizontal"
              className="px-4 py-2 border-b border-outline-variant/20 bg-surface-container-lowest shrink-0"
            />
          )}
          <div
            ref={canvasScrollRef}
            className="flex-1 min-h-0 overflow-y-auto p-4"
          >
            <TabEditorCanvas
              ref={canvasRef}
              cursorBounds={cursorBounds}
              cursorStringNumber={cursor.stringNumber}
              cursorStringCount={
                activeTrackIsDrums
                  ? DRUM_LANE_COUNT
                  : scoreRef.current?.tracks[cursor.trackIndex]?.staves[0]?.stringTuning?.tunings?.length ?? 6
              }
              sectionLabels={sectionLabels}
              patternOverlays={mergedPatternOverlays}
              onScoreLoaded={handleScoreLoaded}
              onApiReady={api => {
                apiRef.current = api;
                api.masterVolume = audioSource === 'tracks' ? 1 : 0;
              }}
              onRenderFinished={handleRenderFinished}
              onPostRenderFinished={handlePostRenderFinished}
              onBeatMouseDown={handleBeatClickWithSeek}
              onBeatMouseUp={handleBeatMouseUp}
              onNoteMouseDown={handleNoteClick}
              onPlayerStateChanged={handlePlayerStateChanged}
              onPlayerReady={handlePlayerReady}
              onPlayerFinished={handlePlayerFinished}
              onPositionChanged={handlePositionChanged}
              onActiveBeatsChanged={handleActiveBeatsChanged}
              staveMode={staveMode}
            />
          </div>

          {showFretboard && isEditMode && (
            <div className="shrink-0 shadow-lg shadow-black/30">
              {activeTrackIsDrums ? (
                <DrumPadGrid
                  onDrumHit={handleDrumHit}
                  onAdvance={handleDrumAdvance}
                  onClose={() => setShowFretboard(false)}
                />
              ) : (
                <FretboardGrid
                  tuning={currentTuning}
                  activeString={cursor.stringNumber}
                  onFretClick={handleFretClick}
                  onClose={() => setShowFretboard(false)}
                  maxFret={MAX_FRET}
                  scaleNotes={selectedKey ? getKeyInfo(selectedKey)?.scaleNotes : undefined}
                  rootNote={selectedKey ?? undefined}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Note entry chrome — edit mode only, so practising gets the height. */}
      {isEditMode && (
      <NoteInputPanel
        currentDuration={currentDuration}
        onDurationChange={handleDurationChange}
        onEffectToggle={handleEffectToggle}
        onDotToggle={handleDotToggle}
        onRestInsert={handleRestInsert}
        onAddMeasure={handleAddMeasure}
        onDeleteMeasure={handleDeleteMeasure}
        currentChordName={currentChordName}
        onChordNameCommit={handleChordNameCommit}
        onChordClear={handleChordClear}
        onOpenChordFinder={() => setShowChordFinder(true)}
        isDrumTrack={activeTrackIsDrums}
        fingering={currentFingering}
        onRightHandFinger={handleRightHandFinger}
        onLeftHandFinger={handleLeftHandFinger}
        onClearFingering={handleClearNoteFingering}
      />
      )}

      {/* Status bar — desktop only. Read-outs live here, never in the toolbar:
          the track, the mode, the saved BPM, the practice speed, the loop and
          the cursor. Only the track label may shrink; everything else is
          `whitespace-nowrap` so nothing can wrap mid-value. */}
      <div className="hidden lg:flex items-center gap-4 px-4 py-1.5 bg-surface-container-low border-t border-outline-variant/20 text-xs text-on-surface-variant">
        <span className="truncate min-w-0">{tracks[activeTrackIndex]?.name ?? 'Guitar'} — {tracks[activeTrackIndex]?.tuningName ?? 'Standard'}</span>
        <span className={cn('whitespace-nowrap shrink-0', isEditMode ? 'text-tertiary font-semibold' : 'text-primary font-semibold')}>
          {isEditMode ? 'Edit mode' : 'View mode — score locked'}
        </span>
        <span className="whitespace-nowrap shrink-0">{tempo} BPM (saved)</span>
        <span className="font-mono whitespace-nowrap shrink-0 tabular-nums">
          Bar {cursor.barIndex + 1} · Beat {cursor.beatIndex + 1} · {stringLabel}
        </span>
        {effectivePlaybackSpeed !== DEFAULT_PLAYBACK_SPEED && (
          <span className="text-tertiary whitespace-nowrap shrink-0 hidden xl:inline">
            Practice speed {effectivePlaybackSpeed}% — playback only, not saved
          </span>
        )}
        {loopRange && <span className="text-amber-500 whitespace-nowrap shrink-0">Loop {formatLoopRange(loopRange)}</span>}
        <div className="flex-1 min-w-0" />
        <button onClick={() => setShowHelp(true)} className="hidden xl:inline whitespace-nowrap shrink-0 hover:text-on-surface transition-colors">
          Press ? for keyboard shortcuts
        </button>
      </div>

      <KeyChartDialog
        open={showKeyChart}
        selectedKey={selectedKey}
        onSelectKey={handleKeyChange}
        onClose={() => setShowKeyChart(false)}
      />
      <EditorHelpDialog open={showHelp} onOpenChange={setShowHelp} />
      <ChordFinderDialog
        open={showChordFinder}
        onOpenChange={setShowChordFinder}
        onSelectChord={handleChordSelect}
      />
      <SaveCompositionDialog
        open={showSaveDialog}
        onOpenChange={handleSaveDialogOpenChange}
        initialMeta={{
          title,
          artist,
          album: scoreRef.current?.album ?? '',
          tempo,
          instrument: tracks[activeTrackIndex]?.instrument ?? 'guitar',
          previewImage: pendingPreviewImage,
          youtubeUrl: youtubeUrl || null,
        }}
        onSave={handleSaveComposition}
      />
      <UnsavedChangesDialog
        isOpen={showNewTabConfirm}
        onCancel={() => setShowNewTabConfirm(false)}
        onDiscard={() => { setShowNewTabConfirm(false); _editorScoreCache.delete('new'); doNewTab(); }}
        onSave={() => { setShowNewTabConfirm(false); proceedAfterSaveRef.current = doNewTab; setShowSaveDialog(true); }}
      />
      <UnsavedChangesDialog
        isOpen={blocker.state === 'blocked' && !isResolvingBlockedNavigation}
        onCancel={handleBlockedNavigationCancel}
        onDiscard={handleBlockedNavigationDiscard}
        onSave={handleBlockedNavigationSave}
      />

      {/* ASCII Import Dialog */}
      {showAsciiImport && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 cursor-pointer"
          onPointerDown={e => { if (e.target === e.currentTarget) closeAsciiImport(); }}
        >
          <div className="min-h-full flex items-center justify-center p-4">
            <div
              className="bg-surface-container-high rounded-xl shadow-xl p-4 sm:p-6 w-full max-w-[600px] flex flex-col gap-4 cursor-default"
              onPointerDown={e => e.stopPropagation()}
            >
            <h2 className="text-sm font-semibold text-on-surface">Import ASCII Tab</h2>
            <div className="flex flex-col gap-3">
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs text-on-surface-variant">Title</label>
                <input
                  type="text"
                  value={asciiImportTitle}
                  onChange={e => { asciiTitleManual.current = true; setAsciiImportTitle(e.target.value); }}
                  placeholder="Song title"
                  className="bg-surface-container border border-outline-variant/40 rounded-lg px-3 py-1.5 text-xs text-on-surface outline-none focus:border-primary"
                />
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs text-on-surface-variant">Artist</label>
                <input
                  type="text"
                  value={asciiImportArtist}
                  onChange={e => { asciiArtistManual.current = true; setAsciiImportArtist(e.target.value); }}
                  placeholder="Artist name"
                  className="bg-surface-container border border-outline-variant/40 rounded-lg px-3 py-1.5 text-xs text-on-surface outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-on-surface-variant">Paste ASCII tab below</label>
              <textarea
                value={asciiImportText}
                onChange={e => {
                  const val = e.target.value;
                  setAsciiImportText(val);
                  const meta = extractAsciiTabMeta(val);
                  if (meta.title && !asciiTitleManual.current) setAsciiImportTitle(meta.title);
                  if (meta.artist && !asciiArtistManual.current) setAsciiImportArtist(meta.artist);
                }}
                placeholder={"Title: Song Name\nArtist: Artist Name\nTempo: 120\nYouTube: https://youtu.be/...\nThumbnail: https://...\n\ne|---0---2---3---|\nB|---1---3---3---|\nG|---0---2---0---|\nD|---2---0---0---|\nA|---3-------2---|\nE|-----------3---|"}
                rows={8}
                className="bg-surface-container border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface font-mono outline-none focus:border-primary resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={closeAsciiImport}
                className="px-4 py-1.5 text-xs rounded-lg bg-surface-container hover:bg-surface-container-highest transition-colors text-on-surface"
              >
                Cancel
              </button>
              <button
                onClick={handleImportAscii}
                disabled={!asciiImportText.trim()}
                className="px-4 py-1.5 text-xs rounded-lg bg-primary text-on-primary hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Import
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
