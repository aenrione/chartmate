/**
 * Achievement catalog evaluator. Reads the catalog JSON, evaluates each not-yet-earned
 * achievement against current state + the firing event, returns the newly earned IDs.
 *
 * Predicates are intentionally a small DSL — adding a new predicate type means adding a case
 * here and (if needed) one indexed query. Catalog entries are pure data and live in
 * `catalogs/achievements.json`.
 */

import type {Kysely} from 'kysely';
import type {DB} from '@/lib/local-db/types';
import type {Instrument, ProgressEvent, Surface} from './events';
import catalogJson from './catalogs/achievements.json';

export type AchievementPredicate =
  | {type: 'event_count'; surface: Surface; min: number}
  | {type: 'streak'; min: number}
  | {type: 'lessons_with_stars'; stars: 1 | 2 | 3; min: number}
  | {type: 'instruments_touched_in_week'; min: number}
  | {type: 'xp_total'; instrument?: Instrument; min: number}
  | {type: 'unit_all_three_stars'}
  | {type: 'rudiment_sustained'; min_bpm: number; min_bars: number}
  | {type: 'surfaces_touched'; min: number}
  | {type: 'event_at_local_hour_range'; min_hour: number; max_hour: number}
  | {type: 'repertoire_items_min'; min: number};

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  hidden: boolean;
  predicate: AchievementPredicate;
}

export const ACHIEVEMENT_CATALOG: Achievement[] = catalogJson as Achievement[];

export interface AchievementContext {
  alreadyEarned: Set<string>;
  currentStreak: number;
  /** YYYY-MM-DD (Monday, local) — used by `instruments_touched_in_week`. */
  weekStart: string;
  /** Local Date for the firing event — used by `event_at_local_hour_range`. */
  eventLocalDate: Date;
}

/**
 * Surfaces that count for the `surfaces_touched` predicate. Excludes engine-internal sources
 * like mission_bonus / achievement_bonus that the user doesn't directly produce.
 */
const COUNTABLE_SURFACES: Surface[] = [
  'lesson',
  'rudiment',
  'fill',
  'ear',
  'fretboard',
  'repertoire',
  'playbook',
  'tab_session',
  'program_goal',
];

/**
 * Run the catalog against current state + the firing event. Returns the IDs of achievements
 * that flipped from "not earned" to "earned" on this event. The engine inserts them into
 * `earned_achievements` and grants `achievement_bonus` XP.
 */
export async function evaluateAchievements(
  trx: Kysely<DB>,
  event: ProgressEvent,
  ctx: AchievementContext,
): Promise<Achievement[]> {
  const newlyEarned: Achievement[] = [];

  for (const achievement of ACHIEVEMENT_CATALOG) {
    if (ctx.alreadyEarned.has(achievement.id)) continue;
    const earned = await checkPredicate(trx, achievement.predicate, event, ctx);
    if (earned) newlyEarned.push(achievement);
  }
  return newlyEarned;
}

async function checkPredicate(
  trx: Kysely<DB>,
  pred: AchievementPredicate,
  event: ProgressEvent,
  ctx: AchievementContext,
): Promise<boolean> {
  switch (pred.type) {
    case 'event_count': {
      const row = await trx
        .selectFrom('learn_xp_ledger')
        .select(eb => eb.fn.countAll<number>().as('n'))
        .where('surface', '=', pred.surface)
        .executeTakeFirst();
      return Number(row?.n ?? 0) >= pred.min;
    }

    case 'streak': {
      return ctx.currentStreak >= pred.min;
    }

    case 'lessons_with_stars': {
      const row = await trx
        .selectFrom('lesson_stars')
        .select(eb => eb.fn.countAll<number>().as('n'))
        .where('stars', '>=', pred.stars)
        .executeTakeFirst();
      return Number(row?.n ?? 0) >= pred.min;
    }

    case 'instruments_touched_in_week': {
      const rows = await trx
        .selectFrom('learn_xp_ledger')
        .select('instrument')
        .where('earned_at', '>=', ctx.weekStart)
        .where('instrument', 'is not', null)
        .distinct()
        .execute();
      const instruments = new Set(rows.map(r => r.instrument).filter((x): x is string => !!x));
      return instruments.size >= pred.min;
    }

    case 'xp_total': {
      if (pred.instrument) {
        const row = await trx
          .selectFrom('instrument_levels')
          .select('cum_xp')
          .where('instrument', '=', pred.instrument)
          .executeTakeFirst();
        return Number(row?.cum_xp ?? 0) >= pred.min;
      }
      const row = await trx
        .selectFrom('instrument_levels')
        .select(eb => eb.fn.sum<number>('cum_xp').as('total'))
        .executeTakeFirst();
      return Number(row?.total ?? 0) >= pred.min;
    }

    case 'unit_all_three_stars': {
      // For each unit_id with stars data, true iff every lesson in that unit has stars=3.
      // We approximate with a SQL aggregate: a unit qualifies if MIN(stars)=3.
      const row = await trx
        .selectFrom('lesson_stars')
        .select(eb => eb.fn.min<number>('stars').as('min_stars'))
        .groupBy(['instrument', 'unit_id'])
        .having(eb => eb.fn.min<number>('stars'), '=', 3)
        .executeTakeFirst();
      return !!row;
    }

    case 'rudiment_sustained': {
      // Event-driven: only true on the firing rudiment_practiced event meeting both bars.
      if (event.kind !== 'rudiment_practiced') return false;
      return event.bpm >= pred.min_bpm && event.sustainedBars >= pred.min_bars;
    }

    case 'surfaces_touched': {
      const rows = await trx
        .selectFrom('learn_xp_ledger')
        .select('surface')
        .where('surface', 'in', COUNTABLE_SURFACES)
        .distinct()
        .execute();
      return rows.length >= pred.min;
    }

    case 'event_at_local_hour_range': {
      const hour = ctx.eventLocalDate.getHours();
      const wrapsMidnight = pred.max_hour <= pred.min_hour;
      const inRange = wrapsMidnight
        ? hour >= pred.min_hour || hour < pred.max_hour
        : hour >= pred.min_hour && hour < pred.max_hour;
      return inRange;
    }

    case 'repertoire_items_min': {
      const row = await trx
        .selectFrom('repertoire_items')
        .select(eb => eb.fn.countAll<number>().as('n'))
        .executeTakeFirst();
      return Number(row?.n ?? 0) >= pred.min;
    }
  }
}
