import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {
  FileMusic,
  FileText,
  GripVertical,
  ListMusic,
  Music,
  Music2,
  Play,
  Plus,
  Search,
  X,
  Gauge,
} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {cn} from '@/lib/utils';

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
import {reorderItems} from '@/lib/setlist-order';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {toast} from 'sonner';
import {
  type Setlist,
  type SetlistItem,
  getSetlists,
  createSetlist,
  getSetlistItems,
  addSetlistItem,
  removeSetlistItem,
  reorderSetlistItem,
  updateSetlistItemSpeed,
  addCompositionsToSetlist,
  addPdfsToSetlist,
} from '@/lib/local-db/setlists';
import {getSavedCharts} from '@/lib/local-db/saved-charts';
import {listCompositions, type TabComposition} from '@/lib/local-db/tab-compositions';
import {getAllPdfLibraryEntries, type PdfLibraryEntry} from '@/lib/local-db/pdf-library';
import {ChartResponseEncore} from '@/lib/chartSelection';
import {InstrumentImage, RENDERED_INSTRUMENTS, type AllowedInstrument} from '@/components/ChartInstruments';
// ── Add Items Dialog (tabbed) ────────────────────────────────────────

type AddTab = 'charts' | 'tabs' | 'pdfs';

type AddItemsResult =
  | {type: 'charts'; items: ChartResponseEncore[]}
  | {type: 'compositions'; items: TabComposition[]}
  | {type: 'pdfs'; items: PdfLibraryEntry[]};

function AddItemsDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (result: AddItemsResult) => void;
}) {
  const [activeTab, setActiveTab] = useState<AddTab>('charts');
  const [search, setSearch] = useState('');

  // Charts tab
  const [charts, setCharts] = useState<ChartResponseEncore[]>([]);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [selectedCharts, setSelectedCharts] = useState<Set<string>>(new Set());

  // Tabs tab
  const [compositions, setCompositions] = useState<TabComposition[]>([]);
  const [selectedCompositions, setSelectedCompositions] = useState<Set<number>>(new Set());

  // PDFs tab
  const [pdfs, setPdfs] = useState<PdfLibraryEntry[]>([]);
  const [selectedPdfs, setSelectedPdfs] = useState<Set<number>>(new Set());

  const loadCharts = useCallback(async (q?: string) => {
    setChartsLoading(true);
    try {
      setCharts(await getSavedCharts(q));
    } finally {
      setChartsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelectedCharts(new Set());
    setSelectedCompositions(new Set());
    setSelectedPdfs(new Set());
    loadCharts().then(() =>
      Promise.all([listCompositions(), getAllPdfLibraryEntries()])
        .then(([comps, pdfs]) => {
          setCompositions(comps);
          setPdfs(pdfs);
        }),
    );
  }, [open, loadCharts]);

  useEffect(() => {
    if (!open || activeTab !== 'charts') return;
    const searchTimer = setTimeout(() => loadCharts(search || undefined), 200);
    return () => clearTimeout(searchTimer);
  }, [search, open, activeTab, loadCharts]);

  const filteredCompositions = useMemo(() =>
    search
      ? compositions.filter(c =>
          c.title.toLowerCase().includes(search.toLowerCase()) ||
          c.artist.toLowerCase().includes(search.toLowerCase()),
        )
      : compositions,
  [compositions, search]);

  const filteredPdfs = useMemo(() =>
    search
      ? pdfs.filter(p =>
          p.filename.toLowerCase().includes(search.toLowerCase()) ||
          (p.detectedTitle ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (p.detectedArtist ?? '').toLowerCase().includes(search.toLowerCase()),
        )
      : pdfs,
  [pdfs, search]);

  const selectedCount =
    activeTab === 'charts' ? selectedCharts.size :
    activeTab === 'tabs' ? selectedCompositions.size :
    selectedPdfs.size;

  const handleAdd = () => {
    if (activeTab === 'charts') {
      onAdd({type: 'charts', items: charts.filter(c => selectedCharts.has(c.md5))});
    } else if (activeTab === 'tabs') {
      onAdd({type: 'compositions', items: compositions.filter(c => selectedCompositions.has(c.id))});
    } else {
      onAdd({type: 'pdfs', items: pdfs.filter(p => selectedPdfs.has(p.id))});
    }
    onOpenChange(false);
  };

  const TABS: {id: AddTab; label: string}[] = [
    {id: 'charts', label: 'Charts'},
    {id: 'tabs', label: 'Guitar Tabs'},
    {id: 'pdfs', label: 'PDFs'},
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add to Setlist</DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex border-b border-outline-variant/20 -mx-1 mt-1">
          {TABS.map(tabDef => (
            <button
              key={tabDef.id}
              onClick={() => { setActiveTab(tabDef.id); setSearch(''); }}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === tabDef.id
                  ? 'border-primary text-on-surface'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface',
              )}
            >
              {tabDef.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-outline" />
          <Input
            placeholder={
              activeTab === 'charts' ? 'Search saved charts…' :
              activeTab === 'tabs' ? 'Search compositions…' :
              'Search PDFs…'
            }
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto mt-3 border border-outline-variant/20 rounded-lg">
          {/* Charts */}
          {activeTab === 'charts' && (
            chartsLoading ? (
              <div className="p-6 text-center text-sm text-outline">Loading…</div>
            ) : charts.length === 0 ? (
              <div className="p-6 text-center text-sm text-outline">
                {search ? 'No charts match.' : 'No saved charts.'}
              </div>
            ) : charts.map(chart => (
              <label
                key={chart.md5}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-white/5 last:border-b-0 transition-colors',
                  selectedCharts.has(chart.md5) ? 'bg-surface-container' : 'hover:bg-surface-container-high',
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedCharts.has(chart.md5)}
                  onChange={() => setSelectedCharts(prev => {
                    const next = new Set(prev);
                    next.has(chart.md5) ? next.delete(chart.md5) : next.add(chart.md5);
                    return next;
                  })}
                  className="rounded border-outline-variant/20"
                />
                <Music2 className="h-4 w-4 text-on-surface-variant shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-on-surface truncate">{chart.name}</div>
                  <div className="text-xs text-on-surface-variant truncate">
                    {chart.artist} &middot; {chart.charter}
                  </div>
                </div>
              </label>
            ))
          )}

          {/* Guitar Tabs */}
          {activeTab === 'tabs' && (
            filteredCompositions.length === 0 ? (
              <div className="p-6 text-center text-sm text-outline">
                {search ? 'No compositions match.' : 'No saved compositions.'}
              </div>
            ) : filteredCompositions.map(comp => (
              <label
                key={comp.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-white/5 last:border-b-0 transition-colors',
                  selectedCompositions.has(comp.id) ? 'bg-surface-container' : 'hover:bg-surface-container-high',
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedCompositions.has(comp.id)}
                  onChange={() => setSelectedCompositions(prev => {
                    const next = new Set(prev);
                    next.has(comp.id) ? next.delete(comp.id) : next.add(comp.id);
                    return next;
                  })}
                  className="rounded border-outline-variant/20"
                />
                <FileMusic className="h-4 w-4 text-secondary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-on-surface truncate">{comp.title}</div>
                  <div className="text-xs text-on-surface-variant truncate">
                    {comp.artist} &middot; {comp.tempo} BPM &middot; {comp.instrument}
                  </div>
                </div>
              </label>
            ))
          )}

          {/* PDFs */}
          {activeTab === 'pdfs' && (
            filteredPdfs.length === 0 ? (
              <div className="p-6 text-center text-sm text-outline">
                {search ? 'No PDFs match.' : 'No PDFs in library.'}
              </div>
            ) : filteredPdfs.map(pdf => (
              <label
                key={pdf.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-white/5 last:border-b-0 transition-colors',
                  selectedPdfs.has(pdf.id) ? 'bg-surface-container' : 'hover:bg-surface-container-high',
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedPdfs.has(pdf.id)}
                  onChange={() => setSelectedPdfs(prev => {
                    const next = new Set(prev);
                    next.has(pdf.id) ? next.delete(pdf.id) : next.add(pdf.id);
                    return next;
                  })}
                  className="rounded border-outline-variant/20"
                />
                <FileText className="h-4 w-4 text-tertiary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-on-surface truncate">
                    {pdf.detectedTitle ?? pdf.filename}
                  </div>
                  {pdf.detectedArtist && (
                    <div className="text-xs text-on-surface-variant truncate">{pdf.detectedArtist}</div>
                  )}
                </div>
              </label>
            ))
          )}
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
          <span className="text-sm text-on-surface-variant">{selectedCount} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={selectedCount === 0} onClick={handleAdd}>
              Add {selectedCount > 0 ? `(${selectedCount})` : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Speed Editor Popover ─────────────────────────────────────────────

function SpeedEditor({
  speed,
  onChangeSpeed,
}: {
  speed: number;
  onChangeSpeed: (speed: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(speed));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setValue(String(speed));
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, speed]);

  const commit = () => {
    const num = Math.round(Number(value) / 5) * 5;
    const clamped = Math.max(5, Math.min(5000, num || 100));
    onChangeSpeed(clamped);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        className={cn(
          'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs tabular-nums transition-colors',
          speed !== 100
            ? 'bg-tertiary-container/20 text-tertiary hover:bg-tertiary-container/30'
            : 'text-outline hover:bg-surface-container-high hover:text-on-surface-variant',
        )}
        onClick={() => setEditing(true)}
        title="Click to edit speed"
      >
        <Gauge className="h-3 w-3" />
        {speed}%
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        className="w-14 text-xs border border-outline-variant/20 rounded px-1.5 py-0.5 text-center tabular-nums bg-surface-container text-on-surface outline-none focus:ring-1 focus:ring-outline"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <span className="text-xs text-outline">%</span>
    </div>
  );
}

// ── Item type icon ────────────────────────────────────────────────────

function ItemTypeIcon({itemType}: {itemType: SetlistItem['itemType']}) {
  if (itemType === 'composition') return <FileMusic className="h-3.5 w-3.5 text-secondary shrink-0" />;
  if (itemType === 'pdf') return <FileText className="h-3.5 w-3.5 text-tertiary shrink-0" />;
  return <Music2 className="h-3.5 w-3.5 text-outline shrink-0" />;
}

// ── Setlist Item Row (sortable) ──────────────────────────────────────

function itemSubtitle(item: SetlistItem): string | null {
  if (item.itemType === 'chart') return `${item.artist} · ${item.charter ?? ''}`;
  if (item.itemType === 'composition') return item.artist;
  return item.artist || null;
}

function SetlistItemRow({
  item,
  index,
  onRemove,
  onChangeSpeed,
}: {
  item: SetlistItem;
  index: number;
  onRemove: () => void;
  onChangeSpeed: (speed: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({id: item.id});

  const subtitle = itemSubtitle(item);

  return (
    <div
      ref={setNodeRef}
      style={{transform: CSS.Transform.toString(transform), transition}}
      {...attributes}
      {...listeners}
      data-testid={`setlist-item-${index}`}
      className={cn(
        'group flex items-center gap-2 px-3 py-2 transition-colors select-none touch-none',
        isDragging
          ? 'opacity-30 bg-surface-container z-10 cursor-grabbing'
          : 'cursor-grab hover:bg-surface-container-high',
      )}
    >
      <div
        data-testid="grip"
        className="text-outline hover:text-on-surface-variant shrink-0"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <span className="text-xs text-outline w-6 text-right tabular-nums shrink-0">
        {index + 1}
      </span>
      <ItemTypeIcon itemType={item.itemType} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-on-surface truncate">{item.name}</div>
        {subtitle && (
          <div className="text-xs text-on-surface-variant truncate">{subtitle}</div>
        )}
      </div>
      {item.songLength != null && (
        <span className="text-xs text-outline tabular-nums shrink-0 w-10 text-right">
          {formatDuration(item.songLength)}
        </span>
      )}
      {item.instrument != null && (RENDERED_INSTRUMENTS as readonly string[]).includes(item.instrument) && (
        <InstrumentImage instrument={item.instrument as AllowedInstrument} size="sm" classNames="shrink-0 opacity-70" />
      )}
      <SpeedEditor speed={item.speed} onChangeSpeed={onChangeSpeed} />
      <button
        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-error/10 transition-opacity shrink-0"
        onClick={onRemove}
        title="Remove from setlist"
      >
        <X className="h-3.5 w-3.5 text-error" />
      </button>
    </div>
  );
}

// Plain row used inside DragOverlay (no useSortable hook).
function SetlistItemRowOverlay({item, index}: {item: SetlistItem; index: number}) {
  const subtitle = itemSubtitle(item);
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-surface-container-high rounded-lg shadow-lg border border-outline-variant/20 select-none opacity-95 cursor-grabbing">
      <div className="text-outline shrink-0">
        <GripVertical className="h-4 w-4" />
      </div>
      <span className="text-xs text-outline w-6 text-right tabular-nums shrink-0">
        {index + 1}
      </span>
      <ItemTypeIcon itemType={item.itemType} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-on-surface truncate">{item.name}</div>
        {subtitle && (
          <div className="text-xs text-on-surface-variant truncate">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

// ── Setlist Editor (main area) ───────────────────────────────────────

export function SetlistEditor({
  setlist,
  items,
  onAddItems,
  onRemoveItem,
  onReorder,
  onChangeSpeed,
}: {
  setlist: Setlist;
  items: SetlistItem[];
  onAddItems: () => void;
  onRemoveItem: (itemId: number) => void;
  onReorder: (itemId: number, newPosition: number) => void;
  onChangeSpeed: (itemId: number, speed: number) => void;
}) {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<number | null>(null);

  const totalDurationMs = useMemo(
    () => items.reduce((sum, item) => sum + (item.songLength ?? 0), 0),
    [items],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
    useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
  );

  const activeItem = activeId !== null ? items.find(i => i.id === activeId) ?? null : null;
  const activeIndex = activeItem ? items.indexOf(activeItem) : -1;

  const handleDragStart = ({active}: DragStartEvent) => {
    setActiveId(active.id as number);
  };

  const handleDragEnd = ({active, over}: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const fromIndex = items.findIndex(i => i.id === active.id);
    const toIndex = items.findIndex(i => i.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      onReorder(active.id as number, toIndex);
    }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-on-surface truncate">{setlist.name}</h1>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-on-surface-variant">
            <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
            {totalDurationMs > 0 && (
              <span className="tabular-nums">{formatDuration(totalDurationMs)}</span>
            )}
            {setlist.description && (
              <span className="truncate">{setlist.description}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/playbook/${setlist.id}`)}>
              <Play className="h-4 w-4 mr-1.5" />
              Practice
            </Button>
          )}
          <Button size="sm" onClick={onAddItems}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Items
          </Button>
        </div>
      </div>

      {/* Song List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Music className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>Empty Setlist</EmptyTitle>
                <EmptyDescription>
                  Add charts, guitar tabs, or PDFs to build this setlist.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={onAddItems}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Items
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext
              items={items.map(i => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {items.map((item, i) => (
                <SetlistItemRow
                  key={item.id}
                  item={item}
                  index={i}
                  onRemove={() => onRemoveItem(item.id)}
                  onChangeSpeed={speed => onChangeSpeed(item.id, speed)}
                />
              ))}
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeItem && (
                <SetlistItemRowOverlay item={activeItem} index={activeIndex} />
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function SetlistsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [items, setItems] = useState<SetlistItem[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedId = searchParams.get('id') ? Number(searchParams.get('id')) : null;

  const selectedSetlist = useMemo(
    () => setlists.find(s => s.id === selectedId) ?? null,
    [setlists, selectedId],
  );

  const loadSetlists = useCallback(async () => {
    const data = await getSetlists();
    setSetlists(data);
    return data;
  }, []);

  const loadItems = useCallback(async (setlistId: number) => {
    const data = await getSetlistItems(setlistId);
    setItems(data);
  }, []);

  useEffect(() => {
    loadSetlists().then(data => {
      if (data.length > 0 && !searchParams.get('id')) {
        setSearchParams({id: String(data[0].id)}, {replace: true});
      }
      setLoading(false);
    });
  }, [loadSetlists]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => loadSetlists();
    window.addEventListener('setlists-updated', handler);
    return () => window.removeEventListener('setlists-updated', handler);
  }, [loadSetlists]);

  useEffect(() => {
    if (selectedId !== null) {
      loadItems(selectedId);
    } else {
      setItems([]);
    }
  }, [selectedId, loadItems]);

  const handleCreate = useCallback(async () => {
    const id = await createSetlist(`Setlist ${setlists.length + 1}`);
    setSearchParams({id: String(id)});
    window.dispatchEvent(new CustomEvent('setlists-updated'));
    toast.success('Setlist created');
  }, [setlists.length, setSearchParams]);

  const handleAddItems = async (result: AddItemsResult) => {
    if (!selectedId) return;

    if (result.type === 'charts') {
      for (const chart of result.items) {
        await addSetlistItem(selectedId, {
          md5: chart.md5,
          name: chart.name,
          artist: chart.artist,
          charter: chart.charter,
        });
      }
      toast.success(`Added ${result.items.length} chart${result.items.length !== 1 ? 's' : ''}`);
    } else if (result.type === 'compositions') {
      await addCompositionsToSetlist(selectedId, result.items);
      toast.success(`Added ${result.items.length} tab${result.items.length !== 1 ? 's' : ''}`);
    } else {
      await addPdfsToSetlist(selectedId, result.items);
      toast.success(`Added ${result.items.length} PDF${result.items.length !== 1 ? 's' : ''}`);
    }

    await loadItems(selectedId);
    await loadSetlists();
    window.dispatchEvent(new CustomEvent('setlists-updated'));
  };

  const handleRemoveItem = async (itemId: number) => {
    await removeSetlistItem(itemId);
    if (selectedId) {
      await loadItems(selectedId);
      await loadSetlists();
      window.dispatchEvent(new CustomEvent('setlists-updated'));
    }
  };

  const handleReorder = async (itemId: number, newPosition: number) => {
    if (!selectedId) return;
    const fromIndex = items.findIndex(item => item.id === itemId);
    if (fromIndex !== -1 && fromIndex !== newPosition) {
      setItems(prev => reorderItems(prev, fromIndex, newPosition));
    }
    try {
      await reorderSetlistItem(selectedId, itemId, newPosition);
    } catch (err) {
      console.error('Failed to reorder:', err);
      await loadItems(selectedId);
      toast.error('Failed to reorder');
    }
  };

  const handleChangeSpeed = async (itemId: number, speed: number) => {
    await updateSetlistItemSpeed(itemId, speed);
    if (selectedId) await loadItems(selectedId);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-outline">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      {selectedSetlist ? (
        <SetlistEditor
          setlist={selectedSetlist}
          items={items}
          onAddItems={() => setAddDialogOpen(true)}
          onRemoveItem={handleRemoveItem}
          onReorder={handleReorder}
          onChangeSpeed={handleChangeSpeed}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListMusic className="h-6 w-6" />
              </EmptyMedia>
              <EmptyTitle>No Setlists</EmptyTitle>
              <EmptyDescription>
                Create a setlist to organize your charts, tabs, and PDFs.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create Setlist
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      )}

      <AddItemsDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={handleAddItems}
      />
    </div>
  );
}
