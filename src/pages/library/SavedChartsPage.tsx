import {useState, useEffect, useCallback, useRef, Fragment, type ReactNode} from 'react';
import {Link, useLocation, useNavigate, useSearchParams} from 'react-router-dom';
import {
  FolderHeart, Loader2, Search, Play, Bookmark, HardDrive, Wifi,
  Music2, BookMarked, Trash2, Pencil, FolderOpen,
  LayoutGrid, List, ChevronDown, ChevronRight, Tag as TagIcon,
  Archive, ArchiveRestore,
} from 'lucide-react';
import debounce from 'debounce';
import {Settings, importer} from '@coderline/alphatab';
import {getSavedCharts, unsaveChart, type SavedChartEntry} from '@/lib/local-db/saved-charts';
import {LIBRARY_CHANGED_EVENT} from '@/lib/library-events';
import {getSavedCompositions, deleteComposition, deleteCompositionBatch, updateCompositionMeta, saveComposition, markCompositionSaved, listAllCompositionTags, addTagToCompositions, removeTagFromCompositions, setCompositionArchived, setCompositionsArchived, countArchivedCompositions, isArchived, type TabComposition, type CompositionSortOrder, type ArchiveScope} from '@/lib/local-db/tab-compositions';
import {getDrumsLibraryItems, type LibraryItem} from '@/lib/local-db/library';
import {deletePersistedChart} from '@/lib/chart-persistent-store';
import {cn} from '@/lib/utils';
import {toast} from 'sonner';
import {Toggle} from '@/components/ui/toggle';
import {DifficultyDots} from '@/components/shared/DifficultyDots';
import {formatDuration} from '@/lib/ui-utils';
import AddRepertoireItemDialog from '@/pages/guitar/repertoire/AddRepertoireItemDialog';
import {importFromAsciiTabWithMeta, type AsciiImportOptions} from '@/lib/tab-editor/asciiTabImporter';
import {exportToGp7} from '@/lib/tab-editor/exporters';
import {getScoreTempo} from '@/lib/tab-editor/scoreOperations';
import SaveCompositionDialog, {type CompositionMeta} from '@/pages/tab-editor/SaveCompositionDialog';
import {storeGet, storeSet, STORE_KEYS} from '@/lib/store';
import {tagKey} from '@/lib/composition-tags';
import {
  DEFAULT_LIBRARY_PREFS, parseLibraryPrefs, filterByTags, filterByArchiveScope, toggleTagFilter,
  countTags, groupItems, groupId, visibleInGroups,
  type LibraryPrefs, type LibraryViewMode, type LibraryGroupBy,
} from './libraryView';

type Tab = 'all' | 'chorus' | 'guitar' | 'bass' | 'drums' | 'keys';

const TABS: {id: Tab; label: string}[] = [
  {id: 'all', label: 'All'},
  {id: 'chorus', label: 'Rhythm / Chorus'},
  {id: 'guitar', label: 'Guitar'},
  {id: 'bass', label: 'Bass'},
  {id: 'drums', label: 'Drums'},
  {id: 'keys', label: 'Keys'},
];

const itemTags = (item: LibraryItem): string[] => item.sourceType === 'composition' ? item.data.tags : [];
/** Clone Hero charts can't be archived, so they are never part of the archived view. */
const itemArchived = (item: LibraryItem): boolean =>
  item.sourceType === 'composition' && isArchived(item.data);
const itemArtist = (item: LibraryItem): string => item.data.artist ?? '';
const itemKey = (item: LibraryItem): string =>
  item.sourceType === 'composition' ? `comp-${item.data.id}` : `chorus-${item.data.md5}`;

export default function SavedChartsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const fromState = (location.state as any)?.activeTab as Tab | undefined;
    return TABS.some(t => t.id === fromState) ? fromState! : 'all';
  });
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [addToRepertoire, setAddToRepertoire] = useState<SavedChartEntry | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<TabComposition | null>(null);

  // Edit metadata dialog
  const [editTarget, setEditTarget] = useState<TabComposition | null>(null);

  // Bulk import
  const dirInputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [sort, setSort] = useState<CompositionSortOrder>('saved_at_desc');

  // Archive view: off on every visit, so archived items stay out of the way by default.
  const [showArchived, setShowArchived] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const scope: ArchiveScope = showArchived ? 'archived' : 'active';

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCompIds, setSelectedCompIds] = useState<Set<number>>(new Set());
  const [selectedChartMd5s, setSelectedChartMd5s] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkTagDraft, setBulkTagDraft] = useState('');
  const [bulkTagBusy, setBulkTagBusy] = useState(false);

  // Collapsed group ids (see groupId); lifted here so select-all can skip hidden groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) => setCollapsedGroups(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Chorus state
  const [charts, setCharts] = useState<SavedChartEntry[]>([]);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [removingCharts, setRemovingCharts] = useState<Set<string>>(new Set());

  // Composition state (guitar / bass / keys)
  const [compositions, setCompositions] = useState<TabComposition[]>([]);
  const [compositionsLoading, setCompositionsLoading] = useState(false);
  const [removingComps, setRemovingComps] = useState<Set<number>>(new Set());

  // Drums state (merged)
  const [drumsItems, setDrumsItems] = useState<LibraryItem[]>([]);
  const [drumsLoading, setDrumsLoading] = useState(false);

  // All state (cross-instrument)
  const [allItems, setAllItems] = useState<LibraryItem[]>([]);
  const [allLoading, setAllLoading] = useState(false);

  // View prefs (grid/list, grouping, tag filter), remembered in prefs.json
  const [prefs, setPrefs] = useState<LibraryPrefs>(DEFAULT_LIBRARY_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  // Set while refreshing on window focus, so loaders keep the current list on screen
  // instead of swapping it for the loading spinner.
  const silentReloadRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    storeGet<unknown>(STORE_KEYS.LIBRARY_VIEW_PREFS)
      .then(raw => { if (!cancelled) setPrefs(parseLibraryPrefs(raw)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPrefsLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (prefsLoaded) storeSet(STORE_KEYS.LIBRARY_VIEW_PREFS, prefs).catch(() => {});
  }, [prefs, prefsLoaded]);

  const updatePrefs = (patch: Partial<LibraryPrefs>) => setPrefs(prev => ({...prev, ...patch}));

  useEffect(() => {
    if (!editTarget) return;
    listAllCompositionTags()
      .then(rows => setTagSuggestions(rows.map(r => r.tag)))
      .catch(() => setTagSuggestions([]));
  }, [editTarget]);

  // Items of the current tab before / after the tag filter (chorus tab has no tags).
  // The archive scope is applied first, so tag chips count only what this view shows.
  const scopedCompositions = filterByArchiveScope(compositions, showArchived, isArchived);
  const tabItems: LibraryItem[] = filterByArchiveScope(
    activeTab === 'all' ? allItems
    : activeTab === 'drums' ? drumsItems
    : activeTab === 'chorus' ? []
    : scopedCompositions.map(data => ({sourceType: 'composition' as const, data})),
    showArchived,
    itemArchived,
  );
  const availableTags = countTags(tabItems, itemTags);
  const tagChips = [
    ...availableTags,
    ...prefs.tagFilter
      .filter(t => !availableTags.some(a => tagKey(a.tag) === tagKey(t)))
      .map(tag => ({tag, count: 0})),
  ];
  const isTagSelected = (tag: string) => prefs.tagFilter.some(t => tagKey(t) === tagKey(tag));
  const visibleCompositions = filterByTags(scopedCompositions, c => c.tags, prefs.tagFilter);
  const visibleDrumsItems = filterByTags(
    filterByArchiveScope(drumsItems, showArchived, itemArchived), itemTags, prefs.tagFilter);
  const visibleAllItems = filterByTags(
    filterByArchiveScope(allItems, showArchived, itemArchived), itemTags, prefs.tagFilter);

  // What the current tab shows after the tag filter (chorus tab: all its charts)
  const filteredItems: LibraryItem[] =
    activeTab === 'chorus' ? charts.map(data => ({sourceType: 'chorus' as const, data}))
    : activeTab === 'all' ? visibleAllItems
    : activeTab === 'drums' ? visibleDrumsItems
    : visibleCompositions.map(data => ({sourceType: 'composition' as const, data}));
  const isItemSelected = (item: LibraryItem) =>
    item.sourceType === 'composition' ? selectedCompIds.has(item.data.id) : selectedChartMd5s.has(item.data.md5);
  // Bulk actions only act on selected items that pass the current filters, so a
  // selection hidden by a later filter change is never deleted or retagged.
  const selectedItems = filteredItems.filter(isItemSelected);
  const selectedComps = selectedItems.flatMap(i => i.sourceType === 'composition' ? [i.data] : []);
  const selectedMd5s = selectedItems.flatMap(i => i.sourceType === 'chorus' ? [i.data.md5] : []);
  const selectedTagOptions = countTags(selectedComps, c => c.tags);
  const totalSelected = selectedItems.length;

  const selectAllVisible = () => {
    const visible = activeTab === 'chorus'
      ? filteredItems
      : visibleInGroups(filteredItems, prefs.groupBy, collapsedGroups, {getArtist: itemArtist, getTags: itemTags}, itemKey);
    setSelectedCompIds(new Set(visible.flatMap(i => i.sourceType === 'composition' ? [i.data.id] : [])));
    setSelectedChartMd5s(new Set(visible.flatMap(i => i.sourceType === 'chorus' ? [i.data.md5] : [])));
  };

  const clearSelection = () => {
    setSelectedCompIds(new Set());
    setSelectedChartMd5s(new Set());
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedCompIds(new Set());
    setSelectedChartMd5s(new Set());
  };

  const toggleSelectComp = (id: number) => {
    setSelectedCompIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectChart = (md5: string) => {
    setSelectedChartMd5s(prev => {
      const next = new Set(prev);
      next.has(md5) ? next.delete(md5) : next.add(md5);
      return next;
    });
  };

  const loadChorus = useCallback(async (q?: string) => {
    if (!silentReloadRef.current) setChartsLoading(true);
    const results = await getSavedCharts(q);
    setCharts(results);
    setChartsLoading(false);
  }, []);

  const loadCompositions = useCallback(async (instrument: string, q?: string, s: CompositionSortOrder = 'saved_at_desc', sc: ArchiveScope = 'active') => {
    if (!silentReloadRef.current) setCompositionsLoading(true);
    const results = await getSavedCompositions(instrument, q, s, sc);
    setCompositions(results);
    setCompositionsLoading(false);
  }, []);

  const loadDrums = useCallback(async (q?: string, s: CompositionSortOrder = 'saved_at_desc', sc: ArchiveScope = 'active') => {
    if (!silentReloadRef.current) setDrumsLoading(true);
    const results = await getDrumsLibraryItems(q, s, sc);
    setDrumsItems(results);
    setDrumsLoading(false);
  }, []);

  const loadAll = useCallback(async (q?: string, s: CompositionSortOrder = 'saved_at_desc', sc: ArchiveScope = 'active') => {
    if (!silentReloadRef.current) setAllLoading(true);
    const [chartResults, guitar, bass, keys, drums] = await Promise.all([
      // Clone Hero charts can't be archived, so the archived view has none of them.
      sc === 'archived' ? Promise.resolve([] as SavedChartEntry[]) : getSavedCharts(q),
      getSavedCompositions('guitar', q, s, sc),
      getSavedCompositions('bass', q, s, sc),
      getSavedCompositions('keys', q, s, sc),
      getSavedCompositions('drums', q, s, sc),
    ]);
    const merged: LibraryItem[] = [
      ...chartResults.map(data => ({ sourceType: 'chorus' as const, data })),
      ...[...guitar, ...bass, ...keys, ...drums].map(data => ({ sourceType: 'composition' as const, data })),
    ];
    setAllItems(merged);
    setAllLoading(false);
  }, []);

  const loadTab = useCallback((tab: Tab, q?: string, s: CompositionSortOrder = 'saved_at_desc', sc: ArchiveScope = 'active') => {
    const loaders: Record<Tab, (q?: string, s?: CompositionSortOrder, sc?: ArchiveScope) => void> = {
      all: loadAll,
      chorus: (q) => loadChorus(q),
      drums: loadDrums,
      guitar: (q, s, sc) => loadCompositions('guitar', q, s, sc),
      bass: (q, s, sc) => loadCompositions('bass', q, s, sc),
      keys: (q, s, sc) => loadCompositions('keys', q, s, sc),
    };
    loaders[tab](q, s, sc);
  }, [loadAll, loadChorus, loadDrums, loadCompositions]);

  // How many archived items the "Archived" toggle offers for this tab.
  const refreshArchivedCount = useCallback(async (tab: Tab) => {
    if (tab === 'chorus') { setArchivedCount(0); return; }
    try {
      setArchivedCount(await countArchivedCompositions(tab === 'all' ? undefined : tab));
    } catch { setArchivedCount(0); }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadTab(activeTab, search || undefined, sort, scope); }, [activeTab, loadTab, sort, scope]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refreshArchivedCount(activeTab); }, [activeTab, refreshArchivedCount]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  /** Reload what the page currently shows, plus the archived count behind the toggle. */
  const reloadCurrent = useCallback(() => {
    loadTab(activeTab, search || undefined, sort, scope);
    refreshArchivedCount(activeTab);
  }, [activeTab, search, sort, scope, loadTab, refreshArchivedCount]);

  // Refresh in place when the library changes outside this page: live when an agent writes
  // through the MCP (LIBRARY_CHANGED_EVENT), and on window focus for anything else (e.g. a
  // script writing the DB directly). focus and visibilitychange often fire together, hence
  // the short throttle on those.
  useEffect(() => {
    let last = 0;
    const reload = () => {
      silentReloadRef.current = true;
      reloadCurrent();
      silentReloadRef.current = false;
    };
    const onFocus = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 1000) return;
      last = Date.now();
      reload();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener(LIBRARY_CHANGED_EVENT, reload);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener(LIBRARY_CHANGED_EVENT, reload);
    };
  }, [reloadCurrent]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((q: string, s: CompositionSortOrder, sc: ArchiveScope) => loadTab(activeTab, q || undefined, s, sc), 300),
    [activeTab, loadTab],
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearch(q);
    navigate({search: q ? `?q=${encodeURIComponent(q)}` : ''}, {replace: true, state: location.state});
    debouncedSearch(q, sort, scope);
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSearch('');
    setSort('saved_at_desc');
    navigate({search: ''}, {replace: true, state: location.state});
    exitSelectionMode();
  };

  const toggleArchivedView = () => {
    // Selections don't carry across the two views: clear them with the switch.
    exitSelectionMode();
    setShowArchived(prev => !prev);
  };

  const handleRemoveChart = async (chart: SavedChartEntry, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (removingCharts.has(chart.md5)) return;
    setRemovingCharts(prev => new Set(prev).add(chart.md5));
    try {
      await unsaveChart(chart.md5);
      await deletePersistedChart(chart.md5);
      setCharts(prev => prev.filter(c => c.md5 !== chart.md5));
      setAllItems(prev => prev.filter(i => !(i.sourceType === 'chorus' && i.data.md5 === chart.md5)));
      toast.success(`"${chart.name}" removed from library`);
    } catch {
      toast.error(`Failed to remove "${chart.name}"`);
    } finally {
      setRemovingCharts(prev => {const next = new Set(prev); next.delete(chart.md5); return next;});
    }
  };

  const handleRemoveComposition = async (comp: TabComposition, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteTarget(comp);
  };

  const confirmDeleteComposition = async () => {
    const comp = deleteTarget;
    if (!comp) return;
    setDeleteTarget(null);
    setRemovingComps(prev => new Set(prev).add(comp.id));
    try {
      await deleteComposition(comp.id);
      if (activeTab === 'drums') {
        reloadCurrent();
      } else if (activeTab === 'all') {
        setAllItems(prev => prev.filter(i => !(i.sourceType === 'composition' && i.data.id === comp.id)));
      } else {
        setCompositions(prev => prev.filter(c => c.id !== comp.id));
      }
      toast.success(`"${comp.title}" removed from library`);
    } catch {
      toast.error(`Failed to remove "${comp.title}"`);
    } finally {
      setRemovingComps(prev => {const next = new Set(prev); next.delete(comp.id); return next;});
    }
  };

  const handleEditSave = async (meta: CompositionMeta) => {
    if (!editTarget) return;
    await updateCompositionMeta(editTarget.id, meta);
    setEditTarget(null);
    reloadCurrent();
    toast.success('Metadata updated');
  };

  /** Archive (or, in the archived view, restore) one composition. Nothing is deleted. */
  const handleArchiveComposition = async (comp: TabComposition, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const archive = !isArchived(comp);
    const title = comp.title || 'Untitled';
    try {
      await setCompositionArchived(comp.id, archive);
      // It belongs to the other view now: drop it from the lists on screen.
      setCompositions(prev => prev.filter(c => c.id !== comp.id));
      setDrumsItems(prev => prev.filter(i => !(i.sourceType === 'composition' && i.data.id === comp.id)));
      setAllItems(prev => prev.filter(i => !(i.sourceType === 'composition' && i.data.id === comp.id)));
      setArchivedCount(prev => Math.max(0, prev + (archive ? 1 : -1)));
      toast.success(archive ? `"${title}" archived` : `"${title}" restored to the library`);
    } catch {
      toast.error(archive ? `Failed to archive "${title}"` : `Failed to restore "${title}"`);
    }
  };

  /** Bulk archive / unarchive. No confirmation: it is reversible and deletes nothing. */
  const handleBulkArchive = async () => {
    const ids = selectedComps.map(c => c.id);
    if (ids.length === 0) return;
    const archive = !showArchived;
    setArchiveBusy(true);
    try {
      const n = await setCompositionsArchived(ids, archive);
      toast.success(
        `${archive ? 'Archived' : 'Restored'} ${n} composition${n !== 1 ? 's' : ''}` +
        (selectedMd5s.length > 0 ? ` (${selectedMd5s.length} Clone Hero chart${selectedMd5s.length !== 1 ? 's' : ''} skipped)` : ''),
      );
      exitSelectionMode();
      reloadCurrent();
    } catch {
      toast.error(archive ? 'Failed to archive the selection' : 'Failed to restore the selection');
    } finally {
      setArchiveBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    const count = totalSelected;
    setConfirmBulkDelete(false);
    setBulkDeleting(true);
    try {
      // Same cleanup as the single-delete paths: deleteCompositionBatch removes
      // tags and rows like deleteComposition; charts are unsaved and their
      // persisted copy deleted like handleRemoveChart.
      if (selectedComps.length > 0) {
        await deleteCompositionBatch(selectedComps.map(c => c.id));
      }
      if (selectedMd5s.length > 0) {
        await Promise.all(
          selectedMd5s.map(async md5 => {
            await unsaveChart(md5);
            await deletePersistedChart(md5);
          })
        );
      }
      toast.success(`Deleted ${count} item${count !== 1 ? 's' : ''}`);
      exitSelectionMode();
      reloadCurrent();
      pageRef.current?.scrollTo({top: 0, behavior: 'smooth'});
    } catch {
      toast.error('Some items failed to delete');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkAddTag = async () => {
    const tag = bulkTagDraft.trim();
    if (!tag || selectedComps.length === 0) return;
    setBulkTagBusy(true);
    try {
      const added = await addTagToCompositions(selectedComps.map(c => c.id), tag);
      toast.success(`Added "${tag}" to ${added} composition${added !== 1 ? 's' : ''}`);
      setBulkTagDraft('');
      reloadCurrent();
    } catch {
      toast.error(`Failed to add "${tag}"`);
    } finally {
      setBulkTagBusy(false);
    }
  };

  const handleBulkRemoveTag = async (tag: string) => {
    if (selectedComps.length === 0) return;
    setBulkTagBusy(true);
    try {
      const removed = await removeTagFromCompositions(selectedComps.map(c => c.id), tag);
      toast.success(`Removed "${tag}" from ${removed} composition${removed !== 1 ? 's' : ''}`);
      reloadCurrent();
    } catch {
      toast.error(`Failed to remove "${tag}"`);
    } finally {
      setBulkTagBusy(false);
    }
  };

  // Escape leaves selection mode (unless a dialog is open on top of it)
  useEffect(() => {
    if (!selectionMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || confirmBulkDelete || deleteTarget || editTarget) return;
      setSelectionMode(false);
      setSelectedCompIds(new Set());
      setSelectedChartMd5s(new Set());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectionMode, confirmBulkDelete, deleteTarget, editTarget]);

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setBulkImporting(true);
    const results = await Promise.allSettled(files.map(async file => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      let score;
      let thumbnailUrl: string | null = null;
      let asciiMeta: AsciiImportOptions | null = null;
      if (ext === 'txt' || ext === 'tab') {
        const text = await file.text();
        const result = importFromAsciiTabWithMeta(text);
        score = result.score;
        thumbnailUrl = result.meta.thumbnailUrl ?? null;
        asciiMeta = result.meta;
      } else {
        const buf = await file.arrayBuffer();
        score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buf), new Settings());
      }
      const scoreData = exportToGp7(score).buffer as ArrayBuffer;
      const instrument = score.tracks[0]?.staves[0]?.isPercussion ? 'drums'
        : score.tracks[0]?.name?.toLowerCase().includes('bass') ? 'bass' : 'guitar';
      const fileBaseName = file.name.replace(/\.[^.]+$/, '');
      const newId = await saveComposition(scoreData, {
        title: asciiMeta?.title || score.title || fileBaseName,
        artist: asciiMeta?.artist || score.artist || '',
        album: (score as any).album || '',
        tempo: getScoreTempo(score),
        instrument,
        previewImage: thumbnailUrl,
        youtubeUrl: asciiMeta?.youtubeUrl ?? null,
      });
      await markCompositionSaved(newId);
    }));
    setBulkImporting(false);
    const imported = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    reloadCurrent();
    if (imported > 0) toast.success(`Imported ${imported} file${imported !== 1 ? 's' : ''}`);
    if (failed > 0) toast.error(`${failed} file${failed !== 1 ? 's' : ''} failed to import`);
  };

  const loadingByTab: Record<Tab, boolean> = {
    all: allLoading,
    chorus: chartsLoading,
    drums: drumsLoading,
    guitar: compositionsLoading,
    bass: compositionsLoading,
    keys: compositionsLoading,
  };
  const isLoading = loadingByTab[activeTab];

  return (
    <div ref={pageRef} className="flex-1 overflow-y-auto bg-surface">
      <div className={cn('max-w-6xl mx-auto px-6 py-8 space-y-6', selectionMode && 'pb-36')}>
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <FolderHeart className="h-6 w-6 text-tertiary" />
            <h1 className="font-headline font-extrabold text-3xl text-on-surface tracking-tight">
              Library
            </h1>
            <div className="ml-auto flex items-center gap-2">
              <input
                ref={dirInputRef}
                type="file"
                multiple
                // @ts-ignore — webkitdirectory not in TS types
                webkitdirectory=""
                accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.alphatex,.tex,.txt,.tab,.psarc"
                className="hidden"
                onChange={handleBulkImport}
              />
              <button
                onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
                aria-pressed={selectionMode}
                title={selectionMode ? 'Exit selection (Esc)' : 'Select items for bulk actions'}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                  selectionMode
                    ? 'bg-primary text-on-primary hover:bg-primary/90'
                    : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container',
                )}
              >
                {selectionMode ? 'Cancel' : 'Select'}
              </button>
              <button
                onClick={() => dirInputRef.current?.click()}
                disabled={bulkImporting}
                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
                title="Import files from a folder"
              >
                {bulkImporting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <FolderOpen className="h-3.5 w-3.5" />
                }
                {bulkImporting ? 'Importing…' : 'Import Folder'}
              </button>
            </div>
          </div>
          <p className="text-on-surface-variant text-sm max-w-xl leading-relaxed">
            Your saved charts and compositions, organized by instrument.
          </p>
        </header>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(tab => (
            <Toggle
              key={tab.id}
              pressed={activeTab === tab.id}
              onPressedChange={() => handleTabChange(tab.id)}
              size="sm"
            >
              {tab.label}
            </Toggle>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-on-surface-variant" />
          </div>
          <input
            ref={searchRef}
            type="search"
            placeholder={activeTab === 'chorus' ? 'Filter charts\u2026' : activeTab === 'all' ? 'Search all\u2026' : 'Filter compositions\u2026'}
            className="w-full rounded-xl bg-surface-container-high py-2.5 pl-10 pr-4 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-tertiary/40"
            value={search}
            onChange={handleSearch}
          />
        </div>

        {activeTab !== 'chorus' && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <label htmlFor="library-sort" className="text-xs text-on-surface-variant font-medium">Sort</label>
              <select
                id="library-sort"
                value={sort}
                onChange={e => setSort(e.target.value as CompositionSortOrder)}
                className="rounded-lg bg-surface-container-high px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-tertiary/40"
              >
                <option value="saved_at_desc">Date Added</option>
                <option value="title_asc">Title A→Z</option>
                <option value="artist_asc">Artist A→Z</option>
                <option value="tempo_asc">Tempo ↑</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="library-group" className="text-xs text-on-surface-variant font-medium">Group</label>
              <select
                id="library-group"
                value={prefs.groupBy}
                onChange={e => updatePrefs({groupBy: e.target.value as LibraryGroupBy})}
                className="rounded-lg bg-surface-container-high px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-tertiary/40"
              >
                <option value="none">None</option>
                <option value="artist">Artist</option>
                <option value="tag">Tag</option>
              </select>
            </div>
            {(showArchived || archivedCount > 0) && (
              <button
                type="button"
                onClick={toggleArchivedView}
                aria-pressed={showArchived}
                title={showArchived ? 'Back to the library' : 'Show archived compositions only'}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  showArchived
                    ? 'bg-tertiary-container text-on-tertiary-container'
                    : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container',
                )}
              >
                <Archive className="h-3.5 w-3.5" />
                Archived
                <span className="font-mono text-[10px] text-outline">{archivedCount}</span>
              </button>
            )}
            <ViewToggle view={prefs.view} onChange={view => updatePrefs({view})} />
          </div>
        )}

        {showArchived && (
          <p className="rounded-xl bg-surface-container-high px-3 py-2 text-xs text-on-surface-variant">
            Showing archived compositions only. They stay out of the library but keep their score,
            tags and stems, and lessons or setlists that point at them still work.
          </p>
        )}

        {activeTab !== 'chorus' && tagChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <TagIcon className="h-3.5 w-3.5 text-on-surface-variant" aria-hidden />
            {tagChips.map(({tag, count}) => (
              <Toggle
                key={tagKey(tag)}
                size="sm"
                pressed={isTagSelected(tag)}
                onPressedChange={() => updatePrefs({tagFilter: toggleTagFilter(prefs.tagFilter, tag)})}
                className="rounded-full gap-1.5"
              >
                {tag}
                <span className="font-mono text-[10px] text-outline">{count}</span>
              </Toggle>
            ))}
            {prefs.tagFilter.length > 0 && (
              <button
                onClick={() => updatePrefs({tagFilter: []})}
                className="ml-1 text-xs font-semibold text-tertiary hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-tertiary" />
          </div>
        ) : activeTab === 'all' ? (
          <DrumsSection
            items={visibleAllItems}
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
            view={prefs.view}
            groupBy={prefs.groupBy}
            tagFilterActive={prefs.tagFilter.length > 0}
            removingComps={removingComps}
            removingCharts={removingCharts}
            onRemoveComposition={handleRemoveComposition}
            onRemoveChart={handleRemoveChart}
            onEditComposition={(comp, e) => { e.preventDefault(); e.stopPropagation(); setEditTarget(comp); }}
            onArchiveComposition={handleArchiveComposition}
            showArchived={showArchived}
            search={search}
            selectionMode={selectionMode}
            selectedCompIds={selectedCompIds}
            selectedChartMd5s={selectedChartMd5s}
            onToggleSelectComp={toggleSelectComp}
            onToggleSelectChart={toggleSelectChart}
            showInstrumentLabel
          />
        ) : activeTab === 'chorus' ? (
          <ChorusSection
            charts={charts}
            removing={removingCharts}
            onRemove={handleRemoveChart}
            onAddToRepertoire={setAddToRepertoire}
            search={search}
            selectionMode={selectionMode}
            selectedMd5s={selectedChartMd5s}
            onToggleSelect={toggleSelectChart}
          />
        ) : activeTab === 'drums' ? (
          <DrumsSection
            items={visibleDrumsItems}
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
            view={prefs.view}
            groupBy={prefs.groupBy}
            tagFilterActive={prefs.tagFilter.length > 0}
            removingComps={removingComps}
            removingCharts={removingCharts}
            onRemoveComposition={handleRemoveComposition}
            onRemoveChart={handleRemoveChart}
            onEditComposition={(comp, e) => { e.preventDefault(); e.stopPropagation(); setEditTarget(comp); }}
            onArchiveComposition={handleArchiveComposition}
            showArchived={showArchived}
            search={search}
            selectionMode={selectionMode}
            selectedCompIds={selectedCompIds}
            selectedChartMd5s={selectedChartMd5s}
            onToggleSelectComp={toggleSelectComp}
            onToggleSelectChart={toggleSelectChart}
          />
        ) : (
          <CompositionsSection
            compositions={visibleCompositions}
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
            view={prefs.view}
            groupBy={prefs.groupBy}
            tagFilterActive={prefs.tagFilter.length > 0}
            instrument={activeTab}
            removing={removingComps}
            onRemove={handleRemoveComposition}
            onEdit={(comp, e) => { e.preventDefault(); e.stopPropagation(); setEditTarget(comp); }}
            onArchive={handleArchiveComposition}
            showArchived={showArchived}
            search={search}
            activeTab={activeTab}
            selectionMode={selectionMode}
            selectedIds={selectedCompIds}
            onToggleSelect={toggleSelectComp}
          />
        )}

        {/* Sticky bottom action bar */}
        {selectionMode && (
          <div className="fixed bottom-0 inset-x-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 bg-surface-container border-t border-outline/20 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-on-surface" aria-live="polite">
                {totalSelected} selected
              </span>
              <button onClick={selectAllVisible} className="text-xs font-semibold text-tertiary hover:underline">
                Select all
              </button>
              <button
                onClick={clearSelection}
                disabled={totalSelected === 0}
                className="text-xs font-semibold text-tertiary hover:underline disabled:opacity-40 disabled:no-underline"
              >
                Clear
              </button>
            </div>
            {activeTab !== 'chorus' && (
              <div className="flex flex-wrap items-center gap-2">
                <form
                  onSubmit={e => { e.preventDefault(); handleBulkAddTag(); }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    value={bulkTagDraft}
                    onChange={e => setBulkTagDraft(e.target.value)}
                    list="library-bulk-tag-suggestions"
                    placeholder="Add tag…"
                    aria-label="Tag to add to the selected compositions"
                    disabled={bulkTagBusy}
                    className="w-32 rounded-lg bg-surface-container-high px-2 py-1.5 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-tertiary/40"
                  />
                  <datalist id="library-bulk-tag-suggestions">
                    {availableTags.map(({tag}) => <option key={tagKey(tag)} value={tag} />)}
                  </datalist>
                  <button
                    type="submit"
                    disabled={!bulkTagDraft.trim() || selectedComps.length === 0 || bulkTagBusy}
                    className="flex items-center gap-1 rounded-lg bg-surface-container-high px-2.5 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-highest transition-colors disabled:opacity-40"
                  >
                    <TagIcon className="h-3.5 w-3.5" />
                    Add
                  </button>
                </form>
                <select
                  value=""
                  onChange={e => { if (e.target.value) handleBulkRemoveTag(e.target.value); }}
                  disabled={selectedTagOptions.length === 0 || bulkTagBusy}
                  aria-label="Remove a tag from the selected compositions"
                  className="rounded-lg bg-surface-container-high px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-tertiary/40 disabled:opacity-40"
                >
                  <option value="">Remove tag…</option>
                  {selectedTagOptions.map(({tag, count}) => (
                    <option key={tagKey(tag)} value={tag}>{tag} ({count})</option>
                  ))}
                </select>
              </div>
            )}
            {activeTab !== 'chorus' && (
              // No confirmation: archiving is reversible and deletes nothing.
              <button
                disabled={selectedComps.length === 0 || archiveBusy}
                onClick={handleBulkArchive}
                title={showArchived
                  ? 'Put the selected compositions back in the library'
                  : 'Hide the selected compositions from the library (reversible)'}
                className="ml-auto flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors disabled:opacity-40"
              >
                {archiveBusy
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {showArchived ? 'Unarchive' : 'Archive'} {selectedComps.length > 0 ? selectedComps.length : ''}
              </button>
            )}
            <button
              disabled={totalSelected === 0 || bulkDeleting}
              onClick={() => setConfirmBulkDelete(true)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-error text-on-error hover:bg-error/90 transition-colors disabled:opacity-40',
                activeTab === 'chorus' && 'ml-auto',
              )}
            >
              {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete {totalSelected > 0 ? totalSelected : ''} Selected
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-container rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl space-y-4">
            <h2 className="text-base font-bold text-on-surface">Delete Composition</h2>
            <p className="text-sm text-on-surface-variant">
              Delete <strong>{deleteTarget.title || 'Untitled'}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 text-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteComposition}
                className="px-3 py-1.5 text-sm rounded-lg bg-error text-on-error hover:bg-error/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-container rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl space-y-4">
            <h2 className="text-base font-bold text-on-surface">Delete {totalSelected} Items</h2>
            <p className="text-sm text-on-surface-variant">
              Permanently delete {totalSelected} selected item{totalSelected !== 1 ? 's' : ''}? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="px-3 py-1.5 text-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 text-sm rounded-lg bg-error text-on-error hover:bg-error/90 transition-colors"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit metadata dialog */}
      {editTarget && (
        <SaveCompositionDialog
          open
          onOpenChange={open => { if (!open) setEditTarget(null); }}
          initialMeta={{
            title: editTarget.title,
            artist: editTarget.artist,
            album: editTarget.album,
            tempo: editTarget.tempo,
            instrument: editTarget.instrument,
            previewImage: editTarget.previewImage,
            youtubeUrl: editTarget.youtubeUrl,
            tags: editTarget.tags,
          }}
          tagSuggestions={tagSuggestions}
          onSave={handleEditSave}
        />
      )}

      {addToRepertoire && (
        <AddRepertoireItemDialog
          open={!!addToRepertoire}
          onOpenChange={open => { if (!open) setAddToRepertoire(null); }}
          onSaved={() => toast.success(`"${addToRepertoire.name}" added to RepertoireIQ`)}
          prefill={{
            itemType: 'song',
            title: addToRepertoire.name,
            artist: addToRepertoire.artist,
            linkedItem: {
              kind: 'saved_chart',
              md5: addToRepertoire.md5,
              name: addToRepertoire.name,
              artist: addToRepertoire.artist,
              albumArtMd5: addToRepertoire.albumArtMd5,
            },
          }}
        />
      )}
    </div>
  );
}

function SelectionOverlay({isSelected}: {isSelected: boolean}) {
  return (
    <div className={cn(
      'absolute inset-0 z-20 flex items-center justify-center pointer-events-none',
      isSelected ? 'bg-primary/20' : '',
    )}>
      <div className={cn(
        'h-6 w-6 rounded-full border-2 flex items-center justify-center',
        isSelected ? 'bg-primary border-primary' : 'bg-surface/80 border-outline',
      )}>
        {isSelected && <span className="text-on-primary text-xs font-bold">✓</span>}
      </div>
    </div>
  );
}

function ChorusSection({
  charts,
  removing,
  onRemove,
  onAddToRepertoire,
  search,
  selectionMode,
  selectedMd5s,
  onToggleSelect,
}: {
  charts: SavedChartEntry[];
  removing: Set<string>;
  onRemove: (chart: SavedChartEntry, e: React.MouseEvent) => void;
  onAddToRepertoire: (chart: SavedChartEntry) => void;
  search: string;
  selectionMode?: boolean;
  selectedMd5s?: Set<string>;
  onToggleSelect?: (md5: string) => void;
}) {
  if (charts.length === 0) {
    return (
      <div className="py-20 text-center space-y-3">
        <FolderHeart className="mx-auto h-12 w-12 text-outline opacity-50" />
        <p className="text-on-surface-variant">
          {search ? 'No saved charts match your search.' : 'No saved charts yet. Search for drum charts and bookmark them.'}
        </p>
        {!search && (
          <Link to="/sheet-music/search" className="inline-flex items-center gap-2 text-sm font-bold text-tertiary hover:underline">
            Browse Charts
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <p className="font-mono text-xs text-outline uppercase tracking-widest">
        {charts.length} saved · {charts.filter(c => c.isDownloaded).length} offline
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {charts.map(chart => {
          const isSelected = selectedMd5s?.has(chart.md5) ?? false;
          return (
            <Link
              to={`/sheet-music/${chart.md5}`}
              key={chart.md5}
              onClick={e => { if (selectionMode) { e.preventDefault(); onToggleSelect?.(chart.md5); } }}
              className={cn(
                'group relative flex flex-col overflow-hidden rounded-2xl bg-surface-container-low transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container',
                selectionMode && isSelected && 'ring-2 ring-primary',
              )}
            >
              <div className="relative flex h-36 items-center justify-center overflow-hidden bg-surface-container">
                <img
                  src={`https://files.enchor.us/${chart.albumArtMd5}.jpg`}
                  alt={`${chart.name} album art`}
                  className="h-full w-full object-cover opacity-40"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tertiary/90 text-on-tertiary opacity-0 shadow-lg transition-all duration-200 group-hover:opacity-100 group-hover:scale-110">
                    <Play className="h-5 w-5 fill-current" />
                  </div>
                </div>
                <div className={cn(
                  'absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold backdrop-blur-sm',
                  chart.isDownloaded
                    ? 'bg-tertiary-container/80 text-on-tertiary-container'
                    : 'bg-surface/70 text-outline',
                )}>
                  {chart.isDownloaded
                    ? <><HardDrive className="h-3 w-3" /> Offline</>
                    : <><Wifi className="h-3 w-3" /> Online only</>
                  }
                </div>
                <button
                  className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface/70 backdrop-blur-sm transition-colors hover:bg-surface"
                  onClick={(e) => onRemove(chart, e)}
                  disabled={removing.has(chart.md5)}
                  title="Remove from library"
                >
                  {removing.has(chart.md5)
                    ? <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
                    : <Bookmark className="h-4 w-4 fill-tertiary text-tertiary" />
                  }
                </button>
                {selectionMode && <SelectionOverlay isSelected={isSelected} />}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-on-surface">{chart.name}</h3>
                  <p className="truncate text-xs text-on-surface-variant">{chart.artist}</p>
                </div>
                <div className="mt-auto flex items-center gap-3">
                  {chart.diff_drums != null && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] uppercase text-on-surface-variant">Diff</span>
                      <DifficultyDots level={chart.diff_drums} />
                    </div>
                  )}
                  {chart.song_length != null && (
                    <span className="font-mono text-xs text-on-surface-variant">
                      {formatDuration(chart.song_length)}
                    </span>
                  )}
                  <button
                    className="ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-all"
                    onClick={e => { e.preventDefault(); e.stopPropagation(); onAddToRepertoire(chart); }}
                    title="Add to RepertoireIQ"
                  >
                    <BookMarked className="h-3 w-3" />
                    Repertoire
                  </button>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

/** Composition thumbnail: an https URL or a data: URI. Falls back when missing or broken. */
function CompositionThumb({src, alt, className, fallback}: {
  src: string | null;
  alt: string;
  className?: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function TagChips({tags, max, className}: {tags: string[]; max?: number; className?: string}) {
  if (tags.length === 0) return null;
  const shown = max ? tags.slice(0, max) : tags;
  const extra = tags.length - shown.length;
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1', className)} title={tags.join(', ')}>
      {shown.map(tag => (
        <span
          key={tag}
          className="max-w-[9rem] truncate rounded-full bg-secondary/10 px-1.5 py-0.5 text-[10px] font-medium text-secondary"
        >
          {tag}
        </span>
      ))}
      {extra > 0 && <span className="font-mono text-[10px] text-outline">+{extra}</span>}
    </div>
  );
}

function RowCheck({isSelected}: {isSelected: boolean}) {
  return (
    <div className={cn(
      'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2',
      isSelected ? 'bg-primary border-primary' : 'bg-surface/80 border-outline',
    )}>
      {isSelected && <span className="text-on-primary text-[10px] font-bold">✓</span>}
    </div>
  );
}

function ViewToggle({view, onChange}: {view: LibraryViewMode; onChange: (view: LibraryViewMode) => void}) {
  const options: {id: LibraryViewMode; label: string; Icon: typeof LayoutGrid}[] = [
    {id: 'grid', label: 'Grid view', Icon: LayoutGrid},
    {id: 'list', label: 'List view', Icon: List},
  ];
  return (
    <div className="ml-auto flex items-center rounded-lg bg-surface-container-high p-0.5" role="group" aria-label="View">
      {options.map(({id, label, Icon}) => (
        <button
          key={id}
          type="button"
          aria-pressed={view === id}
          title={label}
          onClick={() => onChange(id)}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
            view === id
              ? 'bg-surface text-on-surface shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

/**
 * Lays items out as a grid or a list, optionally in collapsible groups.
 * With grouping by tag, an item with several tags appears in each group.
 */
function ItemCollection({items, view, groupBy, collapsed, onToggleGroup, renderItem}: {
  items: LibraryItem[];
  view: LibraryViewMode;
  groupBy: LibraryGroupBy;
  collapsed: ReadonlySet<string>;
  onToggleGroup: (id: string) => void;
  renderItem: (item: LibraryItem) => ReactNode;
}) {
  const container = view === 'list'
    ? 'flex flex-col gap-1.5'
    : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3';
  const renderItems = (list: LibraryItem[]) => (
    <div className={container}>
      {list.map(item => <Fragment key={itemKey(item)}>{renderItem(item)}</Fragment>)}
    </div>
  );

  if (groupBy === 'none') return renderItems(items);

  const groups = groupItems(items, groupBy, {getArtist: itemArtist, getTags: itemTags});

  return (
    <div className="space-y-5">
      {groups.map(group => {
        const id = groupId(groupBy, group.key);
        const isCollapsed = collapsed.has(id);
        return (
          <section key={id} className="space-y-2">
            <button
              type="button"
              onClick={() => onToggleGroup(id)}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center gap-2 text-left text-on-surface-variant hover:text-on-surface transition-colors"
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
              <h2 className="truncate text-sm font-bold text-on-surface">{group.label}</h2>
              <span className="flex-shrink-0 rounded-full bg-surface-container-high px-2 py-0.5 font-mono text-[10px] font-semibold text-on-surface-variant">
                {group.items.length}
              </span>
              <span className="h-px flex-1 bg-outline-variant/30" aria-hidden />
            </button>
            {!isCollapsed && renderItems(group.items)}
          </section>
        );
      })}
    </div>
  );
}

type CompositionItemProps = {
  comp: TabComposition;
  removing: Set<number>;
  onRemove: (comp: TabComposition, e: React.MouseEvent) => void;
  onEdit: (comp: TabComposition, e: React.MouseEvent) => void;
  onArchive: (comp: TabComposition, e: React.MouseEvent) => void;
  badge?: string;
  instrumentLabel?: string;
  activeTab: Tab;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
  search: string;
};

function compositionLinkProps({comp, activeTab, search, selectionMode, onToggleSelect}: CompositionItemProps) {
  return {
    to: `/tab-editor/${comp.id}`,
    state: {from: `/library/saved-charts${search ? `?q=${encodeURIComponent(search)}` : ''}`, activeTab},
    onClick: (e: React.MouseEvent) => {
      if (selectionMode) {
        e.preventDefault();
        onToggleSelect?.(comp.id);
      }
    },
  };
}

function CompositionCard(props: CompositionItemProps) {
  const {comp, removing, onRemove, onEdit, onArchive, badge, instrumentLabel, selectionMode, isSelected} = props;
  const archived = isArchived(comp);
  return (
    <Link
      {...compositionLinkProps(props)}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl bg-surface-container-low transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container',
        selectionMode && isSelected && 'ring-2 ring-primary',
        archived && 'opacity-70 ring-1 ring-outline-variant/40 hover:opacity-100',
      )}
    >
      <div className="relative flex h-28 items-center justify-center overflow-hidden bg-surface-container">
        <CompositionThumb
          src={comp.previewImage}
          alt={comp.title}
          className="h-full w-full object-cover opacity-60"
          fallback={
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary opacity-60 group-hover:opacity-100 transition-opacity">
              <Music2 className="h-6 w-6" />
            </div>
          }
        />
        <div className="absolute left-3 top-3 z-10 flex items-center gap-1">
          {badge && (
            <span className="rounded-full bg-surface/70 px-2 py-0.5 text-[10px] font-mono font-semibold backdrop-blur-sm text-outline">
              {badge}
            </span>
          )}
          {archived && (
            <span className="flex items-center gap-1 rounded-full bg-tertiary-container/80 px-2 py-0.5 text-[10px] font-mono font-semibold backdrop-blur-sm text-on-tertiary-container">
              <Archive className="h-2.5 w-2.5" /> Archived
            </span>
          )}
        </div>
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/70 backdrop-blur-sm transition-colors hover:bg-surface opacity-0 group-hover:opacity-100"
            onClick={(e) => onEdit(comp, e)}
            title="Edit metadata"
          >
            <Pencil className="h-3.5 w-3.5 text-on-surface-variant" />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/70 backdrop-blur-sm transition-colors hover:bg-surface opacity-0 group-hover:opacity-100"
            onClick={(e) => onArchive(comp, e)}
            title={archived ? 'Unarchive (back to the library)' : 'Archive (hide from the library)'}
          >
            {archived
              ? <ArchiveRestore className="h-3.5 w-3.5 text-tertiary" />
              : <Archive className="h-3.5 w-3.5 text-on-surface-variant" />}
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/70 backdrop-blur-sm transition-colors hover:bg-surface"
            onClick={(e) => onRemove(comp, e)}
            disabled={removing.has(comp.id)}
            title="Delete from library"
          >
            {removing.has(comp.id)
              ? <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
              : <Trash2 className="h-3.5 w-3.5 text-error" />
            }
          </button>
        </div>
        {selectionMode && <SelectionOverlay isSelected={isSelected ?? false} />}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-on-surface">{comp.title || 'Untitled'}</h3>
          <p className="truncate text-xs text-on-surface-variant">{comp.artist || 'Unknown artist'}</p>
        </div>
        <TagChips tags={comp.tags} max={4} />
        <div className="mt-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-primary">
            {comp.tempo} BPM
          </span>
          {instrumentLabel && (
            <span className="text-[10px] font-mono text-outline uppercase">
              {instrumentLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function CompositionRow(props: CompositionItemProps) {
  const {comp, removing, onRemove, onEdit, onArchive, badge, instrumentLabel, selectionMode, isSelected} = props;
  const archived = isArchived(comp);
  return (
    <Link
      {...compositionLinkProps(props)}
      className={cn(
        'group flex items-center gap-3 rounded-xl bg-surface-container-low px-3 py-2 transition-colors hover:bg-surface-container',
        selectionMode && isSelected && 'ring-2 ring-primary',
        archived && 'opacity-70 hover:opacity-100',
      )}
    >
      {selectionMode && <RowCheck isSelected={isSelected ?? false} />}
      <div className="flex h-10 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-container">
        <CompositionThumb
          src={comp.previewImage}
          alt={comp.title}
          className="h-full w-full object-cover"
          fallback={<Music2 className="h-4 w-4 text-primary opacity-60" />}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="truncate text-sm font-bold text-on-surface">{comp.title || 'Untitled'}</h3>
          {badge && <span className="flex-shrink-0 font-mono text-[10px] font-semibold text-outline">{badge}</span>}
          {archived && (
            <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-tertiary-container/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-on-tertiary-container">
              <Archive className="h-2.5 w-2.5" /> Archived
            </span>
          )}
        </div>
        <p className="truncate text-xs text-on-surface-variant">{comp.artist || 'Unknown artist'}</p>
        <TagChips tags={comp.tags} max={3} className="mt-1 sm:hidden" />
      </div>
      <TagChips tags={comp.tags} max={3} className="hidden max-w-[35%] justify-end sm:flex" />
      <span className="flex-shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-primary">
        {comp.tempo} BPM
      </span>
      {instrumentLabel && (
        <span className="hidden w-12 flex-shrink-0 text-[10px] font-mono text-outline uppercase sm:inline">
          {instrumentLabel}
        </span>
      )}
      <div className="flex flex-shrink-0 items-center gap-0.5">
        <button
          className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high"
          onClick={(e) => onEdit(comp, e)}
          title="Edit metadata"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high"
          onClick={(e) => onArchive(comp, e)}
          title={archived ? 'Unarchive (back to the library)' : 'Archive (hide from the library)'}
        >
          {archived
            ? <ArchiveRestore className="h-3.5 w-3.5 text-tertiary" />
            : <Archive className="h-3.5 w-3.5" />}
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-surface-container-high"
          onClick={(e) => onRemove(comp, e)}
          disabled={removing.has(comp.id)}
          title="Delete from library"
        >
          {removing.has(comp.id)
            ? <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
            : <Trash2 className="h-3.5 w-3.5 text-error" />
          }
        </button>
      </div>
    </Link>
  );
}

type ChorusItemProps = {
  chart: SavedChartEntry;
  removing: Set<string>;
  onRemove: (chart: SavedChartEntry, e: React.MouseEvent) => void;
  selectionMode?: boolean;
  isSelected: boolean;
  onToggleSelect?: (md5: string) => void;
};

function chorusLinkProps({chart, selectionMode, onToggleSelect}: ChorusItemProps) {
  return {
    to: `/sheet-music/${chart.md5}`,
    onClick: (e: React.MouseEvent) => {
      if (selectionMode) {
        e.preventDefault();
        onToggleSelect?.(chart.md5);
      }
    },
  };
}

function ChorusItemCard(props: ChorusItemProps) {
  const {chart, removing, onRemove, selectionMode, isSelected} = props;
  return (
    <Link
      {...chorusLinkProps(props)}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl bg-surface-container-low transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container',
        selectionMode && isSelected && 'ring-2 ring-primary',
      )}
    >
      <div className="relative flex h-28 items-center justify-center overflow-hidden bg-surface-container">
        <img
          src={`https://files.enchor.us/${chart.albumArtMd5}.jpg`}
          alt={`${chart.name} album art`}
          className="h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tertiary/90 text-on-tertiary opacity-0 shadow-lg transition-all duration-200 group-hover:opacity-100 group-hover:scale-110">
            <Play className="h-5 w-5 fill-current" />
          </div>
        </div>
        <div className="absolute left-3 top-3 z-10 rounded-full bg-surface/70 px-2 py-0.5 text-[10px] font-mono font-semibold backdrop-blur-sm text-outline">
          Chorus
        </div>
        <button
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface/70 backdrop-blur-sm transition-colors hover:bg-surface"
          onClick={(e) => onRemove(chart, e)}
          disabled={removing.has(chart.md5)}
          title="Remove from library"
        >
          {removing.has(chart.md5)
            ? <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
            : <Bookmark className="h-4 w-4 fill-tertiary text-tertiary" />
          }
        </button>
        {selectionMode && <SelectionOverlay isSelected={isSelected} />}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-on-surface">{chart.name}</h3>
          <p className="truncate text-xs text-on-surface-variant">{chart.artist}</p>
        </div>
        {chart.diff_drums != null && (
          <div className="mt-auto flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase text-on-surface-variant">Diff</span>
            <DifficultyDots level={chart.diff_drums} />
          </div>
        )}
      </div>
    </Link>
  );
}

function ChorusRow(props: ChorusItemProps) {
  const {chart, removing, onRemove, selectionMode, isSelected} = props;
  return (
    <Link
      {...chorusLinkProps(props)}
      className={cn(
        'group flex items-center gap-3 rounded-xl bg-surface-container-low px-3 py-2 transition-colors hover:bg-surface-container',
        selectionMode && isSelected && 'ring-2 ring-primary',
      )}
    >
      {selectionMode && <RowCheck isSelected={isSelected} />}
      <div className="h-10 w-14 flex-shrink-0 overflow-hidden rounded-md bg-surface-container">
        <img
          src={`https://files.enchor.us/${chart.albumArtMd5}.jpg`}
          alt={`${chart.name} album art`}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="truncate text-sm font-bold text-on-surface">{chart.name}</h3>
          <span className="flex-shrink-0 font-mono text-[10px] font-semibold text-outline">Chorus</span>
        </div>
        <p className="truncate text-xs text-on-surface-variant">{chart.artist}</p>
      </div>
      {chart.diff_drums != null && (
        <div className="hidden flex-shrink-0 items-center gap-1.5 sm:flex">
          <span className="font-mono text-[10px] uppercase text-on-surface-variant">Diff</span>
          <DifficultyDots level={chart.diff_drums} />
        </div>
      )}
      <button
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface-container-high"
        onClick={(e) => onRemove(chart, e)}
        disabled={removing.has(chart.md5)}
        title="Remove from library"
      >
        {removing.has(chart.md5)
          ? <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
          : <Bookmark className="h-4 w-4 fill-tertiary text-tertiary" />
        }
      </button>
    </Link>
  );
}

function CompositionsSection({
  compositions,
  view,
  groupBy,
  collapsedGroups,
  onToggleGroup,
  tagFilterActive,
  instrument,
  removing,
  onRemove,
  onEdit,
  onArchive,
  showArchived,
  search,
  activeTab,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: {
  compositions: TabComposition[];
  view: LibraryViewMode;
  groupBy: LibraryGroupBy;
  collapsedGroups: ReadonlySet<string>;
  onToggleGroup: (id: string) => void;
  tagFilterActive: boolean;
  instrument: string;
  removing: Set<number>;
  onRemove: (comp: TabComposition, e: React.MouseEvent) => void;
  onEdit: (comp: TabComposition, e: React.MouseEvent) => void;
  onArchive: (comp: TabComposition, e: React.MouseEvent) => void;
  showArchived: boolean;
  search: string;
  activeTab: Tab;
  selectionMode?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
}) {
  const instrumentLabel = instrument.charAt(0).toUpperCase() + instrument.slice(1);

  if (compositions.length === 0) {
    return (
      <div className="py-20 text-center space-y-3">
        <Music2 className="mx-auto h-12 w-12 text-outline opacity-50" />
        <p className="text-on-surface-variant">
          {showArchived
            ? `No archived ${instrumentLabel} compositions${search ? ' match your search' : tagFilterActive ? ' have all the selected tags' : ''}.`
            : search
            ? `No ${instrumentLabel} compositions match your search.`
            : tagFilterActive
              ? `No ${instrumentLabel} compositions have all the selected tags.`
              : `No saved ${instrumentLabel} compositions yet. Open the Tab Editor and save a composition.`}
        </p>
        {!search && !tagFilterActive && !showArchived && (
          <Link to="/tab-editor" className="inline-flex items-center gap-2 text-sm font-bold text-tertiary hover:underline">
            Open Tab Editor
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <p className="font-mono text-xs text-outline uppercase tracking-widest">
        {compositions.length} {showArchived ? 'archived ' : ''}composition{compositions.length !== 1 ? 's' : ''}
      </p>
      <ItemCollection
        items={compositions.map(data => ({sourceType: 'composition' as const, data}))}
        view={view}
        groupBy={groupBy}
        collapsed={collapsedGroups}
        onToggleGroup={onToggleGroup}
        renderItem={item => {
          const comp = item.data as TabComposition;
          const Item = view === 'list' ? CompositionRow : CompositionCard;
          return (
            <Item
              comp={comp}
              removing={removing}
              onRemove={onRemove}
              onEdit={onEdit}
              onArchive={onArchive}
              instrumentLabel={instrumentLabel}
              activeTab={activeTab}
              selectionMode={selectionMode}
              isSelected={selectedIds?.has(comp.id)}
              onToggleSelect={onToggleSelect}
              search={search}
            />
          );
        }}
      />
    </>
  );
}

function DrumsSection({
  items,
  view,
  groupBy,
  collapsedGroups,
  onToggleGroup,
  tagFilterActive,
  removingComps,
  removingCharts,
  onRemoveComposition,
  onRemoveChart,
  onEditComposition,
  onArchiveComposition,
  showArchived,
  search,
  selectionMode,
  selectedCompIds,
  selectedChartMd5s,
  onToggleSelectComp,
  onToggleSelectChart,
  showInstrumentLabel,
}: {
  items: LibraryItem[];
  view: LibraryViewMode;
  groupBy: LibraryGroupBy;
  collapsedGroups: ReadonlySet<string>;
  onToggleGroup: (id: string) => void;
  tagFilterActive: boolean;
  removingComps: Set<number>;
  removingCharts: Set<string>;
  onRemoveComposition: (comp: TabComposition, e: React.MouseEvent) => void;
  onRemoveChart: (chart: SavedChartEntry, e: React.MouseEvent) => void;
  onEditComposition: (comp: TabComposition, e: React.MouseEvent) => void;
  onArchiveComposition: (comp: TabComposition, e: React.MouseEvent) => void;
  showArchived: boolean;
  search: string;
  selectionMode?: boolean;
  selectedCompIds?: Set<number>;
  selectedChartMd5s?: Set<string>;
  onToggleSelectComp?: (id: number) => void;
  onToggleSelectChart?: (md5: string) => void;
  showInstrumentLabel?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="py-20 text-center space-y-3">
        <Music2 className="mx-auto h-12 w-12 text-outline opacity-50" />
        <p className="text-on-surface-variant">
          {showArchived
            ? 'Nothing archived here.'
            : search
            ? 'No drum items match your search.'
            : tagFilterActive
              ? 'No items have all the selected tags.'
              : 'No saved drum content yet.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="font-mono text-xs text-outline uppercase tracking-widest">
        {items.length} item{items.length !== 1 ? 's' : ''}
      </p>
      <ItemCollection
        items={items}
        view={view}
        groupBy={groupBy}
        collapsed={collapsedGroups}
        onToggleGroup={onToggleGroup}
        renderItem={item => {
          if (item.sourceType === 'composition') {
            const comp = item.data;
            const instrLabel = showInstrumentLabel
              ? comp.instrument.charAt(0).toUpperCase() + comp.instrument.slice(1)
              : undefined;
            const Item = view === 'list' ? CompositionRow : CompositionCard;
            return (
              <Item
                comp={comp}
                removing={removingComps}
                onRemove={onRemoveComposition}
                onEdit={onEditComposition}
                onArchive={onArchiveComposition}
                badge="Tab"
                instrumentLabel={instrLabel}
                activeTab="drums"
                selectionMode={selectionMode}
                isSelected={selectedCompIds?.has(comp.id)}
                onToggleSelect={onToggleSelectComp}
                search={search}
              />
            );
          }
          const chart = item.data;
          const Item = view === 'list' ? ChorusRow : ChorusItemCard;
          return (
            <Item
              chart={chart}
              removing={removingCharts}
              onRemove={onRemoveChart}
              selectionMode={selectionMode}
              isSelected={selectedChartMd5s?.has(chart.md5) ?? false}
              onToggleSelect={onToggleSelectChart}
            />
          );
        }}
      />
    </>
  );
}
