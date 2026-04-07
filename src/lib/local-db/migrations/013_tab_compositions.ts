import {type Kysely, type Migration} from 'kysely';

export const migration_013_tab_compositions: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('tab_compositions')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('title', 'text', cb => cb.notNull().defaultTo('Untitled'))
      .addColumn('artist', 'text', cb => cb.notNull().defaultTo(''))
      .addColumn('album', 'text', cb => cb.notNull().defaultTo(''))
      .addColumn('tempo', 'integer', cb => cb.notNull().defaultTo(120))
      .addColumn('instrument', 'text', cb => cb.notNull().defaultTo('guitar'))
      .addColumn('created_at', 'text', cb => cb.notNull())
      .addColumn('updated_at', 'text', cb => cb.notNull())
      .addColumn('score_data', 'blob', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_tab_compositions_updated')
      .ifNotExists()
      .on('tab_compositions')
      .column('updated_at')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_tab_compositions_updated').ifExists().execute();
    await db.schema.dropTable('tab_compositions').ifExists().execute();
  },
};
