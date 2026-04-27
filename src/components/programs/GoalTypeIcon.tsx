import {Music, BookOpen, Dumbbell, Guitar, HelpCircle} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Goal} from '@/lib/local-db/programs';

const TYPE_CONFIG: Record<
  Goal['type'],
  {icon: React.ElementType; label: string; className: string}
> = {
  song: {icon: Music, label: 'Song', className: 'text-purple-400'},
  tab: {icon: Guitar, label: 'Tab', className: 'text-blue-400'},
  learn_lesson: {icon: BookOpen, label: 'Lesson', className: 'text-green-400'},
  exercise: {icon: Dumbbell, label: 'Exercise', className: 'text-orange-400'},
  custom: {icon: HelpCircle, label: 'Custom', className: 'text-on-surface-variant'},
};

interface GoalTypeIconProps {
  type: Goal['type'];
  className?: string;
  showLabel?: boolean;
}

export default function GoalTypeIcon({type, className, showLabel = false}: GoalTypeIconProps) {
  const {icon: Icon, label, className: colorClass} = TYPE_CONFIG[type] ?? TYPE_CONFIG.custom;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', colorClass, className)}>
      <Icon className="h-3.5 w-3.5" />
      {showLabel && <span>{label}</span>}
    </span>
  );
}
