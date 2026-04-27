// src/pages/learn/activities/ActivityRenderer.tsx
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

export default function ActivityRenderer({activity, onPass, onFail}: Props) {
  switch (activity.type) {
    case 'theory-card':
      return <TheoryCard activity={activity} onPass={onPass} />;
    case 'chord-diagram':
      return <ChordDiagram activity={activity} onPass={onPass} />;
    case 'quiz':
      return <QuizActivity activity={activity} onPass={onPass} onFail={onFail} />;
    case 'fretboard-drill':
      return <FretboardDrillActivity activity={activity} onPass={onPass} />;
    case 'tab-exercise':
      return <TabExerciseActivity activity={activity} onPass={onPass} />;
    default:
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-on-surface-variant text-sm">
            Unknown activity type: {(activity as any).type}
          </p>
        </div>
      );
  }
}
