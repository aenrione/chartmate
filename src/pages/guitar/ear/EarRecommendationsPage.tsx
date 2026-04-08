// src/pages/guitar/ear/EarRecommendationsPage.tsx
import {Link} from 'react-router-dom';
import {useRecommendation} from './hooks/useRecommendation';
import {useEarProgress} from './hooks/useEarProgress';

const TOOL_LABELS = {eariq: 'EarIQ', fretboardiq: 'FretboardIQ'};

export default function EarRecommendationsPage() {
  const {recommendations, loading} = useRecommendation();
  const {userStats} = useEarProgress();

  if (loading) {
    return <div className="p-8 text-on-surface-variant text-sm">Analyzing your practice…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-on-surface">
          If you practice these{' '}
          <span className="text-primary">{recommendations.length}</span>{' '}
          things today, you'll improve fastest.
        </h1>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {label: 'Overall Accuracy', value: `${Math.round((userStats?.overallAccuracy ?? 0) * 100)}%`},
          {label: 'Current Streak', value: `${userStats?.currentStreak ?? 0} days`},
          {label: 'Total XP', value: (userStats?.totalXp ?? 0).toLocaleString()},
          {label: 'Best Streak', value: `${userStats?.longestStreak ?? 0} days`},
        ].map(({label, value}) => (
          <div key={label} className="rounded-3xl bg-surface-container p-4 text-center">
            <p className="text-lg font-bold text-on-surface">{value}</p>
            <p className="text-xs text-on-surface-variant">{label}</p>
          </div>
        ))}
      </div>

      {/* Priority queue */}
      <div className="rounded-3xl bg-surface-container p-5">
        <h2 className="text-sm font-semibold text-on-surface mb-4">Priority Queue</h2>
        {recommendations.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            Practice more sessions to unlock personalized recommendations.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {recommendations.map((rec, i) => (
              <div key={`${rec.tool}-${rec.item}`} className="flex items-center gap-4 rounded-2xl bg-surface-container-high p-4">
                <span className="text-2xl font-bold text-on-surface-variant w-6">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${rec.tool === 'eariq' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
                      {TOOL_LABELS[rec.tool]}
                    </span>
                    <span className="text-sm font-medium text-on-surface">{rec.item}</span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">{rec.reason}</p>
                </div>
                <Link
                  to={rec.tool === 'eariq'
                    ? `/guitar/ear/session/${rec.exerciseType}`
                    : `/guitar/fretboard/drill/${rec.exerciseType}`}
                  className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary/90"
                >
                  Start
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Link to="/guitar/ear" className="text-sm text-primary hover:underline">← Back to EarIQ</Link>
        <Link to="/guitar/ear/progress" className="text-sm text-primary hover:underline">Progress Dashboard →</Link>
      </div>
    </div>
  );
}
