import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {CalendarDays, ChevronRight, BookOpen} from 'lucide-react';
import {cn} from '@/lib/utils';
import {getUpcomingSessions, getActiveProgram, getUnitsForProgram} from '@/lib/local-db/programs';
import type {Session, Program, Unit} from '@/lib/local-db/programs';

interface WidgetData {
  todaySessions: Session[];
  upcomingSessions: Session[];
  activeProgram: Program | null;
  currentUnit: Unit | null;
}

export default function UpcomingSessionsWidget() {
  const [data, setData] = useState<WidgetData | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    async function load() {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const [upcoming, activeProgram] = await Promise.all([
        getUpcomingSessions(7),
        getActiveProgram(),
      ]);
      const todaySessions = upcoming.filter(s => s.scheduledDate === todayStr);
      const upcomingSessions = upcoming.filter(s => s.scheduledDate > todayStr).slice(0, 4);

      let currentUnit: Unit | null = null;

      if (activeProgram) {
        const units = await getUnitsForProgram(activeProgram.id);
        const inProgress = units.find(u => u.startedAt && !u.completedAt);
        const nextUp = units.find(u => !u.completedAt);
        currentUnit = inProgress ?? nextUp ?? null;
      }

      setData({todaySessions, upcomingSessions, activeProgram, currentUnit});
    }
    load();
  }, []);

  if (!data) return null;
  const {todaySessions, upcomingSessions, activeProgram, currentUnit} = data;
  if (!activeProgram && todaySessions.length === 0 && upcomingSessions.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-outline-variant/20">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-surface-container-high transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-on-surface">
          <CalendarDays className="h-4 w-4 text-primary" />
          Practice schedule
        </span>
        <ChevronRight className={cn('h-4 w-4 text-on-surface-variant transition-transform', !collapsed && 'rotate-90')} />
      </button>

      {!collapsed && (
        <div className="px-6 pb-4 space-y-3">
          {/* Active program + unit */}
          {activeProgram && currentUnit && (
            <Link
              to={`/programs/${activeProgram.id}/units/${currentUnit.id}`}
              className="flex items-center gap-3 rounded-xl bg-surface-container p-3 hover:bg-surface-container-high transition-colors"
            >
              <BookOpen className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-on-surface-variant">{activeProgram.title}</p>
                <p className="text-sm font-medium text-on-surface truncate">{currentUnit.title}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-on-surface-variant shrink-0" />
            </Link>
          )}

          {/* Today's sessions */}
          {todaySessions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-on-surface-variant mb-1.5">Today</p>
              <div className="space-y-1">
                {todaySessions.map(s => (
                  <Link
                    key={s.id}
                    to="/calendar"
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                      s.completedAt
                        ? 'text-on-surface-variant line-through bg-surface-container/50'
                        : 'bg-primary/10 text-on-surface hover:bg-primary/20',
                    )}
                  >
                    <span className="flex-1 truncate">{s.title ?? 'Practice session'}</span>
                    {s.scheduledTime && <span className="text-xs text-on-surface-variant shrink-0">{s.scheduledTime}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming sessions */}
          {upcomingSessions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-on-surface-variant mb-1.5">Upcoming</p>
              <div className="space-y-1">
                {upcomingSessions.map(s => (
                  <Link
                    key={s.id}
                    to="/calendar"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                  >
                    <span className="flex-1 truncate">{s.title ?? 'Practice session'}</span>
                    <span className="text-xs shrink-0">{s.scheduledDate}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <Link to="/calendar" className="text-xs text-primary hover:underline block text-right">
            View calendar →
          </Link>
        </div>
      )}
    </div>
  );
}
