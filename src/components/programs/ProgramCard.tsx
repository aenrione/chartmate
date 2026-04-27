import {Link} from 'react-router-dom';
import {Guitar, Drum, ChevronRight, Play, Archive} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';
import type {Program, Unit} from '@/lib/local-db/programs';
import {activateProgram, archiveProgram} from '@/lib/local-db/programs';

interface ProgramCardProps {
  program: Program;
  unitCount: number;
  completedUnitCount: number;
  onRefresh: () => void;
}

const STATUS_BADGE: Record<Program['status'], {label: string; className: string}> = {
  draft: {label: 'Draft', className: 'bg-surface-container-high text-on-surface-variant'},
  active: {label: 'Active', className: 'bg-primary/20 text-primary'},
  archived: {label: 'Archived', className: 'bg-surface-container text-on-surface-variant opacity-60'},
};

export default function ProgramCard({program, unitCount, completedUnitCount, onRefresh}: ProgramCardProps) {
  const badge = STATUS_BADGE[program.status];
  const progress = unitCount > 0 ? Math.round((completedUnitCount / unitCount) * 100) : 0;

  async function handleActivate(e: React.MouseEvent) {
    e.preventDefault();
    await activateProgram(program.id);
    onRefresh();
  }

  async function handleArchive(e: React.MouseEvent) {
    e.preventDefault();
    await archiveProgram(program.id);
    onRefresh();
  }

  return (
    <Link
      to={`/programs/${program.id}`}
      className={cn(
        'block rounded-2xl border border-outline-variant/20 bg-surface-container p-4 hover:bg-surface-container-high transition-colors',
        program.status === 'active' && 'border-primary/30 bg-primary/5',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {program.instrument === 'guitar' && <Guitar className="h-4 w-4 text-on-surface-variant shrink-0" />}
            {program.instrument === 'drums' && <Drum className="h-4 w-4 text-on-surface-variant shrink-0" />}
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badge.className)}>
              {badge.label}
            </span>
          </div>
          <h3 className="font-semibold text-on-surface truncate">{program.title}</h3>
          {program.description && (
            <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{program.description}</p>
          )}
          <p className="text-xs text-on-surface-variant mt-2">
            {completedUnitCount}/{unitCount} units complete
          </p>
          {unitCount > 0 && (
            <div className="mt-2 h-1 rounded-full bg-surface-container-high overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{width: `${progress}%`}} />
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <ChevronRight className="h-4 w-4 text-on-surface-variant" />
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
    </Link>
  );
}
