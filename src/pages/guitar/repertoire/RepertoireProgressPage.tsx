import {useState, useEffect} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft, Flame, BookOpen, BarChart3} from 'lucide-react';
import {cn} from '@/lib/utils';
import {
  getAllItems,
  getRepertoireStats,
  getStreakData,
  type RepertoireItem,
  type RepertoireStats,
} from '@/lib/local-db/repertoire';
import {formatInterval} from '@/lib/repertoire/sm2';

function StatCard({label, value, sub}: {label: string; value: string | number; sub?: string}) {
  return (
    <div className="rounded-2xl bg-surface-container p-4 text-center">
      <p className="text-2xl font-bold text-on-surface">{value}</p>
      <p className="text-xs text-on-surface-variant mt-1">{label}</p>
      {sub && <p className="text-xs text-on-surface-variant/60 mt-0.5">{sub}</p>}
    </div>
  );
}

function CalendarHeatmap({data}: {data: {date: string; count: number}[]}) {
  const today = new Date();
  const weeks: {date: string; count: number}[][] = [];
  const countMap = new Map(data.map(d => [d.date, d.count]));

  // Build 12 weeks back from today
  const start = new Date(today);
  start.setDate(start.getDate() - 83); // ~12 weeks
  // Align to Sunday
  start.setDate(start.getDate() - start.getDay());

  let week: {date: string; count: number}[] = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const dateStr = cursor.toISOString().split('T')[0];
    week.push({date: dateStr, count: countMap.get(dateStr) ?? 0});
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (week.length > 0) weeks.push(week);

  const max = Math.max(1, ...data.map(d => d.count));

  return (
    <div className="flex gap-1 overflow-x-auto pb-2">
      {weeks.map((w, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {w.map(day => {
            const intensity = day.count === 0 ? 0 : Math.ceil((day.count / max) * 4);
            return (
              <div
                key={day.date}
                title={`${day.date}: ${day.count} reviews`}
                className={cn(
                  'h-3 w-3 rounded-sm',
                  intensity === 0 ? 'bg-surface-container-high'
                  : intensity === 1 ? 'bg-primary/20'
                  : intensity === 2 ? 'bg-primary/40'
                  : intensity === 3 ? 'bg-primary/60'
                  : 'bg-primary/90',
                )}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function RepertoireProgressPage() {
  const [stats, setStats] = useState<RepertoireStats | null>(null);
  const [items, setItems] = useState<RepertoireItem[]>([]);
  const [streakData, setStreakData] = useState<{date: string; count: number}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getRepertoireStats(), getAllItems(), getStreakData()])
      .then(([s, i, sd]) => {
        setStats(s);
        setItems(i);
        setStreakData(sd);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-outline-variant/20 shrink-0">
        <Link
          to="/guitar/repertoire"
          className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface"
        >
          <ArrowLeft className="h-4 w-4" />
          Repertoire
        </Link>
        <span className="text-on-surface-variant">/</span>
        <h1 className="text-sm font-semibold text-on-surface">Progress</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-sm text-on-surface-variant text-center py-12">Loading…</div>
        ) : (
          <div className="max-w-3xl mx-auto flex flex-col gap-6">
            {/* Stats overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total Items" value={stats?.totalItems ?? 0} />
              <StatCard label="Mature" value={stats?.reviewItems ?? 0} sub="≥2 reps" />
              <StatCard label="Current Streak" value={`${stats?.currentStreak ?? 0}d`} />
              <StatCard label="Best Streak" value={`${stats?.longestStreak ?? 0}d`} />
            </div>

            {/* Review calendar */}
            <div className="rounded-2xl bg-surface-container p-5">
              <h2 className="text-sm font-semibold text-on-surface mb-4">Review Activity</h2>
              {streakData.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No reviews yet.</p>
              ) : (
                <CalendarHeatmap data={streakData} />
              )}
            </div>

            {/* Items table */}
            <div className="rounded-2xl bg-surface-container overflow-hidden">
              <div className="px-5 py-4 border-b border-outline-variant/20">
                <h2 className="text-sm font-semibold text-on-surface">All Items</h2>
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-on-surface-variant p-5">No items yet.</p>
              ) : (
                <div className="divide-y divide-outline-variant/10">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center px-5 py-3 gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{item.title}</p>
                        {item.artist && (
                          <p className="text-xs text-on-surface-variant truncate">{item.artist}</p>
                        )}
                      </div>
                      <div className="text-right text-xs text-on-surface-variant shrink-0">
                        <p>Next: {item.nextReviewDate}</p>
                        <p className="mt-0.5">
                          Interval: {formatInterval(item.interval)} · Rep {item.repetitions}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
