import {useRef, useEffect, useState, useCallback, useMemo} from 'react';
import {useParams, useNavigate, useLocation} from 'react-router-dom';
import {AlphaTabApi, model, importer, Settings, StaveProfile} from '@coderline/alphatab';
import {loadComposition, saveComposition, markCompositionSaved} from '@/lib/local-db/tab-compositions';
import SaveCompositionDialog, {type CompositionMeta} from './SaveCompositionDialog';
import {useUnsavedChanges} from './useUnsavedChanges';
import TabEditorCanvas, {type TabEditorCanvasHandle} from './TabEditorCanvas';
import NoteInputPanel from './NoteInputPanel';
import TabEditorSidebar from './TabEditorSidebar';
import FretboardGrid from './FretboardGrid';
import DrumPadGrid from './DrumPadGrid';
import EditorHelpDialog from './EditorHelpDialog';
import ChordFinderDialog from './ChordFinderDialog';
import {createGuitarDemo} from '@/lib/tab-editor/examples/guitar-demo';
import {createDrumsDemo} from '@/lib/tab-editor/examples/drums-demo';
import {createBassDemo} from '@/lib/tab-editor/examples/bass-demo';
import {useEditorCursor} from '@/lib/tab-editor/useEditorCursor';
import {useEditorKeyboard} from '@/lib/tab-editor/useEditorKeyboard';
import {createBlankScore, type InstrumentType} from '@/lib/tab-editor/newScore';
import {getDefaultTuningPreset} from '@/lib/tab-editor/tunings';
import {
  setNote,
  setNoteAndAdvance,
  setChord,
  toggleDrumNote,
  setDrumNoteAndAdvance,
  insertRest,
  setBeatDuration,
  toggleDot,
  toggleEffect,
  toggleSlide,
  toggleBend,
  insertMeasureAfter,
  deleteMeasure,
  addTrack,
  removeTrack,
  setTrackTuning,
  setTempo,
  getScoreTempo,
  type NoteEffect,
} from '@/lib/tab-editor/scoreOperations';
import {voicingToNotes, type ChordVoicing} from '@/lib/tab-editor/chordDb';
import {
  Music,
  Play,
  Pause,
  Square,
  ChevronLeft,
  Save,
  Download,
  Upload,
  HelpCircle,
  Piano,
  Eye,
  BookOpen,
  ChevronDown,
  Youtube,
  Unlink,
  Maximize2,
  Minimize2,
  Search,
  Plus,
} from 'lucide-react';
import {useYoutubeSync} from '@/hooks/useYoutubeSync';
import type {PlaybackClock} from '@/lib/youtube-sync';
import YouTubePlayer from '@/components/YouTubePlayer';
import {snapToYouTubeRate} from '@/lib/youtube-utils';
import {exportToAlphaTex, exportToAsciiTab, exportToGp7} from '@/lib/tab-editor/exporters';
import {UndoManager} from '@/lib/tab-editor/undoManager';
import {importFromAsciiTabWithMeta, extractAsciiTabMeta} from '@/lib/tab-editor/asciiTabImporter';
import {cn, sanitizeFilename} from '@/lib/utils';
import {toast} from 'sonner';
import {invoke} from '@tauri-apps/api/core';
import {join, appCacheDir} from '@tauri-apps/api/path';
import {writeFile} from '@tauri-apps/plugin-fs';
import {save as saveDialog} from '@tauri-apps/plugin-dialog';
import {convertToAlphaTab} from '@/lib/rocksmith/convertToAlphaTab';
import type {RocksmithArrangement} from '@/lib/rocksmith/types';

type Score = InstanceType<typeof model.Score>;
const {Duration} = model;

// Per-id caches — survive route changes without unmounting persistence
type EditorUIState = {
  staveMode: 'both' | 'tab' | 'notation';
  showFretboard: boolean;
  mutedTracks: Set<number>;
};
const _editorScoreCache = new Map<string, Uint8Array>(); // dirty score bytes
const _editorUICache = new Map<string, EditorUIState>();  // UI preferences

export default function TabEditorPage() {
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
  const lastPlaybackYRef = useRef(0);
  const [currentDuration, setCurrentDuration] = useState(Duration.Quarter);
  const [, setRenderKey] = useState(0);
  const [title, setTitle] = useState('Untitled');
  const [artist, setArtist] = useState('');
  const [tempo, setTempoState] = useState(120);
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showChordFinder, setShowChordFinder] = useState(false);
  const [showFretboard, setShowFretboard] = useState(
    () => _editorUICache.get(id ?? 'new')?.showFretboard ?? true,
  );
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [staveMode, setStaveMode] = useState<'both' | 'tab' | 'notation'>(
    () => _editorUICache.get(id ?? 'new')?.staveMode ?? 'tab',
  );
  const [mutedTracks, setMutedTracks] = useState<Set<number>>(
    () => new Set(_editorUICache.get(id ?? 'new')?.mutedTracks ?? []),
  );
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showDemoMenu, setShowDemoMenu] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showAsciiImport, setShowAsciiImport] = useState(false);
  const [asciiImportText, setAsciiImportText] = useState('');
  const [asciiImportTitle, setAsciiImportTitle] = useState('');
  const [asciiImportArtist, setAsciiImportArtist] = useState('');
  const asciiTitleManual = useRef(false);
  const asciiArtistManual = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const psarcFileInputRef = useRef<HTMLInputElement>(null);
  const [showYoutubePanel, setShowYoutubePanel] = useState(false);
  const [youtubeFullscreen, setYoutubeFullscreen] = useState(false);
  const ytSyncSuppressRef = useRef(false);
  const [compositionId, setCompositionId] = useState<number | undefined>(id ? Number(id) : undefined);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingPreviewImage, setPendingPreviewImage] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [showNewTabConfirm, setShowNewTabConfirm] = useState(false);
  const {isDirty, markDirty, markClean, blocker} = useUnsavedChanges();
  const proceedAfterSaveRef = useRef<(() => void) | null>(null);
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

  // PlaybackClock adapter — exposes AlphaTab position as a generic clock
  const positionRef = useRef({currentTimeMs: 0});
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const clockRef = useRef<PlaybackClock | null>(null);
  if (!clockRef.current) {
    clockRef.current = {
      get currentTime() { return positionRef.current.currentTimeMs / 1000; },
      get isPlaying() { return isPlayingRef.current; },
    };
  }

  const songKey = id ? `tab-editor:${id}` : 'tab-editor:new';

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
    handleSeek: handleYoutubeSeek,
    migrateKey: migrateYoutubeKey,
    seedFromDb: seedYoutubeFromDb,
  } = useYoutubeSync({songKey, clockRef, tempo: 1.0});

  // Auto-show YouTube panel when an association is loaded from DB
  useEffect(() => {
    if (youtubeVideoId) setShowYoutubePanel(true);
  }, [youtubeVideoId]);

  // When YouTube user manually plays/pauses, sync AlphaTab to match
  const handleYoutubeStateChange = useCallback((state: number) => {
    if (ytSyncSuppressRef.current) return;
    if (state === 1 && !isPlayingRef.current) {
      canvasRef.current?.alphaTab?.playPause();
    } else if (state === 2 && isPlayingRef.current) {
      canvasRef.current?.alphaTab?.playPause();
    }
  }, []);

  const handlePositionChanged = useCallback((currentTime: number) => {
    positionRef.current.currentTimeMs = currentTime;
  }, []);

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

  const getApi = useCallback((): AlphaTabApi | null => {
    return canvasRef.current?.alphaTab?.getApi() ?? apiRef.current;
  }, []);

  const reRender = useCallback(() => {
    const api = getApi();
    const score = scoreRef.current;
    if (!api || !score) return;
    api.renderScore(score, [activeTrackIndex]);
    // Regenerate MIDI data so playback reflects score changes
    try { api.loadMidiForScore(); } catch { /* player may not be ready yet */ }
    setRenderKey(k => k + 1);
    markDirty();
  }, [activeTrackIndex, getApi, markDirty]);

  const handlePlayPause = useCallback(() => {
    ytSyncSuppressRef.current = true;
    setTimeout(() => { ytSyncSuppressRef.current = false; }, 800);
    canvasRef.current?.alphaTab?.playPause();
    if (isPlaying) {
      youtubeSyncRef.current.onPause();
    } else {
      youtubeSyncRef.current.onResume();
    }
  }, [isPlaying, youtubeSyncRef]);

  const applyUndoRedo = useCallback((score: Score) => {
    const api = getApi();
    if (!api) return;
    scoreRef.current = score;
    setScore(score);
    setTitle(score.title);
    setArtist(score.artist);
    const scoreTempo = getScoreTempo(score);
    if (scoreTempo > 0) setTempoState(scoreTempo);
    api.renderScore(score, [activeTrackIndex]);
    try { api.loadMidiForScore(); } catch { }
    markDirty();
  }, [getApi, setScore, activeTrackIndex, markDirty]);

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

  const handleBeforeMutation = useCallback(() => {
    if (scoreRef.current) undoManagerRef.current.pushSnapshot(scoreRef.current);
  }, []);

  const handleActiveBeatsChanged = useCallback((beats: InstanceType<typeof model.Beat>[]) => {
    if (!isPlayingRef.current) return;
    const beat = beats[0];
    if (!beat) return;
    const api = getApi();
    const beatBounds = api?.boundsLookup?.findBeat(beat);
    if (!beatBounds) return;
    const y = beatBounds.visualBounds.y;
    if (Math.abs(y - lastPlaybackYRef.current) < 20) return;
    lastPlaybackYRef.current = y;
    const container = canvasScrollRef.current;
    if (!container) return;
    container.scrollTo({top: Math.max(0, y - container.clientHeight / 3), behavior: 'smooth'});
  }, [getApi]);

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
    onScoreChanged: reRender,
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
  });

  const loadScore = useCallback((score: InstanceType<typeof model.Score>) => {
    const api = getApi();
    if (!api) return;
    scoreRef.current = score;
    setScore(score);
    setTitle(score.title);
    setArtist(score.artist);
    const scoreTempo = getScoreTempo(score);
    if (scoreTempo > 0) setTempoState(scoreTempo);
    setActiveTrackIndex(0);
    setTrackVersion(v => v + 1);
    api.renderScore(score, [0]);
    api.loadMidiForScore();
    setIsReady(true);
    undoManagerRef.current.clear();
  }, [getApi, setScore]);

  // Initialize score — loads from DB if :id param present, otherwise creates blank
  const initScore = useCallback(async () => {
    const api = getApi();
    if (!api || scoreRef.current) return;
    apiRef.current = api;

    // Check in-memory cache first — restores unsaved edits after navigation
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
          // DB meta is authoritative — override whatever getScoreTempo read from bytes
          if (composition.meta.tempo > 0) setTempoState(composition.meta.tempo);
          if (composition.meta.previewImage) setPendingPreviewImage(composition.meta.previewImage);
          if (composition.meta.youtubeUrl) seedYoutubeFromDb(composition.meta.youtubeUrl);
          return;
        } catch {
          // Fall through to blank score if parsing fails
        }
      }
    }

    const score = createBlankScore({
      title: 'Untitled',
      tempo: 120,
      measureCount: 4,
      instrument: 'guitar',
    });
    scoreRef.current = score;
    setScore(score);
    api.renderScore(score, [0]);
    // Generate MIDI data for playback (may fail if player not ready yet)
    try { api.loadMidiForScore(); } catch { /* will load when player is ready */ }
    setIsReady(true);
  }, [getApi, id, loadScore, markDirty, setScore, resetKey, seedYoutubeFromDb]);

  useEffect(() => {
    const timer = setTimeout(initScore, 200);
    return () => clearTimeout(timer);
  }, [initScore]);

  const handleRenderFinished = useCallback(() => {
    if (!scoreRef.current) initScore();
    updateCursorBounds();
  }, [initScore, updateCursorBounds]);

  const handleScoreLoaded = useCallback((score: Score) => {
    scoreRef.current = score;
    setScore(score);
    setIsReady(true);
  }, [setScore]);

  const handlePlayerStateChanged = useCallback((state: number) => {
    setIsPlaying(state === 1); // 1 = playing in alphaTab
  }, []);

  const handlePlayerReady = useCallback(() => {
    setIsPlayerReady(true);
  }, []);

  const handleStop = useCallback(() => {
    ytSyncSuppressRef.current = true;
    setTimeout(() => { ytSyncSuppressRef.current = false; }, 800);
    canvasRef.current?.alphaTab?.stop();
    setIsPlaying(false);
    youtubeSyncRef.current.onPause();
  }, [youtubeSyncRef]);

  const handleLoadGuitarDemo = useCallback(() => {
    loadScore(createGuitarDemo());
  }, [loadScore]);

  const handleLoadDrumsDemo = useCallback(() => {
    loadScore(createDrumsDemo());
  }, [loadScore]);

  const handleLoadBassDemo = useCallback(() => {
    loadScore(createBassDemo());
  }, [loadScore]);

  // Export handlers — use native save dialog so user picks location
  const handleExportGp7 = useCallback(async () => {
    const s = scoreRef.current;
    if (!s) return;
    const filePath = await saveDialog({defaultPath: sanitizeFilename(s.title, 'gp'), filters: [{name: 'Guitar Pro', extensions: ['gp', 'gp7']}]});
    if (!filePath) return;
    await writeFile(filePath, exportToGp7(s));
    setShowExportMenu(false);
  }, []);

  const handleExportAlphaTex = useCallback(async () => {
    const s = scoreRef.current;
    if (!s) return;
    const filePath = await saveDialog({defaultPath: sanitizeFilename(s.title, 'alphatex'), filters: [{name: 'AlphaTex', extensions: ['alphatex', 'tex']}]});
    if (!filePath) return;
    await writeFile(filePath, new TextEncoder().encode(exportToAlphaTex(s)));
    setShowExportMenu(false);
  }, []);

  const handleExportAscii = useCallback(async () => {
    const s = scoreRef.current;
    if (!s) return;
    const filePath = await saveDialog({defaultPath: sanitizeFilename(s.title, 'txt'), filters: [{name: 'Text', extensions: ['txt']}]});
    if (!filePath) return;
    await writeFile(filePath, new TextEncoder().encode(exportToAsciiTab(s)));
    setShowExportMenu(false);
  }, []);

  // Import handler
  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const score = importer.ScoreLoader.loadScoreFromBytes(data, new Settings());
        loadScore(score);
      } catch (err) {
        console.error('Failed to import file:', err);
        alert('Failed to import file. Make sure it is a valid Guitar Pro or supported tab format.');
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
  }, [loadScore]);

  const handleImportAscii = useCallback(() => {
    if (!asciiImportText.trim()) return;
    try {
      const overrides = {
        title: asciiImportTitle.trim() || undefined,
        artist: asciiImportArtist.trim() || undefined,
      };
      const {score, meta} = importFromAsciiTabWithMeta(asciiImportText, overrides);
      loadScore(score);
      if (meta.youtubeUrl) {
        setShowYoutubePanel(true);
        handleYoutubeUrlSubmit(meta.youtubeUrl);
      }
      if (meta.thumbnailUrl) {
        setPendingPreviewImage(meta.thumbnailUrl);
      }
      setShowAsciiImport(false);
      setAsciiImportText('');
      setAsciiImportTitle('');
      setAsciiImportArtist('');
    } catch (err) {
      console.error('Failed to import ASCII tab:', err);
      alert('Failed to parse ASCII tab. Make sure it uses standard 6-string tab notation.');
    }
  }, [asciiImportText, asciiImportTitle, asciiImportArtist, loadScore, handleYoutubeUrlSubmit]);

  const handleImportPsarc = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const bytes = await file.arrayBuffer();
      const tempPath = await join(await appCacheDir(), `tab-editor-import-${Date.now()}.psarc`);
      await writeFile(tempPath, new Uint8Array(bytes));
      const {arrangements} = await invoke<{arrangements: RocksmithArrangement[]}>('parse_psarc', {path: tempPath});
      if (arrangements.length === 0) throw new Error('No arrangements found in PSARC');
      const arr = arrangements.find(a => a.arrangementType === 'Lead') ?? arrangements[0];
      loadScore(convertToAlphaTab(arr));
    } catch (err) {
      console.error('Failed to import PSARC:', err);
      alert(`Failed to import PSARC: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [loadScore]);

  // Drum pad hit handler — adds note to current beat (layer multiple hits)
  // User advances with right arrow or Enter
  const handleDrumHit = useCallback((midiNote: number) => {
    const s = scoreRef.current;
    if (!s) return;
    toggleDrumNote(s, cursor, midiNote);
    // Set the beat duration to current selected duration
    const beat = s.tracks[cursor.trackIndex]?.staves[0]?.bars[cursor.barIndex]?.voices[cursor.voiceIndex]?.beats[cursor.beatIndex];
    if (beat) beat.duration = currentDuration;
    reRender();
  }, [cursor, reRender, currentDuration]);

  // Advance drum cursor to next beat position
  const handleDrumAdvance = useCallback(() => {
    const s = scoreRef.current;
    if (!s) return;
    const next = insertRest(s, cursor, currentDuration);
    reRender();
    if (next) moveTo(next);
    else moveRight();
  }, [cursor, currentDuration, reRender, moveTo, moveRight]);
  handleDrumAdvanceRef.current = handleDrumAdvance;
  handleDrumHitRef.current = handleDrumHit;

  // Fretboard click handler — place note and advance within bar
  const handleFretClick = useCallback((stringNumber: number, fret: number) => {
    const s = scoreRef.current;
    if (!s) return;
    const targetCursor = {...cursor, stringNumber};
    const nextCursor = setNoteAndAdvance(s, targetCursor, fret, currentDuration);
    reRender();
    if (nextCursor) {
      moveTo(nextCursor);
    } else {
      moveTo(targetCursor);
    }
  }, [cursor, moveTo, reRender, currentDuration]);

  // Chord finder — insert selected chord voicing at current beat
  const handleChordSelect = useCallback((voicing: ChordVoicing) => {
    const s = scoreRef.current;
    if (!s) return;
    const notes = voicingToNotes(voicing);
    setChord(s, cursor, notes, currentDuration);
    reRender();
    toast.success(`Inserted chord`);
  }, [cursor, currentDuration, reRender]);

  // Stave profile toggle — updates via API + re-renders the current score
  const handleStaveModeToggle = useCallback(() => {
    const api = getApi();
    if (!api) return;
    const modes: Array<'tab' | 'notation' | 'both'> = ['tab', 'notation', 'both'];
    const nextIdx = (modes.indexOf(staveMode) + 1) % modes.length;
    const next = modes[nextIdx];
    setStaveMode(next);

    const profile = next === 'tab' ? StaveProfile.Tab
      : next === 'notation' ? StaveProfile.Score
      : StaveProfile.Default;

    api.settings.display.staveProfile = profile;
    api.updateSettings();
    // Re-render with current score and track
    const score = scoreRef.current;
    if (score) {
      api.renderScore(score, [activeTrackIndex]);
    } else {
      api.render();
    }
  }, [staveMode, getApi, activeTrackIndex]);

  // NoteInputPanel callbacks
  const handleDurationChange = useCallback((duration: number) => {
    setCurrentDuration(duration);
    const s = scoreRef.current;
    if (s) {
      setBeatDuration(s, cursor, duration);
      reRender();
    }
  }, [cursor, reRender]);

  const handleEffectToggle = useCallback((effect: NoteEffect | 'slide' | 'bend') => {
    const s = scoreRef.current;
    if (!s) return;
    if (effect === 'slide') toggleSlide(s, cursor);
    else if (effect === 'bend') toggleBend(s, cursor);
    else toggleEffect(s, cursor, effect);
    reRender();
  }, [cursor, reRender]);

  const handleDotToggle = useCallback(() => {
    const s = scoreRef.current;
    if (!s) return;
    toggleDot(s, cursor);
    reRender();
  }, [cursor, reRender]);

  const handleRestInsert = useCallback(() => {
    const s = scoreRef.current;
    if (!s) return;
    const next = insertRest(s, cursor, currentDuration);
    reRender();
    if (next) moveTo(next);
  }, [cursor, currentDuration, reRender, moveTo]);

  const handleAddMeasure = useCallback(() => {
    const s = scoreRef.current;
    if (!s) return;
    insertMeasureAfter(s, cursor.barIndex);
    reRender();
  }, [cursor.barIndex, reRender]);

  const handleDeleteMeasure = useCallback(() => {
    const s = scoreRef.current;
    if (!s) return;
    deleteMeasure(s, cursor.barIndex);
    reRender();
  }, [cursor.barIndex, reRender]);

  // Track count state — incremented on add/remove to force tracks recalculation
  const [trackVersion, setTrackVersion] = useState(0);

  // Sidebar callbacks
  const tracks = useMemo(() => {
    const s = scoreRef.current;
    if (!s) return [{name: 'Guitar', instrument: 'guitar' as InstrumentType, stringCount: 6, tuningName: 'Standard (E A D G B E)'}];
    return s.tracks.map(t => {
      const staff = t.staves[0];
      const isPercussion = staff?.isPercussion ?? false;
      const instrument: InstrumentType = isPercussion ? 'drums' : t.name.toLowerCase().includes('bass') ? 'bass' : 'guitar';
      const stringCount = staff?.stringTuning?.tunings?.length ?? (instrument === 'bass' ? 4 : 6);
      const tuningName = staff?.stringTuning?.name ?? 'Custom';
      return {name: t.name, instrument, stringCount, tuningName};
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, activeTrackIndex, trackVersion]);

  // Get current tuning for fretboard
  const currentTuning = useMemo(() => {
    const s = scoreRef.current;
    if (!s) return [64, 59, 55, 50, 45, 40]; // standard guitar
    const staff = s.tracks[activeTrackIndex]?.staves[0];
    return staff?.stringTuning?.tunings ?? [64, 59, 55, 50, 45, 40];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, activeTrackIndex]);

  const activeTrackIsDrums = tracks[activeTrackIndex]?.instrument === 'drums';

  const handleTrackSelect = useCallback((index: number) => {
    setActiveTrackIndex(index);
    setTrackVersion(v => v + 1);
    const api = getApi();
    const score = scoreRef.current;
    if (api && score && index < score.tracks.length) {
      // Set stave profile based on whether the track is percussion
      const track = score.tracks[index];
      const isPerc = track.staves[0]?.isPercussion ?? false;
      const profile = isPerc ? StaveProfile.Score
        : staveMode === 'tab' ? StaveProfile.Tab
        : staveMode === 'notation' ? StaveProfile.Score
        : StaveProfile.Default;
      api.settings.display.staveProfile = profile;
      api.updateSettings();
      // Render with the selected track only
      api.renderScore(score, [index]);
      try { api.loadMidiForScore(); } catch { /* player may not be ready */ }
    }
    moveTo({...cursor, trackIndex: index, barIndex: 0, beatIndex: 0, stringNumber: 1});
  }, [cursor, moveTo, getApi, staveMode]);

  const handleAddTrack = useCallback((instrument: InstrumentType, stringCount: number) => {
    const s = scoreRef.current;
    if (!s) return;
    const tuningPreset = instrument !== 'drums' ? getDefaultTuningPreset(instrument, stringCount) : null;
    addTrack(s, {
      name: instrument === 'drums' ? 'Drums' : instrument === 'bass' ? 'Bass' : 'Guitar',
      instrument,
      stringCount,
      tuning: tuningPreset?.values ?? [],
    });
    // Auto-switch to the newly added track
    const newIndex = s.tracks.length - 1;
    setActiveTrackIndex(newIndex);
    setTrackVersion(v => v + 1);

    const api = getApi();
    if (api) {
      const isPerc = instrument === 'drums';
      api.settings.display.staveProfile = isPerc ? StaveProfile.Score
        : staveMode === 'tab' ? StaveProfile.Tab
        : staveMode === 'notation' ? StaveProfile.Score
        : StaveProfile.Default;
      api.updateSettings();
      api.renderScore(s, [newIndex]);
      try { api.loadMidiForScore(); } catch {}
    }
    moveTo({...cursor, trackIndex: newIndex, barIndex: 0, beatIndex: 0, stringNumber: 1});
  }, [cursor, moveTo, getApi, staveMode]);

  const handleRemoveTrack = useCallback((index: number) => {
    const s = scoreRef.current;
    if (!s) return;
    removeTrack(s, index);
    if (activeTrackIndex >= s.tracks.length) {
      setActiveTrackIndex(Math.max(0, s.tracks.length - 1));
    }
    setTrackVersion(v => v + 1);
    reRender();
  }, [activeTrackIndex, reRender]);

  const handleToggleMute = useCallback((trackIndex: number) => {
    const api = getApi();
    const s = scoreRef.current;
    if (!api || !s) return;
    const track = s.tracks[trackIndex];
    if (!track) return;

    setMutedTracks(prev => {
      const next = new Set(prev);
      const willMute = !next.has(trackIndex);
      if (willMute) {
        next.add(trackIndex);
      } else {
        next.delete(trackIndex);
      }
      // Use alphaTab's proper track mute API
      try {
        api.changeTrackMute([track], willMute);
      } catch { /* player may not be ready */ }
      return next;
    });
  }, [getApi]);

  const handleTuningChange = useCallback((trackIndex: number, tuning: number[]) => {
    const s = scoreRef.current;
    if (!s) return;
    setTrackTuning(s, trackIndex, tuning);
    reRender();
  }, [reRender]);

  const handleTempoChange = useCallback((bpm: number) => {
    setTempoState(bpm);
    const s = scoreRef.current;
    if (!s) return;
    setTempo(s, bpm);
    reRender();
  }, [reRender]);

  const doNewTab = useCallback(() => {
    scoreRef.current = null;
    _editorScoreCache.delete('new');
    setCompositionId(undefined);
    setPendingPreviewImage(null);
    setTitle('Untitled');
    setArtist('');
    setTempoState(120);
    setActiveTrackIndex(0);
    markClean();
    setResetKey(k => k + 1);
  }, [markClean]);

  const handleNewTab = useCallback(() => {
    if (id) {
      navigate('/tab-editor');
      return;
    }
    if (isDirty) {
      setShowNewTabConfirm(true);
      return;
    }
    doNewTab();
  }, [id, isDirty, navigate, doNewTab]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    const s = scoreRef.current;
    if (s) s.title = newTitle;
  }, []);

  const handleArtistChange = useCallback((newArtist: string) => {
    setArtist(newArtist);
    const s = scoreRef.current;
    if (s) s.artist = newArtist;
  }, []);

  const handleSaveComposition = useCallback(async (meta: CompositionMeta) => {
    const score = scoreRef.current;
    if (!score) return;
    const scoreData = exportToGp7(score).buffer as ArrayBuffer;
    // Update score metadata to match what user entered
    score.title = meta.title;
    score.artist = meta.artist;
    const newId = await saveComposition(scoreData, {
      id: compositionId,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      tempo: meta.tempo,
      instrument: meta.instrument,
      previewImage: meta.previewImage,
      youtubeUrl: meta.youtubeUrl ?? null,
    });
    await markCompositionSaved(newId);
    // Migrate YouTube association from old key to new id-based key when saving for first time
    if (!compositionId) {
      await migrateYoutubeKey(`tab-editor:${newId}`);
    }
    setCompositionId(newId);
    setTitle(meta.title);
    setArtist(meta.artist);
    markClean();
    _editorScoreCache.delete(id ?? 'new');
    toast.success('Saved to library');
    if (!compositionId) {
      navigate(`/tab-editor/${newId}`, {replace: true});
    }
    if (proceedAfterSaveRef.current) {
      const proceed = proceedAfterSaveRef.current;
      proceedAfterSaveRef.current = null;
      proceed();
    }
  }, [compositionId, markClean, navigate, migrateYoutubeKey]);

  const handleSave = useCallback(() => {
    if (compositionId && isDirty) {
      handleSaveComposition({
        title,
        artist,
        album: (scoreRef.current as any)?.album ?? '',
        tempo,
        instrument: tracks[activeTrackIndex]?.instrument ?? 'guitar',
        previewImage: pendingPreviewImage,
        youtubeUrl: youtubeUrl || null,
      });
    } else {
      setShowSaveDialog(true);
    }
  }, [compositionId, isDirty, handleSaveComposition, title, artist, tempo, tracks, activeTrackIndex, pendingPreviewImage, youtubeUrl]);

  // Keep a stable ref so the keydown listener never needs re-registration
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  // Cmd+S / Ctrl+S shortcut — registered once, reads latest handleSave via ref
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

  // String names for status bar
  const stringLabel = useMemo(() => {
    if (activeTrackIsDrums) return 'Drums';
    const tuningArr = currentTuning;
    const idx = cursor.stringNumber - 1;
    if (idx < 0 || idx >= tuningArr.length) return `String ${cursor.stringNumber}`;
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const midi = tuningArr[idx];
    const name = NOTE_NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${name}${octave} (String ${cursor.stringNumber})`;
  }, [currentTuning, cursor.stringNumber, activeTrackIsDrums]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-surface-container border-b border-outline-variant/20">
        <button
          onClick={() => navigate((location.state as any)?.from ?? '/guitar', {state: {activeTab: (location.state as any)?.activeTab}})}
          className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-bold text-on-surface">Tab Editor</h1>
        </div>

        <div className="w-px h-6 bg-outline-variant/30" />

        {/* Transport */}
        <div className="flex items-center gap-1">
          <button
            onClick={handlePlayPause}
            className={cn(
              'p-2 rounded-lg transition-colors',
              isPlaying
                ? 'bg-primary/10 text-primary'
                : 'text-on-surface-variant hover:bg-surface-container-high',
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

        <div className="w-px h-6 bg-outline-variant/30" />

        {/* Position */}
        <div className="text-xs text-on-surface-variant font-mono">
          Bar {cursor.barIndex + 1} | Beat {cursor.beatIndex + 1} | {stringLabel}
        </div>

        <div className="flex-1" />

        {/* New tab */}
        <button
          onClick={handleNewTab}
          className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
          title="New tab"
        >
          <Plus className="h-4 w-4" />
        </button>

        {/* View mode toggle — disabled for percussion (score only) */}
        <button
          onClick={handleStaveModeToggle}
          disabled={activeTrackIsDrums}
          className={cn(
            'px-2 py-1 rounded text-[10px] font-medium transition-colors',
            activeTrackIsDrums
              ? 'text-on-surface-variant/30 cursor-not-allowed'
              : 'text-on-surface-variant hover:bg-surface-container-high',
          )}
          title={activeTrackIsDrums ? 'Percussion tracks use score notation only' : 'Toggle view: Tab / Notation / Both'}
        >
          <Eye className="h-3.5 w-3.5 inline mr-1" />
          {activeTrackIsDrums ? 'Score' : staveMode === 'tab' ? 'Tab' : staveMode === 'notation' ? 'Score' : 'Both'}
        </button>

        {/* Chord Finder */}
        {!activeTrackIsDrums && (
          <button
            onClick={() => setShowChordFinder(true)}
            className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
            title="Chord Finder (Cmd+K)"
          >
            <Search className="h-4 w-4" />
          </button>
        )}

        {/* Fretboard / Drum pad toggle */}
        <button
          onClick={() => setShowFretboard(!showFretboard)}
          className={cn(
            'p-2 rounded-lg transition-colors',
            showFretboard
              ? 'bg-primary/10 text-primary'
              : 'text-on-surface-variant hover:bg-surface-container-high',
          )}
          title={activeTrackIsDrums ? 'Toggle Drum Pad' : 'Toggle Fretboard'}
        >
          <Piano className="h-4 w-4" />
        </button>

        {/* Demos dropdown — only shown on blank new tabs */}
        {!compositionId && !isDirty && <div className="relative">
          <button
            onClick={() => { setShowDemoMenu(!showDemoMenu); setShowExportMenu(false); }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors"
            title="Load demo tabs"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Demos
            <ChevronDown className="h-3 w-3" />
          </button>
          {showDemoMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowDemoMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 bg-surface-container-high border border-outline-variant/30 rounded-lg shadow-lg py-1 min-w-[140px]">
                <button
                  onClick={() => { handleLoadGuitarDemo(); setShowDemoMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors"
                >
                  Guitar Demo
                </button>
                <button
                  onClick={() => { handleLoadBassDemo(); setShowDemoMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors"
                >
                  Bass Demo
                </button>
                <button
                  onClick={() => { handleLoadDrumsDemo(); setShowDemoMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors"
                >
                  Drums Demo
                </button>
              </div>
            </>
          )}
        </div>}

        {/* Save to Library */}
        <button
          onClick={handleSave}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
            isDirty
              ? 'bg-primary text-on-primary hover:bg-primary/90'
              : 'text-on-surface-variant hover:bg-surface-container-high',
          )}
          title={compositionId && isDirty ? 'Save (⌘S)' : 'Save to library (⌘S)'}
        >
          <Save className="h-3.5 w-3.5" />
          {isDirty ? 'Save*' : 'Saved'}
        </button>

        {/* Import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.alphatex,.tex"
          className="hidden"
          onChange={handleImportFile}
        />
        <input
          ref={psarcFileInputRef}
          type="file"
          accept=".psarc"
          className="hidden"
          onChange={handleImportPsarc}
        />
        <div className="relative">
          <button
            onClick={() => { setShowImportMenu(!showImportMenu); setShowExportMenu(false); setShowDemoMenu(false); }}
            className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
            title="Import"
          >
            <Upload className="h-4 w-4" />
          </button>
          {showImportMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowImportMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 bg-surface-container-high border border-outline-variant/30 rounded-lg shadow-lg py-1 min-w-[180px]">
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowImportMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors"
                >
                  GP / AlphaTex file...
                </button>
                <button
                  onClick={() => { setShowAsciiImport(true); setShowImportMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors"
                >
                  ASCII Tab text...
                </button>
                <button
                  onClick={() => { psarcFileInputRef.current?.click(); setShowImportMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors"
                >
                  PSARC file...
                </button>
              </div>
            </>
          )}
        </div>

        {/* Export dropdown */}
        <div className="relative">
          <button
            onClick={() => { setShowExportMenu(!showExportMenu); setShowDemoMenu(false); }}
            className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
            title="Export"
          >
            <Download className="h-4 w-4" />
          </button>
          {showExportMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowExportMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 bg-surface-container-high border border-outline-variant/30 rounded-lg shadow-lg py-1 min-w-[160px]">
                <button
                  onClick={handleExportGp7}
                  className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors"
                >
                  Guitar Pro (.gp)
                </button>
                <button
                  onClick={handleExportAlphaTex}
                  className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors"
                >
                  AlphaTex (.alphatex)
                </button>
                <button
                  onClick={handleExportAscii}
                  className="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container transition-colors"
                >
                  ASCII Tab (.txt)
                </button>
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => setShowHelp(true)}
          className="p-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
          title="Help (?)"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
        <button
          onClick={() => setShowYoutubePanel(v => !v)}
          className={cn(
            'p-2 rounded-lg transition-colors',
            (showYoutubePanel || youtubeVideoId)
              ? 'bg-primary/10 text-primary'
              : 'text-on-surface-variant hover:bg-surface-container-high',
          )}
          title="YouTube sync"
        >
          <Youtube className="h-4 w-4" />
        </button>
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
      <div className="flex flex-1 min-h-0">
        <TabEditorSidebar
          tracks={tracks}
          activeTrackIndex={activeTrackIndex}
          onTrackSelect={handleTrackSelect}
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
        />

        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {/* Score canvas — scrollable, with bottom padding for the overlay */}
          <div
            ref={canvasScrollRef}
            className={cn(
              'flex-1 min-h-0 overflow-y-auto p-4',
              showFretboard && 'pb-[220px]',
            )}
          >
            <TabEditorCanvas
              ref={canvasRef}
              cursorBounds={cursorBounds}
              cursorStringNumber={cursor.stringNumber}
              cursorStringCount={scoreRef.current?.tracks[cursor.trackIndex]?.staves[0]?.stringTuning?.tunings?.length ?? 6}
              onScoreLoaded={handleScoreLoaded}
              onRenderFinished={handleRenderFinished}
              onBeatMouseDown={handleBeatClick}
              onNoteMouseDown={handleNoteClick}
              onPlayerStateChanged={handlePlayerStateChanged}
              onPlayerReady={handlePlayerReady}
              onPositionChanged={handlePositionChanged}
              onActiveBeatsChanged={handleActiveBeatsChanged}
              staveMode={staveMode}
            />
          </div>

          {/* Fretboard / Drum pad — sticky at bottom */}
          {showFretboard && (
            <div className="absolute bottom-[76px] left-64 right-0 z-20 shadow-lg shadow-black/30">
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
                  maxFret={24}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Note Input Panel */}
      <NoteInputPanel
        currentDuration={currentDuration}
        onDurationChange={handleDurationChange}
        onEffectToggle={handleEffectToggle}
        onDotToggle={handleDotToggle}
        onRestInsert={handleRestInsert}
        onAddMeasure={handleAddMeasure}
        onDeleteMeasure={handleDeleteMeasure}
      />

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-surface-container-low border-t border-outline-variant/20 text-xs text-on-surface-variant">
        <span>{tracks[activeTrackIndex]?.name ?? 'Guitar'} — {tracks[activeTrackIndex]?.tuningName ?? 'Standard'}</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowHelp(true)}
          className="hover:text-on-surface transition-colors"
        >
          Press ? for keyboard shortcuts
        </button>
      </div>

      <EditorHelpDialog open={showHelp} onOpenChange={setShowHelp} />
      <ChordFinderDialog
        open={showChordFinder}
        onOpenChange={setShowChordFinder}
        onSelectChord={handleChordSelect}
      />
      <SaveCompositionDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        initialMeta={{
          title,
          artist,
          album: (scoreRef.current as any)?.album ?? '',
          tempo,
          instrument: tracks[activeTrackIndex]?.instrument ?? 'guitar',
          previewImage: pendingPreviewImage,
          youtubeUrl: youtubeUrl || null,
        }}
        onSave={handleSaveComposition}
      />
      {showNewTabConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-container rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl space-y-4">
            <h2 className="text-base font-bold text-on-surface">Unsaved Changes</h2>
            <p className="text-sm text-on-surface-variant">You have unsaved changes. Save before creating a new tab?</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNewTabConfirm(false)}
                className="px-3 py-1.5 text-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowNewTabConfirm(false); _editorScoreCache.delete('new'); doNewTab(); }}
                className="px-3 py-1.5 text-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Discard
              </button>
              <button
                onClick={() => {
                  setShowNewTabConfirm(false);
                  proceedAfterSaveRef.current = doNewTab;
                  setShowSaveDialog(true);
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {blocker.state === 'blocked' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-container rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl space-y-4">
            <h2 className="text-base font-bold text-on-surface">Unsaved Changes</h2>
            <p className="text-sm text-on-surface-variant">You have unsaved changes. Save before leaving?</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => blocker.reset?.()}
                className="px-3 py-1.5 text-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { markClean(); _editorScoreCache.delete(id ?? 'new'); blocker.proceed?.(); }}
                className="px-3 py-1.5 text-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Discard
              </button>
              <button
                onClick={() => {
                  proceedAfterSaveRef.current = blocker.proceed ?? null;
                  blocker.reset?.();
                  setShowSaveDialog(true);
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASCII Import Dialog */}
      {showAsciiImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-container-high rounded-xl shadow-xl p-6 w-[600px] max-w-[90vw] flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-on-surface">Import ASCII Tab</h2>
            <div className="flex gap-3">
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
                rows={12}
                className="bg-surface-container border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface font-mono outline-none focus:border-primary resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowAsciiImport(false); setAsciiImportText(''); setAsciiImportTitle(''); setAsciiImportArtist(''); asciiTitleManual.current = false; asciiArtistManual.current = false; }}
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
      )}
    </div>
  );
}
