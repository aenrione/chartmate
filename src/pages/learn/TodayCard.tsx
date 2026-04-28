// src/pages/learn/TodayCard.tsx
import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Calendar, RotateCcw, ChevronRight, ChevronUp, ChevronDown, Flame, Target, GraduationCap, Sparkles} from 'lucide-react';
import {cn} from '@/lib/utils';
import {todayIso} from '@/lib/learn/gamification';
import {getLocalDb} from '@/lib/local-db/client';
import {getLearnStats} from '@/lib/local-db/learn';
import {
  getOrGenerateDailyPlan,
  regenerateDailyPlan,
  type DailyPlan,
  type DailyPlanItem,
  type Instrument,
} from '@/lib/progression';

interface Props {
  instrument: Instrument;
  onOpenMissionBoard: () => void;
}

interface Stats {
  todayXp: number;
  dailyGoalTarget: number;
  dailyGoalCompleted: boolean;
  streak: number;
}

const COLLAPSED_KEY = 'chartmate.today.collapsed.v1';

export default function TodayCard({instrument, onOpenMissionBoard}: Props) {
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const navigate = useNavigate();

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await getLocalDb();
      const today = todayIso();
      const [p, s] = await Promise.all([
        getOrGenerateDailyPlan(db, today, instrument),
        getLearnStats(),
      ]);
      if (cancelled) return;
      setPlan(p);
      setStats({
        todayXp: s.todayXp,
        dailyGoalTarget: s.dailyGoalTarget,
        dailyGoalCompleted: s.dailyGoalCompleted,
        streak: s.streak,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [instrument]);

  const handleShuffle = async () => {
    setShuffling(true);
    try {
      const db = await getLocalDb();
      const today = todayIso();
      const fresh = await regenerateDailyPlan(db, today, instrument);
      setPlan(fresh);
    } finally {
      setShuffling(false);
    }
  };

  if (!plan || !stats) {
    return (
      <div className="px-4 pt-4">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container/40 p-4">
          <p className="text-sm text-on-surface-variant">Loading today's plan…</p>
        </div>
      </div>
    );
  }

  const remaining = Math.max(0, stats.dailyGoalTarget - stats.todayXp);
  const goalMet = stats.dailyGoalCompleted;
  const intent = goalMet
    ? 'Goal met — keep going if you want, the rest is bonus'
    : `Today's plan — about ${estimateMinutes(plan.items)} min to your goal`;

  return (
    <div className="px-4 pt-4">
      <div
        className={cn(
          'rounded-xl border transition-colors',
          collapsed ? 'p-2' : 'p-4',
          goalMet
            ? 'bg-amber-500/5 border-amber-500/30'
            : 'bg-surface-container/40 border-outline-variant/30',
        )}
      >
        {collapsed ? (
          // Compact one-line view so the skill tree sits closer to the fold.
          <button
            onClick={toggleCollapsed}
            className="w-full flex items-center justify-between gap-3 px-2 py-1 group"
            aria-label="Expand today's plan"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="h-3.5 w-3.5 text-on-surface-variant shrink-0" />
              <span className="text-xs font-medium text-on-surface truncate">
                Today · {stats.todayXp}/{stats.dailyGoalTarget} XP
                {goalMet && ' · goal met'}
                {plan.items.length > 0 && ` · ${plan.items.filter(i => !i.completed).length} left`}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('flex items-center gap-1 text-xs', stats.streak > 0 ? 'text-orange-500' : 'text-on-surface-variant')}>
                <Flame className="h-3.5 w-3.5" />
                <span className="font-semibold">{stats.streak}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-on-surface-variant group-hover:text-on-surface transition-colors" />
            </div>
          </button>
        ) : (
          <>
            {/* Header strip */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                <Calendar className="h-3.5 w-3.5" />
                <span>{intent}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleShuffle}
                  disabled={shuffling}
                  className="p-1.5 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
                  title="Shuffle plan"
                  aria-label="Shuffle today's plan"
                >
                  <RotateCcw className={cn('h-3.5 w-3.5', shuffling && 'animate-spin')} />
                </button>
                <button
                  onClick={onOpenMissionBoard}
                  className="text-xs font-medium text-primary hover:underline px-2"
                >
                  Mission Board
                </button>
                <button
                  onClick={toggleCollapsed}
                  className="p-1.5 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                  title="Collapse plan"
                  aria-label="Collapse today's plan"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Plan items */}
            <div className="flex flex-col gap-2">
              {plan.items.length === 0 && (
                <p className="text-sm text-on-surface-variant py-2">Nothing queued — pick something from your skill tree below.</p>
              )}
              {plan.items.map((item, idx) => (
                <PlanItemRow
                  key={item.refKey}
                  item={item}
                  isAnchor={idx === 0}
                  onClick={() => item.href && navigate(item.href)}
                />
              ))}
            </div>

            {/* Footer pill: today XP + streak */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-outline-variant/30">
              <div className="flex items-center gap-2 text-xs">
                <span className={cn('font-semibold', goalMet ? 'text-amber-500' : 'text-on-surface')}>
                  {stats.todayXp} / {stats.dailyGoalTarget} XP
                </span>
                {!goalMet && remaining > 0 && (
                  <span className="text-on-surface-variant">· {remaining} to goal</span>
                )}
                {goalMet && (
                  <span className="text-amber-500/80 inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> goal met
                  </span>
                )}
              </div>
              <div className={cn('flex items-center gap-1', stats.streak > 0 ? 'text-orange-500' : 'text-on-surface-variant')}>
                <Flame className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">{stats.streak}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PlanItemRow({item, isAnchor, onClick}: {item: DailyPlanItem; isAnchor: boolean; onClick: () => void}) {
  const Icon = iconFor(item);
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all group',
        isAnchor
          ? 'bg-primary text-on-primary hover:opacity-95 active:scale-[0.99]'
          : 'bg-surface-container/60 hover:bg-surface-container text-on-surface',
        item.completed && 'opacity-50',
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0', isAnchor ? 'text-on-primary' : 'text-on-surface-variant')} />
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold truncate', item.completed && 'line-through')}>
          {item.label}
        </p>
        <p className={cn('text-xs', isAnchor ? 'text-on-primary/80' : 'text-on-surface-variant')}>
          ~{item.xp} XP
        </p>
      </div>
      <ChevronRight className={cn('h-4 w-4 shrink-0', isAnchor ? 'text-on-primary' : 'text-on-surface-variant')} />
    </button>
  );
}

function iconFor(item: DailyPlanItem): React.ComponentType<{className?: string}> {
  switch (item.kind) {
    case 'lesson':
      return GraduationCap;
    case 'weak_spot':
      return Sparkles;
    case 'mission_step':
      return Target;
  }
}

function estimateMinutes(items: DailyPlanItem[]): number {
  // Rough: 1 min per ~5 XP. Floor at 5 minutes.
  const xpTotal = items.reduce((sum, i) => sum + i.xp, 0);
  return Math.max(5, Math.round(xpTotal / 5));
}
