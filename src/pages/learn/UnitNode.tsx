// src/pages/learn/UnitNode.tsx
import {useNavigate} from 'react-router-dom';
import {Lock, ChevronDown, ChevronUp, Crown, Circle} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Instrument, LoadedUnit} from '@/lib/curriculum/types';

type UnitStatus = 'locked' | 'available' | 'in_progress' | 'completed';

function getUnitStatus(
  unit: LoadedUnit,
  completedLessonIds: Set<string>,
  completedUnitIds: Set<string>,
): UnitStatus {
  const prereqsMet = unit.prerequisites.every(p => completedUnitIds.has(p));
  if (!prereqsMet) return 'locked';
  const completed = unit.lessons.filter(id => completedLessonIds.has(`${unit.id}/${id}`));
  if (completed.length === 0) return 'available';
  if (completed.length === unit.lessons.length) return 'completed';
  return 'in_progress';
}

interface UnitNodeProps {
  unit: LoadedUnit;
  instrument: Instrument;
  completedLessonIds: Set<string>;
  completedUnitIds: Set<string>;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function UnitNode({
  unit,
  instrument,
  completedLessonIds,
  completedUnitIds,
  isExpanded,
  onToggle,
}: UnitNodeProps) {
  const navigate = useNavigate();
  const status = getUnitStatus(unit, completedLessonIds, completedUnitIds);
  const completedCount = unit.lessons.filter(id => completedLessonIds.has(`${unit.id}/${id}`)).length;
  const isLocked = status === 'locked';

  return (
    <div className="mb-4">
      {/* Unit header */}
      <button
        onClick={isLocked ? undefined : onToggle}
        disabled={isLocked}
        className={cn(
          'w-full flex items-center gap-4 p-4 rounded-xl border transition-all',
          isLocked
            ? 'bg-surface-container/50 border-outline-variant/10 opacity-50 cursor-not-allowed'
            : status === 'completed'
            ? 'bg-primary/10 border-primary/30 hover:bg-primary/15'
            : 'bg-surface-container border-outline-variant/20 hover:bg-surface-container-high',
        )}
      >
        {/* Status icon */}
        <div className={cn(
          'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
          status === 'locked' ? 'bg-surface-container-high'
          : status === 'completed' ? 'bg-primary'
          : 'bg-primary-container',
        )}>
          {status === 'locked' && <Lock className="h-4 w-4 text-on-surface-variant" />}
          {status === 'completed' && <Crown className="h-4 w-4 text-on-primary" />}
          {(status === 'available' || status === 'in_progress') && (
            <Circle className="h-4 w-4 text-primary" />
          )}
        </div>

        {/* Unit info */}
        <div className="flex-1 text-left min-w-0">
          <div className="font-semibold text-on-surface truncate">{unit.title}</div>
          <div className="text-xs text-on-surface-variant mt-0.5">
            {isLocked
              ? 'Complete prerequisites first'
              : `${completedCount} / ${unit.lessons.length} lessons`}
          </div>
        </div>

        {/* Progress bar */}
        {!isLocked && unit.lessons.length > 0 && (
          <div className="w-16 h-1.5 bg-surface-container-high rounded-full shrink-0">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{width: `${(completedCount / unit.lessons.length) * 100}%`}}
            />
          </div>
        )}

        {/* Expand toggle */}
        {!isLocked && (
          isExpanded ? <ChevronUp className="h-4 w-4 text-on-surface-variant shrink-0" />
                     : <ChevronDown className="h-4 w-4 text-on-surface-variant shrink-0" />
        )}
      </button>

      {/* Lesson list */}
      {isExpanded && !isLocked && (
        <div className="mt-2 pl-4 space-y-1">
          {unit.loadedLessons.map(lesson => {
            const done = completedLessonIds.has(`${unit.id}/${lesson.id}`);
            return (
              <button
                key={lesson.id}
                onClick={() =>
                  navigate(`/learn/lesson/${instrument}/${unit.id}/${lesson.id}`)
                }
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors text-left',
                  done
                    ? 'text-on-surface-variant hover:bg-surface-container'
                    : 'text-on-surface hover:bg-surface-container',
                )}
              >
                <div className={cn(
                  'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0',
                  done ? 'border-primary bg-primary' : 'border-outline-variant',
                )}>
                  {done && (
                    <svg className="h-3 w-3 text-on-primary" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className={cn('flex-1 font-medium', done && 'line-through opacity-60')}>
                  {lesson.title}
                </span>
                <span className="text-xs text-on-surface-variant">{lesson.xp} XP</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
