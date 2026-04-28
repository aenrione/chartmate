import {getLocalDb} from './client';
import {getCurrentTimestamp} from './db-utils';
import {todayISO} from '../repertoire/sm2';
import {loadAllUnits} from '../curriculum/loader';
import type {QuizActivity} from '../curriculum/types';

/**
 * Syncs theory SRS cards:
 * - Only quiz activities (srs: true) from lessons the user has completed
 * - Prunes any existing theory items that no longer belong (wrong type, uncompleted lesson)
 * - Inserts missing valid cards (idempotent via theory_source)
 */
export async function seedTheorySRS(): Promise<{inserted: number; pruned: number}> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  const today = todayISO();

  const completedRows = await db
    .selectFrom('learn_progress')
    .select(['unit_id', 'lesson_id'])
    .where('instrument', '=', 'theory')
    .execute();

  const completedSet = new Set(completedRows.map(r => `${r.unit_id}/${r.lesson_id}`));

  // Build the full canonical set of valid sources first
  const units = await loadAllUnits('theory');
  const validSources = new Map<string, QuizActivity>();

  for (const unit of units) {
    for (const lesson of unit.loadedLessons) {
      if (!completedSet.has(`${unit.id}/${lesson.id}`)) continue;
      for (let i = 0; i < lesson.activities.length; i++) {
        const activity = lesson.activities[i];
        if (!(activity as any).srs || activity.type !== 'quiz') continue;
        validSources.set(`curriculum:theory/${unit.id}/${lesson.id}/${i}`, activity as QuizActivity);
      }
    }
  }

  // Prune: delete any theory item whose source is not in the valid set
  // (covers theory-card blobs, uncompleted lessons, and reset lessons)
  const existing = await db
    .selectFrom('repertoire_items')
    .select(['id', 'theory_source'])
    .where('item_type', '=', 'theory')
    .where('theory_source', 'is not', null)
    .execute();

  const idsToDelete = existing
    .filter(row => !validSources.has(row.theory_source!))
    .map(row => Number(row.id));

  if (idsToDelete.length > 0) {
    await db.deleteFrom('repertoire_items').where('id', 'in', idsToDelete).execute();
  }

  if (validSources.size === 0) return {inserted: 0, pruned: idsToDelete.length};

  // Insert any valid cards not yet in the DB
  let inserted = 0;

  for (const [source, quiz] of validSources) {
    const alreadyExists = await db
      .selectFrom('repertoire_items')
      .select('id')
      .where('theory_source', '=', source)
      .executeTakeFirst();

    if (alreadyExists) continue;

    const answer = quiz.choices[quiz.answer];
    const notes = quiz.explanation ? `**${answer}**\n\n${quiz.explanation}` : `**${answer}**`;

    await db
      .insertInto('repertoire_items')
      .values({
        collection_id: 1,
        item_type: 'theory',
        title: quiz.question,
        artist: null,
        notes,
        target_bpm: null,
        reference_type: null,
        reference_id: null,
        saved_chart_md5: null,
        composition_id: null,
        song_section_id: null,
        theory_source: source,
        interval: 1,
        ease_factor: 2.5,
        repetitions: 0,
        next_review_date: today,
        last_reviewed_at: null,
        created_at: now,
        updated_at: now,
      })
      .execute();

    inserted++;
  }

  return {inserted, pruned: idsToDelete.length};
}

/** Derive the in-app lesson URL from a theory_source key. */
export function lessonLinkFromSource(source: string): string | null {
  // format: curriculum:theory/{unitId}/{lessonId}/{activityIndex}
  const parts = source.split('/');
  if (parts.length < 4) return null;
  return `/learn/lesson/theory/${parts[1]}/${parts[2]}`;
}
