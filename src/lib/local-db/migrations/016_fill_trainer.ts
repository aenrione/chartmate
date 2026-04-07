import {type Kysely, type Migration} from 'kysely';

export const migration_016_fill_trainer: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('fill_practice_sessions')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('fill_id', 'text', cb => cb.notNull())
      .addColumn('bpm', 'integer', cb => cb.notNull())
      .addColumn('learned', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_fill_practice_sessions_fill_id')
      .ifNotExists()
      .on('fill_practice_sessions')
      .column('fill_id')
      .execute();

    await db.schema
      .createIndex('idx_fill_practice_sessions_created')
      .ifNotExists()
      .on('fill_practice_sessions')
      .column('created_at')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_fill_practice_sessions_created').ifExists().execute();
    await db.schema.dropIndex('idx_fill_practice_sessions_fill_id').ifExists().execute();
    await db.schema.dropTable('fill_practice_sessions').ifExists().execute();
  },
};
