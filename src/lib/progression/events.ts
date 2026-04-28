/**
 * The unified event vocabulary for the progression system. Every practice surface emits one of
 * these into `recordEvent` (see `engine.ts`). The kinds are exhaustive — surfaces don't get to
 * invent new ones.
 */

export type Instrument = 'guitar' | 'drums' | 'theory';

export type Surface =
  | 'lesson'
  | 'rudiment'
  | 'fill'
  | 'ear'
  | 'fretboard'
  | 'repertoire'
  | 'playbook'
  | 'tab_session'
  | 'mission_bonus'
  | 'achievement_bonus'
  | 'program_goal';

export type AchievementId = string;
export type MissionTemplateId = string;

export type ProgressEvent =
  | {
      kind: 'lesson_completed';
      instrument: Instrument;
      unitId: string;
      lessonId: string;
      heartsLost: number;
      accuracy: number;          // 0..1 (first-try correctness ratio); 1.0 if no scored activities
      lessonXp: number;          // base XP from lesson JSON
    }
  | {
      kind: 'rudiment_practiced';
      rudimentId: string;
      bpm: number;
      sustainedBars: number;
    }
  | {
      kind: 'fill_practiced';
      fillId: string;
      bpm: number;
      clean: boolean;
    }
  | {
      kind: 'ear_session_finished';
      exerciseType: string;
      difficulty: 'easy' | 'medium' | 'hard';
      correct: number;
      total: number;
      sessionId: number;
    }
  | {
      kind: 'fretboard_session_finished';
      drillType: string;
      difficulty: 'easy' | 'medium' | 'hard';
      correct: number;
      total: number;
      medianMs: number;
      sessionId: number;
    }
  | {
      kind: 'repertoire_review';
      songId: string;
      quality: number;           // 0..5 (SM-2-style)
      atTargetTempo: boolean;
    }
  | {
      kind: 'playbook_section_status';
      songId: string;
      sectionId: number;
      status: 'not_started' | 'practicing' | 'nailed_it';
      noRewinds: boolean;
    }
  | {
      kind: 'tab_session_finished';
      compositionId: number;
      measuresAdded: number;
    }
  | {
      kind: 'program_goal_completed';
      goalId: number;
      programId: number;
    };

/**
 * Maps a ProgressEvent to its Surface discriminator. Used by the engine and mission evaluator to
 * avoid duplicating the event.kind → Surface switch in both files.
 */
export function surfaceForEvent(event: ProgressEvent): Surface | null {
  switch (event.kind) {
    case 'lesson_completed':        return 'lesson';
    case 'rudiment_practiced':      return 'rudiment';
    case 'fill_practiced':          return 'fill';
    case 'ear_session_finished':    return 'ear';
    case 'fretboard_session_finished': return 'fretboard';
    case 'repertoire_review':       return 'repertoire';
    case 'playbook_section_status': return 'playbook';
    case 'tab_session_finished':    return 'tab_session';
    case 'program_goal_completed':  return 'program_goal';
  }
}

/**
 * What `recordEvent` returns. The UI reads this to decide what to celebrate (level-up modal,
 * achievement toast, mission-progress card, etc.).
 */
export interface ProgressionResult {
  xpEarned: number;             // counted toward daily goal
  xpCappedAmount: number;       // earned but above per-surface cap (still counted for stars/missions)
  leveledUp: boolean;
  newLevel?: number;
  starsRaised?: { from: number; to: number };
  achievements: AchievementId[];
  missionsCompleted: MissionTemplateId[];
  missionsAdvanced: { id: MissionTemplateId; progress: number; target: number }[];
  dailyGoalMet: boolean;
  streak: number;
}
