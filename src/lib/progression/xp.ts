/**
 * XP rules per surface. Pure — the engine queries the DB to build the `XpContext` and passes it
 * here. All numbers are tunable from one place.
 *
 * Anti-grind principles encoded here:
 *  - Outcome-based: rules fire on completion + quality thresholds, not duration.
 *  - Per-surface daily caps: see DAILY_CAP_BY_SURFACE.
 *  - Lesson reruns earn at most a small mastery bonus (with a weekly cap per lesson).
 *  - Repertoire only counts the first end-to-end run of a song per day.
 */

import type {Instrument, ProgressEvent, Surface} from './events';

// ---------------------------------------------------------------------------------------------
// Daily caps per surface. Infinity = no cap.
// ---------------------------------------------------------------------------------------------

export const DEFAULT_DAILY_GOAL_XP = 10;

export const DAILY_CAP_BY_SURFACE: Record<Surface, number> = {
  lesson: Infinity,           // first plays uncapped; reruns capped via weekly per-lesson rule
  rudiment: 25,
  fill: 20,
  ear: 30,
  fretboard: 25,
  repertoire: 30,
  playbook: 25,
  tab_session: 0,             // composition isn't practice — no recurring XP
  mission_bonus: Infinity,
  achievement_bonus: Infinity,
  program_goal: Infinity,
};

export const LESSON_MASTERY_BONUS_WEEKLY_CAP = 5;
export const ACCURACY_FOR_EAR_BONUS = 0.9;
export const ACCURACY_FOR_FRETBOARD_SNAP = 0.9;
export const FRETBOARD_SNAP_MAX_MEDIAN_MS = 1000;
export const ACCURACY_PASS_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------------------------
// Context the engine builds from DB state.
// ---------------------------------------------------------------------------------------------

export interface XpContext {
  /** Calendar date for the event in user-local time, YYYY-MM-DD. */
  today: string;
  /** Monday of the current week, YYYY-MM-DD. Used for weekly mastery-bonus dedupe. */
  weekStart: string;
  /** Whether this is the first time this lesson has been completed. */
  isFirstLessonPlay: boolean;
  /** Whether the latest retry raised the user's star count for this lesson. */
  starsRaisedOnRetry: boolean;
  /** Total mastery-bonus XP already awarded for this lesson during the current week. */
  weeklyMasteryBonusForLesson: number;
  /** Total XP earned today for the event's (instrument, surface) combo. Used for daily caps. */
  todayXpForSurfaceInstrument: number;
  /** Whether this rudiment has already hit the +10 bpm milestone in question. */
  bpmMilestoneAlreadyHit: boolean;
  /** Whether the song was already played end-to-end today (repertoire). */
  alreadyPlayedSongToday: boolean;
}

// ---------------------------------------------------------------------------------------------
// Result shape.
// ---------------------------------------------------------------------------------------------

export interface XpComputation {
  surface: Surface;
  instrument: Instrument | null;
  refId: string | null;
  /** XP that goes toward the daily goal (after cap). */
  countedXp: number;
  /** XP earned but above the daily cap — recorded for transparency, not counted toward goal. */
  cappedAmount: number;
  /** Idempotency key. UNIQUE in `learn_xp_ledger`. `null` means do not write a ledger row. */
  dedupeKey: string | null;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function applyCap(surface: Surface, alreadyEarnedToday: number, requested: number): {countedXp: number; cappedAmount: number} {
  const cap = DAILY_CAP_BY_SURFACE[surface];
  if (cap === Infinity) return {countedXp: requested, cappedAmount: 0};
  const room = Math.max(0, cap - alreadyEarnedToday);
  const counted = Math.min(requested, room);
  return {countedXp: counted, cappedAmount: requested - counted};
}

function difficultyMultiplier(d: 'easy' | 'medium' | 'hard'): number {
  return d === 'easy' ? 1.0 : d === 'medium' ? 1.25 : 1.5;
}

// ---------------------------------------------------------------------------------------------
// The main rule dispatcher.
// ---------------------------------------------------------------------------------------------

export function computeXpForEvent(event: ProgressEvent, ctx: XpContext): XpComputation {
  switch (event.kind) {
    case 'lesson_completed': {
      const surface: Surface = 'lesson';
      const instrument = event.instrument;
      const refId = event.lessonId;

      if (ctx.isFirstLessonPlay) {
        const heartBonus = event.heartsLost === 0 ? 3 : 0;
        const requested = Math.max(0, event.lessonXp) + heartBonus;
        const {countedXp, cappedAmount} = applyCap(surface, ctx.todayXpForSurfaceInstrument, requested);
        return {
          surface,
          instrument,
          refId,
          countedXp,
          cappedAmount,
          dedupeKey: `lesson:first:${event.lessonId}`,
        };
      }

      // Rerun: only a mastery bonus, capped weekly per-lesson.
      const remainingWeeklyRoom = Math.max(0, LESSON_MASTERY_BONUS_WEEKLY_CAP - ctx.weeklyMasteryBonusForLesson);
      const masteryBonus = ctx.starsRaisedOnRetry ? 2 : 1;
      const grant = Math.min(masteryBonus, remainingWeeklyRoom);
      if (grant <= 0) {
        return {
          surface,
          instrument,
          refId,
          countedXp: 0,
          cappedAmount: 0,
          dedupeKey: null, // nothing to write — re-run already capped
        };
      }
      const {countedXp, cappedAmount} = applyCap(surface, ctx.todayXpForSurfaceInstrument, grant);
      return {
        surface,
        instrument,
        refId,
        countedXp,
        cappedAmount,
        // Dedupe per-lesson per-week so the same retry can only earn the bonus once per week.
        // Multiple retries in the same week share a weekly bucket — the writer guards via the
        // `weeklyMasteryBonusForLesson` query, so subsequent attempts above use a different key
        // suffix (we encode the running week-XP so successive grants don't collide).
        dedupeKey: `lesson:mastery:${event.lessonId}:${ctx.weekStart}:${ctx.weeklyMasteryBonusForLesson}`,
      };
    }

    case 'rudiment_practiced': {
      const surface: Surface = 'rudiment';
      // Rudiments aren't instrument-typed (they're drum-only by convention but used by guitarists too).
      // We tag with 'drums' as the canonical home.
      const instrument: Instrument = 'drums';
      const base = 4;
      const sustainedBonus = event.sustainedBars >= 32 ? 3 : 0;
      const milestoneBonus = !ctx.bpmMilestoneAlreadyHit && event.bpm > 0 && event.bpm % 10 === 0 ? 5 : 0;
      const requested = base + sustainedBonus + milestoneBonus;
      const {countedXp, cappedAmount} = applyCap(surface, ctx.todayXpForSurfaceInstrument, requested);
      return {
        surface,
        instrument,
        refId: event.rudimentId,
        countedXp,
        cappedAmount,
        dedupeKey: `rudiment:${event.rudimentId}:${ctx.today}:${event.bpm}`,
      };
    }

    case 'fill_practiced': {
      const surface: Surface = 'fill';
      const instrument: Instrument = 'drums';
      const base = 5;
      const cleanBonus = event.clean ? 3 : 0;
      const requested = base + cleanBonus;
      const {countedXp, cappedAmount} = applyCap(surface, ctx.todayXpForSurfaceInstrument, requested);
      return {
        surface,
        instrument,
        refId: event.fillId,
        countedXp,
        cappedAmount,
        dedupeKey: `fill:${event.fillId}:${ctx.today}`,
      };
    }

    case 'ear_session_finished': {
      const surface: Surface = 'ear';
      const instrument: Instrument = 'guitar'; // ear training currently lives under /guitar
      const accuracy = event.total > 0 ? event.correct / event.total : 0;
      if (accuracy < ACCURACY_PASS_THRESHOLD) {
        return {surface, instrument, refId: String(event.sessionId), countedXp: 0, cappedAmount: 0, dedupeKey: null};
      }
      const base = Math.round(6 * difficultyMultiplier(event.difficulty));
      const accuracyBonus = accuracy >= ACCURACY_FOR_EAR_BONUS ? 4 : 0;
      const requested = base + accuracyBonus;
      const {countedXp, cappedAmount} = applyCap(surface, ctx.todayXpForSurfaceInstrument, requested);
      return {
        surface,
        instrument,
        refId: String(event.sessionId),
        countedXp,
        cappedAmount,
        dedupeKey: `ear:${event.sessionId}`,
      };
    }

    case 'fretboard_session_finished': {
      const surface: Surface = 'fretboard';
      const instrument: Instrument = 'guitar';
      const accuracy = event.total > 0 ? event.correct / event.total : 0;
      if (accuracy < ACCURACY_PASS_THRESHOLD) {
        return {surface, instrument, refId: String(event.sessionId), countedXp: 0, cappedAmount: 0, dedupeKey: null};
      }
      const base = 5;
      const speedBonus = event.medianMs > 0 && event.medianMs < FRETBOARD_SNAP_MAX_MEDIAN_MS ? 3 : 0;
      const snapBonus = accuracy >= ACCURACY_FOR_FRETBOARD_SNAP && event.medianMs > 0 && event.medianMs < FRETBOARD_SNAP_MAX_MEDIAN_MS ? 5 : 0;
      const requested = base + speedBonus + snapBonus;
      const {countedXp, cappedAmount} = applyCap(surface, ctx.todayXpForSurfaceInstrument, requested);
      return {
        surface,
        instrument,
        refId: String(event.sessionId),
        countedXp,
        cappedAmount,
        dedupeKey: `fretboard:${event.sessionId}`,
      };
    }

    case 'repertoire_review': {
      const surface: Surface = 'repertoire';
      const instrument: Instrument = 'guitar';
      // Same-day grind prevention: only the first end-to-end run of a song earns XP that day.
      if (ctx.alreadyPlayedSongToday) {
        return {surface, instrument, refId: event.songId, countedXp: 0, cappedAmount: 0, dedupeKey: null};
      }
      const base = 8;
      const tempoBonus = event.atTargetTempo ? 4 : 0;
      const requested = base + tempoBonus;
      const {countedXp, cappedAmount} = applyCap(surface, ctx.todayXpForSurfaceInstrument, requested);
      return {
        surface,
        instrument,
        refId: event.songId,
        countedXp,
        cappedAmount,
        dedupeKey: `repertoire:${event.songId}:${ctx.today}`,
      };
    }

    case 'playbook_section_status': {
      const surface: Surface = 'playbook';
      // Playbook spans instruments — engine fills in based on song metadata if needed.
      const instrument: Instrument | null = null;
      if (event.status !== 'nailed_it') {
        return {surface, instrument, refId: `${event.songId}:${event.sectionId}`, countedXp: 0, cappedAmount: 0, dedupeKey: null};
      }
      const base = 5;
      const cleanBonus = event.noRewinds ? 3 : 0;
      const requested = base + cleanBonus;
      const {countedXp, cappedAmount} = applyCap(surface, ctx.todayXpForSurfaceInstrument, requested);
      return {
        surface,
        instrument,
        refId: `${event.songId}:${event.sectionId}`,
        countedXp,
        cappedAmount,
        dedupeKey: `playbook:${event.songId}:${event.sectionId}:${ctx.today}`,
      };
    }

    case 'tab_session_finished': {
      // Composition isn't practice. We record the event for the achievement evaluator (e.g.
      // "Your First Tab") but award no recurring XP.
      return {
        surface: 'tab_session',
        instrument: null,
        refId: String(event.compositionId),
        countedXp: 0,
        cappedAmount: 0,
        dedupeKey: `tab_session:${event.compositionId}:${ctx.today}`,
      };
    }

    case 'program_goal_completed': {
      const requested = 15;
      // No daily cap — durable planned work is uncapped.
      return {
        surface: 'program_goal',
        instrument: null, // engine resolves via program lookup
        refId: String(event.goalId),
        countedXp: requested,
        cappedAmount: 0,
        dedupeKey: `program_goal:${event.goalId}`,
      };
    }
  }
}
