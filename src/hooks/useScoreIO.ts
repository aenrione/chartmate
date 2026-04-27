import {useState, useCallback, useRef} from 'react';
import type React from 'react';
import {AlphaTabApi, model, importer, Settings} from '@coderline/alphatab';
import {loadComposition, saveComposition, markCompositionSaved} from '@/lib/local-db/tab-compositions';
import {createGuitarDemo} from '@/lib/tab-editor/examples/guitar-demo';
import {createDrumsDemo} from '@/lib/tab-editor/examples/drums-demo';
import {createBassDemo} from '@/lib/tab-editor/examples/bass-demo';
import {getScoreTempo} from '@/lib/tab-editor/scoreOperations';
import {exportToAlphaTex, exportToAsciiTab, exportToGp7} from '@/lib/tab-editor/exporters';
import {importFromAsciiTabWithMeta, extractAsciiTabMeta} from '@/lib/tab-editor/asciiTabImporter';
import {sanitizeFilename} from '@/lib/utils';
import {toast} from 'sonner';
import {join, appCacheDir} from '@tauri-apps/api/path';
import {writeFile} from '@tauri-apps/plugin-fs';
import {save as saveDialog} from '@tauri-apps/plugin-dialog';
import {invoke} from '@tauri-apps/api/core';
import {convertToAlphaTab} from '@/lib/rocksmith/convertToAlphaTab';
import type {RocksmithArrangement} from '@/lib/rocksmith/types';
import type {UndoManager} from '@/lib/tab-editor/undoManager';
import type {CompositionMeta} from '@/pages/tab-editor/SaveCompositionDialog';

type Score = InstanceType<typeof model.Score>;

const DEFAULT_TEMPO_BPM = 120;

type ExportStrategy = {
  id: string;
  label: string;
  ext: string;
  filterName: string;
  filterExts: string[];
  serialize: (score: Score) => Uint8Array;
};

const EXPORT_STRATEGIES: ExportStrategy[] = [
  {id: 'gp7', label: 'Guitar Pro (.gp)', ext: 'gp', filterName: 'Guitar Pro', filterExts: ['gp', 'gp7'], serialize: exportToGp7},
  {id: 'alphatex', label: 'AlphaTex (.alphatex)', ext: 'alphatex', filterName: 'AlphaTex', filterExts: ['alphatex', 'tex'], serialize: (s) => new TextEncoder().encode(exportToAlphaTex(s))},
  {id: 'ascii', label: 'ASCII Tab (.txt)', ext: 'txt', filterName: 'Text', filterExts: ['txt'], serialize: (s) => new TextEncoder().encode(exportToAsciiTab(s))},
];

export interface UseScoreIOParams {
  scoreRef: React.MutableRefObject<Score | null>;
  apiRef: React.MutableRefObject<AlphaTabApi | null>;
  undoManagerRef: React.MutableRefObject<UndoManager>;
  id?: string;
  // Called after a score is fully loaded into alphatab
  onScoreLoaded: (score: Score) => void;
  // Called when metadata should be marked dirty
  onDirty: () => void;
  // Called when composition should be marked clean after save
  onClean: () => void;
  // YouTube helpers
  onYoutubeUrl?: (url: string) => void;
  onShowYoutubePanel?: () => void;
  // Called after a successful save; caller handles navigation, cache invalidation, etc.
  onSaved: (newId: number, isNew: boolean) => void;
}

export function useScoreIO(params: UseScoreIOParams) {
  const {
    scoreRef,
    apiRef: _apiRef,
    undoManagerRef,
    id,
    onScoreLoaded,
    onDirty,
    onClean,
    onYoutubeUrl,
    onShowYoutubePanel,
    onSaved,
  } = params;

  const [title, setTitle] = useState('Untitled');
  const [artist, setArtist] = useState('');
  const [tempo, setTempoState] = useState(DEFAULT_TEMPO_BPM);
  const [compositionId, setCompositionId] = useState<number | undefined>(id ? Number(id) : undefined);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingPreviewImage, setPendingPreviewImage] = useState<string | null>(null);
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

  const loadScore = useCallback((score: Score) => {
    scoreRef.current = score;
    const scoreTempo = getScoreTempo(score);
    setTitle(score.title);
    setArtist(score.artist);
    if (scoreTempo > 0) setTempoState(scoreTempo);
    undoManagerRef.current.clear();
    onScoreLoaded(score);
  }, [scoreRef, undoManagerRef, onScoreLoaded]);

  const resetToNew = useCallback(() => {
    setCompositionId(undefined);
    setPendingPreviewImage(null);
    setTitle('Untitled');
    setArtist('');
    setTempoState(DEFAULT_TEMPO_BPM);
  }, []);

  const handleLoadGuitarDemo = useCallback(() => {
    loadScore(createGuitarDemo());
  }, [loadScore]);

  const handleLoadDrumsDemo = useCallback(() => {
    loadScore(createDrumsDemo());
  }, [loadScore]);

  const handleLoadBassDemo = useCallback(() => {
    loadScore(createBassDemo());
  }, [loadScore]);

  const handleExport = useCallback(async (strategyId: string) => {
    const score = scoreRef.current;
    if (!score) return;
    const strategy = EXPORT_STRATEGIES.find(s => s.id === strategyId);
    if (!strategy) return;
    const filePath = await saveDialog({
      defaultPath: sanitizeFilename(score.title, strategy.ext),
      filters: [{name: strategy.filterName, extensions: strategy.filterExts}],
    });
    if (!filePath) return;
    await writeFile(filePath, strategy.serialize(score));
    setShowExportMenu(false);
  }, [scoreRef]);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const score = importer.ScoreLoader.loadScoreFromBytes(data, new Settings());
        loadScore(score);
      } catch {
        toast.error('Failed to import file. Make sure it is a valid Guitar Pro or supported tab format.');
      }
    };
    reader.readAsArrayBuffer(file);
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
        onShowYoutubePanel?.();
        onYoutubeUrl?.(meta.youtubeUrl);
      }
      if (meta.thumbnailUrl) {
        setPendingPreviewImage(meta.thumbnailUrl);
      }
      setShowAsciiImport(false);
      setAsciiImportText('');
      setAsciiImportTitle('');
      setAsciiImportArtist('');
    } catch {
      toast.error('Failed to parse ASCII tab. Make sure it uses standard 6-string tab notation.');
    }
  }, [asciiImportText, asciiImportTitle, asciiImportArtist, loadScore, onShowYoutubePanel, onYoutubeUrl]);

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
      toast.error(`Failed to import PSARC: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [loadScore]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    const score = scoreRef.current;
    if (score) score.title = newTitle;
  }, [scoreRef]);

  const handleArtistChange = useCallback((newArtist: string) => {
    setArtist(newArtist);
    const score = scoreRef.current;
    if (score) score.artist = newArtist;
  }, [scoreRef]);

  const handleSaveComposition = useCallback(async (
    meta: CompositionMeta,
    {tracks, activeTrackIndex}: {tracks: Array<{instrument: string}>; activeTrackIndex: number},
  ) => {
    const score = scoreRef.current;
    if (!score) return;
    const scoreData = exportToGp7(score).buffer as ArrayBuffer;
    score.title = meta.title;
    score.artist = meta.artist;
    const isNew = !compositionId;
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
    setCompositionId(newId);
    setTitle(meta.title);
    setArtist(meta.artist);
    onClean();
    undoManagerRef.current.markClean();
    toast.success('Saved to library');
    params.onSaved(newId, isNew);
  }, [
    scoreRef,
    compositionId,
    undoManagerRef,
    onClean,
    params,
  ]);

  const getScoreBytes = useCallback((): Uint8Array | null => {
    const score = scoreRef.current;
    if (!score) return null;
    try { return exportToGp7(score); } catch { return null; }
  }, [scoreRef]);

  // Seeds UI state from DB meta after a composition is loaded.
  // Note: youtubeUrl seeding is handled separately via seedYoutubeFromDb.
  const seedFromComposition = useCallback((meta: {
    tempo?: number;
    previewImage?: string | null;
  }) => {
    if (meta.tempo && meta.tempo > 0) setTempoState(meta.tempo);
    if (meta.previewImage) setPendingPreviewImage(meta.previewImage);
  }, []);

  return {
    // State
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
    // Callbacks
    loadScore,
    resetToNew,
    handleLoadGuitarDemo,
    handleLoadDrumsDemo,
    handleLoadBassDemo,
    handleExport,
    handleImportFile,
    handleImportAscii,
    handleImportPsarc,
    handleTitleChange,
    handleArtistChange,
    handleSaveComposition,
    getScoreBytes,
    seedFromComposition,
  };
}
