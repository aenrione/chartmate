import {sql, type Kysely, type Migration} from 'kysely';

/**
 * Adds the mastery layer (lesson stars) and the per-instrument level cache.
 *
 * - `lesson_stars` is a graded layer on top of `learn_progress`. One row per lesson, *upgraded*
 *   in place — never downgraded. The progression engine writes stars=max(existing, computed)
 *   so a sloppy retry never erases prior mastery.
 * - `instrument_levels` is a denormalized cache of cumulative XP per instrument, including the
 *   precomputed `level` so `recordEvent` can return `{leveledUp, newLevel}` without recomputing
 *   thresholds. Level curve lives in code (`xpForLevel(n) = 50 * n * (n + 1)`).
 *   Seed rows are inserted for guitar/drums/theory at level 1 / cum_xp 0 / xp_to_next 100.
 */
export const migration_038_lesson_stars_and_levels: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('lesson_stars')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('instrument', 'text', cb => cb.notNull())
      .addColumn('unit_id', 'text', cb => cb.notNull())
      .addColumn('lesson_id', 'text', cb => cb.notNull())
      .addColumn('stars', 'integer', cb => cb.notNull())
      .addColumn('best_hearts_remaining', 'integer', cb => cb.notNull())
      .addColumn('best_accuracy', 'real', cb => cb.notNull())
      .addColumn('first_try', 'integer', cb => cb.notNull())
      .addColumn('attempts', 'integer', cb => cb.notNull().defaultTo(1))
      .addColumn('last_completed_at', 'text', cb => cb.notNull())
      .addUniqueConstraint('uq_lesson_stars_lesson', ['instrument', 'unit_id', 'lesson_id'])
      .execute();

    await db.schema
      .createIndex('idx_lesson_stars_instrument_stars')
      .on('lesson_stars')
      .columns(['instrument', 'stars'])
      .ifNotExists()
      .execute();

    await db.schema
      .createTable('instrument_levels')
      .ifNotExists()
      .addColumn('instrument', 'text', cb => cb.primaryKey().notNull())
      .addColumn('cum_xp', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('level', 'integer', cb => cb.notNull().defaultTo(1))
      .addColumn('xp_into_level', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('xp_to_next', 'integer', cb => cb.notNull())
      .addColumn('updated_at', 'text', cb => cb.notNull())
      .execute();

    // Seed level rows for the three supported instruments.
    // xpForLevel(1) = 50 * 1 * 2 = 100, so xp_to_next starts at 100.
    const now = new Date().toISOString();
    for (const instrument of ['guitar', 'drums', 'theory']) {
      await sql`
        INSERT OR IGNORE INTO instrument_levels
          (instrument, cum_xp, level, xp_into_level, xp_to_next, updated_at)
        VALUES (${instrument}, 0, 1, 0, 100, ${now})
      `.execute(db);
    }
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_lesson_stars_instrument_stars').ifExists().execute();
    await db.schema.dropTable('instrument_levels').ifExists().execute();
    await db.schema.dropTable('lesson_stars').ifExists().execute();
  },
};
