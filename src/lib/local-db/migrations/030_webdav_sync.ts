import {type Kysely, type Migration} from 'kysely';

export const migration_030_webdav_sync: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('sync_meta')
      .ifNotExists()
      .addColumn('key', 'text', cb => cb.primaryKey().notNull())
      .addColumn('value', 'text', cb => cb.notNull())
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropTable('sync_meta').ifExists().execute();
  },
};
