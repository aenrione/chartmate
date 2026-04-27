import {useEffect, useState} from 'react';
import {Music} from 'lucide-react';
import type {TabExerciseActivity as TabExerciseActivityType} from '@/lib/curriculum/types';

interface Props {
  activity: TabExerciseActivityType;
  onPass: () => void;
}

export default function TabExerciseActivity({activity, onPass}: Props) {
  const unlockAfter = activity.unlockAfterSeconds ?? 5;
  const [secondsLeft, setSecondsLeft] = useState(unlockAfter);
  const [compositionId, setCompositionId] = useState<number | null>(null);

  useEffect(() => {
    const id = activity.compositionId;
    if (id.startsWith('db:')) {
      const numId = parseInt(id.replace('db:', ''), 10);
      if (!isNaN(numId)) setCompositionId(numId);
    }
  }, [activity.compositionId]);

  useEffect(() => {
    setSecondsLeft(unlockAfter);
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onPass();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activity, unlockAfter]);

  return (
    <div className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <Music className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <p className="text-on-surface font-medium">{activity.instruction}</p>
      </div>

      {compositionId !== null ? (
        <div className="bg-surface-container rounded-xl border border-outline-variant/20 p-4">
          <p className="text-sm text-on-surface-variant mb-2">
            Tab composition #{compositionId}
          </p>
          <p className="text-xs text-on-surface-variant/60">
            Open this composition in the Tab Editor to play along.
          </p>
        </div>
      ) : (
        <div className="bg-surface-container rounded-xl border border-outline-variant/20 p-4 text-sm text-on-surface-variant">
          {activity.compositionId.startsWith('bundled:')
            ? 'Bundled tab assets are coming in a future update.'
            : 'Invalid composition reference.'}
        </div>
      )}

      {secondsLeft > 0 && (
        <p className="text-xs text-center text-on-surface-variant">
          Continue unlocks in {secondsLeft}s…
        </p>
      )}
    </div>
  );
}
