// src/pages/learn/LessonComplete.tsx
import {Trophy} from 'lucide-react';
import type {Lesson} from '@/lib/curriculum/types';

interface Props {
  lesson: Lesson;
  onNext: () => void;
  onBack: () => void;
}

export default function LessonComplete({lesson, onNext, onBack}: Props) {
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

      <div className="bg-primary/10 border border-primary/20 rounded-full px-6 py-2">
        <span className="text-primary font-bold">+{lesson.xp} XP</span>
      </div>

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
