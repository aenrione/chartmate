import {useState, useEffect, type ReactNode} from 'react';
import {useNavigate} from 'react-router-dom';
import {Zap, Flame, Music} from 'lucide-react';
import {getAllDrills} from './drills/registry';
import DrillCard from './components/DrillCard';
import FretboardHeatMap from './components/FretboardHeatMap';
import {useProgress, usePositionStats} from './hooks/useProgress';

export default function FretboardIQPage() {
  const navigate = useNavigate();
  const drills = getAllDrills();
  const {userStats} = useProgress();
  const {stats: positionStats} = usePositionStats();
  const [bestScores, setBestScores] = useState<Record<string, string>>({});

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
        <header className="mb-8">
          <h2 className="text-3xl font-black font-headline tracking-tight text-on-surface mb-2">
            Training Room
          </h2>
          <p className="text-on-surface-variant max-w-md">
            Precision focus exercises designed to build instant fretboard recognition and muscular memory.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
