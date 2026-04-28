/**
 * Daily Plan generator. Builds the "Today" card on /learn — answers "what should I practice
 * right now?" in one glance, sized roughly to the user's daily XP target.
 *
 * Persistence: plan items live in the `daily_plan` table keyed by date. Regenerated lazily iff
 * `date != today` or items are empty. A manual "Shuffle" button explicitly clears + regenerates.
 *
 * Composition rules (greedy fill, in priority order):
 *  1. Next-step lesson on the user's most-recently-active instrument (lowest-id unit not fully
 *     completed → first un-completed lesson in it).
 *  2. Weak-spot retry: lowest-star previously-completed lesson on the same instrument.
 *  3. One mission step (ref to the active mission with the smallest remaining target).
 *
 * SRS is intentionally not yet a slot — we don't have a per-activity SRS state table yet, and
 * adding one would be its own piece of work. (See plan §D.2 — keeping it simple for v1.)
 */

import type {Kysely} from 'kysely';
import type {DB} from '@/lib/local-db/types';
import type {Instrument} from './events';
import {findMissionTemplate} from './missions';

export type DailyPlanKind = 'lesson' | 'weak_spot' | 'mission_step';

export interface DailyPlanItem {
  kind: DailyPlanKind;
  /** Display label, e.g. "Continue: Open Position Chords — Lesson 3". */
  label: string;
  /** Estimated XP awarded by completing this item. */
  xp: number;
  /** Whether this slot has been completed today. */
  completed: boolean;
  /** Deep-link target inside the SPA. Undefined = no navigation. */
  href?: string;
  /** Stable key (e.g. lesson id, mission id) — used to flip `completed` when the engine fires. */
  refKey: string;
}

export interface DailyPlan {
  date: string;
  target_xp: number;
  items: DailyPlanItem[];
  generated_at: string;
}

export async function getOrGenerateDailyPlan(
  db: Kysely<DB>,
  today: string,
  instrument: Instrument,
): Promise<DailyPlan> {
  const existing = await db
    .selectFrom('daily_plan')
    .selectAll()
    .where('date', '=', today)
    .executeTakeFirst();

  if (existing) {
    try {
      const items = JSON.parse(existing.items) as DailyPlanItem[];
      if (Array.isArray(items) && items.length > 0) {
        return {
          date: existing.date,
          target_xp: existing.target_xp,
          items,
          generated_at: existing.generated_at,
        };
      }
    } catch {
      // fall through to regenerate
    }
  }

  return regenerateDailyPlan(db, today, instrument);
}

export async function regenerateDailyPlan(
  db: Kysely<DB>,
  today: string,
  instrument: Instrument,
): Promise<DailyPlan> {
  const targetXp = await readDailyGoalTarget(db);
  const items: DailyPlanItem[] = [];

  const nextLesson = await pickNextLessonItem(db, instrument);
  if (nextLesson) items.push(nextLesson);

  const weakSpot = await pickWeakSpotItem(db, instrument);
  if (weakSpot) items.push(weakSpot);

  const mission = await pickMissionStep(db, today);
  if (mission) items.push(mission);

  // Mark items already-completed-today by checking the ledger for matching ref keys.
  await markCompletedItems(db, items, today);

  const generatedAt = new Date().toISOString();
  await db
    .insertInto('daily_plan')
    .values({
      date: today,
      items: JSON.stringify(items),
      target_xp: targetXp,
      generated_at: generatedAt,
    })
    .onConflict(oc =>
      oc.column('date').doUpdateSet({
        items: JSON.stringify(items),
        target_xp: targetXp,
        generated_at: generatedAt,
      }),
    )
    .execute();

  return {date: today, target_xp: targetXp, items, generated_at: generatedAt};
}

async function readDailyGoalTarget(db: Kysely<DB>): Promise<number> {
  const row = await db.selectFrom('learn_streaks').select('daily_goal_target').executeTakeFirst();
  return row?.daily_goal_target ?? 10;
}

async function pickNextLessonItem(
  db: Kysely<DB>,
  instrument: Instrument,
): Promise<DailyPlanItem | null> {
  // Most recently completed lesson defines the "active path" — find the lesson immediately after.
  // For simplicity, we surface the *first* un-completed lesson by scanning curriculum order.
  // Curriculum modules are static; for now we delegate to a runtime curriculum import inside the
  // browser. To keep this generator pure, we just return null here — the UI will fall back to
  // pulling the recommendation from SkillTree's own ordering.
  // We keep the slot present even when the lesson can't be picked here, so the Today card
  // always renders the "Continue your path" hint.
  const completedRow = await db
    .selectFrom('learn_progress')
    .select(['unit_id', 'lesson_id', 'completed_at'])
    .where('instrument', '=', instrument)
    .orderBy('completed_at', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (!completedRow) {
    // No progress yet — invite the user to start.
    return {
      kind: 'lesson',
      label: 'Start your first lesson',
      xp: 15,
      completed: false,
      href: '/learn',
      refKey: `start:${instrument}`,
    };
  }

  return {
    kind: 'lesson',
    label: `Continue your ${instrument} path`,
    xp: 15,
    completed: false,
    href: '/learn',
    refKey: `continue:${instrument}:${completedRow.unit_id}/${completedRow.lesson_id}`,
  };
}

async function pickWeakSpotItem(
  db: Kysely<DB>,
  instrument: Instrument,
): Promise<DailyPlanItem | null> {
  const row = await db
    .selectFrom('lesson_stars')
    .select(['unit_id', 'lesson_id', 'stars'])
    .where('instrument', '=', instrument)
    .where('stars', '<', 3)
    .orderBy('stars', 'asc')
    .orderBy('last_completed_at', 'asc')
    .limit(1)
    .executeTakeFirst();
  if (!row) return null;
  return {
    kind: 'weak_spot',
    label: `Raise stars on ${row.lesson_id} (currently ${row.stars}★)`,
    xp: 2,
    completed: false,
    href: `/learn/lesson/${instrument}/${row.unit_id}/${row.lesson_id}`,
    refKey: `weak:${instrument}:${row.unit_id}/${row.lesson_id}`,
  };
}

async function pickMissionStep(
  db: Kysely<DB>,
  today: string,
): Promise<DailyPlanItem | null> {
  // Pick the active mission with the smallest absolute remaining (target - progress).
  const rows = await db
    .selectFrom('active_missions')
    .selectAll()
    .where('state', '=', 'active')
    .execute();
  if (rows.length === 0) return null;
  const sorted = rows
    .map(r => ({row: r, remaining: r.target - r.progress}))
    .sort((a, b) => a.remaining - b.remaining);
  const pick = sorted[0].row;
  const template = findMissionTemplate(pick.template_id);
  if (!template) return null;
  return {
    kind: 'mission_step',
    label: `Mission: ${template.title} (${pick.progress}/${pick.target})`,
    xp: Math.max(2, Math.round(pick.xp_reward / Math.max(1, pick.target - pick.progress))),
    completed: pick.progress >= pick.target,
    href: '/learn',
    refKey: `mission:${pick.template_id}:${pick.week_start}:${today}`,
  };
}

/**
 * Flip `completed: true` on each item that's already represented in today's xp_ledger by a
 * matching ref. This is intentionally loose — we just check whether *any* lesson XP landed
 * today for the lesson slot, and whether the mission's progress has hit the target.
 */
async function markCompletedItems(
  db: Kysely<DB>,
  items: DailyPlanItem[],
  today: string,
): Promise<void> {
  // Lesson + weak-spot: any lesson XP today for that lesson id
  const lessonRefs = items
    .filter(i => i.kind === 'lesson' || i.kind === 'weak_spot')
    .map(i => extractLessonId(i.refKey))
    .filter((x): x is string => !!x);

  if (lessonRefs.length > 0) {
    const todayLessonRefs = await db
      .selectFrom('learn_xp_ledger')
      .select('ref_id')
      .where('surface', '=', 'lesson')
      .where('earned_at', '>=', today)
      .execute();
    const seen = new Set(todayLessonRefs.map(r => r.ref_id).filter((x): x is string => !!x));
    for (const item of items) {
      const id = extractLessonId(item.refKey);
      if (id && seen.has(id)) item.completed = true;
    }
  }
}

function extractLessonId(refKey: string): string | null {
  // refKey shapes:
  //   continue:guitar:unitId/lessonId
  //   weak:guitar:unitId/lessonId
  //   start:guitar
  const lessonRefMatch = /^(?:continue|weak):[^:]+:[^/]+\/(.+)$/.exec(refKey);
  return lessonRefMatch ? lessonRefMatch[1] : null;
}
