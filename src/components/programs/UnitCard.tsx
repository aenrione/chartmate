import {Link} from 'react-router-dom';
import {CheckCircle2, Circle, Clock, ChevronRight, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';
import type {Unit, Goal} from '@/lib/local-db/programs';
import {completeUnit, deleteUnit} from '@/lib/local-db/programs';

interface UnitCardProps {
  programId: number;
  unit: Unit;
  goals: Goal[];
  orderLabel: string;
  onRefresh: () => void;
}

export default function UnitCard({programId, unit, goals, orderLabel, onRefresh}: UnitCardProps) {
  const done = !!unit.completedAt;
  const completedGoals = goals.filter(g => !!g.completedAt).length;

  async function handleComplete(e: React.MouseEvent) {
    e.preventDefault();
    await completeUnit(unit.id);
    onRefresh();
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    await deleteUnit(unit.id);
    onRefresh();
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-outline-variant/20 bg-surface-container transition-colors',
        done && 'opacity-60',
      )}
    >
      <Link
        to={`/programs/${programId}/units/${unit.id}`}
        className="flex items-center gap-3 p-4 hover:bg-surface-container-high rounded-2xl transition-colors"
      >
        <div className="shrink-0">
          {done ? (
            <CheckCircle2 className="h-5 w-5 text-primary" />
          ) : (
            <Circle className="h-5 w-5 text-on-surface-variant" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant font-mono">{orderLabel}</span>
            {unit.suggestedDays && (
              <span className="flex items-center gap-0.5 text-xs text-on-surface-variant">
                <Clock className="h-3 w-3" /> {unit.suggestedDays}d
              </span>
            )}
          </div>
          <h3 className="font-medium text-on-surface truncate">{unit.title}</h3>
          {unit.description && (
            <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">{unit.description}</p>
          )}
          <p className="text-xs text-on-surface-variant mt-1">
            {completedGoals}/{goals.length} goals
          </p>
          {goals.length > 0 && (
            <div className="mt-1.5 h-1 rounded-full bg-surface-container-high overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{width: `${Math.round((completedGoals / goals.length) * 100)}%`}}
              />
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <ChevronRight className="h-4 w-4 text-on-surface-variant" />
          {!done && (
            <Button variant="outline" size="sm" onClick={handleComplete}>
              Complete
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5 text-error" />
          </Button>
        </div>
      </Link>
    </div>
  );
}
