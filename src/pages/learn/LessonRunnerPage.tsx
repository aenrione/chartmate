// src/pages/learn/LessonRunnerPage.tsx
import {useCallback, useEffect, useState} from 'react';
import {useParams, useNavigate, useLocation} from 'react-router-dom';
import {X, ArrowLeft, Heart, HeartCrack} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Instrument, Lesson, Activity} from '@/lib/curriculum/types';
import {loadLesson} from '@/lib/curriculum/loader';
import {markLessonCompleted, getLearnStats} from '@/lib/local-db/learn';
import {recordEvent} from '@/lib/progression';
import ActivityRenderer from './activities/ActivityRenderer';
import LessonComplete from './LessonComplete';

const MAX_HEARTS = 3;

interface CompletionData {
  xpEarned: number;
  heartBonus: boolean;
  stars: 1 | 2 | 3;
  starsRaised?: {from: number; to: number};
  leveledUp: boolean;
  newLevel?: number;
  achievements: string[];
  missionsCompleted: string[];
  streak: number;
  todayXp: number;
  dailyGoalTarget: number;
  dailyGoalCompleted: boolean;
}

// ---------------------------------------------------------------------------
// useLessonCompletion hook
// ---------------------------------------------------------------------------

function useLessonCompletion(instrument: string, unitId: string, lessonId: string) {
  const [saving, setSaving] = useState(false);
  const [completionData, setCompletionData] = useState<CompletionData | null>(null);

  const complete = useCallback(
    async (heartsLost: number, lessonXp: number) => {
      if (saving) return;
      setSaving(true);
      try {
        // Hearts already encode failures: 0 hearts lost == perfect first-try run.
        // For lessons that have no scored activities, this still yields accuracy=1.
        const accuracy = heartsLost === 0 ? 1 : 0.5;
        await markLessonCompleted(instrument, unitId, lessonId);
        const result = await recordEvent({
          kind: 'lesson_completed',
          instrument: instrument as 'guitar' | 'drums' | 'theory',
          unitId,
          lessonId,
          heartsLost,
          accuracy,
          lessonXp,
        });
        const stats = await getLearnStats();
        const stars = (heartsLost === 0 && accuracy >= 0.85 ? 3 : heartsLost === 0 ? 2 : 1) as 1 | 2 | 3;
        setCompletionData({
          xpEarned: result.xpEarned,
          heartBonus: heartsLost === 0,
          stars,
          starsRaised: result.starsRaised,
          leveledUp: result.leveledUp,
          newLevel: result.newLevel,
          achievements: result.achievements,
          missionsCompleted: result.missionsCompleted,
          streak: result.streak,
          todayXp: stats.todayXp,
          dailyGoalTarget: stats.dailyGoalTarget,
          dailyGoalCompleted: result.dailyGoalMet,
        });
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saving, instrument, unitId, lessonId],
  );

  return {saving, completionData, complete};
}

// ---------------------------------------------------------------------------
// LessonRunnerPage
// ---------------------------------------------------------------------------

export default function LessonRunnerPage() {
  const {instrument, unitId, lessonId} = useParams<{
    instrument: Instrument;
    unitId: string;
    lessonId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = (location.state as {from?: string} | null)?.from ?? null;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [activityIndex, setActivityIndex] = useState(0);
  const [canContinue, setCanContinue] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [heartsLost, setHeartsLost] = useState(0);
  const [lessonFailed, setLessonFailed] = useState(false);

  const {saving, completionData, complete} = useLessonCompletion(
    instrument ?? '',
    unitId ?? '',
    lessonId ?? '',
  );

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
      await complete(heartsLost, lesson.xp);
      setCompleted(true);
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
        stars={completionData.stars}
        starsRaised={completionData.starsRaised}
        leveledUp={completionData.leveledUp}
        newLevel={completionData.newLevel}
        achievements={completionData.achievements}
        missionsCompleted={completionData.missionsCompleted}
        streak={completionData.streak}
        todayXp={completionData.todayXp}
        dailyGoalTarget={completionData.dailyGoalTarget}
        dailyGoalCompleted={completionData.dailyGoalCompleted}
        onNext={() => navigate('/learn')}
        onBack={() => navigate(fromPath ?? '/learn')}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface overflow-hidden">
      <div className="shrink-0 border-b border-outline-variant/20">
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <button
            onClick={() => navigate(fromPath ?? '/learn')}
            className="p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant shrink-0"
          >
            {fromPath ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </button>

          <p className="flex-1 text-sm font-medium text-on-surface text-center truncate">
            {lesson.title}
          </p>

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

        <div className="flex gap-1 px-4 pb-3">
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
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activity && (
          <ActivityRenderer
            key={activityIndex}
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
