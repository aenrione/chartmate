// src/pages/guitar/ear/EarSummaryPage.tsx
import {useLocation, useNavigate, Link} from 'react-router-dom';
import {AnswerHistoryChart} from './components/AnswerHistoryChart';
import {useRecommendation} from './hooks/useRecommendation';
import type {EarAnswerResult} from './exercises/types';
import type {EarExerciseType} from '@/lib/local-db/ear-training';

function computeHeadline(accuracy: number): {title: string; sub: string} {
  if (accuracy >= 0.9) return {title: 'Perfect Ear.', sub: 'Exceptional accuracy across the board.'};
  if (accuracy >= 0.75) return {title: 'Sharp Hearing.', sub: 'Strong performance — keep refining.'};
  if (accuracy >= 0.5) return {title: 'Getting There.', sub: 'Solid foundation. Push that accuracy up.'};
  return {title: 'Keep Listening.', sub: 'Every session builds the ear.'};
}

interface LocationState {
  results: EarAnswerResult[];
  exerciseType: EarExerciseType;
  sessionId: number;
}

export default function EarSummaryPage() {
  const navigate = useNavigate();
  const {state} = useLocation() as {state: LocationState | null};
  const {recommendations} = useRecommendation();

  if (!state?.results) {
    return (
      <div className="p-8 text-center">
        <p className="text-on-surface-variant">No session data found.</p>
        <Link to="/guitar/ear" className="text-primary text-sm mt-4 block">Back to EarIQ</Link>
      </div>
    );
  }

  const {results, exerciseType} = state;
  const correct = results.filter(r => r.isCorrect).length;
  const accuracy = results.length > 0 ? correct / results.length : 0;
  const totalTime = results.reduce((sum, r) => sum + r.responseTimeMs, 0);
  const avgTime = results.length > 0 ? totalTime / results.length : 0;
  const bestStreak = (() => {
    let streak = 0; let best = 0;
    for (const r of results) { streak = r.isCorrect ? streak + 1 : 0; best = Math.max(best, streak); }
    return best;
  })();
  const xpEarned = correct * 10 + bestStreak * 5 + (accuracy === 1 ? 50 : 0);

  const {title, sub} = computeHeadline(accuracy);

  // Build per-item stats from results
  const itemMap = new Map<string, {correct: number; total: number}>();
  for (const r of results) {
    const item = r.question.correctAnswer;
    const cur = itemMap.get(item) ?? {correct: 0, total: 0};
    itemMap.set(item, {correct: cur.correct + (r.isCorrect ? 1 : 0), total: cur.total + 1});
  }
  const itemStats = Array.from(itemMap.entries()).map(([item, {correct, total}]) => ({item, correct, total}));

  // Most confused pair
  const confusedPairs = new Map<string, number>();
  for (const r of results) {
    if (!r.isCorrect && r.givenAnswer) {
      const key = `${r.question.correctAnswer} → ${r.givenAnswer}`;
      confusedPairs.set(key, (confusedPairs.get(key) ?? 0) + 1);
    }
  }
  const topConfused = [...confusedPairs.entries()].sort((a, b) => b[1] - a[1])[0];

  const topRec = recommendations.find(r => r.exerciseType === exerciseType) ?? recommendations[0];

  return (
    <div className="flex flex-col items-center p-8 max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <div className="self-start text-xs text-on-surface-variant mb-6">
        <Link to="/guitar/ear" className="hover:text-primary">EarIQ</Link> / Summary
      </div>

      {/* Headline */}
      <div className="text-center mb-8">
        <div className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
          SESSION COMPLETE
        </div>
        <h1 className="text-5xl font-bold text-on-surface italic">{title}</h1>
        <p className="text-on-surface-variant mt-2">{sub}</p>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 gap-4 w-full mb-6">
        {[
          {label: 'Accuracy', value: `${Math.round(accuracy * 100)}%`, color: 'text-green-400'},
          {label: 'Time', value: `${Math.floor(totalTime / 60000)}:${String(Math.floor((totalTime % 60000) / 1000)).padStart(2,'0')}`, color: 'text-blue-400'},
          {label: 'Best Streak', value: String(bestStreak), color: 'text-amber-400'},
          {label: 'XP Earned', value: `+${xpEarned}`, color: 'text-primary'},
        ].map(({label, value, color}) => (
          <div key={label} className="rounded-3xl bg-surface-container p-5">
            <p className="text-xs text-on-surface-variant">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Answer history */}
      <div className="w-full rounded-3xl bg-surface-container p-5 mb-4">
        <div className="flex justify-between mb-3">
          <h3 className="text-sm font-semibold text-on-surface">Answer History</h3>
          <span className="text-xs text-on-surface-variant">Frequency per item</span>
        </div>
        <AnswerHistoryChart stats={itemStats} />
      </div>

      {/* Most confused pair */}
      {topConfused && (
        <div className="w-full rounded-3xl bg-red-500/10 border border-red-500/20 p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-red-400">MOST CONFUSED PAIR</p>
            <p className="text-sm text-on-surface mt-1">{topConfused[0]}</p>
          </div>
          <p className="text-2xl font-bold text-red-400">{topConfused[1]}×</p>
        </div>
      )}

      {/* Recommendation */}
      {topRec && (
        <div className="w-full rounded-3xl bg-surface-container p-5 text-center mb-6">
          <p className="text-sm font-semibold text-on-surface">Deepen the Resonance</p>
          <p className="text-xs text-on-surface-variant mt-1">
            Focusing on <span className="text-primary">{topRec.item}</span> could boost your score.
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => navigate(`/guitar/ear/session/${exerciseType}`)}
              className="flex-1 rounded-full py-2 text-sm bg-surface-container-high text-on-surface"
            >
              Practice Again
            </button>
            <Link
              to={`/guitar/ear/session/${topRec.exerciseType}`}
              className="flex-1 rounded-full py-2 text-sm bg-primary text-on-primary text-center"
            >
              Try Recommended
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
