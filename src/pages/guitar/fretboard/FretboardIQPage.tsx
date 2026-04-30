import {useState, useEffect, type ReactNode} from 'react';
import {useNavigate} from 'react-router-dom';
import {Zap, Flame, Music, BookOpen} from 'lucide-react';
import {getAllDrills} from './drills/registry';
import DrillCard from './components/DrillCard';
import FretboardHeatMap from './components/FretboardHeatMap';
import {useProgress, usePositionStats} from './hooks/useProgress';
import {getAnkiDueCount} from '@/lib/local-db/fretboard';

export default function FretboardIQPage() {
  const navigate = useNavigate();
  const drills = getAllDrills();
  const {userStats} = useProgress();
  const {stats: positionStats} = usePositionStats();
  const [bestScores, setBestScores] = useState<Record<string, string>>({});
  const [dueCount, setDueCount] = useState<number | null>(null);

  useEffect(() => {
    getAnkiDueCount().then(setDueCount).catch(() => setDueCount(0));
  }, []);

  // Load best scores for each drill
  useEffect(() => {
    async function loadBestScores() {
      const {getBestSession} = await import('@/lib/local-db/fretboard');
      const scores: Record<string, string> = {};
      for (const drill of drills) {
        const best = await getBestSession(drill.type);
        if (best) {
          const accuracy = Math.round((best.correctAnswers / best.totalQuestions) * 100);
          scores[drill.type] = `${accuracy}%`;
        }
      }
      setBestScores(scores);
    }
    loadBestScores();
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto">
      {/* Drills Grid */}
      <div className="flex-1">
        <header className="mb-4 lg:mb-8">
          <h2 className="text-xl lg:text-3xl font-black font-headline tracking-tight text-on-surface mb-1 lg:mb-2">
            Training Room
          </h2>
          <p className="text-sm lg:text-base text-on-surface-variant max-w-md hidden sm:block">
            Precision focus exercises designed to build instant fretboard recognition and muscular memory.
          </p>
        </header>

        {/* Daily Review */}
        <div className="mb-4 lg:mb-8">
          <DailyReviewCard
            dueCount={dueCount}
            onClick={() => navigate('/guitar/fretboard/anki')}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-6">
          {drills.map(drill => (
            <DrillCard
              key={drill.type}
              drill={drill}
              bestScore={bestScores[drill.type]}
              onClick={() => navigate(`/guitar/fretboard/drill/${drill.type}`)}
            />
          ))}
        </div>
      </div>

      {/* Progress Sidebar */}
      <div className="lg:w-80 space-y-6">
        {/* Stats */}
        <section className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10">
          <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest mb-6">
            Your Progress
          </h3>
          <div className="space-y-6">
            <StatItem
              icon={<Zap className="h-4 w-4" />}
              iconBg="bg-primary/10"
              iconColor="text-primary"
              label="Accuracy"
              value={userStats ? `${Math.round(userStats.overallAccuracy * 100)}%` : '--'}
            />
            <StatItem
              icon={<Flame className="h-4 w-4" />}
              iconBg="bg-tertiary/10"
              iconColor="text-tertiary"
              label="Daily Streak"
              value={userStats ? `${userStats.currentStreak} Days` : '0 Days'}
            />
            <StatItem
              icon={<Music className="h-4 w-4" />}
              iconBg="bg-secondary-container/10"
              iconColor="text-secondary-container"
              label="Total Drills"
              value={userStats ? userStats.totalDrillsCompleted.toLocaleString() : '0'}
            />
          </div>

          {/* Mini Heat Map */}
          <div className="mt-8">
            <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-4">
              Heat Map Preview
            </h4>
            <FretboardHeatMap
              stats={positionStats}
              compact
              fretRange={[0, 11]}
              stringRange={[0, 1]}
            />
          </div>
        </section>

        {/* Tip Card */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-surface-container-high to-surface-container-low border border-outline-variant/10 relative overflow-hidden">
          <h3 className="text-sm font-bold text-on-surface mb-2">Maestro Tip</h3>
          <p className="text-sm text-on-surface-variant italic">
            "Always visualize the next interval before you pluck the string. Thinking ahead creates mental pathways that outpace your fingers."
          </p>
        </div>
      </div>
    </div>
  );
}

function StatItem({
  icon,
  iconBg,
  iconColor,
  label,
  value,
}: {
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center ${iconColor}`}>
          {icon}
        </div>
        <span className="text-sm font-medium text-on-surface-variant">{label}</span>
      </div>
      <span className="text-lg font-mono font-bold text-on-surface">{value}</span>
    </div>
  );
}

function DailyReviewCard({
  dueCount,
  onClick,
}: {
  dueCount: number | null;
  onClick: () => void;
}) {
  const isEmpty = dueCount === 0;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 lg:gap-5 p-3 lg:p-5 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-secondary/5 hover:from-primary/20 hover:to-secondary/10 transition-all active:scale-[0.99] text-left"
    >
      <div className="w-9 h-9 lg:w-12 lg:h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
        <BookOpen className="h-4 w-4 lg:h-6 lg:w-6 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-on-surface text-sm lg:text-base">Daily Review</p>
        <p className="text-xs lg:text-sm text-on-surface-variant mt-0.5">
          {dueCount === null
            ? 'Loading…'
            : isEmpty
            ? 'All caught up — check back tomorrow'
            : `${dueCount} card${dueCount === 1 ? '' : 's'} due`}
        </p>
      </div>
      {dueCount !== null && !isEmpty && (
        <span className="shrink-0 px-3 py-1 rounded-full bg-primary text-on-primary text-sm font-bold">
          {dueCount}
        </span>
      )}
    </button>
  );
}
