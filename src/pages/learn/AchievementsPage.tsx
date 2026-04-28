// src/pages/learn/AchievementsPage.tsx
import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowLeft, Award, Lock} from 'lucide-react';
import {ACHIEVEMENT_CATALOG, type Achievement} from '@/lib/progression';
import {getLocalDb} from '@/lib/local-db/client';
import {cn} from '@/lib/utils';

interface EarnedRow {
  achievement_id: string;
  earned_at: string;
}

const TIER_STYLE: Record<Achievement['tier'], {ring: string; chip: string}> = {
  bronze: {ring: 'ring-amber-700/40', chip: 'text-amber-700 bg-amber-700/10'},
  silver: {ring: 'ring-slate-400/40', chip: 'text-slate-500 bg-slate-500/10'},
  gold: {ring: 'ring-amber-500/50', chip: 'text-amber-600 bg-amber-500/10'},
};

export default function AchievementsPage() {
  const navigate = useNavigate();
  const [earned, setEarned] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await getLocalDb();
      const rows = await db.selectFrom('earned_achievements').select(['achievement_id', 'earned_at']).execute();
      if (cancelled) return;
      setEarned(new Map((rows as EarnedRow[]).map(r => [r.achievement_id, r.earned_at])));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const earnedCount = earned?.size ?? 0;
  const totalCount = ACHIEVEMENT_CATALOG.length;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface">
      {/* Header */}
      <div className="shrink-0 px-4 py-4 border-b border-outline-variant/20">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => navigate('/learn')}
            className="p-1.5 -ml-1.5 rounded-lg hover:bg-surface-container transition-colors"
            aria-label="Back to Learn"
          >
            <ArrowLeft className="h-4 w-4 text-on-surface" />
          </button>
          <h1 className="text-xl font-bold font-headline">Achievements</h1>
        </div>
        <p className="text-sm text-on-surface-variant">
          {earnedCount} of {totalCount} unlocked
        </p>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
          {ACHIEVEMENT_CATALOG.map(a => {
            const earnedAt = earned?.get(a.id) ?? null;
            const isEarned = !!earnedAt;
            const isLockedHidden = a.hidden && !isEarned;
            const style = TIER_STYLE[a.tier];

            return (
              <div
                key={a.id}
                className={cn(
                  'flex items-start gap-3 p-3.5 rounded-xl border transition-all',
                  isEarned
                    ? 'bg-surface-container border-outline-variant/30'
                    : 'bg-surface-container/40 border-outline-variant/20 opacity-70',
                )}
              >
                <div
                  className={cn(
                    'h-12 w-12 shrink-0 rounded-lg flex items-center justify-center ring-2',
                    isEarned ? style.ring : 'ring-outline-variant/20',
                    isEarned ? 'bg-amber-500/10 text-amber-500' : 'bg-surface text-on-surface-variant/50',
                  )}
                >
                  {isLockedHidden ? <Lock className="h-5 w-5" /> : <Award className="h-6 w-6" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-semibold text-on-surface truncate">
                      {isLockedHidden ? '???' : a.title}
                    </h3>
                    <span className={cn('text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded', style.chip)}>
                      {a.tier}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    {isLockedHidden ? 'Hidden — keep practicing.' : a.description}
                  </p>
                  {isEarned && (
                    <p className="text-[10px] text-on-surface-variant/70 mt-1">
                      Unlocked {new Date(earnedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
