import {Award} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Session} from '@/lib/local-db/programs';
import SessionChip from './SessionChip';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarGridProps {
  year: number;
  month: number; // 0-indexed
  sessions: Session[];
  onDayClick: (date: string) => void;
  onSessionClick: (session: Session) => void;
  /** XP earned per YYYY-MM-DD (local). Optional — calendar still works without it. */
  xpByDate?: Map<string, number>;
  /** Dates where the daily goal was met. Highlighted with a small dot. */
  goalMetDates?: Set<string>;
  /** Dates where at least one achievement was unlocked. Renders a tiny trophy. */
  achievementDates?: Set<string>;
  /** Total active ms per YYYY-MM-DD. */
  activeTimeByDate?: Map<string, number>;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function fmtMs(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return '';
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export default function CalendarGrid({
  year,
  month,
  sessions,
  onDayClick,
  onSessionClick,
  xpByDate,
  goalMetDates,
  achievementDates,
  activeTimeByDate,
}: CalendarGridProps) {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Group sessions by date
  const byDate = new Map<string, Session[]>();
  for (const s of sessions) {
    const existing = byDate.get(s.scheduledDate) ?? [];
    byDate.set(s.scheduledDate, [...existing, s]);
  }

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({length: daysInMonth}, (_, i) => i + 1),
  ];
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="select-none">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-on-surface-variant py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px bg-outline-variant/10 rounded-xl overflow-hidden">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={idx} className="bg-surface-container min-h-[80px]" />;
          }
          const dateStr = toDateStr(year, month, day);
          const daySessions = byDate.get(dateStr) ?? [];
          const isToday = dateStr === today;
          const xpToday = xpByDate?.get(dateStr) ?? 0;
          const goalMet = goalMetDates?.has(dateStr) ?? false;
          const hasAchievement = achievementDates?.has(dateStr) ?? false;
          const activeMs = activeTimeByDate?.get(dateStr) ?? 0;
          const timeLabel = fmtMs(activeMs);

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onDayClick(dateStr)}
              className={cn(
                'w-full text-left bg-surface-container min-h-[80px] p-1 cursor-pointer hover:bg-surface-container-high transition-colors relative',
                isToday && 'bg-primary/5',
                goalMet && !isToday && 'bg-emerald-500/5',
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <div className={cn(
                  'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                  isToday ? 'bg-primary text-on-primary' : 'text-on-surface-variant',
                )}>
                  {day}
                </div>
                <div className="flex items-center gap-0.5">
                  {hasAchievement && (
                    <Award className="h-3 w-3 text-amber-500" aria-label="Achievement unlocked" />
                  )}
                  {goalMet && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="Goal met" />
                  )}
                  {xpToday > 0 && (
                    <span className="text-[9px] font-bold text-on-surface-variant tabular-nums">
                      {xpToday}xp
                    </span>
                  )}
                  {timeLabel && (
                    <span className="text-[9px] font-semibold text-primary/70 tabular-nums">
                      {timeLabel}
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-0.5">
                {daySessions.slice(0, 3).map(s => (
                  <SessionChip
                    key={s.id}
                    session={s}
                    onClick={e => {
                      e.stopPropagation();
                      onSessionClick(s);
                    }}
                  />
                ))}
                {daySessions.length > 3 && (
                  <div className="text-xs text-on-surface-variant px-1">+{daySessions.length - 3} more</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
