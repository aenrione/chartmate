// src/pages/learn/LessonComplete.tsx
import {Trophy, Flame} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Lesson} from '@/lib/curriculum/types';

interface Props {
  lesson: Lesson;
  xpEarned: number;
  heartBonus: boolean;
  streak: number;
  todayXp: number;
  dailyGoalTarget: number;
  dailyGoalCompleted: boolean;
  onNext: () => void;
  onBack: () => void;
}

function GoalRing({current, target}: {current: number; target: number}) {
  const pct = Math.min(1, current / target);
  const r = 20;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle
        cx="28" cy="28" r={r}
        fill="none"
        stroke="currentColor"
        className="text-surface-container-high"
        strokeWidth="4"
      />
      <circle
        cx="28" cy="28" r={r}
        fill="none"
        stroke="currentColor"
        className="text-primary"
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
      />
      <text
        x="28" y="33"
        textAnchor="middle"
        className="fill-on-surface font-bold"
        fontSize="10"
      >
        {current}/{target}
      </text>
    </svg>
  );
}

export default function LessonComplete({
  lesson,
  xpEarned,
  heartBonus,
  streak,
  todayXp,
  dailyGoalTarget,
  dailyGoalCompleted,
  onNext,
  onBack,
}: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-8 bg-surface">
      <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
        <Trophy className="h-10 w-10 text-primary" />
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-bold font-headline text-on-surface mb-2">
          Lesson Complete!
        </h2>
        <p className="text-on-surface-variant">{lesson.title}</p>
      </div>

      {/* XP earned */}
      <div className="flex flex-col items-center gap-1">
        <div className="bg-primary/10 border border-primary/20 rounded-full px-6 py-2">
          <span className="text-primary font-bold">+{xpEarned} XP</span>
        </div>
        {heartBonus && (
          <p className="text-xs text-emerald-500 font-medium">+3 bonus — no hearts lost!</p>
        )}
      </div>

      {/* Stats row: streak + daily goal */}
      <div className="flex items-center gap-8">
        {/* Streak */}
        <div className="flex flex-col items-center gap-1">
          <div className={cn(
            'flex items-center gap-1',
            streak > 0 ? 'text-orange-500' : 'text-on-surface-variant',
          )}>
            <Flame className="h-6 w-6" />
            <span className="text-2xl font-bold">{streak}</span>
          </div>
          <p className="text-xs text-on-surface-variant">day streak</p>
        </div>

        {/* Divider */}
        <div className="h-12 w-px bg-outline-variant/30" />

        {/* Daily goal ring */}
        <div className="flex flex-col items-center gap-1">
          <GoalRing current={todayXp} target={dailyGoalTarget} />
          <p className="text-xs text-on-surface-variant">
            {dailyGoalCompleted ? 'Goal met!' : 'daily goal'}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={onNext}
          className="w-full py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
        >
          Continue Learning
        </button>
        <button
          onClick={onBack}
          className="w-full py-3 rounded-xl text-on-surface-variant text-sm hover:bg-surface-container transition-colors"
        >
          Back to Skill Tree
        </button>
      </div>
    </div>
  );
}
