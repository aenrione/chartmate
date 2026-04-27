import {type Kysely, type Migration} from 'kysely';

export const migration_036_practice_programs: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('practice_programs')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('title', 'text', cb => cb.notNull())
      .addColumn('description', 'text')
      .addColumn('instrument', 'text')
      .addColumn('status', 'text', cb => cb.notNull().defaultTo('draft'))
      .addColumn('started_at', 'text')
      .addColumn('created_at', 'text', cb => cb.notNull())
      .addColumn('updated_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createTable('program_units')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('program_id', 'integer', cb => cb.notNull().references('practice_programs.id'))
      .addColumn('title', 'text', cb => cb.notNull())
      .addColumn('description', 'text')
      .addColumn('order_index', 'integer', cb => cb.notNull())
      .addColumn('suggested_days', 'integer')
      .addColumn('started_at', 'text')
      .addColumn('completed_at', 'text')
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createTable('unit_goals')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('unit_id', 'integer', cb => cb.notNull().references('program_units.id'))
      .addColumn('title', 'text', cb => cb.notNull())
      .addColumn('type', 'text', cb => cb.notNull().defaultTo('custom'))
      .addColumn('ref_id', 'text')
      .addColumn('target', 'text')
      .addColumn('notes', 'text')
      .addColumn('order_index', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('completed_at', 'text')
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createTable('lesson_sessions')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('title', 'text')
      .addColumn('unit_id', 'integer', cb => cb.references('program_units.id'))
      .addColumn('scheduled_date', 'text', cb => cb.notNull())
      .addColumn('scheduled_time', 'text')
      .addColumn('duration_minutes', 'integer')
      .addColumn('completed_at', 'text')
      .addColumn('notes', 'text')
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_lesson_sessions_date')
      .ifNotExists()
      .on('lesson_sessions')
      .columns(['scheduled_date'])
      .execute();

    await db.schema
      .createIndex('idx_program_units_program')
      .ifNotExists()
      .on('program_units')
      .columns(['program_id', 'order_index'])
      .execute();

    await db.schema
      .createIndex('idx_unit_goals_unit')
      .ifNotExists()
      .on('unit_goals')
      .columns(['unit_id', 'order_index'])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_unit_goals_unit').ifExists().execute();
    await db.schema.dropIndex('idx_program_units_program').ifExists().execute();
    await db.schema.dropIndex('idx_lesson_sessions_date').ifExists().execute();
    await db.schema.dropTable('lesson_sessions').ifExists().execute();
    await db.schema.dropTable('unit_goals').ifExists().execute();
    await db.schema.dropTable('program_units').ifExists().execute();
    await db.schema.dropTable('practice_programs').ifExists().execute();
  },
};
