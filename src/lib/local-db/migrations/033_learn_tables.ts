import {type Kysely, type Migration} from 'kysely';

export const migration_033_learn_tables: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('learn_progress')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('instrument', 'text', cb => cb.notNull())
      .addColumn('unit_id', 'text', cb => cb.notNull())
      .addColumn('lesson_id', 'text', cb => cb.notNull())
      .addColumn('completed_at', 'text', cb => cb.notNull())
      .addUniqueConstraint('uq_learn_progress', ['instrument', 'unit_id', 'lesson_id'])
      .execute();

    await db.schema
      .createIndex('idx_learn_progress_instrument')
      .ifNotExists()
      .on('learn_progress')
      .columns(['instrument', 'unit_id'])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_learn_progress_instrument').ifExists().execute();
    await db.schema.dropTable('learn_progress').ifExists().execute();
  },
};
