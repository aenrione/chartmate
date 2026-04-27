import {useState, useRef, useEffect} from 'react';
import {Link} from 'react-router-dom';
import {Guitar, Drum, ChevronRight, Play, Archive, MoreVertical, Pencil, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {cn} from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import type {Program} from '@/lib/local-db/programs';
import {activateProgram, archiveProgram, updateProgram, deleteProgram} from '@/lib/local-db/programs';

interface ProgramCardProps {
  program: Program;
  unitCount: number;
  completedUnitCount: number;
  onRefresh: () => void;
  onDeleted?: () => void;
}

const STATUS_BADGE: Record<Program['status'], {label: string; className: string}> = {
  draft: {label: 'Draft', className: 'bg-surface-container-high text-on-surface-variant'},
  active: {label: 'Active', className: 'bg-primary/20 text-primary'},
  archived: {label: 'Archived', className: 'bg-surface-container text-on-surface-variant opacity-60'},
};

export default function ProgramCard({program, unitCount, completedUnitCount, onRefresh, onDeleted}: ProgramCardProps) {
  const badge = STATUS_BADGE[program.status];
  const progress = unitCount > 0 ? Math.round((completedUnitCount / unitCount) * 100) : 0;
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(program.title);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

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

  async function handleRename() {
    const v = renameValue.trim();
    if (!v) {
      setRenameValue(program.title);
      setRenaming(false);
      return;
    }
    if (v !== program.title) {
      await updateProgram(program.id, {title: v});
      onRefresh();
    }
    setRenaming(false);
  }

  async function handleDelete() {
    await deleteProgram(program.id);
    onDeleted ? onDeleted() : onRefresh();
  }

  return (
    <>
      <Link
        to={renaming ? '#' : `/programs/${program.id}`}
        onClick={renaming ? e => e.preventDefault() : undefined}
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
            {renaming ? (
              <Input
                ref={inputRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={handleRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleRename(); }
                  if (e.key === 'Escape') { setRenameValue(program.title); setRenaming(false); }
                }}
                onClick={e => e.preventDefault()}
                className="font-semibold h-8 text-sm"
              />
            ) : (
              <h3 className="font-semibold text-on-surface truncate">{program.title}</h3>
            )}
            {program.description && !renaming && (
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
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={e => e.preventDefault()}
                  >
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">Program options</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={e => e.preventDefault()}>
                  <DropdownMenuItem
                    onClick={e => {
                      e.preventDefault();
                      setRenameValue(program.title);
                      setRenaming(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={e => {
                      e.preventDefault();
                      setDeleteOpen(true);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ChevronRight className="h-4 w-4 text-on-surface-variant" />
            </div>
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
