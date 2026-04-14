import {useState, useEffect} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft, PlusCircle, Trash2, Pencil} from 'lucide-react';
import {cn} from '@/lib/utils';
import {
  getAllItems,
  deleteItem,
  type RepertoireItem,
  type ItemType,
} from '@/lib/local-db/repertoire';
import {formatInterval} from '@/lib/repertoire/sm2';
import AddRepertoireItemDialog from './AddRepertoireItemDialog';

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  song: 'Song',
  song_section: 'Section',
  composition: 'Composition',
  exercise: 'Exercise',
};

const ITEM_TYPE_COLORS: Record<ItemType, string> = {
  song: 'bg-blue-500/20 text-blue-400',
  song_section: 'bg-purple-500/20 text-purple-400',
  composition: 'bg-emerald-500/20 text-emerald-400',
  exercise: 'bg-amber-500/20 text-amber-400',
};

export default function RepertoireManagePage() {
  const [items, setItems] = useState<RepertoireItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<ItemType | 'all'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const today = new Date().toISOString().split('T')[0];

  const loadItems = () => {
    setLoading(true);
    getAllItems()
      .then(setItems)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteItem(id);
      setItems(prev => prev.filter(i => i.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = items.filter(item => {
    const matchesSearch =
      search === '' ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      (item.artist?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesType = filterType === 'all' || item.itemType === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to="/guitar/repertoire"
            className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface"
          >
            <ArrowLeft className="h-4 w-4" />
            Repertoire
          </Link>
          <span className="text-on-surface-variant">/</span>
          <h1 className="text-sm font-semibold text-on-surface">Manage Items</h1>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all"
        >
          <PlusCircle className="h-4 w-4" />
          Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-outline-variant/10 shrink-0">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search items…"
          className="flex-1 max-w-xs px-3 py-1.5 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary"
        />
        <div className="flex gap-1.5">
          {(['all', 'song', 'song_section', 'composition', 'exercise'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                filterType === t
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high',
              )}
            >
              {t === 'all' ? 'All' : ITEM_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-sm text-on-surface-variant text-center py-12">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-on-surface-variant text-sm">
              {items.length === 0 ? 'No items yet. Add something!' : 'No items match your search.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/10">
            {filtered.map(item => {
              const isOverdue = item.nextReviewDate < today;
              const isDueToday = item.nextReviewDate === today;
              return (
                <div key={item.id} className="flex items-center px-6 py-3 gap-4 hover:bg-surface-container/50 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-on-surface truncate">{item.title}</p>
                      <span className={cn(
                        'shrink-0 text-xs px-1.5 py-0.5 rounded-full',
                        ITEM_TYPE_COLORS[item.itemType],
                      )}>
                        {ITEM_TYPE_LABELS[item.itemType]}
                      </span>
                    </div>
                    {item.artist && (
                      <p className="text-xs text-on-surface-variant mt-0.5">{item.artist}</p>
                    )}
                  </div>
                  <div className="text-right text-xs shrink-0 hidden sm:block">
                    <p className={cn(
                      'font-medium',
                      isOverdue ? 'text-red-400' : isDueToday ? 'text-primary' : 'text-on-surface-variant',
                    )}>
                      {isOverdue ? 'Overdue' : isDueToday ? 'Due today' : `In ${formatInterval(
                        Math.max(0, Math.round((new Date(item.nextReviewDate).getTime() - Date.now()) / 86400000))
                      )}`}
                    </p>
                    <p className="text-on-surface-variant mt-0.5">Rep {item.repetitions}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-on-surface-variant hover:text-red-400 hover:bg-red-400/10 transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AddRepertoireItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={loadItems}
      />
    </div>
  );
}
