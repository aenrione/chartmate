import {type Kysely, type Migration} from 'kysely';

/**
 * Adds the durable state for achievements, weekly missions, and the daily plan.
 *
 * Catalogs (achievement and mission *templates*) live as JSON in
 * `src/lib/progression/catalogs/`, not in the DB — adding new entries is a code change, not a
 * migration. These tables only hold *instances*: which achievements have been earned, which
 * missions are active this week, and what the generated plan for today is.
 */
export const migration_039_achievements_missions_plan: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('earned_achievements')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('achievement_id', 'text', cb => cb.notNull().unique())
      .addColumn('earned_at', 'text', cb => cb.notNull())
      .addColumn('meta', 'text') // JSON of trigger context, nullable
      .execute();

    await db.schema
      .createTable('active_missions')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('template_id', 'text', cb => cb.notNull())
      .addColumn('week_start', 'text', cb => cb.notNull()) // Monday YYYY-MM-DD local
      .addColumn('target', 'integer', cb => cb.notNull())
      .addColumn('progress', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('xp_reward', 'integer', cb => cb.notNull())
      .addColumn('state', 'text', cb => cb.notNull().defaultTo('active')) // 'active' | 'completed' | 'expired'
      .addColumn('created_at', 'text', cb => cb.notNull())
      .addColumn('completed_at', 'text')
      .addUniqueConstraint('uq_active_missions_template_week', ['template_id', 'week_start'])
      .execute();

    await db.schema
      .createIndex('idx_active_missions_week_state')
      .on('active_missions')
      .columns(['week_start', 'state'])
      .ifNotExists()
      .execute();

    await db.schema
      .createTable('daily_plan')
      .ifNotExists()
      .addColumn('date', 'text', cb => cb.primaryKey().notNull()) // YYYY-MM-DD local
      .addColumn('items', 'text', cb => cb.notNull()) // JSON array of plan items
      .addColumn('target_xp', 'integer', cb => cb.notNull())
      .addColumn('generated_at', 'text', cb => cb.notNull())
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_active_missions_week_state').ifExists().execute();
    await db.schema.dropTable('daily_plan').ifExists().execute();
    await db.schema.dropTable('active_missions').ifExists().execute();
    await db.schema.dropTable('earned_achievements').ifExists().execute();
  },
};
