import {useEffect, useState, useCallback} from 'react';
import {useMobilePageTitle} from '@/contexts/LayoutContext';
import {ChevronLeft, ChevronRight, CalendarDays, Clock, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {getSessionsForDateRange, getUpcomingSessions} from '@/lib/local-db/programs';
import type {Session} from '@/lib/local-db/programs';
import {
  getDailyXpForRange,
  getGoalMetDatesForRange,
  getAchievementDatesForRange,
} from '@/lib/local-db/learn';
import {
  getDailyActiveTimeForRange,
  getDailyContextBreakdownForRange,
  type ContextBreakdown,
} from '@/lib/local-db/active-time';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import SessionModal from '@/components/programs/SessionModal';
import {cn} from '@/lib/utils';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const CONTEXT_LABELS: Record<string, string> = {
  browse: 'Browsing',
  lesson: 'Lessons',
  drill: 'Fretboard Drill',
  ear: 'Ear Training',
  repertoire: 'Repertoire',
  fill: 'Fills',
  rudiment: 'Rudiments',
  tab_editor: 'Tab Editor',
  playbook: 'Playbook',
};

const CONTEXT_COLORS: Record<string, string> = {
  browse: 'bg-slate-400',
  lesson: 'bg-primary',
  drill: 'bg-violet-500',
  ear: 'bg-sky-500',
  repertoire: 'bg-emerald-500',
  fill: 'bg-orange-400',
  rudiment: 'bg-amber-500',
  tab_editor: 'bg-rose-500',
  playbook: 'bg-pink-500',
};

function fmtMs(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return '< 1m';
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(undefined, {weekday: 'long', month: 'long', day: 'numeric'});
}

export default function CalendarPage() {
  useMobilePageTitle('Calendar');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [upcoming, setUpcoming] = useState<Session[]>([]);
  const [xpByDate, setXpByDate] = useState<Map<string, number>>(new Map());
  const [goalMetDates, setGoalMetDates] = useState<Set<string>>(new Set());
  const [achievementDates, setAchievementDates] = useState<Set<string>>(new Set());
  const [activeTimeByDate, setActiveTimeByDate] = useState<Map<string, number>>(new Map());
  const [contextByDate, setContextByDate] = useState<Map<string, ContextBreakdown[]>>(new Map());
  const [modalOpen, setModalOpen] = useState(false);
  const [clickedDate, setClickedDate] = useState<string | undefined>();
  const [editSession, setEditSession] = useState<Session | undefined>();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const [monthSessions, upcomingSessions, xpMap, goalSet, achSet, timeMap, ctxMap] = await Promise.all([
        getSessionsForDateRange(from, to),
        getUpcomingSessions(7),
        getDailyXpForRange(from, to),
        getGoalMetDatesForRange(from, to),
        getAchievementDatesForRange(from, to),
        getDailyActiveTimeForRange(from, to),
        getDailyContextBreakdownForRange(from, to),
      ]);
      setSessions(monthSessions);
      setUpcoming(upcomingSessions);
      setXpByDate(xpMap);
      setGoalMetDates(goalSet);
      setAchievementDates(achSet);
      setActiveTimeByDate(timeMap);
      setContextByDate(ctxMap);
    } catch {
      // DB error — leave existing state unchanged
    }
  }, [year, month]);

  useEffect(() => {load();}, [load]);

  function prevMonth() {
    if (month === 0) {setYear(y => y - 1); setMonth(11);}
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) {setYear(y => y + 1); setMonth(0);}
    else setMonth(m => m + 1);
  }

  function handleDayClick(date: string) {
    setSelectedDate(date);
  }

  function handleSessionClick(session: Session) {
    setEditSession(session);
    setClickedDate(undefined);
    setModalOpen(true);
  }

  const selectedSessions = selectedDate
    ? sessions.filter(s => s.scheduledDate === selectedDate)
    : [];
  const selectedBreakdown = selectedDate ? (contextByDate.get(selectedDate) ?? []) : [];
  const selectedTotalMs = selectedBreakdown.reduce((s, b) => s + b.total_ms, 0);
  const selectedXp = selectedDate ? (xpByDate.get(selectedDate) ?? 0) : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
      {/* Main calendar */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold font-headline flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              {MONTH_NAMES[month]} {year}
            </h1>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Previous month" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { const t = new Date(); setYear(t.getFullYear()); setMonth(t.getMonth()); }}
              >
                Today
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next month" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <CalendarGrid
            year={year}
            month={month}
            sessions={sessions}
            onDayClick={handleDayClick}
            onSessionClick={handleSessionClick}
            xpByDate={xpByDate}
            goalMetDates={goalMetDates}
            achievementDates={achievementDates}
            activeTimeByDate={activeTimeByDate}
          />
        </div>
      </div>

      {/* Sidebar */}
      <div className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-outline-variant/20 p-4 overflow-y-auto">
        {selectedDate ? (
          <DayDetail
            date={selectedDate}
            breakdown={selectedBreakdown}
            totalMs={selectedTotalMs}
            xp={selectedXp}
            sessions={selectedSessions}
            onClose={() => setSelectedDate(null)}
            onAddSession={() => {
              setClickedDate(selectedDate);
              setEditSession(undefined);
              setModalOpen(true);
            }}
            onSessionClick={handleSessionClick}
          />
        ) : (
          <UpcomingPanel
            upcoming={upcoming}
            onSessionClick={handleSessionClick}
            onNewSession={() => {
              setClickedDate(new Date().toISOString().slice(0, 10));
              setEditSession(undefined);
              setModalOpen(true);
            }}
          />
        )}
      </div>

      <SessionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        defaultDate={clickedDate}
        session={editSession}
      />
    </div>
  );
}

function DayDetail({
  date,
  breakdown,
  totalMs,
  xp,
  sessions,
  onClose,
  onAddSession,
  onSessionClick,
}: {
  date: string;
  breakdown: ContextBreakdown[];
  totalMs: number;
  xp: number;
  sessions: Session[];
  onClose: () => void;
  onAddSession: () => void;
  onSessionClick: (s: Session) => void;
}) {
  const sorted = [...breakdown].sort((a, b) => b.total_ms - a.total_ms);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-on-surface">{fmtDate(date)}</h2>
          {totalMs > 0 && (
            <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {fmtMs(totalMs)} active{xp > 0 ? ` · ${xp} XP` : ''}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-on-surface-variant hover:text-on-surface p-1 rounded"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {sorted.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Time breakdown</h3>
          {sorted.map(b => {
            const pct = totalMs > 0 ? Math.round((b.total_ms / totalMs) * 100) : 0;
            const barColor = CONTEXT_COLORS[b.context] ?? 'bg-primary';
            return (
              <div key={b.context} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-on-surface">{CONTEXT_LABELS[b.context] ?? b.context}</span>
                  <span className="tabular-nums text-on-surface-variant">{fmtMs(b.total_ms)}</span>
                </div>
                <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', barColor)}
                    style={{width: `${pct}%`}}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-on-surface-variant">No active time recorded.</p>
      )}

      {sessions.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Sessions</h3>
          {sessions.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSessionClick(s)}
              className="w-full text-left rounded-lg bg-surface-container p-3 hover:bg-surface-container-high transition-colors"
            >
              <p className="text-sm font-medium text-on-surface">{s.title ?? 'Practice session'}</p>
              {s.scheduledTime && (
                <p className="text-xs text-on-surface-variant mt-0.5">{s.scheduledTime}</p>
              )}
              {s.completedAt && (
                <p className="text-xs text-emerald-500 mt-0.5">Done</p>
              )}
            </button>
          ))}
        </div>
      )}

      <Button size="sm" className="w-full" onClick={onAddSession}>
        + Add session
      </Button>
    </div>
  );
}

function UpcomingPanel({
  upcoming,
  onSessionClick,
  onNewSession,
}: {
  upcoming: Session[];
  onSessionClick: (s: Session) => void;
  onNewSession: () => void;
}) {
  return (
    <>
      <h2 className="text-sm font-semibold text-on-surface mb-3">Upcoming</h2>
      {upcoming.length === 0 ? (
        <p className="text-xs text-on-surface-variant">No upcoming sessions.</p>
      ) : (
        <div className="space-y-2">
          {upcoming.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSessionClick(s)}
              className="w-full text-left cursor-pointer rounded-lg bg-surface-container p-3 hover:bg-surface-container-high transition-colors"
            >
              <p className="text-sm font-medium text-on-surface">{s.title ?? 'Practice session'}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {s.scheduledDate}{s.scheduledTime ? ` · ${s.scheduledTime}` : ''}
                {s.completedAt ? ' · Done' : ''}
              </p>
            </button>
          ))}
        </div>
      )}
      <Button className="w-full mt-4" size="sm" onClick={onNewSession}>
        New session
      </Button>
    </>
  );
}
