// src/pages/learn/LessonComplete.tsx
import {Trophy, Flame, Star, Sparkles, Award, Target} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Lesson} from '@/lib/curriculum/types';
import {ACHIEVEMENT_CATALOG} from '@/lib/progression';
import {findMissionTemplate} from '@/lib/progression';

interface Props {
  lesson: Lesson;
  xpEarned: number;
  heartBonus: boolean;
  stars: 1 | 2 | 3;
  starsRaised?: {from: number; to: number};
  leveledUp?: boolean;
  newLevel?: number;
  achievements?: string[];
  missionsCompleted?: string[];
  streak: number;
  todayXp: number;
  dailyGoalTarget: number;
  dailyGoalCompleted: boolean;
  onNext: () => void;
  onBack: () => void;
}

function StarRow({earned}: {earned: 1 | 2 | 3}) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`${earned} of 3 stars`}>
      {[1, 2, 3].map(i => (
        <Star
          key={i}
          className={cn(
            'h-7 w-7 transition-all',
            i <= earned ? 'fill-amber-400 text-amber-400' : 'text-on-surface-variant/30',
          )}
        />
      ))}
    </div>
  );
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
  stars,
  starsRaised,
  leveledUp,
  newLevel,
  achievements,
  missionsCompleted,
  streak,
  todayXp,
  dailyGoalTarget,
  dailyGoalCompleted,
  onNext,
  onBack,
}: Props) {
  const isRetry = xpEarned > 0 && !heartBonus && stars < 3 && xpEarned <= 5;
  const masteryNotice = stars < 3
    ? `You earned ${stars} ${stars === 1 ? 'star' : 'stars'}. Replay for the third — no extra XP, just a mastery bonus.`
    : null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-6 bg-surface">
      <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
        <Trophy className="h-10 w-10 text-primary" />
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-bold font-headline text-on-surface mb-2">
          Lesson Complete!
        </h2>
        <p className="text-on-surface-variant">{lesson.title}</p>
      </div>

      {/* Stars */}
      <div className="flex flex-col items-center gap-1">
        <StarRow earned={stars} />
        {starsRaised && (
          <p className="text-xs text-emerald-500 font-medium mt-1">
            Raised from {starsRaised.from}★ to {starsRaised.to}★ — nice
          </p>
        )}
        {masteryNotice && !starsRaised && (
          <p className="text-xs text-on-surface-variant mt-1 max-w-xs text-center">{masteryNotice}</p>
        )}
      </div>

      {/* XP earned */}
      <div className="flex flex-col items-center gap-1">
        <div className="bg-primary/10 border border-primary/20 rounded-full px-6 py-2">
          <span className="text-primary font-bold">+{xpEarned} XP</span>
        </div>
        {heartBonus && (
          <p className="text-xs text-emerald-500 font-medium">+3 bonus — no hearts lost!</p>
        )}
        {isRetry && (
          <p className="text-xs text-on-surface-variant">replays earn less than first plays — that's intentional</p>
        )}
      </div>

      {/* Level-up celebration */}
      {leveledUp && newLevel != null && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-semibold">Level up — Lv {newLevel}</span>
        </div>
      )}

      {/* Achievements unlocked */}
      {achievements && achievements.length > 0 && (
        <div className="w-full max-w-sm flex flex-col gap-1.5">
          {achievements.map(id => {
            const a = ACHIEVEMENT_CATALOG.find(x => x.id === id);
            if (!a) return null;
            return (
              <div
                key={id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30"
              >
                <Award className="h-5 w-5 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">{a.title}</p>
                  <p className="text-xs text-on-surface-variant truncate">{a.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Missions completed */}
      {missionsCompleted && missionsCompleted.length > 0 && (
        <div className="w-full max-w-sm flex flex-col gap-1.5">
          {missionsCompleted.map(id => {
            const m = findMissionTemplate(id);
            if (!m) return null;
            return (
              <div
                key={id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30"
              >
                <Target className="h-5 w-5 text-emerald-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">Mission complete: {m.title}</p>
                  <p className="text-xs text-on-surface-variant truncate">+{m.xp_reward} XP</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
