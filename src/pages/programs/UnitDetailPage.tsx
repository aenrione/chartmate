import {useEffect, useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {ArrowLeft, CheckCircle2, Calendar} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
  getUnit,
  getGoalsForUnit,
  completeUnit,
  getProgram,
  getSessionsForDate,
  createSession,
} from '@/lib/local-db/programs';
import type {Unit, Goal, Session, Program} from '@/lib/local-db/programs';
import GoalItem from '@/components/programs/GoalItem';
import AddGoalForm from '@/components/programs/AddGoalForm';
import SessionModal from '@/components/programs/SessionModal';

export default function UnitDetailPage() {
  const {id, unitId} = useParams<{id: string; unitId: string}>();
  const navigate = useNavigate();
  const [program, setProgram] = useState<Program | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [todaySessions, setTodaySessions] = useState<Session[]>([]);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [editSession, setEditSession] = useState<Session | undefined>();

  async function load() {
    if (!id || !unitId) return;
    const [prog, u, g] = await Promise.all([
      getProgram(Number(id)),
      getUnit(Number(unitId)),
      getGoalsForUnit(Number(unitId)),
    ]);
    if (!u) {navigate(`/programs/${id}`); return;}
    const today = new Date().toISOString().slice(0, 10);
    const sessions = await getSessionsForDate(today);
    const unitSessions = sessions.filter(s => s.unitId === Number(unitId));
    setProgram(prog);
    setUnit(u);
    setGoals(g);
    setTodaySessions(unitSessions);
  }

  useEffect(() => {load();}, [id, unitId]);

  async function handleMarkComplete() {
    if (!unitId) return;
    await completeUnit(Number(unitId));
    load();
  }

  if (!unit) {
    return <div className="flex-1 flex items-center justify-center"><span className="text-on-surface-variant text-sm">Loading...</span></div>;
  }

  const completedGoals = goals.filter(g => !!g.completedAt).length;
  const done = !!unit.completedAt;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button
          type="button"
          onClick={() => navigate(`/programs/${id}`)}
          className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> {program?.title ?? 'Program'}
        </button>

        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold font-headline">{unit.title}</h1>
            {unit.description && <p className="text-sm text-on-surface-variant mt-1">{unit.description}</p>}
            <p className="text-xs text-on-surface-variant mt-2">
              {completedGoals}/{goals.length} goals · {unit.suggestedDays ? `~${unit.suggestedDays} days` : 'flexible pace'}
            </p>
            {goals.length > 0 && (
              <div className="mt-2 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{width: `${Math.round((completedGoals / goals.length) * 100)}%`}}
                />
              </div>
            )}
          </div>
          {!done && (
            <Button variant="outline" size="sm" onClick={handleMarkComplete}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark complete
            </Button>
          )}
        </div>

        {/* Sessions section */}
        <div className="mb-6 rounded-xl border border-outline-variant/20 bg-surface-container p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-on-surface">Today's sessions</span>
            <Button variant="ghost" size="sm" onClick={() => {setEditSession(undefined); setSessionModalOpen(true);}}>
              <Calendar className="h-3.5 w-3.5 mr-1" /> Schedule
            </Button>
          </div>
          {todaySessions.length === 0 ? (
            <p className="text-xs text-on-surface-variant">No sessions today for this unit.</p>
          ) : (
            <div className="space-y-2">
              {todaySessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => {setEditSession(s); setSessionModalOpen(true);}}
                  className="cursor-pointer text-sm text-on-surface px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest"
                >
                  {s.title ?? 'Practice session'}{s.scheduledTime ? ` · ${s.scheduledTime}` : ''}{s.completedAt ? ' ✓' : ''}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Goals */}
        <div className="space-y-2">
          {goals.map(goal => (
            <GoalItem key={goal.id} goal={goal} onRefresh={load} />
          ))}
          <AddGoalForm unitId={unit.id} onAdded={load} />
        </div>
      </div>

      <SessionModal
        open={sessionModalOpen}
        onClose={() => setSessionModalOpen(false)}
        onSaved={load}
        defaultDate={new Date().toISOString().slice(0, 10)}
        session={editSession}
        units={unit ? [unit] : []}
      />
    </div>
  );
}
