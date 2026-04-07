import {useLocation, useNavigate} from 'react-router-dom';
import {Brain, Timer, Flame, TrendingUp, CheckCircle, X, SkipForward} from 'lucide-react';
import type {AnswerResult} from './drills/types';

interface SummaryState {
  sessionId: number;
  drillType: string;
  drillName: string;
  results: AnswerResult[];
  score: number;
  bestStreak: number;
  durationMs: number;
  totalQuestions: number;
}

export default function FretboardSummaryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const data = location.state as SummaryState | null;

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-on-surface-variant mb-4">No session data available.</p>
          <button
            onClick={() => navigate('/guitar/fretboard')}
            className="px-6 py-3 rounded-xl bg-primary-container text-on-primary-container font-bold"
          >
            Back to Hub
          </button>
        </div>
      </div>
    );
  }

  const correctCount = data.results.filter(r => r.isCorrect).length;
  const skippedCount = data.results.filter(r => r.isSkipped).length;
  const accuracy = Math.round((correctCount / Math.max(1, data.totalQuestions)) * 100);
  const durationSec = Math.floor(data.durationMs / 1000);
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // XP calculation
  const speedBonus = data.results.reduce((sum, r) => {
    if (!r.isCorrect) return sum;
    return sum + (r.responseTimeMs < 1000 ? 5 : r.responseTimeMs < 2000 ? 3 : 0);
  }, 0);
  const baseXp = correctCount * 10 + speedBonus;
  const streakBonus = data.bestStreak * 5;
  const perfectBonus = accuracy === 100 ? 50 : 0;
  const totalXp = baseXp + streakBonus + perfectBonus;

  // Trouble spots
  const incorrectResults = data.results.filter(r => !r.isCorrect && !r.isSkipped);

  // Headline text
  const headline = accuracy >= 90 ? 'Mastery Achieved.'
    : accuracy >= 70 ? 'Solid Performance.'
    : accuracy >= 50 ? 'Keep Practicing.'
    : 'Room to Grow.';

  return (
    <div className="max-w-6xl mx-auto">
      {/* Hero Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
        <div className="lg:col-span-7 flex flex-col justify-center">
          <span className="text-primary font-mono text-sm tracking-widest mb-2">SESSION COMPLETE</span>
          <h1 className="text-5xl md:text-7xl font-extrabold font-headline tracking-tighter text-on-surface mb-6">
            {headline}
          </h1>
          <p className="text-on-surface-variant text-lg max-w-md leading-relaxed mb-8">
            You identified {accuracy}% of the positions correctly in {data.drillName}.
            {data.bestStreak > 3 && ` Your best streak was ${data.bestStreak} in a row!`}
          </p>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => navigate(`/guitar/fretboard/drill/${data.drillType}`)}
              className="px-8 py-4 rounded-xl bg-gradient-to-br from-secondary-container to-primary-container text-on-secondary-container font-bold text-lg hover:scale-[1.02] active:scale-95 transition-all shadow-xl"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/guitar/fretboard')}
              className="px-8 py-4 rounded-xl border border-outline-variant/20 text-primary font-bold text-lg hover:bg-surface-container transition-all"
            >
              Back to Hub
            </button>
          </div>
        </div>

        {/* Score Bento Grid */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-4">
          <ScoreCard label="Accuracy" value={`${accuracy}%`} trend={accuracy >= 80 ? '+' : ''} trendLabel="vs last" color="secondary" />
          <ScoreCard label="Time Taken" value={timeStr} icon={<Timer className="h-4 w-4" />} trendLabel="" color="secondary" />
          <ScoreCard
            label="Streak"
            value={`${data.bestStreak}`}
            icon={<Flame className="h-4 w-4" />}
            trendLabel={data.bestStreak > 5 ? 'On Fire' : ''}
            color="tertiary"
          />
          <div className="bg-primary-container/10 border border-primary-container/20 p-6 rounded-2xl flex flex-col justify-between hover:scale-[1.02] transition-transform">
            <span className="text-primary text-xs font-mono uppercase tracking-tighter">XP Earned</span>
            <div>
              <div className="text-4xl font-bold font-headline text-primary">+{totalXp}</div>
              <div className="text-on-surface-variant text-xs mt-1">
                {perfectBonus > 0 && 'Perfect bonus! '}
                {streakBonus > 0 && `Streak +${streakBonus}`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trouble Spots */}
      {incorrectResults.length > 0 && (
        <section className="mb-12">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold font-headline text-on-surface">Trouble Spots</h2>
              <p className="text-on-surface-variant">Focus on these positions in your next drill.</p>
            </div>
            <span className="text-error text-xs font-mono">{incorrectResults.length} MISSES DETECTED</span>
          </div>

          <div className="bg-surface-container-low rounded-3xl p-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              {incorrectResults.slice(0, 3).map((result, i) => {
                const q = result.question;
                return (
                  <div key={i} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-error/10 flex items-center justify-center text-error">
                      <Brain className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-bold text-on-surface">
                        Expected: {q.correctAnswer}
                      </div>
                      <div className="text-sm text-on-surface-variant">
                        {result.givenAnswer
                          ? `You answered: ${result.givenAnswer}`
                          : 'Skipped'}
                        {' '}({Math.round(result.responseTimeMs / 1000)}s)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Performance Chart Placeholder */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-surface-container-low p-8 rounded-3xl border border-outline-variant/10">
            <h3 className="text-xl font-bold font-headline mb-6 text-on-surface">Session Breakdown</h3>
            <div className="space-y-4">
              <BreakdownRow icon={<CheckCircle className="h-5 w-5" />} label="Correct" value={correctCount} color="text-secondary" />
              <BreakdownRow icon={<X className="h-5 w-5" />} label="Incorrect" value={incorrectResults.length} color="text-error" />
              <BreakdownRow icon={<SkipForward className="h-5 w-5" />} label="Skipped" value={skippedCount} color="text-on-surface-variant" />
            </div>
          </div>

          <div className="bg-surface-container-low p-8 rounded-3xl border border-outline-variant/10">
            <h3 className="text-xl font-bold font-headline mb-6 text-on-surface">Speed Analysis</h3>
            <div className="space-y-4">
              {data.results.length > 0 && (() => {
                const times = data.results.filter(r => !r.isSkipped).map(r => r.responseTimeMs);
                const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
                const fastestTime = times.length > 0 ? Math.min(...times) : 0;
                const slowestTime = times.length > 0 ? Math.max(...times) : 0;
                return (
                  <>
                    <SpeedRow label="Average" value={`${(avgTime / 1000).toFixed(1)}s`} />
                    <SpeedRow label="Fastest" value={`${(fastestTime / 1000).toFixed(1)}s`} />
                    <SpeedRow label="Slowest" value={`${(slowestTime / 1000).toFixed(1)}s`} />
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  trend,
  trendLabel,
  icon,
  color,
}: {
  label: string;
  value: string;
  trend?: string;
  trendLabel?: string;
  icon?: React.ReactNode;
  iconFilled?: boolean;
  color: string;
}) {
  return (
    <div className="bg-surface-container-low p-6 rounded-2xl flex flex-col justify-between hover:scale-[1.02] transition-transform">
      <span className="text-on-surface-variant text-xs font-mono uppercase tracking-tighter">{label}</span>
      <div>
        <div className="text-4xl font-bold font-headline text-on-surface">{value}</div>
        {(trend || icon || trendLabel) && (
          <div className={`flex items-center gap-1 text-${color} text-sm font-medium mt-1`}>
            {icon}
            {trend && <TrendingUp className="h-4 w-4" />}
            {trendLabel && <span>{trendLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function BreakdownRow({icon, label, value, color}: {icon: React.ReactNode; label: string; value: number; color: string}) {
  return (
    <div className="flex items-center justify-between p-4 bg-background/50 rounded-xl">
      <div className="flex items-center gap-3">
        <span className={color}>{icon}</span>
        <span className="font-medium text-on-surface">{label}</span>
      </div>
      <span className="font-mono font-bold text-on-surface">{value}</span>
    </div>
  );
}

function SpeedRow({label, value}: {label: string; value: string}) {
  return (
    <div className="flex items-center justify-between p-4 bg-background/50 rounded-xl">
      <span className="text-on-surface-variant">{label}</span>
      <span className="font-mono font-bold text-on-surface">{value}</span>
    </div>
  );
}
