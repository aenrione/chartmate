// src/pages/learn/activities/ActivityRenderer.tsx
import React from 'react';
import type {Activity} from '@/lib/curriculum/types';
import TheoryCard from './TheoryCard';
import ChordDiagram from './ChordDiagram';
import QuizActivity from './QuizActivity';
import FretboardDrillActivity from './FretboardDrillActivity';
import TabExerciseActivity from './TabExerciseActivity';

interface Props {
  activity: Activity;
  onPass: () => void;
  onFail: () => void;
}

const ACTIVITY_REGISTRY: Record<string, React.ComponentType<any>> = {
  'theory-card': TheoryCard,
  'chord-diagram': ChordDiagram,
  'quiz': QuizActivity,
  'fretboard-drill': FretboardDrillActivity,
  'tab-exercise': TabExerciseActivity,
};

export default function ActivityRenderer({activity, onPass, onFail}: Props) {
  const Component = ACTIVITY_REGISTRY[activity.type];
  if (!Component) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-on-surface-variant text-sm">
          Unknown activity type: {(activity as any).type}
        </p>
      </div>
    );
  }
  return <Component activity={activity} onPass={onPass} onFail={onFail} />;
}
