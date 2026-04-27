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
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function CalendarGrid({
  year,
  month,
  sessions,
  onDayClick,
  onSessionClick,
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

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onDayClick(dateStr)}
              className={cn(
                'w-full text-left bg-surface-container min-h-[80px] p-1 cursor-pointer hover:bg-surface-container-high transition-colors',
                isToday && 'bg-primary/5',
              )}
            >
              <div className={cn(
                'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                isToday ? 'bg-primary text-on-primary' : 'text-on-surface-variant',
              )}>
                {day}
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
