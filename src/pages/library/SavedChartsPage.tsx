import {useState, useEffect, useCallback, useRef} from 'react';
import {Link, useLocation} from 'react-router-dom';
import {
  FolderHeart, Loader2, Search, Play, Bookmark, HardDrive, Wifi,
  Music2, BookMarked, Trash2, Pencil, FolderOpen,
} from 'lucide-react';
import debounce from 'debounce';
import {Settings, importer} from '@coderline/alphatab';
import {getSavedCharts, unsaveChart, type SavedChartEntry} from '@/lib/local-db/saved-charts';
import {getSavedCompositions, deleteComposition, deleteCompositionBatch, updateCompositionMeta, saveComposition, markCompositionSaved, type TabComposition, type CompositionSortOrder} from '@/lib/local-db/tab-compositions';
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

type Tab = 'chorus' | 'guitar' | 'bass' | 'drums' | 'keys';

const TABS: {id: Tab; label: string}[] = [
  {id: 'chorus', label: 'Rhythm / Chorus'},
  {id: 'guitar', label: 'Guitar'},
  {id: 'bass', label: 'Bass'},
  {id: 'drums', label: 'Drums'},
  {id: 'keys', label: 'Keys'},
];

export default function SavedChartsPage() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const fromState = (location.state as any)?.activeTab as Tab | undefined;
    return TABS.some(t => t.id === fromState) ? fromState! : 'chorus';
  });
  const [search, setSearch] = useState('');
  const [addToRepertoire, setAddToRepertoire] = useState<SavedChartEntry | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<TabComposition | null>(null);

  // Edit metadata dialog
  const [editTarget, setEditTarget] = useState<TabComposition | null>(null);

  // Bulk import
  const dirInputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [sort, setSort] = useState<CompositionSortOrder>('saved_at_desc');

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCompIds, setSelectedCompIds] = useState<Set<number>>(new Set());
  const [selectedChartMd5s, setSelectedChartMd5s] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

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

  const totalSelected = selectedCompIds.size + selectedChartMd5s.size;

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
    setChartsLoading(true);
    const results = await getSavedCharts(q);
    setCharts(results);
    setChartsLoading(false);
  }, []);

  const loadCompositions = useCallback(async (instrument: string, q?: string, s: CompositionSortOrder = 'saved_at_desc') => {
    setCompositionsLoading(true);
    const results = await getSavedCompositions(instrument, q, s);
    setCompositions(results);
    setCompositionsLoading(false);
  }, []);

  const loadDrums = useCallback(async (q?: string, s: CompositionSortOrder = 'saved_at_desc') => {
    setDrumsLoading(true);
    const results = await getDrumsLibraryItems(q, s);
    setDrumsItems(results);
    setDrumsLoading(false);
  }, []);

  const loadTab = useCallback((tab: Tab, q?: string, s: CompositionSortOrder = 'saved_at_desc') => {
    const loaders: Record<Tab, (q?: string, s?: CompositionSortOrder) => void> = {
      chorus: (q) => loadChorus(q),
      drums: loadDrums,
      guitar: (q, s) => loadCompositions('guitar', q, s),
      bass: (q, s) => loadCompositions('bass', q, s),
      keys: (q, s) => loadCompositions('keys', q, s),
    };
    loaders[tab](q, s);
  }, [loadChorus, loadDrums, loadCompositions]);

  useEffect(() => { loadTab(activeTab, undefined, sort); }, [activeTab, loadTab, sort]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((q: string, s: CompositionSortOrder) => loadTab(activeTab, q || undefined, s), 300),
    [activeTab, loadTab],
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearch(q);
    debouncedSearch(q, sort);
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSearch('');
    setSort('saved_at_desc');
    exitSelectionMode();
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
        loadDrums(search || undefined, sort);
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
    loadTab(activeTab, search || undefined, sort);
    toast.success('Metadata updated');
  };

  const handleBulkDelete = async () => {
    const count = selectedCompIds.size + selectedChartMd5s.size;
    setConfirmBulkDelete(false);
    setBulkDeleting(true);
    try {
      if (selectedCompIds.size > 0) {
        await deleteCompositionBatch(Array.from(selectedCompIds));
      }
      if (selectedChartMd5s.size > 0) {
        await Promise.all(
          Array.from(selectedChartMd5s).map(async md5 => {
            await unsaveChart(md5);
            await deletePersistedChart(md5);
          })
        );
      }
      toast.success(`Deleted ${count} item${count !== 1 ? 's' : ''}`);
      exitSelectionMode();
      loadTab(activeTab, search || undefined, sort);
      pageRef.current?.scrollTo({top: 0, behavior: 'smooth'});
    } catch {
      toast.error('Some items failed to delete');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleSelectAll = () => {
    if (activeTab === 'chorus') {
      const allMd5s = charts.map(c => c.md5);
      const allSelected = allMd5s.every(md5 => selectedChartMd5s.has(md5));
      setSelectedChartMd5s(allSelected ? new Set() : new Set(allMd5s));
    } else if (activeTab === 'drums') {
      const compIds = drumsItems.filter(i => i.sourceType === 'composition').map(i => (i.data as TabComposition).id);
      const chartMd5s = drumsItems.filter(i => i.sourceType === 'chorus').map(i => (i.data as SavedChartEntry).md5);
      const allSelected = compIds.every(id => selectedCompIds.has(id)) && chartMd5s.every(md5 => selectedChartMd5s.has(md5));
      if (allSelected) {
        setSelectedCompIds(new Set());
        setSelectedChartMd5s(new Set());
      } else {
        setSelectedCompIds(new Set(compIds));
        setSelectedChartMd5s(new Set(chartMd5s));
      }
    } else {
      const allIds = compositions.map(c => c.id);
      const allSelected = allIds.every(id => selectedCompIds.has(id));
      setSelectedCompIds(allSelected ? new Set() : new Set(allIds));
    }
  };

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
    loadTab(activeTab, search || undefined, sort);
    if (imported > 0) toast.success(`Imported ${imported} file${imported !== 1 ? 's' : ''}`);
    if (failed > 0) toast.error(`${failed} file${failed !== 1 ? 's' : ''} failed to import`);
  };

  const loadingByTab: Record<Tab, boolean> = {
    chorus: chartsLoading,
    drums: drumsLoading,
    guitar: compositionsLoading,
    bass: compositionsLoading,
    keys: compositionsLoading,
  };
  const isLoading = loadingByTab[activeTab];

  return (
    <div ref={pageRef} className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
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
            type="search"
            placeholder={activeTab === 'chorus' ? 'Filter charts\u2026' : 'Filter compositions\u2026'}
            className="w-full rounded-xl bg-surface-container-high py-2.5 pl-10 pr-4 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-tertiary/40"
            value={search}
            onChange={handleSearch}
          />
        </div>

        {activeTab !== 'chorus' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-on-surface-variant font-medium">Sort</label>
            <select
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
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-tertiary" />
          </div>
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
            items={drumsItems}
            removingComps={removingComps}
            removingCharts={removingCharts}
            onRemoveComposition={handleRemoveComposition}
            onRemoveChart={handleRemoveChart}
            onEditComposition={(comp, e) => { e.preventDefault(); e.stopPropagation(); setEditTarget(comp); }}
            search={search}
            selectionMode={selectionMode}
            selectedCompIds={selectedCompIds}
            selectedChartMd5s={selectedChartMd5s}
            onToggleSelectComp={toggleSelectComp}
            onToggleSelectChart={toggleSelectChart}
          />
        ) : (
          <CompositionsSection
            compositions={compositions}
            instrument={activeTab}
            removing={removingComps}
            onRemove={handleRemoveComposition}
            onEdit={(comp, e) => { e.preventDefault(); e.stopPropagation(); setEditTarget(comp); }}
            search={search}
            activeTab={activeTab}
            selectionMode={selectionMode}
            selectedIds={selectedCompIds}
            onToggleSelect={toggleSelectComp}
          />
        )}

        {/* Sticky bottom action bar */}
        {selectionMode && (
          <div className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-between gap-4 px-6 py-4 bg-surface-container border-t border-outline/20 shadow-lg">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectAll}
                className="text-xs font-semibold text-tertiary hover:underline"
              >
                {totalSelected > 0 ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-xs text-on-surface-variant">
                {totalSelected} selected
              </span>
            </div>
            <button
              disabled={totalSelected === 0 || bulkDeleting}
              onClick={() => setConfirmBulkDelete(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-error text-on-error hover:bg-error/90 transition-colors disabled:opacity-40"
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
          }}
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

function CompositionCard({
  comp,
  removing,
  onRemove,
  onEdit,
  badge,
  instrumentLabel,
  activeTab,
  selectionMode,
  isSelected,
  onToggleSelect,
}: {
  comp: TabComposition;
  removing: Set<number>;
  onRemove: (comp: TabComposition, e: React.MouseEvent) => void;
  onEdit: (comp: TabComposition, e: React.MouseEvent) => void;
  badge?: string;
  instrumentLabel?: string;
  activeTab: Tab;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
}) {
  const handleCardClick = (e: React.MouseEvent) => {
    if (selectionMode) {
      e.preventDefault();
      onToggleSelect?.(comp.id);
    }
  };

  return (
    <Link
      to={`/tab-editor/${comp.id}`}
      state={{from: '/library/saved-charts', activeTab}}
      onClick={handleCardClick}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl bg-surface-container-low transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container',
        selectionMode && isSelected && 'ring-2 ring-primary',
      )}
    >
      <div className="relative flex h-28 items-center justify-center overflow-hidden bg-surface-container">
        {comp.previewImage ? (
          <img
            src={comp.previewImage}
            alt={comp.title}
            className="h-full w-full object-cover opacity-60"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary opacity-60 group-hover:opacity-100 transition-opacity">
            <Music2 className="h-6 w-6" />
          </div>
        )}
        {badge && (
          <div className="absolute left-3 top-3 z-10 rounded-full bg-surface/70 px-2 py-0.5 text-[10px] font-mono font-semibold backdrop-blur-sm text-outline">
            {badge}
          </div>
        )}
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/70 backdrop-blur-sm transition-colors hover:bg-surface opacity-0 group-hover:opacity-100"
            onClick={(e) => onEdit(comp, e)}
            title="Edit metadata"
          >
            <Pencil className="h-3.5 w-3.5 text-on-surface-variant" />
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

function CompositionsSection({
  compositions,
  instrument,
  removing,
  onRemove,
  onEdit,
  search,
  activeTab,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: {
  compositions: TabComposition[];
  instrument: string;
  removing: Set<number>;
  onRemove: (comp: TabComposition, e: React.MouseEvent) => void;
  onEdit: (comp: TabComposition, e: React.MouseEvent) => void;
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
          {search
            ? `No ${instrumentLabel} compositions match your search.`
            : `No saved ${instrumentLabel} compositions yet. Open the Tab Editor and save a composition.`}
        </p>
        {!search && (
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
        {compositions.length} composition{compositions.length !== 1 ? 's' : ''}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {compositions.map(comp => (
          <CompositionCard
            key={comp.id}
            comp={comp}
            removing={removing}
            onRemove={onRemove}
            onEdit={onEdit}
            instrumentLabel={instrumentLabel}
            activeTab={activeTab}
            selectionMode={selectionMode}
            isSelected={selectedIds?.has(comp.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
    </>
  );
}

function DrumsSection({
  items,
  removingComps,
  removingCharts,
  onRemoveComposition,
  onRemoveChart,
  onEditComposition,
  search,
  selectionMode,
  selectedCompIds,
  selectedChartMd5s,
  onToggleSelectComp,
  onToggleSelectChart,
}: {
  items: LibraryItem[];
  removingComps: Set<number>;
  removingCharts: Set<string>;
  onRemoveComposition: (comp: TabComposition, e: React.MouseEvent) => void;
  onRemoveChart: (chart: SavedChartEntry, e: React.MouseEvent) => void;
  onEditComposition: (comp: TabComposition, e: React.MouseEvent) => void;
  search: string;
  selectionMode?: boolean;
  selectedCompIds?: Set<number>;
  selectedChartMd5s?: Set<string>;
  onToggleSelectComp?: (id: number) => void;
  onToggleSelectChart?: (md5: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="py-20 text-center space-y-3">
        <Music2 className="mx-auto h-12 w-12 text-outline opacity-50" />
        <p className="text-on-surface-variant">
          {search ? 'No drum items match your search.' : 'No saved drum content yet.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="font-mono text-xs text-outline uppercase tracking-widest">
        {items.length} item{items.length !== 1 ? 's' : ''}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(item => {
          if (item.sourceType === 'composition') {
            const comp = item.data;
            return (
              <CompositionCard
                key={`comp-${comp.id}`}
                comp={comp}
                removing={removingComps}
                onRemove={onRemoveComposition}
                onEdit={onEditComposition}
                badge="Tab"
                activeTab="drums"
                selectionMode={selectionMode}
                isSelected={selectedCompIds?.has(comp.id)}
                onToggleSelect={onToggleSelectComp}
              />
            );
          }

          const chart = item.data as SavedChartEntry;
          const isSelected = selectedChartMd5s?.has(chart.md5) ?? false;
          return (
            <Link
              to={`/sheet-music/${chart.md5}`}
              key={`chorus-${chart.md5}`}
              onClick={e => { if (selectionMode) { e.preventDefault(); onToggleSelectChart?.(chart.md5); } }}
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
                  onClick={(e) => onRemoveChart(chart, e)}
                  disabled={removingCharts.has(chart.md5)}
                  title="Remove from library"
                >
                  {removingCharts.has(chart.md5)
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
        })}
      </div>
    </>
  );
}
