import {useEffect, useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {ArrowLeft, Plus, Play, Archive} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
  getProgram,
  getUnitsForProgram,
  getGoalsForUnit,
  createUnit,
  activateProgram,
  archiveProgram,
} from '@/lib/local-db/programs';
import type {Program, Unit, Goal} from '@/lib/local-db/programs';
import UnitCard from '@/components/programs/UnitCard';

interface UnitWithGoals {
  unit: Unit;
  goals: Goal[];
}

export default function ProgramDetailPage() {
  const {id} = useParams<{id: string}>();
  const navigate = useNavigate();
  const [program, setProgram] = useState<Program | null>(null);
  const [unitsWithGoals, setUnitsWithGoals] = useState<UnitWithGoals[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnitTitle, setNewUnitTitle] = useState('');
  const [newUnitDays, setNewUnitDays] = useState('');

  async function load() {
    if (!id) return;
    setLoading(true);
    const [prog, units] = await Promise.all([
      getProgram(Number(id)),
      getUnitsForProgram(Number(id)),
    ]);
    if (!prog) {navigate('/programs'); return;}
    const withGoals = await Promise.all(
      units.map(async unit => ({unit, goals: await getGoalsForUnit(unit.id)})),
    );
    setProgram(prog);
    setUnitsWithGoals(withGoals);
    setLoading(false);
  }

  useEffect(() => {load();}, [id]);

  async function handleAddUnit() {
    if (!newUnitTitle.trim() || !id) return;
    await createUnit({
      programId: Number(id),
      title: newUnitTitle.trim(),
      suggestedDays: newUnitDays ? Number(newUnitDays) : undefined,
    });
    setNewUnitTitle('');
    setNewUnitDays('');
    setAddingUnit(false);
    load();
  }

  async function handleActivate() {
    if (!id) return;
    await activateProgram(Number(id));
    load();
  }

  async function handleArchive() {
    if (!id) return;
    await archiveProgram(Number(id));
    load();
  }

  if (loading || !program) {
    return <div className="flex-1 flex items-center justify-center"><span className="text-on-surface-variant text-sm">Loading...</span></div>;
  }

  const totalUnits = unitsWithGoals.length;
  const completedUnits = unitsWithGoals.filter(({unit}) => !!unit.completedAt).length;
  const progress = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={() => navigate('/programs')} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface mb-4">
          <ArrowLeft className="h-4 w-4" /> Programs
        </button>

        <div className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold font-headline">{program.title}</h1>
              {program.description && <p className="text-sm text-on-surface-variant mt-1">{program.description}</p>}
              <p className="text-xs text-on-surface-variant mt-2">{completedUnits}/{totalUnits} units complete</p>
              {totalUnits > 0 && (
                <div className="mt-2 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{width: `${progress}%`}} />
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {program.status === 'draft' && (
                <Button variant="outline" size="sm" onClick={handleActivate}>
                  <Play className="h-3 w-3 mr-1" /> Start
                </Button>
              )}
              {program.status === 'active' && (
                <Button variant="ghost" size="sm" onClick={handleArchive}>
                  <Archive className="h-3 w-3 mr-1" /> Archive
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {unitsWithGoals.map(({unit, goals}, i) => (
            <UnitCard
              key={unit.id}
              programId={program.id}
              unit={unit}
              goals={goals}
              orderLabel={`${i + 1}.`}
              onRefresh={load}
            />
          ))}

          {addingUnit ? (
            <div className="rounded-xl border border-outline-variant/20 bg-surface-container p-4 space-y-3">
              <Input
                placeholder="Unit title"
                value={newUnitTitle}
                onChange={e => setNewUnitTitle(e.target.value)}
                autoFocus
              />
              <Input
                type="number"
                placeholder="Suggested days (optional)"
                value={newUnitDays}
                onChange={e => setNewUnitDays(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setAddingUnit(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddUnit} disabled={!newUnitTitle.trim()}>Add unit</Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="w-full border border-dashed border-outline-variant/40"
              onClick={() => setAddingUnit(true)}
            >
              <Plus className="h-4 w-4 mr-1" /> Add unit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
