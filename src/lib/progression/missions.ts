/**
 * Mission catalog evaluator. Given the firing event and the active missions for the current
 * week, advance progress where the trigger matches. The engine writes back the new progress
 * and flips state to `completed` when a target is hit.
 *
 * The weekly *generator* (which picks templates and inserts `active_missions` rows on Monday)
 * lives in `daily-plan.ts`'s sibling and arrives in step 9.
 */

import type {Kysely} from 'kysely';
import type {DB} from '@/lib/local-db/types';
import type {ProgressEvent, Surface} from './events';
import {surfaceForEvent} from './events';
import catalogJson from './catalogs/missions.json';

export type MissionTrigger =
  | {
      type: 'event_count';
      surface: Surface;
      where?: {
        instrument?: 'guitar' | 'drums' | 'theory';
        min_accuracy?: number;
        at_target_tempo?: boolean;
        first_play_only?: boolean;
        no_rewinds?: boolean;
        status?: 'nailed_it' | 'practicing' | 'not_started';
        stars_min?: 1 | 2 | 3;
      };
    }
  | {type: 'rudiment_milestone'}
  | {type: 'distinct_surfaces'};

export type MissionIntensity = 'easy' | 'medium' | 'hard';

export interface MissionTemplate {
  id: string;
  title: string;
  description: string;
  intensity: MissionIntensity;
  weight: number;
  target: number;
  xp_reward: number;
  trigger: MissionTrigger;
}

export const MISSION_CATALOG: MissionTemplate[] = catalogJson as MissionTemplate[];

export function findMissionTemplate(id: string): MissionTemplate | undefined {
  return MISSION_CATALOG.find(t => t.id === id);
}

/**
 * Auxiliary state the engine passes in for triggers that need cross-cutting context (e.g.
 * "this lesson was a first play", "this fretboard session crossed an accuracy threshold",
 * "this rudiment hit a +10 bpm milestone").
 */
export interface MissionEventContext {
  /** lesson stars achieved on this event, if applicable. */
  lessonStars?: 1 | 2 | 3;
  /** True iff this lesson_completed event was the first play of that lesson. */
  isFirstLessonPlay?: boolean;
  /** True iff this rudiment_practiced event hit a +10 bpm milestone for the first time. */
  rudimentMilestoneHit?: boolean;
  /** Distinct surfaces touched in the current week (used by `distinct_surfaces`). */
  weeklyDistinctSurfaces?: Set<Surface>;
}

/**
 * Decide whether a single firing event advances a single template's progress, and by how much.
 * Returns 0 if the trigger doesn't match.
 *
 * Mission progress increments by 1 per matching event by default — there's no concept of
 * "this single event was worth 5 progress points". Targets are concrete counts.
 */
export function progressDeltaForEvent(
  template: MissionTemplate,
  event: ProgressEvent,
  ctx: MissionEventContext = {},
): number {
  const trigger = template.trigger;

  switch (trigger.type) {
    case 'rudiment_milestone': {
      if (event.kind !== 'rudiment_practiced') return 0;
      return ctx.rudimentMilestoneHit ? 1 : 0;
    }

    case 'distinct_surfaces': {
      // Whole-week aggregate: progress is set by the engine to the size of the distinct set,
      // not incremented by 1. We signal this with a special sentinel handled below: caller
      // should use `setProgressForEvent` instead.
      return 0;
    }

    case 'event_count': {
      if (surfaceForEvent(event) !== trigger.surface) return 0;
      if (!whereMatches(trigger.where ?? {}, event, ctx)) return 0;
      return 1;
    }
  }
}

/**
 * For triggers that compute progress as an absolute value (e.g. `distinct_surfaces` — the
 * progress IS the count of distinct surfaces touched this week), return the new absolute
 * value. The caller writes `progress = max(progress, returned)`.
 *
 * Returns `null` for triggers that aren't absolute-valued (use progressDeltaForEvent for those).
 */
export function absoluteProgressForEvent(
  template: MissionTemplate,
  _event: ProgressEvent,
  ctx: MissionEventContext = {},
): number | null {
  if (template.trigger.type === 'distinct_surfaces') {
    return ctx.weeklyDistinctSurfaces?.size ?? 0;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function whereMatches(
  where: NonNullable<Extract<MissionTrigger, {type: 'event_count'}>['where']>,
  event: ProgressEvent,
  ctx: MissionEventContext,
): boolean {
  if (where.instrument && 'instrument' in event && event.instrument !== where.instrument) {
    return false;
  }

  if (where.stars_min != null && (ctx.lessonStars == null || ctx.lessonStars < where.stars_min)) {
    return false;
  }

  if (where.first_play_only && !ctx.isFirstLessonPlay) {
    return false;
  }

  if (where.min_accuracy != null) {
    const accuracy = accuracyFromEvent(event);
    if (accuracy == null || accuracy < where.min_accuracy) return false;
  }

  if (where.at_target_tempo && event.kind === 'repertoire_review' && !event.atTargetTempo) {
    return false;
  }

  if (where.no_rewinds && event.kind === 'playbook_section_status' && !event.noRewinds) {
    return false;
  }

  if (where.status && event.kind === 'playbook_section_status' && event.status !== where.status) {
    return false;
  }

  return true;
}

/**
 * Pick `count` mission templates for a week, weighted by `weight` and avoiding templates that
 * were active last week. Pure given the inputs — `random` is injectable for testing.
 */
export function pickMissionsForWeek(
  catalog: MissionTemplate[],
  excludeIds: Set<string>,
  count: number,
  random: () => number = Math.random,
): MissionTemplate[] {
  const pool = catalog.filter(t => !excludeIds.has(t.id));
  const fallback = pool.length === 0 ? catalog : pool; // if everything excluded, allow repeats
  const picks: MissionTemplate[] = [];
  const remaining = [...fallback];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((sum, t) => sum + Math.max(0, t.weight), 0);
    if (totalWeight <= 0) break;
    let r = random() * totalWeight;
    let idx = 0;
    for (let j = 0; j < remaining.length; j++) {
      r -= Math.max(0, remaining[j].weight);
      if (r <= 0) {
        idx = j;
        break;
      }
    }
    picks.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picks;
}

/**
 * Ensure the user has active missions for the given Monday-week. If rows already exist for the
 * week, returns them. Otherwise picks new templates, inserts them, and returns the new rows.
 *
 * Designed to be called lazily — every time the Mission Board / Today card mounts.
 */
export async function ensureWeekMissions(
  db: Kysely<DB>,
  weekStart: string,
  options: {count?: number; now?: Date} = {},
): Promise<{template: MissionTemplate; row: {id: number; progress: number; target: number; xp_reward: number; state: string}}[]> {
  const count = options.count ?? 2;
  const nowIso = (options.now ?? new Date()).toISOString();

  const existing = await db
    .selectFrom('active_missions')
    .selectAll()
    .where('week_start', '=', weekStart)
    .execute();

  if (existing.length > 0) {
    return existing
      .map(r => {
        const t = findMissionTemplate(r.template_id);
        return t ? {template: t, row: r} : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  // Find templates used last week to avoid repeats.
  const prevWeekStart = previousMondayIso(weekStart);
  const lastWeek = await db
    .selectFrom('active_missions')
    .select('template_id')
    .where('week_start', '=', prevWeekStart)
    .execute();
  const exclude = new Set(lastWeek.map(r => r.template_id));

  const picks = pickMissionsForWeek(MISSION_CATALOG, exclude, count);
  const inserted = [];
  for (const t of picks) {
    const result = await db
      .insertInto('active_missions')
      .values({
        template_id: t.id,
        week_start: weekStart,
        target: t.target,
        progress: 0,
        xp_reward: t.xp_reward,
        state: 'active',
        created_at: nowIso,
        completed_at: null,
      })
      .onConflict(oc => oc.columns(['template_id', 'week_start']).doNothing())
      .execute();
    if (Number(result[0]?.numInsertedOrUpdatedRows ?? 0) > 0) {
      const row = await db
        .selectFrom('active_missions')
        .selectAll()
        .where('template_id', '=', t.id)
        .where('week_start', '=', weekStart)
        .executeTakeFirst();
      if (row) inserted.push({template: t, row});
    }
  }
  return inserted;
}

function previousMondayIso(monday: string): string {
  const [y, m, d] = monday.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 7);
  return date.toLocaleDateString('sv');
}

function accuracyFromEvent(event: ProgressEvent): number | null {
  switch (event.kind) {
    case 'lesson_completed':
      return event.accuracy;
    case 'ear_session_finished':
    case 'fretboard_session_finished':
      return event.total > 0 ? event.correct / event.total : null;
    default:
      return null;
  }
}
