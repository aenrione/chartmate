import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type {Setlist, SetlistItem} from '@/lib/local-db/setlists';
import {updateSetlistItemSpeed} from '@/lib/local-db/setlists';
import {loadComposition} from '@/lib/local-db/tab-compositions';
import {
  type ProgressStatus,
  type SongSection,
  type SectionProgressRecord,
  type SongAnnotation,
  deriveSongStatus,
  startPracticeSession,
  endPracticeSession,
  getSectionsForChart,
  getSectionProgress,
  getAnnotations,
  createSection,
  updateSection,
  deleteSection,
  updateSectionStatus,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
} from '@/lib/local-db/playbook';

// ── Context Types ────────────────────────────────────────────────────

interface PlaybookState {
  setlist: Setlist;
  items: SetlistItem[];
  activeIndex: number;
  activeItem: SetlistItem | null;
  sections: SongSection[];
  sectionProgress: SectionProgressRecord[];
  annotations: SongAnnotation[];
  isPlaying: boolean;
  speed: number;
  loopSectionId: number | null;
  sidebarExpanded: boolean;
  mobileSidebarOpen: boolean;
  sessionId: number | null;
  songStatus: ProgressStatus;
  compositionScoreData: ArrayBuffer | null;
}

interface PlaybookActions {
  goToSong: (index: number) => void;
  nextSong: () => void;
  prevSong: () => void;
  setSpeed: (speed: number) => void;
  togglePlay: () => void;
  setIsPlaying: (playing: boolean) => void;
  setLoopSectionId: (id: number | null) => void;
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  addSection: (name: string, startPos: number, endPos: number, pdfPage?: number, pdfYOffset?: number) => Promise<void>;
  removeSection: (sectionId: number) => Promise<void>;
  editSection: (sectionId: number, updates: Partial<Pick<SongSection, 'name' | 'startPosition' | 'endPosition' | 'sortOrder'>>) => Promise<void>;
  setSectionStatus: (sectionId: number, status: ProgressStatus) => Promise<void>;
  addAnnotation: (sectionId: number, content: string) => Promise<void>;
  editAnnotation: (annotationId: number, content: string) => Promise<void>;
  removeAnnotation: (annotationId: number) => Promise<void>;
}

type PlaybookContextValue = PlaybookState & PlaybookActions;

const PlaybookContext = createContext<PlaybookContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────

export function PlaybookProvider({
  setlist,
  items,
  children,
}: {
  setlist: Setlist;
  items: SetlistItem[];
  children: ReactNode;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [sections, setSections] = useState<SongSection[]>([]);
  const [sectionProgress, setSectionProgress] = useState<SectionProgressRecord[]>([]);
  const [annotations, setAnnotations] = useState<SongAnnotation[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(() => items[0]?.speed ?? 100);
  const [loopSectionId, setLoopSectionId] = useState<number | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [compositionScoreData, setCompositionScoreData] = useState<ArrayBuffer | null>(null);

  const activeItem = items[activeIndex] ?? null;

  // Load per-item data when active item changes
  useEffect(() => {
    if (!activeItem) return;
    let cancelled = false;

    const load = async () => {
      setSpeedState(activeItem.speed);
      setLoopSectionId(null);
      // Always reset per-item data; each branch below only fills in what applies.
      setSections([]);
      setSectionProgress([]);
      setAnnotations([]);
      setCompositionScoreData(null);

      if (activeItem.itemType === 'chart' && activeItem.chartMd5) {
        const [secs, progress, annots] = await Promise.all([
          getSectionsForChart(activeItem.chartMd5),
          getSectionProgress(activeItem.id),
          getAnnotations(activeItem.chartMd5),
        ]);
        if (cancelled) return;
        setSections(secs);
        setSectionProgress(progress);
        setAnnotations(annots);
      } else if (activeItem.itemType === 'composition' && activeItem.compositionId) {
        const result = await loadComposition(activeItem.compositionId);
        if (cancelled) return;
        setCompositionScoreData(result?.scoreData ?? null);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [activeItem?.id, activeItem?.itemType, activeItem?.chartMd5, activeItem?.compositionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manage practice session lifecycle
  useEffect(() => {
    if (!activeItem) return;
    let currentSessionId: number | null = null;

    const start = async () => {
      const id = await startPracticeSession(activeItem.id, speed);
      currentSessionId = id;
      setSessionId(id);
    };
    start();

    return () => {
      if (currentSessionId !== null) {
        endPracticeSession(currentSessionId);
      }
    };
  }, [activeItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const songStatus = useMemo(() => deriveSongStatus(sectionProgress), [sectionProgress]);

  // ── Actions ──────────────────────────────────────────────────────

  const goToSong = useCallback((index: number) => {
    if (index >= 0 && index < items.length) {
      setActiveIndex(index);
      setIsPlaying(false);
    }
  }, [items.length]);

  const nextSong = useCallback(() => {
    setActiveIndex(prev => Math.min(prev + 1, items.length - 1));
    setIsPlaying(false);
  }, [items.length]);

  const prevSong = useCallback(() => {
    setActiveIndex(prev => Math.max(prev - 1, 0));
    setIsPlaying(false);
  }, []);

  const setSpeed = useCallback(async (newSpeed: number) => {
    const clamped = Math.max(25, Math.min(200, newSpeed));
    setSpeedState(clamped);
    if (activeItem) {
      await updateSetlistItemSpeed(activeItem.id, clamped);
    }
  }, [activeItem]);

  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);
  const toggleSidebar = useCallback(() => setSidebarExpanded(p => !p), []);

  // ── Section CRUD ─────────────────────────────────────────────────

  const reloadSections = useCallback(async () => {
    if (!activeItem || !activeItem.chartMd5) return;
    const secs = await getSectionsForChart(activeItem.chartMd5);
    setSections(secs);
  }, [activeItem]);

  const reloadProgress = useCallback(async () => {
    if (!activeItem) return;
    const progress = await getSectionProgress(activeItem.id);
    setSectionProgress(progress);
  }, [activeItem]);

  const reloadAnnotations = useCallback(async () => {
    if (!activeItem || !activeItem.chartMd5) return;
    const annots = await getAnnotations(activeItem.chartMd5);
    setAnnotations(annots);
  }, [activeItem]);

  const addSectionAction = useCallback(async (
    name: string,
    startPos: number,
    endPos: number,
    pdfPage?: number,
    pdfYOffset?: number,
  ) => {
    if (!activeItem || !activeItem.chartMd5) return;
    await createSection(activeItem.chartMd5, name, startPos, endPos, pdfPage, pdfYOffset);
    await reloadSections();
  }, [activeItem, reloadSections]);

  const removeSectionAction = useCallback(async (sectionId: number) => {
    await deleteSection(sectionId);
    await reloadSections();
    await reloadProgress();
    await reloadAnnotations();
  }, [reloadSections, reloadProgress, reloadAnnotations]);

  const editSectionAction = useCallback(async (
    sectionId: number,
    updates: Partial<Pick<SongSection, 'name' | 'startPosition' | 'endPosition' | 'sortOrder'>>,
  ) => {
    await updateSection(sectionId, updates);
    await reloadSections();
  }, [reloadSections]);

  const setSectionStatusAction = useCallback(async (sectionId: number, status: ProgressStatus) => {
    if (!activeItem) return;
    await updateSectionStatus(sectionId, activeItem.id, status);
    await reloadProgress();
  }, [activeItem, reloadProgress]);

  const addAnnotationAction = useCallback(async (sectionId: number, content: string) => {
    await createAnnotation(sectionId, content);
    await reloadAnnotations();
  }, [reloadAnnotations]);

  const editAnnotationAction = useCallback(async (annotationId: number, content: string) => {
    await updateAnnotation(annotationId, content);
    await reloadAnnotations();
  }, [reloadAnnotations]);

  const removeAnnotationAction = useCallback(async (annotationId: number) => {
    await deleteAnnotation(annotationId);
    await reloadAnnotations();
  }, [reloadAnnotations]);

  // ── Value ────────────────────────────────────────────────────────

  const value = useMemo<PlaybookContextValue>(() => ({
    setlist,
    items,
    activeIndex,
    activeItem,
    sections,
    sectionProgress,
    annotations,
    isPlaying,
    speed,
    loopSectionId,
    sidebarExpanded,
    sessionId,
    songStatus,
    compositionScoreData,
    goToSong,
    nextSong,
    prevSong,
    setSpeed,
    togglePlay,
    setIsPlaying,
    setLoopSectionId,
    toggleSidebar,
    setSidebarExpanded,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    addSection: addSectionAction,
    removeSection: removeSectionAction,
    editSection: editSectionAction,
    setSectionStatus: setSectionStatusAction,
    addAnnotation: addAnnotationAction,
    editAnnotation: editAnnotationAction,
    removeAnnotation: removeAnnotationAction,
  }), [
    setlist, items, activeIndex, activeItem, sections, sectionProgress,
    annotations, isPlaying, speed, loopSectionId, sidebarExpanded, sessionId,
    songStatus, compositionScoreData, goToSong, nextSong, prevSong, setSpeed,
    togglePlay, addSectionAction, removeSectionAction, editSectionAction,
    setSectionStatusAction, addAnnotationAction, editAnnotationAction,
    removeAnnotationAction, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen,
  ]);

  return (
    <PlaybookContext.Provider value={value}>
      {children}
    </PlaybookContext.Provider>
  );
}

export function usePlaybook(): PlaybookContextValue {
  const ctx = useContext(PlaybookContext);
  if (!ctx) throw new Error('usePlaybook must be used within PlaybookProvider');
  return ctx;
}
