import {type Kysely, type Migration} from 'kysely';

export const migration_034_learn_gamification: Migration = {
  async up(db: Kysely<any>) {
    // XP ledger — append-only log of every XP event
    await db.schema
      .createTable('learn_xp_ledger')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('amount', 'integer', cb => cb.notNull())
      .addColumn('source', 'text', cb => cb.notNull()) // 'lesson' | 'heart_bonus'
      .addColumn('instrument', 'text')
      .addColumn('lesson_id', 'text')
      .addColumn('earned_at', 'text', cb => cb.notNull()) // ISO datetime
      .execute();

    // Single-row streak tracker (one row max per user)
    await db.schema
      .createTable('learn_streaks')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('current_streak', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('longest_streak', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('last_active_date', 'text') // YYYY-MM-DD, nullable
      .addColumn('daily_goal_target', 'integer', cb => cb.notNull().defaultTo(10))
      .addColumn('updated_at', 'text', cb => cb.notNull())
      .execute();

    // One row per calendar day for daily goal progress
    await db.schema
      .createTable('learn_daily_goal')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('target_xp', 'integer', cb => cb.notNull().defaultTo(10))
      .addColumn('date', 'text', cb => cb.notNull()) // YYYY-MM-DD
      .addColumn('xp_earned', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('completed', 'integer', cb => cb.notNull().defaultTo(0)) // boolean 0/1
      .addUniqueConstraint('uq_learn_daily_goal_date', ['date'])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropTable('learn_daily_goal').ifExists().execute();
    await db.schema.dropTable('learn_streaks').ifExists().execute();
    await db.schema.dropTable('learn_xp_ledger').ifExists().execute();
  },
};
