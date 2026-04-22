import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {
  FileMusic,
  FileText,
  GripVertical,
  ListMusic,
  Music,
  Music2,
  Pencil,
  Play,
  Plus,
  Search,
  Disc3,
  Trash2,
  X,
  Gamepad2,
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
import {toast} from 'sonner';
import {
  type Setlist,
  type SetlistItem,
  getSetlists,
  createSetlist,
  updateSetlist,
  deleteSetlist,
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
import {useSidebar} from '@/contexts/SidebarContext';

// ── Setlist Sidebar ──────────────────────────────────────────────────

function SetlistSidebar({
  setlists,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: {
  setlists: Setlist[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  onRename: (id: number, name: string) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId !== null) inputRef.current?.focus();
  }, [editingId]);

  const startEditing = (s: Setlist) => {
    setEditingId(s.id);
    setEditName(s.name);
  };

  const commitEdit = () => {
    if (editingId !== null && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const sourceIcon = (s: Setlist) => {
    if (s.sourceType === 'spotify') return <Disc3 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    if (s.sourceType === 'source_game') return <Gamepad2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
    return <ListMusic className="h-3.5 w-3.5 text-outline shrink-0" />;
  };

  return (
    <>
      <div className="px-3 py-3 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-sm font-headline font-bold text-on-surface-variant uppercase tracking-widest">Setlists</h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCreate}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {setlists.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-outline">
            No setlists yet. Create one to get started.
          </div>
        ) : (
          <div className="py-1">
            {setlists.map(s => (
              <div
                key={s.id}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2 cursor-pointer text-sm transition-colors',
                  selectedId === s.id
                    ? 'bg-surface-container text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-variant/50',
                )}
                onClick={() => onSelect(s.id)}
              >
                {sourceIcon(s)}
                {editingId === s.id ? (
                  <input
                    ref={inputRef}
                    className="flex-1 min-w-0 bg-surface-container border border-outline-variant/20 rounded px-1.5 py-0.5 text-sm text-on-surface outline-none focus:ring-1 focus:ring-outline"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitEdit();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="flex-1 min-w-0 truncate">{s.name}</span>
                )}
                <span className="text-xs text-outline tabular-nums shrink-0">
                  {s.itemCount ?? 0}
                </span>
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <button
                    className="p-0.5 rounded hover:bg-surface-container-high"
                    onClick={e => {
                      e.stopPropagation();
                      startEditing(s);
                    }}
                  >
                    <Pencil className="h-3 w-3 text-on-surface-variant" />
                  </button>
                  <button
                    className="p-0.5 rounded hover:bg-error/10"
                    onClick={e => {
                      e.stopPropagation();
                      onDelete(s.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-error" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

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

// ── Draggable Setlist Item Row ───────────────────────────────────────

function SetlistItemRow({
  item,
  index,
  onRemove,
  onChangeSpeed,
  onDragStart,
  onDragOver,
  onDrop,
  isDragTarget,
}: {
  item: SetlistItem;
  index: number;
  onRemove: () => void;
  onChangeSpeed: (speed: number) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isDragTarget: boolean;
}) {
  const subtitle =
    item.itemType === 'chart' ? `${item.artist} · ${item.charter ?? ''}` :
    item.itemType === 'composition' ? item.artist :
    item.artist || null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'group flex items-center gap-2 px-3 py-2 border-b border-white/5 last:border-b-0 transition-colors',
        isDragTarget ? 'bg-primary-container/10 border-primary-container/20' : 'hover:bg-surface-container-high',
      )}
    >
      <div className="cursor-grab active:cursor-grabbing text-outline hover:text-on-surface-variant shrink-0">
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

// ── Setlist Editor (main area) ───────────────────────────────────────

function SetlistEditor({
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (targetIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== targetIndex) {
      const item = items[dragIndex];
      if (item) onReorder(item.id, targetIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-on-surface truncate">{setlist.name}</h1>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-on-surface-variant">
            <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
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
      <div className="flex-1 min-h-0 overflow-y-auto" onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}>
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
          <div>
            {items.map((item, i) => (
              <SetlistItemRow
                key={item.id}
                item={item}
                index={i}
                onRemove={() => onRemoveItem(item.id)}
                onChangeSpeed={speed => onChangeSpeed(item.id, speed)}
                onDragStart={handleDragStart(i)}
                onDragOver={handleDragOver(i)}
                onDrop={handleDrop(i)}
                isDragTarget={dragOverIndex === i && dragIndex !== i}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function SetlistsPage() {
  const {setSidebarContent} = useSidebar();
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [items, setItems] = useState<SetlistItem[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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
      if (data.length > 0 && selectedId === null) {
        setSelectedId(data[0].id);
      }
      setLoading(false);
    });
  }, [loadSetlists]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedId !== null) {
      loadItems(selectedId);
    } else {
      setItems([]);
    }
  }, [selectedId, loadItems]);

  const handleCreate = useCallback(async () => {
    const id = await createSetlist(`Setlist ${setlists.length + 1}`);
    await loadSetlists();
    setSelectedId(id);
    toast.success('Setlist created');
  }, [setlists.length, loadSetlists]);

  const handleDelete = useCallback(async (id: number) => {
    await deleteSetlist(id);
    const updated = await loadSetlists();
    if (selectedId === id) {
      setSelectedId(updated.length > 0 ? updated[0].id : null);
    }
    toast.success('Setlist deleted');
  }, [selectedId, loadSetlists]);

  const handleRename = useCallback(async (id: number, name: string) => {
    await updateSetlist(id, {name});
    await loadSetlists();
  }, [loadSetlists]);

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
  };

  const handleRemoveItem = async (itemId: number) => {
    await removeSetlistItem(itemId);
    if (selectedId) {
      await loadItems(selectedId);
      await loadSetlists();
    }
  };

  const handleReorder = async (itemId: number, newPosition: number) => {
    if (!selectedId) return;
    await reorderSetlistItem(selectedId, itemId, newPosition);
    await loadItems(selectedId);
  };

  const handleChangeSpeed = async (itemId: number, speed: number) => {
    await updateSetlistItemSpeed(itemId, speed);
    if (selectedId) await loadItems(selectedId);
  };

  // Inject setlist navigator into the Layout sidebar
  useEffect(() => {
    setSidebarContent(
      <SetlistSidebar
        setlists={setlists}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onRename={handleRename}
      />
    );
  }, [setlists, selectedId, setSidebarContent, handleCreate, handleDelete, handleRename]);

  // Clean up sidebar on unmount
  useEffect(() => {
    return () => setSidebarContent(null);
  }, [setSidebarContent]);

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
