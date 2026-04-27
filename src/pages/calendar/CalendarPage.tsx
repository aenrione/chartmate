import {useEffect, useState, useCallback} from 'react';
import {ChevronLeft, ChevronRight, CalendarDays} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {getSessionsForDateRange, getUpcomingSessions} from '@/lib/local-db/programs';
import type {Session} from '@/lib/local-db/programs';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import SessionModal from '@/components/programs/SessionModal';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [upcoming, setUpcoming] = useState<Session[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [clickedDate, setClickedDate] = useState<string | undefined>();
  const [editSession, setEditSession] = useState<Session | undefined>();

  const load = useCallback(async () => {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const [monthSessions, upcomingSessions] = await Promise.all([
      getSessionsForDateRange(from, to),
      getUpcomingSessions(7),
    ]);
    setSessions(monthSessions);
    setUpcoming(upcomingSessions);
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
    setClickedDate(date);
    setEditSession(undefined);
    setModalOpen(true);
  }

  function handleSessionClick(session: Session) {
    setEditSession(session);
    setClickedDate(undefined);
    setModalOpen(true);
  }

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
              <Button variant="ghost" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {setYear(now.getFullYear()); setMonth(now.getMonth());}}
              >
                Today
              </Button>
              <Button variant="ghost" size="icon" onClick={nextMonth}>
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
          />
        </div>
      </div>

      {/* Sidebar — upcoming sessions */}
      <div className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-outline-variant/20 p-4 overflow-y-auto">
        <h2 className="text-sm font-semibold text-on-surface mb-3">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-xs text-on-surface-variant">No upcoming sessions.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSessionClick(s)}
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
        <Button
          className="w-full mt-4"
          size="sm"
          onClick={() => {
            setClickedDate(new Date().toISOString().slice(0, 10));
            setEditSession(undefined);
            setModalOpen(true);
          }}
        >
          New session
        </Button>
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
