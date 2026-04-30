// src/pages/guitar/ear/EarIQPage.tsx
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {Flame, Trophy, Zap, PanelRight, X} from 'lucide-react';
import {cn} from '@/lib/utils';
import {getAllExercises} from './exercises/index';
import {ExerciseCard} from './components/ExerciseCard';
import {WeakSpotsCard} from './components/WeakSpotsCard';
import {useEarProgress} from './hooks/useEarProgress';
import {useRecommendation} from './hooks/useRecommendation';

// Trigger all registrations
import './exercises/index';

export default function EarIQPage() {
  const {itemStats, userStats, loading} = useEarProgress();
  const {recommendations} = useRecommendation();
  const exercises = getAllExercises();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Best accuracy map per exercise type (for card display)
  const bestMap = new Map<string, number>();
  for (const s of itemStats) {
    const cur = bestMap.get(s.exerciseType) ?? 0;
    bestMap.set(s.exerciseType, Math.max(cur, s.accuracy));
  }

  const topRec = recommendations[0];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">EarIQ</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              Master the architecture of sound through deliberate practice.
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

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {exercises.map(ex => (
            <ExerciseCard
              key={ex.type}
              descriptor={ex}
              bestAccuracy={bestMap.get(ex.type) ?? null}
            />
          ))}
        </div>
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
          'w-72 shrink-0 border-l border-surface-container-high overflow-y-auto p-5 flex flex-col gap-4',
          'lg:relative lg:flex lg:translate-x-0',
          sidebarOpen
            ? 'fixed inset-y-0 right-0 z-50 bg-surface flex'
            : 'hidden',
        )}
        style={sidebarOpen ? {
          paddingTop: 'max(1.25rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))',
          right: 'env(safe-area-inset-right, 0px)',
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

        {/* Accuracy ring */}
        <div className="rounded-3xl bg-surface-container p-5 text-center">
          <div className="relative inline-flex items-center justify-center">
            <svg className="h-24 w-24 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-surface-container-high" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke="currentColor" strokeWidth="2.5"
                strokeDasharray={`${(userStats?.overallAccuracy ?? 0) * 100} 100`}
                strokeLinecap="round"
                className="text-primary transition-all duration-500"
              />
            </svg>
            <span className="absolute text-2xl font-bold text-on-surface">
              {Math.round((userStats?.overallAccuracy ?? 0) * 100)}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-2">Overall Accuracy</p>
        </div>

        {/* Stats */}
        <div className="rounded-3xl bg-surface-container p-4 flex justify-between">
          <div className="text-center">
            <div className="flex items-center gap-1 text-amber-400">
              <Flame className="h-4 w-4" />
              <span className="font-bold">{userStats?.currentStreak ?? 0}</span>
            </div>
            <p className="text-xs text-on-surface-variant">Day Streak</p>
          </div>
          <div className="text-center">
            <div className="flex items-center gap-1 text-primary">
              <Trophy className="h-4 w-4" />
              <span className="font-bold">{userStats?.totalSessionsCompleted ?? 0}</span>
            </div>
            <p className="text-xs text-on-surface-variant">Sessions</p>
          </div>
          <div className="text-center">
            <div className="flex items-center gap-1 text-tertiary">
              <Zap className="h-4 w-4" />
              <span className="font-bold">{(userStats?.totalXp ?? 0).toLocaleString()}</span>
            </div>
            <p className="text-xs text-on-surface-variant">Total XP</p>
          </div>
        </div>

        {/* Recommendation */}
        {topRec && (
          <div className="rounded-3xl bg-primary/10 border border-primary/20 p-4">
            <p className="text-xs font-semibold text-primary mb-1">Recommended for you</p>
            <p className="text-sm text-on-surface font-medium">{topRec.item}</p>
            <p className="text-xs text-on-surface-variant">{topRec.reason}</p>
            <Link
              to={topRec.tool === 'eariq'
                ? `/guitar/ear/session/${topRec.exerciseType}`
                : `/guitar/fretboard/drill/${topRec.exerciseType}`}
              className="mt-3 block w-full rounded-full bg-primary px-4 py-2 text-center text-xs font-semibold text-on-primary hover:bg-primary/90"
            >
              Start Now →
            </Link>
          </div>
        )}

        <WeakSpotsCard stats={itemStats} />

        <Link
          to="/guitar/ear/recommendations"
          className="text-center text-xs text-primary hover:underline"
        >
          See full analysis →
        </Link>
      </aside>
    </div>
  );
}
