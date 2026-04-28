// src/pages/learn/LearnStats.tsx
import {useEffect, useState} from 'react';
import {Flame, Guitar, Drum, Music} from 'lucide-react';
import {cn} from '@/lib/utils';
import {getLearnStats, setDailyGoalTarget, getAllInstrumentLevels, type InstrumentLevelView} from '@/lib/local-db/learn';

interface Stats {
  streak: number;
  dailyGoalTarget: number;
  todayXp: number;
  dailyGoalCompleted: boolean;
}

const INSTRUMENT_ICONS: Record<string, React.ComponentType<{className?: string}>> = {
  guitar: Guitar,
  drums: Drum,
  theory: Music,
};

const GOAL_OPTIONS = [5, 10, 15, 20];

function GoalRing({current, target}: {current: number; target: number}) {
  const pct = Math.min(1, current / target);
  const r = 16;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44">
      <circle
        cx="22" cy="22" r={r}
        fill="none"
        stroke="currentColor"
        className="text-surface-container-high"
        strokeWidth="3.5"
      />
      <circle
        cx="22" cy="22" r={r}
        fill="none"
        stroke="currentColor"
        className="text-primary"
        strokeWidth="3.5"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
      />
      <text
        x="22" y="26"
        textAnchor="middle"
        className="fill-on-surface font-bold"
        fontSize="9"
      >
        {current}/{target}
      </text>
    </svg>
  );
}

export default function LearnStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [levels, setLevels] = useState<InstrumentLevelView[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    getLearnStats().then(setStats).catch(() => {});
    getAllInstrumentLevels().then(setLevels).catch(() => {});
  }, []);

  async function handleSetTarget(target: number) {
    await setDailyGoalTarget(target);
    setShowPicker(false);
    getLearnStats().then(setStats).catch(() => {});
  }

  if (!stats) return null;

  return (
    <div className="shrink-0 px-6 py-3 border-b border-outline-variant/20 flex flex-col gap-2.5">
      <div className="flex items-center gap-6">
      {/* Streak */}
      <div className="flex items-center gap-1.5">
        <Flame
          className={cn(
            'h-5 w-5',
            stats.streak > 0 ? 'text-orange-500' : 'text-on-surface-variant/40',
          )}
        />
        <span className={cn(
          'text-sm font-bold',
          stats.streak > 0 ? 'text-orange-500' : 'text-on-surface-variant/40',
        )}>
          {stats.streak}
        </span>
        <span className="text-xs text-on-surface-variant/60">day streak</span>
      </div>

      <div className="h-6 w-px bg-outline-variant/30" />

      {/* Daily goal ring + target picker toggle */}
      <div className="flex items-center gap-2">
        <GoalRing current={stats.todayXp} target={stats.dailyGoalTarget} />
        <div>
          <p className="text-xs text-on-surface-variant/60">
            {stats.dailyGoalCompleted ? 'Goal complete!' : 'daily goal'}
          </p>
          <button
            onClick={() => setShowPicker(prev => !prev)}
            className="text-xs text-primary underline"
          >
            {stats.dailyGoalTarget} XP target
          </button>
        </div>
      </div>

      {/* Inline picker */}
      {showPicker && (
        <div className="flex gap-1 ml-auto">
          {GOAL_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => handleSetTarget(opt)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors',
                stats.dailyGoalTarget === opt
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface',
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      </div>

      {/* Per-instrument level bars */}
      {levels.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {levels.map(l => {
            const Icon = INSTRUMENT_ICONS[l.instrument] ?? Music;
            const total = l.xp_into_level + l.xp_to_next;
            const pct = total > 0 ? Math.min(100, Math.round((l.xp_into_level / total) * 100)) : 0;
            return (
              <div key={l.instrument} className="flex items-center gap-2 min-w-[140px] flex-1">
                <Icon className="h-3.5 w-3.5 text-on-surface-variant shrink-0" />
                <span className="text-[10px] font-bold text-on-surface w-8 shrink-0">Lv {l.level}</span>
                <div className="flex-1 h-1.5 bg-surface-container-high rounded-full overflow-hidden min-w-[60px]">
                  <div className="h-full bg-primary rounded-full transition-all" style={{width: `${pct}%`}} />
                </div>
                <span className="text-[10px] text-on-surface-variant whitespace-nowrap tabular-nums">
                  {l.xp_into_level}/{total}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
