import {type Kysely, type Migration} from 'kysely';

export const migration_032_stem_associations: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('stem_associations')
      .ifNotExists()
      .addColumn('song_key', 'text', cb => cb.primaryKey().notNull())
      .addColumn('stem_folder_path', 'text', cb => cb.notNull())
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();
  },
  async down(db: Kysely<any>) {
    await db.schema.dropTable('stem_associations').ifExists().execute();
  },
};
