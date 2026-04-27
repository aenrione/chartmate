import {useNavigate} from 'react-router-dom';
import {ExternalLink, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';
import type {Goal} from '@/lib/local-db/programs';
import {completeGoal, uncompleteGoal, deleteGoal} from '@/lib/local-db/programs';
import GoalTypeIcon from './GoalTypeIcon';

interface GoalItemProps {
  goal: Goal;
  onRefresh: () => void;
}

function resolveLink(goal: Goal): string | null {
  if (goal.type === 'tab' && goal.refId) return `/tab-editor/${goal.refId}`;
  if (goal.type === 'learn_lesson' && goal.refId) {
    const [instrument, unitId, lessonId] = goal.refId.split('/');
    if (instrument && unitId && lessonId)
      return `/learn/lesson/${instrument}/${unitId}/${lessonId}`;
  }
  if (goal.type === 'exercise' && goal.refId) return goal.refId;
  if (goal.type === 'song' && goal.refId) return '/library/saved-charts';
  // 'custom' type has no navigable route
  return null;
}

export default function GoalItem({goal, onRefresh}: GoalItemProps) {
  const navigate = useNavigate();
  const done = !!goal.completedAt;
  const link = resolveLink(goal);

  async function handleToggle() {
    try {
      if (done) {
        await uncompleteGoal(goal.id);
      } else {
        await completeGoal(goal.id);
      }
    } finally {
      onRefresh();
    }
  }

  async function handleDelete() {
    try {
      await deleteGoal(goal.id);
    } finally {
      onRefresh();
    }
  }

  return (
    <div className={cn(
      'flex items-start gap-3 rounded-xl p-3 bg-surface-container border border-outline-variant/20',
      done && 'opacity-60',
    )}>
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'mt-0.5 h-5 w-5 shrink-0 rounded border-2 transition-colors flex items-center justify-center',
          done
            ? 'bg-primary border-primary text-on-primary'
            : 'border-outline-variant hover:border-primary',
        )}
      >
        {done && (
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <GoalTypeIcon type={goal.type} showLabel />
        </div>
        <p className={cn('text-sm font-medium text-on-surface', done && 'line-through')}>{goal.title}</p>
        {goal.target && (
          <p className="text-xs text-primary mt-0.5">Target: {goal.target}</p>
        )}
        {goal.notes && (
          <p className="text-xs text-on-surface-variant mt-0.5">{goal.notes}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {link && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(link)}>
            <ExternalLink className="h-3.5 w-3.5 text-primary" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDelete}>
          <Trash2 className="h-3.5 w-3.5 text-error" />
        </Button>
      </div>
    </div>
  );
}
