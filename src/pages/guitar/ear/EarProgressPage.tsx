// src/pages/guitar/ear/EarProgressPage.tsx
import {Link} from 'react-router-dom';
import {AccuracyBreakdown} from './components/AccuracyBreakdown';
import {TrainingPulse} from './components/TrainingPulse';
import {WeakSpotsCard} from './components/WeakSpotsCard';
import {useEarProgress} from './hooks/useEarProgress';

export default function EarProgressPage() {
  const {itemStats, userStats, loading} = useEarProgress();

  // Build training pulse data from itemStats (using lastPracticedAt)
  const pulseDays = (() => {
    const map = new Map<string, number>();
    for (const s of itemStats) {
      if (s.lastPracticedAt) {
        const day = s.lastPracticedAt.split('T')[0];
        map.set(day, (map.get(day) ?? 0) + 1);
      }
    }
    return Array.from(map.entries()).map(([date, count]) => ({date, count}));
  })();

  if (loading) {
    return <div className="p-8 text-on-surface-variant text-sm">Loading progress…</div>;
  }

  return (
    <div className="flex flex-col p-6 gap-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Progress Dashboard</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Your skills grow with every session.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — accuracy breakdown */}
        <div className="rounded-3xl bg-surface-container p-5">
          <h2 className="text-sm font-semibold text-on-surface mb-4">Accuracy Breakdown</h2>
          <AccuracyBreakdown stats={itemStats} />
        </div>

        {/* Right — training pulse + weak spots */}
        <div className="flex flex-col gap-4">
          <div className="rounded-3xl bg-surface-container p-5">
            <h2 className="text-sm font-semibold text-on-surface mb-3">Training Pulse</h2>
            <TrainingPulse data={pulseDays} weeks={12} />
          </div>

          <WeakSpotsCard stats={itemStats} limit={3} />
        </div>
      </div>

      {/* Bottom stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {label: 'Longest Streak', value: `${userStats?.longestStreak ?? 0} days`},
          {label: 'Total XP', value: (userStats?.totalXp ?? 0).toLocaleString()},
          {label: 'Sessions', value: String(userStats?.totalSessionsCompleted ?? 0)},
          {label: 'Overall Accuracy', value: `${Math.round((userStats?.overallAccuracy ?? 0) * 100)}%`},
        ].map(({label, value}) => (
          <div key={label} className="rounded-3xl bg-surface-container p-4 text-center">
            <p className="text-xl font-bold text-on-surface">{value}</p>
            <p className="text-xs text-on-surface-variant mt-1">{label}</p>
          </div>
        ))}
      </div>

      <Link
        to="/guitar/ear/recommendations"
        className="self-start text-sm text-primary hover:underline"
      >
        View full recommendations →
      </Link>
    </div>
  );
}
