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
import {getDefaultTuningPreset} from '@/lib/tab-editor/tunings';
import {
  setNoteAndAdvance,
  setChord,
  toggleDrumNote,
  insertRest,
  setBeatDuration,
  toggleDot,
  toggleEffect,
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
  setBeatChord,
  clearBeatChord,
  getBeatChordName,
  type NoteEffect,
  type TabSection,
} from '@/lib/tab-editor/scoreOperations';
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
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {useHideHeaderOnMobile, useHideBottomNavOnMobile} from '@/contexts/LayoutContext';
import {useAlphaTabPrint} from '@/hooks/usePrint';
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
  const [showKeyChart, setShowKeyChart] = useState(false);
  const [showYoutubePanel, setShowYoutubePanel] = useState(false);
  const [youtubeFullscreen, setYoutubeFullscreen] = useState(false);
  const ytSyncSuppressRef = useRef(false);
  const [resetKey, setResetKey] = useState(0);
  const [showNewTabConfirm, setShowNewTabConfirm] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const {isDirty, markDirty, markClean, blocker} = useUnsavedChanges();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedBarRange, setSelectedBarRange] = useState<{start: number; end: number} | null>(null);
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
  } = useYoutubeSync({songKey, clockRef, tempo: 1.0});

  const getApi = useCallback((): AlphaTabApi | null => {
    return canvasRef.current?.alphaTab?.getApi() ?? apiRef.current;
  }, []);

  // ── YouTube suppress helper ────────────────────────────────────────────────
  const suppressYoutubeSync = useCallback((durationMs = 800) => {
    ytSyncSuppressRef.current = true;
    setTimeout(() => { ytSyncSuppressRef.current = false; }, durationMs);
  }, [ytSyncSuppressRef]);

  // ── Playback Engine ────────────────────────────────────────────────────────
  // commitMutation is defined below but usePlaybackEngine needs onRenderNeeded.
  // We use stable refs to break forward-reference cycles.
  const commitMutationRef = useRef<() => void>(() => { /* stub, replaced below */ });
  // Forward refs for functions defined after playbackEngine
  const setPracticeRangeRef = useRef<((r: {startBar: number; endBar: number} | null) => void)>(() => { /* stub */ });
  const practiceRangeRef = useRef<{startBar: number; endBar: number} | null>(null);
  const initScoreRef = useRef<() => Promise<void>>(async () => { /* stub */ });
  const updateCursorBoundsRef = useRef<() => void>(() => { /* stub */ });
  const computeSectionLabelsRef = useRef<() => void>(() => { /* stub */ });
  const computePatternOverlaysRef = useRef<() => void>(() => { /* stub */ });

  const playbackEngine = usePlaybackEngine({
    apiRef,
    scoreRef,
    stemPlayer,
    canvasScrollRef,
    canvasRef: canvasRef as React.MutableRefObject<{alphaTab: {stop: () => void; clearPlaybackRange: () => void} | null} | null>,
    onRenderNeeded: () => { commitMutationRef.current(); },
    getApi,
    onPlaybackStarted: () => {
      suppressYoutubeSync();
      youtubeSyncRef.current?.onResume();
    },
    onPlaybackPaused: () => {
      suppressYoutubeSync();
      youtubeSyncRef.current?.onPause();
    },
    onStop: () => { setPracticeRangeRef.current(null); },
    onRenderFinished: () => {
      void initScoreRef.current();
      updateCursorBoundsRef.current();
      computeSectionLabelsRef.current();
      computePatternOverlaysRef.current();
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
    handleYoutubeStateChange,
    handleRenderFinished,
    startSeekTo,
    markPlaying,
    unmount,
  } = playbackEngine;

  // Mirror isPlaying state into the local ref so clockRef getter stays current
  isPlayingLocalRef.current = isPlaying;
  // Mirror positionRef into positionLocalRef so clockRef has a stable target
  positionLocalRef.current = positionRef.current;

  // ── Stop (no-arg wrapper so button onClick does not receive a MouseEvent) ──
  const handleStop = useCallback(() => { _engineHandleStop(); }, [_engineHandleStop]);

  useEffect(() => {
    if (stemPlayer.stemsReady) {
      isPlaying ? void stemPlayer.play() : void stemPlayer.pause();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, stemPlayer.stemsReady]);

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
    const api = getApi();
    const wasPlaying = isPlayingRef.current;
    if (!wasPlaying && !renderFinishedRef.current && api) {
      writePlaybackDiag('renderFinished:transport');
      handleRenderFinished();
    }
    writePlaybackDiag('transport:playPause');
    _engineHandlePlayPause();
    if (!wasPlaying && api?.isReadyForPlayback) {
      markPlaying();
      window.setTimeout(() => {
        if (getApi()?.isReadyForPlayback) {
          markPlaying();
        }
      }, 150);
      window.setTimeout(() => {
        if (getApi()?.isReadyForPlayback) {
          markPlaying();
        }
      }, 1000);
    }
  }, [_engineHandlePlayPause, getApi, handleRenderFinished, isPlayingRef, markPlaying, renderFinishedRef, writePlaybackDiag]);

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
      prepareForScoreRender();
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
      // Percussion staves don't carry tablature; force StaveProfile.Score so the
      // first render produces a visible stave (StaveProfile.Tab on drums => empty
      // layout => `group.staves` undefined crash).
      const firstTrackIsDrums = score.tracks[0]?.staves[0]?.isPercussion ?? false;
      api.settings.display.staveProfile = firstTrackIsDrums
        ? StaveProfile.Score
        : staveMode === 'tab' ? StaveProfile.Tab
        : staveMode === 'notation' ? StaveProfile.Score
        : StaveProfile.Default;
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
    showExportMenu, setShowExportMenu,
    showDemoMenu, setShowDemoMenu,
    showImportMenu, setShowImportMenu,
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
      const tuningName = staff?.stringTuning?.name ?? 'Custom';
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
    onStartPlaybackAtBar: useCallback((startBar: number) => {
      const score = scoreRef.current;
      if (!score) return;
      const {endTick} = tickMappingRef.current;
      const startTick = barIndexToTick(score, startBar, totalBarsMemo, endTick);
      const rangeEndTick = barIndexToTick(score, practiceRangeRef.current?.endBar ?? (score.masterBars.length - 1) + 1, totalBarsMemo, endTick);
      canvasRef.current?.alphaTab?.setPlaybackRange(startTick, rangeEndTick);
      if (!requestAlphaTabPlay(startTick)) {
        loadMidiForCurrentScore();
        pollPlaybackReady();
      }
    }, [loadMidiForCurrentScore, pollPlaybackReady, requestAlphaTabPlay, tickMappingRef, totalBarsMemo]),
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
  practiceRangeRef.current = practiceRange;
  updateCursorBoundsRef.current = updateCursorBounds;
  computeSectionLabelsRef.current = computeSectionLabels;
  computePatternOverlaysRef.current = computePatternOverlays;

  // ── Bar selection overlays ────────────────────────────────────────────────
  const [selectedBarOverlays, setSelectedBarOverlays] = useState<PatternOverlay[]>([]);
  useEffect(() => {
    if (!selectedBarRange) {
      setSelectedBarOverlays([]);
      return;
    }
    const api = getApi();
    if (!api?.boundsLookup) return;
    const overlays: PatternOverlay[] = [];
    for (const system of api.boundsLookup.staffSystems) {
      for (const barBounds of system.bars) {
        const idx = barBounds.index;
        if (idx >= selectedBarRange.start && idx <= selectedBarRange.end) {
          const {x, y, w, h} = barBounds.visualBounds;
          overlays.push({x, y, w, h, color: '#3b82f6', label: ''});
        }
      }
    }
    setSelectedBarOverlays(overlays);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBarRange, scoreMutationVersion]);

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
    const restored = undoManagerRef.current.undo(score);
    if (restored) applyUndoRedo(restored);
    else toast('Nothing to undo');
  }, [applyUndoRedo]);

  const handleRedo = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    const restored = undoManagerRef.current.redo(score);
    if (restored) applyUndoRedo(restored);
    else toast('Nothing to redo');
  }, [applyUndoRedo]);

  // ── Bar selection ─────────────────────────────────────────────────────────
  const handleSelectAllBars = useCallback(() => {
    const total = scoreRef.current?.masterBars.length ?? 0;
    if (total > 0) setSelectedBarRange({start: 0, end: total - 1});
  }, []);

  const handleClearSelectedBars = useCallback(() => {
    const score = scoreRef.current;
    if (!score || !selectedBarRange) return;
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
    if (!stemPlayer.stemsReady || stemPlayer.duration <= 0) return;
    const score = scoreRef.current;
    if (!score) return;
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
    commitMutation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stemPlayer.stemsReady, stemPlayer.duration]);

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
    const score = scoreRef.current;
    if (!score) return;
    setTrackTuning(score, trackIndex, tuning);
    commitMutation();
  }, [commitMutation]);

  const handleTempoChange = useCallback((bpm: number) => {
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
    handleBeforeMutation();
    toggleDrumNote(score, cursor, midiNote);
    const beat = score.tracks[cursor.trackIndex]?.staves[0]?.bars[cursor.barIndex]?.voices[cursor.voiceIndex]?.beats[cursor.beatIndex];
    if (beat) beat.duration = currentDuration;
    commitMutation();
  }, [cursor, commitMutation, currentDuration, handleBeforeMutation]);

  const handleDrumAdvance = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
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
    handleBeforeMutation();
    setBeatChord(score, cursor, name);
    commitMutation();
  }, [cursor, commitMutation, handleBeforeMutation]);

  const handleChordClear = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    handleBeforeMutation();
    clearBeatChord(score, cursor);
    commitMutation();
  }, [cursor, commitMutation, handleBeforeMutation]);

  const handleDurationChange = useCallback((duration: number) => {
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
    if (effect === 'slide') toggleSlide(score, cursor);
    else if (effect === 'bend') toggleBend(score, cursor);
    else toggleEffect(score, cursor, effect);
    commitMutation();
  }, [cursor, commitMutation]);

  const handleDotToggle = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    toggleDot(score, cursor);
    commitMutation();
  }, [cursor, commitMutation]);

  const handleRestInsert = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    const next = insertRest(score, cursor, currentDuration);
    commitMutation();
    if (next) moveTo(next);
  }, [cursor, currentDuration, commitMutation, moveTo]);

  const handleAddMeasure = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    insertMeasureAfter(score, cursor.barIndex);
    commitMutation();
  }, [cursor.barIndex, commitMutation]);

  const handleDeleteMeasure = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    deleteMeasure(score, cursor.barIndex);
    commitMutation();
  }, [cursor.barIndex, commitMutation]);

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

  const handlePrint = useAlphaTabPrint(getApi);

  // ── Derived values ────────────────────────────────────────────────────────
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
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-surface-container border-b border-outline-variant/20"
        style={{paddingTop: 'max(var(--sat), 0.5rem)'}}
      >
        <button
          onClick={() => navigate((location.state as LocationState | null)?.from ?? '/guitar', {state: {activeTab: (location.state as LocationState | null)?.activeTab}})}
          className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-bold text-on-surface hidden lg:block">Tab Editor</h1>
        </div>

        <div className="w-px h-6 bg-outline-variant/30" />

        {/* Transport */}
        <div className="flex items-center gap-1">
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

        <div className="hidden lg:block w-px h-6 bg-outline-variant/30" />
        <div className="hidden lg:block text-xs text-on-surface-variant font-mono">
          Bar {cursor.barIndex + 1} | Beat {cursor.beatIndex + 1} | {stringLabel}
        </div>

        <div className="flex-1" />

        {/* Save */}
        <button
          onClick={handleSave}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
            isDirty ? 'bg-primary text-on-primary hover:bg-primary/90' : 'text-on-surface-variant hover:bg-surface-container-high',
          )}
          title={compositionId && isDirty ? 'Save (⌘S)' : 'Save to library (⌘S)'}
        >
          <Save className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">{isDirty ? 'Save*' : 'Saved'}</span>
          {isDirty && <span className="lg:hidden">*</span>}
        </button>

        {/* Desktop-only secondary buttons */}
        <div className="hidden lg:flex items-center gap-1">
          <button onClick={handleNewTab} className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant" title="New tab">
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={handleStaveModeToggle}
            disabled={activeTrackIsDrums}
            className={cn('px-2 py-1 rounded text-[10px] font-medium transition-colors', activeTrackIsDrums ? 'text-on-surface-variant/30 cursor-not-allowed' : 'text-on-surface-variant hover:bg-surface-container-high')}
            title={activeTrackIsDrums ? 'Percussion tracks use score notation only' : 'Toggle view: Tab / Notation / Both'}
          >
            <Eye className="h-3.5 w-3.5 inline mr-1" />
            {activeTrackIsDrums ? 'Score' : staveMode === 'tab' ? 'Tab' : staveMode === 'notation' ? 'Score' : 'Both'}
          </button>
          {!activeTrackIsDrums && (
            <button onClick={() => setShowChordFinder(true)} className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant" title="Chord Finder (Cmd+K)">
              <Search className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setShowFretboard(!showFretboard)}
            className={cn('p-2 rounded-lg transition-colors', showFretboard ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-high')}
            title={activeTrackIsDrums ? 'Toggle Drum Pad' : 'Toggle Fretboard'}
          >
            <Piano className="h-4 w-4" />
          </button>
          {!compositionId && !isDirty && (
            <div className="relative">
              <button onClick={() => { setShowDemoMenu(!showDemoMenu); setShowExportMenu(false); }} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors" title="Load demo tabs">
                <BookOpen className="h-3.5 w-3.5" />Demos<ChevronDown className="h-3 w-3" />
              </button>
              {showDemoMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowDemoMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-40 bg-surface-container-high border border-outline-variant/30 rounded-lg shadow-lg py-1 min-w-[140px]">
                    <button onClick={() => { handleLoadGuitarDemo(); setShowDemoMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors">Guitar Demo</button>
                    <button onClick={() => { handleLoadBassDemo(); setShowDemoMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors">Bass Demo</button>
                    <button onClick={() => { handleLoadDrumsDemo(); setShowDemoMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors">Drums Demo</button>
                  </div>
                </>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.alphatex,.tex" className="hidden" onChange={handleImportFile} />
          <input ref={psarcFileInputRef} type="file" accept=".psarc" className="hidden" onChange={handleImportPsarc} />
          <div className="relative">
            <button onClick={() => { setShowImportMenu(!showImportMenu); setShowExportMenu(false); setShowDemoMenu(false); }} className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant" title="Import">
              <Upload className="h-4 w-4" />
            </button>
            {showImportMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowImportMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 bg-surface-container-high border border-outline-variant/30 rounded-lg shadow-lg py-1 min-w-[180px]">
                  <button onClick={() => { fileInputRef.current?.click(); setShowImportMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors">GP / AlphaTex file...</button>
                  <button onClick={() => { setShowAsciiImport(true); setShowImportMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors">ASCII Tab text...</button>
                  <button onClick={() => { psarcFileInputRef.current?.click(); setShowImportMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors">PSARC file...</button>
                </div>
              </>
            )}
          </div>
          <div className="relative">
            <button onClick={() => { setShowExportMenu(!showExportMenu); setShowDemoMenu(false); }} className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant" title="Export">
              <Download className="h-4 w-4" />
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 bg-surface-container-high border border-outline-variant/30 rounded-lg shadow-lg py-1 min-w-[160px]">
                  <button onClick={() => void handleExport('gp7')} className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors">Guitar Pro (.gp)</button>
                  <button onClick={() => void handleExport('alphatex')} className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors">AlphaTex (.alphatex)</button>
                  <button onClick={() => void handleExport('ascii')} className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors">ASCII Tab (.txt)</button>
                </div>
              </>
            )}
          </div>
          <button onClick={handlePrint} disabled={!isReady} className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-40 disabled:cursor-not-allowed" title="Print / Save as PDF" data-print-hide>
            <Printer className="h-4 w-4" />
          </button>
          <button onClick={() => setShowHelp(true)} className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant" title="Help (?)">
            <HelpCircle className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowYoutubePanel(v => !v)}
            className={cn('p-2 rounded-lg transition-colors', (showYoutubePanel || youtubeVideoId) ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-high')}
            title="YouTube sync"
          >
            <Youtube className="h-4 w-4" />
          </button>
        </div>

        {/* Mobile overflow menu */}
        <div className="lg:hidden flex items-center gap-1">
          <input ref={fileInputRef} type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.alphatex,.tex" className="hidden" onChange={handleImportFile} />
          <input ref={psarcFileInputRef} type="file" accept=".psarc" className="hidden" onChange={handleImportPsarc} />
          <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" className="min-w-[200px] max-h-[70vh] overflow-y-auto">
              <DropdownMenuItem onClick={handleNewTab}><Plus className="h-4 w-4 mr-2" />New tab</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleStaveModeToggle} disabled={activeTrackIsDrums}>
                <Eye className="h-4 w-4 mr-2" />View: {activeTrackIsDrums ? 'Score' : staveMode === 'tab' ? 'Tab' : staveMode === 'notation' ? 'Score' : 'Both'}
              </DropdownMenuItem>
              {!activeTrackIsDrums && (
                <DropdownMenuItem onClick={() => setShowChordFinder(true)}><Search className="h-4 w-4 mr-2" />Chord Finder</DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setShowFretboard(!showFretboard)}>
                <Piano className="h-4 w-4 mr-2" />{showFretboard ? 'Hide' : 'Show'} {activeTrackIsDrums ? 'Drum Pad' : 'Fretboard'}
              </DropdownMenuItem>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowYoutubePanel(v => !v)}>
                <Youtube className="h-4 w-4 mr-2" />YouTube sync
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowHelp(true)}><HelpCircle className="h-4 w-4 mr-2" />Help</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => setIsSidebarOpen(v => !v)}
            className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
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
          <button onClick={handleUndo} className="p-2 rounded-lg hover:bg-surface-container-high active:bg-surface-container-highest transition-colors text-on-surface-variant" title="Undo">
            <Undo2 className="h-4 w-4" />
          </button>
          <button onClick={handleRedo} className="p-2 rounded-lg hover:bg-surface-container-high active:bg-surface-container-highest transition-colors text-on-surface-variant" title="Redo">
            <Redo2 className="h-4 w-4" />
          </button>
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
                  onReady={handleYoutubeReady}
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

        <div className={cn(
          'shrink-0 z-40 transition-transform duration-300 ease-in-out',
          'fixed inset-y-0 left-0 lg:static lg:translate-x-0',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
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
            onTitleChange={handleTitleChange}
            artist={artist}
            onArtistChange={handleArtistChange}
            stemPlayer={stemPlayer}
            sections={sections}
            detectedPatterns={detectedPatterns}
            totalBars={totalBarsMemo}
            practiceRange={practiceRange}
            onDetectPatterns={handleDetectPatterns}
            onAddSection={handleAddSection}
            onRemoveSection={handleRemoveSection}
            onPracticeRange={handlePracticeRange}
            onJumpToBar={handleJumpToBar}
            showPatternColors={showPatternColors}
            onTogglePatternColors={handleTogglePatternColors}
            selectedKey={selectedKey}
            onKeyChange={setSelectedKey}
            onOpenKeyChart={() => setShowKeyChart(true)}
          />
        </div>

        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
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

          {showFretboard && (
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
      />

      {/* Status bar — desktop only */}
      <div className="hidden lg:flex items-center gap-4 px-4 py-1.5 bg-surface-container-low border-t border-outline-variant/20 text-xs text-on-surface-variant">
        <span>{tracks[activeTrackIndex]?.name ?? 'Guitar'} — {tracks[activeTrackIndex]?.tuningName ?? 'Standard'}</span>
        <div className="flex-1" />
        <button onClick={() => setShowHelp(true)} className="hover:text-on-surface transition-colors">
          Press ? for keyboard shortcuts
        </button>
      </div>

      <KeyChartDialog
        open={showKeyChart}
        selectedKey={selectedKey}
        onSelectKey={setSelectedKey}
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
