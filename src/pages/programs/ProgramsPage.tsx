import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {getPrograms, getUnitsForProgram} from '@/lib/local-db/programs';
import type {Program, Unit} from '@/lib/local-db/programs';
import ProgramCard from '@/components/programs/ProgramCard';
import NewProgramModal from '@/components/programs/NewProgramModal';

interface ProgramWithMeta {
  program: Program;
  units: Unit[];
}

const STATUS_ORDER: Program['status'][] = ['active', 'draft', 'archived'];

export default function ProgramsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ProgramWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const programs = await getPrograms();
      const withUnits = await Promise.all(
        programs.map(async program => ({
          program,
          units: await getUnitsForProgram(program.id),
        })),
      );
      const sorted = [...withUnits].sort(
        (a, b) =>
          STATUS_ORDER.indexOf(a.program.status) - STATUS_ORDER.indexOf(b.program.status),
      );
      setItems(sorted);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {load();}, []);

  function handleCreated(id: number) {
    setModalOpen(false);
    navigate(`/programs/${id}`);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-on-surface-variant text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold font-headline">Programs</h1>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New program
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant">
            <p className="text-sm">No programs yet.</p>
            <p className="text-xs mt-1">Create your first practice program to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(({program, units}) => (
              <ProgramCard
                key={program.id}
                program={program}
                unitCount={units.length}
                completedUnitCount={units.filter(u => !!u.completedAt).length}
                onRefresh={load}
              />
            ))}
          </div>
        )}
      </div>

      <NewProgramModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
    </div>
  );
}
