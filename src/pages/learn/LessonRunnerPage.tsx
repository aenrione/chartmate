// src/pages/learn/LessonRunnerPage.tsx
import {useEffect, useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {X, Heart, HeartCrack} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Instrument, Lesson, Activity} from '@/lib/curriculum/types';
import {loadLesson} from '@/lib/curriculum/loader';
import {markLessonCompleted, recordXp, syncStreakAfterXp} from '@/lib/local-db/learn';
import ActivityRenderer from './activities/ActivityRenderer';
import LessonComplete from './LessonComplete';

const MAX_HEARTS = 3;

interface CompletionData {
  xpEarned: number;
  heartBonus: boolean;
  streak: number;
  todayXp: number;
  dailyGoalTarget: number;
  dailyGoalCompleted: boolean;
}

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

  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [heartsLost, setHeartsLost] = useState(0);
  const [lessonFailed, setLessonFailed] = useState(false);

  const [completionData, setCompletionData] = useState<CompletionData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hearts === 0) setLessonFailed(true);
  }, [hearts]);

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

  function handleFail() {
    setHeartsLost(prev => prev + 1);
    setHearts(prev => Math.max(0, prev - 1));
  }

  function handleRestart() {
    setActivityIndex(0);
    setCanContinue(false);
    setHearts(MAX_HEARTS);
    setHeartsLost(0);
    setLessonFailed(false);
  }

  async function handleContinue() {
    if (!lesson || saving) return;
    const next = activityIndex + 1;
    if (next >= totalActivities) {
      setSaving(true);
      try {
        const noHeartsLost = heartsLost === 0;
        await markLessonCompleted(instrument!, unitId!, lessonId!);
        await recordXp(lesson.xp, 'lesson', instrument!, lessonId!);
        if (noHeartsLost) {
          await recordXp(3, 'heart_bonus', instrument!, lessonId!);
        }
        const syncResult = await syncStreakAfterXp();
        setCompletionData({
          xpEarned: lesson.xp + (noHeartsLost ? 3 : 0),
          heartBonus: noHeartsLost,
          streak: syncResult.newStreak,
          todayXp: syncResult.todayXp,
          dailyGoalTarget: syncResult.dailyGoalTarget,
          dailyGoalCompleted: syncResult.todayXp >= syncResult.dailyGoalTarget,
        });
        setCompleted(true);
      } finally {
        setSaving(false);
      }
    } else {
      setActivityIndex(next);
      setCanContinue(false);
    }
  }

  if (lessonFailed) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-8 bg-surface">
        <div className="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center">
          <HeartCrack className="h-10 w-10 text-red-500" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold font-headline text-on-surface mb-2">
            No more hearts!
          </h2>
          <p className="text-on-surface-variant">
            You ran out of hearts. Don't worry — give it another try!
          </p>
        </div>
        <div className="w-full max-w-xs flex flex-col gap-3">
          <button
            onClick={handleRestart}
            className="w-full py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Try Again
          </button>
          <button
            onClick={() => navigate('/learn')}
            className="w-full py-3 rounded-xl text-on-surface-variant text-sm hover:bg-surface-container transition-colors"
          >
            Back to Skill Tree
          </button>
        </div>
      </div>
    );
  }

  if (completed && completionData) {
    return (
      <LessonComplete
        lesson={lesson}
        xpEarned={completionData.xpEarned}
        heartBonus={completionData.heartBonus}
        streak={completionData.streak}
        todayXp={completionData.todayXp}
        dailyGoalTarget={completionData.dailyGoalTarget}
        dailyGoalCompleted={completionData.dailyGoalCompleted}
        onNext={() => navigate('/learn')}
        onBack={() => navigate('/learn')}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface overflow-hidden">
      <div className="shrink-0 flex items-center gap-4 px-4 py-3 border-b border-outline-variant/20">
        <button
          onClick={() => navigate('/learn')}
          className="p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex-1 flex gap-1">
          {lesson.activities.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-2 flex-1 rounded-full transition-all',
                i < activityIndex
                  ? 'bg-primary'
                  : i === activityIndex
                  ? 'bg-primary/50'
                  : 'bg-surface-container',
              )}
            />
          ))}
        </div>

        <div className="flex gap-1 shrink-0">
          {Array.from({length: MAX_HEARTS}).map((_, i) => (
            <Heart
              key={i}
              className={cn(
                'h-5 w-5 transition-colors',
                i < hearts ? 'text-red-500 fill-red-500' : 'text-outline-variant',
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activity && (
          <ActivityRenderer
            activity={activity}
            onPass={() => setCanContinue(true)}
            onFail={handleFail}
          />
        )}
      </div>

      <div className="shrink-0 px-6 py-4 border-t border-outline-variant/20">
        <button
          onClick={handleContinue}
          disabled={!canContinue || saving}
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
