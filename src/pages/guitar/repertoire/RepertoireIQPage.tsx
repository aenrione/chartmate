import {useState, useEffect, useMemo} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {Flame, BookOpen, CalendarCheck, ListMusic, PlusCircle, Clock, PanelRight, X} from 'lucide-react';
import {cn} from '@/lib/utils';
import {formatInterval} from '@/lib/repertoire/sm2';
import {useRepertoireStats} from './hooks/useRepertoireStats';
import {seedTheorySRS} from '@/lib/local-db/theory-srs';
import AddRepertoireItemDialog from './AddRepertoireItemDialog';
import type {RepertoireItem, ItemType, RepertoireFilter} from '@/lib/local-db/repertoire';

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  song: 'Song',
  song_section: 'Section',
  composition: 'Composition',
  exercise: 'Exercise',
  theory: 'Theory',
};

const ITEM_TYPE_COLORS: Record<ItemType, string> = {
  song: 'bg-blue-500/20 text-blue-400',
  song_section: 'bg-purple-500/20 text-purple-400',
  composition: 'bg-emerald-500/20 text-emerald-400',
  exercise: 'bg-amber-500/20 text-amber-400',
  theory: 'bg-violet-500/20 text-violet-400',
};

function ItemCard({item, today}: {item: RepertoireItem; today: string}) {
  const isOverdue = item.nextReviewDate < today;
  const isDueToday = item.nextReviewDate === today;

  return (
    <Link
      to={`/guitar/repertoire/session?item=${item.id}`}
      className={cn(
        'rounded-2xl border p-4 flex flex-col gap-2 cursor-pointer transition-colors hover:bg-opacity-80 active:scale-[0.99]',
        isOverdue
          ? 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10'
          : isDueToday
          ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
          : 'border-outline-variant/20 bg-surface-container hover:bg-surface-container-high',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-on-surface truncate">{item.title}</p>
          {item.artist && (
            <p className="text-xs text-on-surface-variant truncate">{item.artist}</p>
          )}
        </div>
        <span className={cn(
          'shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full',
          ITEM_TYPE_COLORS[item.itemType],
        )}>
          {ITEM_TYPE_LABELS[item.itemType]}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
        <Clock className="h-3 w-3" />
        {isOverdue ? (
          <span className="text-red-400 font-medium">Overdue</span>
        ) : (
          <span>Due {isDueToday ? 'today' : formatInterval(
            Math.round((new Date(item.nextReviewDate).getTime() - Date.now()) / 86400000)
          )}</span>
        )}
        {item.repetitions > 0 && (
          <span className="ml-auto">Rep {item.repetitions}</span>
        )}
      </div>
    </Link>
  );
}

const FILTER_TABS: {label: string; value: RepertoireFilter}[] = [
  {label: 'All', value: 'all'},
  {label: 'Guitar', value: 'guitar'},
  {label: 'Drums', value: 'drums'},
  {label: 'Theory', value: 'theory'},
];

export default function RepertoireIQPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = (searchParams.get('filter') ?? 'all') as RepertoireFilter;

  const {stats, dueItems, loading, refresh} = useRepertoireStats();
  const [addOpen, setAddOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];

  // Seed theory cards from completed lessons when user views the theory tab
  useEffect(() => {
    if (activeFilter === 'theory') {
      seedTheorySRS().then(refresh).catch(() => {});
    }
  }, [activeFilter]);

  const filteredItems = useMemo(() => {
    if (activeFilter === 'guitar') return dueItems.filter(i => i.compositionId !== null);
    if (activeFilter === 'drums') return dueItems.filter(i => i.savedChartMd5 !== null);
    if (activeFilter === 'theory') return dueItems.filter(i => i.itemType === 'theory');
    return dueItems;
  }, [dueItems, activeFilter]);

  const dueCount = filteredItems.length;
  const overdueCount = filteredItems.filter(i => i.nextReviewDate < today).length;

  const sessionHref = activeFilter === 'all'
    ? '/guitar/repertoire/session'
    : `/guitar/repertoire/session?filter=${activeFilter}`;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-5 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">RepertoireIQ</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              Spaced repetition for your guitar repertoire. Never forget a song again.
            </p>
          </div>
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden shrink-0 mt-1 p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
            aria-label="Open sidebar"
          >
            <PanelRight className="h-5 w-5" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-surface-container mb-5 w-fit">
          {FILTER_TABS.map(({label, value}) => (
            <button
              key={value}
              onClick={() => setSearchParams(value === 'all' ? {} : {filter: value})}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                activeFilter === value
                  ? 'bg-surface text-on-surface shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-2xl bg-surface-container p-4 text-center">
            <p className="text-2xl font-bold text-primary">{dueCount}</p>
            <p className="text-xs text-on-surface-variant mt-1">Due Today</p>
          </div>
          <div className="rounded-2xl bg-surface-container p-4 text-center">
            <p className={cn('text-2xl font-bold', overdueCount > 0 ? 'text-red-400' : 'text-on-surface')}>
              {overdueCount}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">Overdue</p>
          </div>
          <div className="rounded-2xl bg-surface-container p-4 text-center">
            <p className="text-2xl font-bold text-on-surface">{stats?.totalItems ?? 0}</p>
            <p className="text-xs text-on-surface-variant mt-1">Total Items</p>
          </div>
          <div className="rounded-2xl bg-surface-container p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <Flame className="h-5 w-5 text-amber-400" />
              <p className="text-2xl font-bold text-amber-400">{stats?.currentStreak ?? 0}</p>
            </div>
            <p className="text-xs text-on-surface-variant mt-1">Day Streak</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-6">
          <Link
            to={sessionHref}
            className={cn(
              'flex-1 py-3 rounded-2xl font-semibold text-sm text-center transition-all',
              dueCount > 0
                ? 'bg-primary text-on-primary hover:bg-primary/90 active:scale-95'
                : 'bg-surface-container text-on-surface-variant cursor-not-allowed opacity-50 pointer-events-none',
            )}
          >
            {dueCount > 0
              ? `Start Review Session (${dueCount} ${dueCount === 1 ? 'item' : 'items'})`
              : 'Nothing due today'}
          </Link>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-outline-variant/30 bg-surface-container text-on-surface text-sm font-medium hover:bg-surface-container-high transition-all"
          >
            <PlusCircle className="h-4 w-4" />
            Add Item
          </button>
        </div>

        {/* Due items list */}
        {loading ? (
          <div className="text-sm text-on-surface-variant text-center py-12">Loading…</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <CalendarCheck className="h-12 w-12 text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-on-surface font-medium">Nothing due today!</p>
            <p className="text-sm text-on-surface-variant mt-1">
              Come back tomorrow, or add more items to your repertoire.
            </p>
            {activeFilter === 'all' && (
              <button
                onClick={() => setAddOpen(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-semibold"
              >
                <PlusCircle className="h-4 w-4" />
                Add Your First Item
              </button>
            )}
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
              Due for Review
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredItems.map(item => (
                <ItemCard key={item.id} item={item} today={today} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'w-64 shrink-0 border-l border-surface-container-high overflow-y-auto p-5 flex flex-col gap-4',
          'lg:relative lg:flex lg:translate-x-0',
          sidebarOpen
            ? 'fixed inset-y-0 right-0 z-50 bg-surface flex'
            : 'hidden',
        )}
        style={sidebarOpen ? {
          paddingTop: 'max(1.25rem, var(--sat))',
          paddingBottom: 'max(1.25rem, var(--sab))',
          right: 'var(--sar)',
        } : undefined}
      >
        {/* Mobile close button */}
        <div className="lg:hidden flex justify-end -mb-2">
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress breakdown */}
        <div className="rounded-2xl bg-surface-container p-4">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
            Your Repertoire
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">New</span>
              <span className="font-medium text-on-surface">{stats?.newItems ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Learning</span>
              <span className="font-medium text-on-surface">{stats?.learningItems ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Mature</span>
              <span className="font-medium text-on-surface">{stats?.reviewItems ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Streak */}
        <div className="rounded-2xl bg-surface-container p-4 flex items-center gap-3">
          <Flame className="h-8 w-8 text-amber-400 shrink-0" />
          <div>
            <p className="text-lg font-bold text-on-surface">
              {stats?.currentStreak ?? 0} days
            </p>
            <p className="text-xs text-on-surface-variant">Current streak</p>
          </div>
        </div>

        {/* Quick links */}
        <div className="space-y-1">
          <Link
            to="/guitar/repertoire/manage"
            className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface px-3 py-2 rounded-lg hover:bg-surface-container transition-all"
          >
            <ListMusic className="h-4 w-4" />
            Manage items
          </Link>
          <Link
            to="/guitar/repertoire/progress"
            className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface px-3 py-2 rounded-lg hover:bg-surface-container transition-all"
          >
            <BookOpen className="h-4 w-4" />
            View progress
          </Link>
        </div>
      </aside>

      <AddRepertoireItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={refresh}
      />
    </div>
  );
}
