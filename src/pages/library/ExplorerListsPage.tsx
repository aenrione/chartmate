import {useEffect, useRef, useState} from 'react';
import {Trash2, BookOpen, Plus, Check} from 'lucide-react';
import {cn} from '@/lib/utils';
import {
  getExplorerLists,
  getExplorerSaves,
  removeExplorerSave,
  type ExplorerSave,
} from '@/lib/local-db/explorer-saves';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {toast} from 'sonner';
import {TrackDetailDrawer} from '@/components/TrackDetailDrawer';
import {useChartResultsCache, useTabResultsCache} from '@/hooks/useTrackResults';

export default function ExplorerListsPage() {
  const [lists, setLists] = useState<string[]>([]);
  const [activeList, setActiveList] = useState<string>('Watch Later');
  const [saves, setSaves] = useState<ExplorerSave[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSave, setSelectedSave] = useState<ExplorerSave | null>(null);

  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const newListInputRef = useRef<HTMLInputElement>(null);

  const chartCache = useChartResultsCache();
  const tabCache = useTabResultsCache();

  async function loadLists() {
    const all = await getExplorerLists();
    const withDefault = all.includes('Watch Later') ? all : ['Watch Later', ...all];
    setLists(withDefault);
    return withDefault;
  }

  async function loadSaves(listName: string) {
    setLoading(true);
    try {
      setSaves(await getExplorerSaves(listName));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLists().then(all => {
      const first = all[0] ?? 'Watch Later';
      setActiveList(first);
      loadSaves(first);
    });
  }, []);

  useEffect(() => {
    if (creatingList && newListInputRef.current) {
      newListInputRef.current.focus();
    }
  }, [creatingList]);

  async function handleRemove(save: ExplorerSave) {
    await removeExplorerSave(save.id);
    if (selectedSave?.id === save.id) setSelectedSave(null);
    setSaves(prev => prev.filter(s => s.id !== save.id));
    const updated = await loadLists();
    if (!updated.includes(activeList)) {
      const next = updated[0] ?? 'Watch Later';
      setActiveList(next);
      loadSaves(next);
    }
    toast.success(`Removed "${save.name}"`);
  }

  function selectList(name: string) {
    setActiveList(name);
    setSelectedSave(null);
    loadSaves(name);
  }

  function handleSelectTrack(save: ExplorerSave) {
    setSelectedSave(save);
    chartCache.trigger(save.artist, save.name);
  }

  function commitNewList() {
    const name = newListName.trim();
    if (!name) {
      setCreatingList(false);
      setNewListName('');
      return;
    }
    if (!lists.includes(name)) {
      setLists(prev => [...prev, name]);
    }
    setCreatingList(false);
    setNewListName('');
    selectList(name);
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden h-full">
      {/* Sidebar */}
      <div className="w-56 shrink-0 border-r border-border flex flex-col bg-surface-container-low">
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-headline font-bold text-sm text-on-surface tracking-tight">
            My Lists
          </h2>
          <button
            onClick={() => setCreatingList(true)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            title="New list">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {lists.length === 0 && !creatingList ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">No lists yet</p>
          ) : (
            lists.map(name => (
              <button
                key={name}
                onClick={() => selectList(name)}
                className={cn(
                  'w-full text-left px-4 py-2 text-sm transition-colors truncate',
                  activeList === name
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}>
                {name}
              </button>
            ))
          )}
          {creatingList && (
            <div className="px-2 py-1 flex items-center gap-1">
              <Input
                ref={newListInputRef}
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitNewList();
                  if (e.key === 'Escape') {
                    setCreatingList(false);
                    setNewListName('');
                  }
                }}
                placeholder="List name…"
                className="h-7 text-xs"
              />
              <button
                onClick={commitNewList}
                className="p-1 rounded hover:bg-accent text-muted-foreground flex-shrink-0">
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        <div className="shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
          <h1 className="font-headline font-bold text-xl text-on-surface">
            {activeList}
          </h1>
          <span className="text-sm text-muted-foreground">
            {saves.length} {saves.length === 1 ? 'track' : 'tracks'}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              Loading...
            </div>
          ) : saves.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <BookOpen className="h-8 w-8 opacity-40" />
              <p className="text-sm">No tracks saved to this list yet</p>
              <p className="text-xs opacity-60">
                Use the ⋮ menu in Spotify Explorer to save tracks
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {saves.map(save => (
                <div
                  key={save.id}
                  onClick={() => handleSelectTrack(save)}
                  className={cn(
                    'flex items-center gap-4 px-6 py-3 hover:bg-accent/30 group cursor-pointer transition-colors',
                    selectedSave?.id === save.id && 'bg-accent/50',
                  )}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{save.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{save.artist}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(save.addedAt).toLocaleDateString()}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={e => {
                      e.stopPropagation();
                      handleRemove(save);
                    }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedSave && (
          <TrackDetailDrawer
            track={{
              id: String(selectedSave.id),
              artist: selectedSave.artist,
              name: selectedSave.name,
            }}
            chartCache={chartCache}
            tabCache={tabCache}
            onClose={() => setSelectedSave(null)}
          />
        )}
      </div>
    </div>
  );
}
