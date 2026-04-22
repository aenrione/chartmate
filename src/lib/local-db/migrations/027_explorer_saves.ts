import {type Kysely, type Migration} from 'kysely';

export const migration_027_explorer_saves: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('explorer_saves')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement())
      .addColumn('list_name', 'text', cb => cb.notNull().defaultTo('Watch Later'))
      .addColumn('artist', 'text', cb => cb.notNull())
      .addColumn('name', 'text', cb => cb.notNull())
      .addColumn('artist_normalized', 'text', cb => cb.notNull())
      .addColumn('name_normalized', 'text', cb => cb.notNull())
      .addColumn('spotify_track_uri', 'text')
      .addColumn('added_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_explorer_saves_list_name')
      .ifNotExists()
      .on('explorer_saves')
      .column('list_name')
      .execute();

    await db.schema
      .createIndex('idx_explorer_saves_track')
      .ifNotExists()
      .on('explorer_saves')
      .columns(['artist_normalized', 'name_normalized'])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_explorer_saves_track').ifExists().execute();
    await db.schema.dropIndex('idx_explorer_saves_list_name').ifExists().execute();
    await db.schema.dropTable('explorer_saves').ifExists().execute();
  },
};
