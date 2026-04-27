// src/pages/learn/LessonRunnerPage.tsx
import {useEffect, useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {X} from 'lucide-react';
import type {Instrument, Lesson, Activity} from '@/lib/curriculum/types';
import {loadLesson} from '@/lib/curriculum/loader';
import {markLessonCompleted} from '@/lib/local-db/learn';
import ActivityRenderer from './activities/ActivityRenderer';
import LessonComplete from './LessonComplete';

export default function LessonRunnerPage() {
  const {instrument, unitId, lessonId} = useParams<{
    instrument: Instrument;
    unitId: string;
    lessonId: string;
  }>();
  const navigate = useNavigate();

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [activityIndex, setActivityIndex] = useState(0);
  const [canContinue, setCanContinue] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (instrument && unitId && lessonId) {
      loadLesson(instrument, unitId, lessonId)
        .then(setLesson)
        .catch(err => setLoadError(String(err)));
    }
  }, [instrument, unitId, lessonId]);

  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <p className="text-red-500 text-sm">Failed to load lesson: {loadError}</p>
      </div>
    );
  }

  if (!lesson || !instrument || !unitId || !lessonId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <p className="text-on-surface-variant text-sm">Loading lesson…</p>
      </div>
    );
  }

  const activity: Activity | undefined = lesson.activities[activityIndex];
  const totalActivities = lesson.activities.length;

  async function handleContinue() {
    if (!lesson) return;
    const next = activityIndex + 1;
    if (next >= totalActivities) {
      await markLessonCompleted(instrument!, unitId!, lessonId!);
      setCompleted(true);
    } else {
      setActivityIndex(next);
      setCanContinue(false);
    }
  }

  if (completed) {
    return (
      <LessonComplete
        lesson={lesson}
        onNext={() => navigate(`/learn`)}
        onBack={() => navigate(`/learn`)}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-3 border-b border-outline-variant/20">
        <button
          onClick={() => navigate(`/learn`)}
          className="p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Progress bar */}
        <div className="flex-1 flex gap-1">
          {lesson.activities.map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full transition-all ${
                i < activityIndex
                  ? 'bg-primary'
                  : i === activityIndex
                  ? 'bg-primary/50'
                  : 'bg-surface-container'
              }`}
            />
          ))}
        </div>

        <span className="text-xs text-on-surface-variant shrink-0 font-medium">
          {activityIndex + 1} / {totalActivities}
        </span>
      </div>

      {/* Activity area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activity && (
          <ActivityRenderer
            activity={activity}
            onPass={() => setCanContinue(true)}
          />
        )}
      </div>

      {/* Continue button */}
      <div className="shrink-0 px-6 py-4 border-t border-outline-variant/20">
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className="w-full py-3 rounded-xl font-semibold transition-all text-sm
            bg-primary text-on-primary
            disabled:opacity-40 disabled:cursor-not-allowed
            hover:opacity-90 active:scale-[0.98]"
        >
          {activityIndex + 1 === totalActivities ? 'Finish' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
