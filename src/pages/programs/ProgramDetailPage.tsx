import {useEffect, useState, useRef} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {ArrowLeft, Plus, Play, Archive, Pencil, Trash2, Check, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getProgram,
  getUnitsForProgram,
  getGoalsForUnit,
  createUnit,
  activateProgram,
  archiveProgram,
  updateProgram,
  deleteProgram,
} from '@/lib/local-db/programs';
import type {Program, Unit, Goal} from '@/lib/local-db/programs';
import UnitCard from '@/components/programs/UnitCard';

interface UnitWithGoals {
  unit: Unit;
  goals: Goal[];
}

type ProgramDetailCache = {program: Program | null; unitsWithGoals: UnitWithGoals[]};
const _programDetailCache = new Map<string, ProgramDetailCache>();

export default function ProgramDetailPage() {
  const {id} = useParams<{id: string}>();
  const navigate = useNavigate();
  const cached = id ? _programDetailCache.get(id) : undefined;
  const [program, setProgram] = useState<Program | null>(cached?.program ?? null);
  const [unitsWithGoals, setUnitsWithGoals] = useState<UnitWithGoals[]>(cached?.unitsWithGoals ?? []);
  const [loading, setLoading] = useState(!cached);
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnitTitle, setNewUnitTitle] = useState('');
  const [newUnitDays, setNewUnitDays] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const [prog, units] = await Promise.all([
        getProgram(Number(id)),
        getUnitsForProgram(Number(id)),
      ]);
      if (!prog) {navigate('/programs'); return;}
      const withGoals = await Promise.all(
        units.map(async unit => ({unit, goals: await getGoalsForUnit(unit.id)})),
      );
      _programDetailCache.set(id, {program: prog, unitsWithGoals: withGoals});
      setProgram(prog);
      setUnitsWithGoals(withGoals);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {load();}, [id]);

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus();
  }, [renaming]);

  async function handleAddUnit() {
    if (!newUnitTitle.trim() || !id) return;
    await createUnit({
      programId: Number(id),
      title: newUnitTitle.trim(),
      suggestedDays: newUnitDays.trim()
        ? (v => (!isNaN(v) && v > 0 ? v : undefined))(parseInt(newUnitDays, 10))
        : undefined,
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

  async function handleRename() {
    const v = renameValue.trim();
    if (v && v !== program?.title) {
      await updateProgram(Number(id), {title: v});
      load();
    }
    setRenaming(false);
  }

  async function handleDelete() {
    if (!id) return;
    await deleteProgram(Number(id));
    navigate('/programs');
  }

  if (loading || !program) {
    return <div className="flex-1 flex items-center justify-center"><span className="text-on-surface-variant text-sm">Loading...</span></div>;
  }

  const totalUnits = unitsWithGoals.length;
  const completedUnits = unitsWithGoals.filter(({unit}) => !!unit.completedAt).length;
  const progress = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button type="button" onClick={() => navigate('/programs')} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface mb-4">
            <ArrowLeft className="h-4 w-4" /> Programs
          </button>

          <div className="mb-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {renaming ? (
                  <div className="flex items-center gap-2">
                    <Input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename();
                        if (e.key === 'Escape') setRenaming(false);
                      }}
                      className="text-xl font-bold font-headline h-9"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleRename}>
                      <Check className="h-4 w-4 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setRenaming(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h1 className="text-xl font-bold font-headline">{program.title}</h1>
                    <button
                      type="button"
                      onClick={() => { setRenameValue(program.title); setRenaming(true); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-surface-container-high"
                      aria-label="Rename program"
                    >
                      <Pencil className="h-3.5 w-3.5 text-on-surface-variant" />
                    </button>
                  </div>
                )}
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
                <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
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

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{program.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the program and all its units, goals, and sessions. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
