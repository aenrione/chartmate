// src/pages/learn/MissionBoard.tsx
import {useEffect, useState} from 'react';
import {Target, Trophy, X} from 'lucide-react';
import {ensureWeekMissions, findMissionTemplate, mondayOfWeek, type MissionTemplate} from '@/lib/progression';
import {todayIso} from '@/lib/learn/gamification';
import {getLocalDb} from '@/lib/local-db/client';
import {cn} from '@/lib/utils';

interface MissionRow {
  template: MissionTemplate;
  progress: number;
  target: number;
  reward: number;
  state: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MissionBoard({open, onClose}: Props) {
  const [missions, setMissions] = useState<MissionRow[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const db = await getLocalDb();
      const weekStart = mondayOfWeek(todayIso());
      await ensureWeekMissions(db, weekStart);
      const rows = await db
        .selectFrom('active_missions')
        .selectAll()
        .where('week_start', '=', weekStart)
        .execute();
      if (cancelled) return;
      const result: MissionRow[] = [];
      for (const r of rows) {
        const template = findMissionTemplate(r.template_id);
        if (template) result.push({template, progress: r.progress, target: r.target, reward: r.xp_reward, state: r.state});
      }
      setMissions(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-surface rounded-t-2xl sm:rounded-2xl shadow-2xl border border-outline-variant/30"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-outline-variant/30 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold font-headline text-on-surface">Mission Board</h2>
            <p className="text-xs text-on-surface-variant">Resets every Monday</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-lg hover:bg-surface-container transition-colors"
            aria-label="Close mission board"
          >
            <X className="h-5 w-5 text-on-surface-variant" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {missions === null && (
            <p className="text-sm text-on-surface-variant text-center py-8">Loading missions…</p>
          )}
          {missions !== null && missions.length === 0 && (
            <p className="text-sm text-on-surface-variant text-center py-8">No missions this week.</p>
          )}
          {missions?.map(m => {
            const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
            const done = m.state === 'completed';
            return (
              <div
                key={m.template.id}
                className={cn(
                  'p-4 rounded-xl border transition-all',
                  done
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-surface-container border-outline-variant/30',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'h-9 w-9 shrink-0 rounded-lg flex items-center justify-center',
                    done ? 'bg-emerald-500/20 text-emerald-600' : 'bg-primary/10 text-primary',
                  )}>
                    {done ? <Trophy className="h-5 w-5" /> : <Target className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-on-surface truncate">{m.template.title}</h3>
                      <span className="text-xs font-medium text-on-surface-variant whitespace-nowrap">
                        +{m.reward} XP
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant mb-2">{m.template.description}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', done ? 'bg-emerald-500' : 'bg-primary')}
                          style={{width: `${pct}%`}}
                        />
                      </div>
                      <span className="text-xs text-on-surface-variant whitespace-nowrap">
                        {m.progress} / {m.target}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
