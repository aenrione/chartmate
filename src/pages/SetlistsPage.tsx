import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {
  GripVertical,
  ListMusic,
  Music,
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
} from '@/lib/local-db/setlists';
import {getSavedCharts} from '@/lib/local-db/saved-charts';
import {ChartResponseEncore} from '@/lib/chartSelection';

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
    <div className="w-64 border-r border-white/5 flex flex-col shrink-0 bg-surface-container-low">
      <div className="px-3 py-3 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-on-surface">Setlists</h2>
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
    </div>
  );
}

// ── Add Songs Dialog ─────────────────────────────────────────────────

function AddSongsDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (charts: ChartResponseEncore[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [charts, setCharts] = useState<ChartResponseEncore[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const loadCharts = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const results = await getSavedCharts(q);
      setCharts(results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadCharts();
      setSelected(new Set());
      setSearch('');
    }
  }, [open, loadCharts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (open) loadCharts(search || undefined);
    }, 200);
    return () => clearTimeout(timer);
  }, [search, open, loadCharts]);

  const toggleSelect = (md5: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(md5)) next.delete(md5);
      else next.add(md5);
      return next;
    });
  };

  const handleAdd = () => {
    const toAdd = charts.filter(c => selected.has(c.md5));
    onAdd(toAdd);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Songs from Saved Charts</DialogTitle>
        </DialogHeader>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-outline" />
          <Input
            placeholder="Search saved charts..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto mt-3 border border-outline-variant/20 rounded-lg">
          {loading ? (
            <div className="p-6 text-center text-sm text-outline">Loading...</div>
          ) : charts.length === 0 ? (
            <div className="p-6 text-center text-sm text-outline">
              {search ? 'No charts match your search.' : 'No saved charts. Save some charts first from Browse or Sheet Music.'}
            </div>
          ) : (
            <div>
              {charts.map(chart => (
                <label
                  key={chart.md5}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-white/5 last:border-b-0 transition-colors',
                    selected.has(chart.md5) ? 'bg-surface-container' : 'hover:bg-surface-container-high',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(chart.md5)}
                    onChange={() => toggleSelect(chart.md5)}
                    className="rounded border-outline-variant/20 text-on-surface focus:ring-outline"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-on-surface truncate">{chart.name}</div>
                    <div className="text-xs text-on-surface-variant truncate">
                      {chart.artist} &middot; {chart.charter}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-outline shrink-0">
                    {chart.diff_guitar != null && chart.diff_guitar >= 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-surface-container">Guitar</span>
                    )}
                    {chart.diff_drums != null && chart.diff_drums >= 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-surface-container">Drums</span>
                    )}
                    {chart.diff_bass != null && chart.diff_bass >= 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-surface-container">Bass</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
          <span className="text-sm text-on-surface-variant">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={selected.size === 0} onClick={handleAdd}>
              Add {selected.size > 0 ? `(${selected.size})` : ''}
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

// ── Draggable Song Row ───────────────────────────────────────────────

function SongRow({
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
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-on-surface truncate">{item.name}</div>
        <div className="text-xs text-on-surface-variant truncate">
          {item.artist} &middot; {item.charter}
        </div>
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
  onAddSongs,
  onRemoveItem,
  onReorder,
  onChangeSpeed,
}: {
  setlist: Setlist;
  items: SetlistItem[];
  onAddSongs: () => void;
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

  const totalDuration = useMemo(() => {
    // We don't have song_length in setlist_items, so skip for now
    return null;
  }, []);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-on-surface truncate">{setlist.name}</h1>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-on-surface-variant">
            <span>{items.length} {items.length === 1 ? 'song' : 'songs'}</span>
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
          <Button size="sm" onClick={onAddSongs}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Songs
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
                  Add songs from your saved charts to build this setlist.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={onAddSongs}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Songs
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        ) : (
          <div>
            {items.map((item, i) => (
              <SongRow
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

  const handleCreate = async () => {
    const id = await createSetlist(`Setlist ${setlists.length + 1}`);
    await loadSetlists();
    setSelectedId(id);
    toast.success('Setlist created');
  };

  const handleDelete = async (id: number) => {
    await deleteSetlist(id);
    const updated = await loadSetlists();
    if (selectedId === id) {
      setSelectedId(updated.length > 0 ? updated[0].id : null);
    }
    toast.success('Setlist deleted');
  };

  const handleRename = async (id: number, name: string) => {
    await updateSetlist(id, {name});
    await loadSetlists();
  };

  const handleAddSongs = async (charts: ChartResponseEncore[]) => {
    if (!selectedId) return;
    for (const chart of charts) {
      await addSetlistItem(selectedId, {
        md5: chart.md5,
        name: chart.name,
        artist: chart.artist,
        charter: chart.charter,
      });
    }
    await loadItems(selectedId);
    await loadSetlists();
    toast.success(`Added ${charts.length} song${charts.length > 1 ? 's' : ''}`);
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-outline">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      <SetlistSidebar
        setlists={setlists}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onRename={handleRename}
      />

      {selectedSetlist ? (
        <SetlistEditor
          setlist={selectedSetlist}
          items={items}
          onAddSongs={() => setAddDialogOpen(true)}
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
                Create a setlist to organize your charts into ordered playlists for Clone Hero, YARG, or ScoreSpy.
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

      <AddSongsDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={handleAddSongs}
      />
    </div>
  );
}
