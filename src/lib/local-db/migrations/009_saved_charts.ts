import {type Kysely, type Migration} from 'kysely';

export const migration_009_saved_charts: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('saved_charts')
      .ifNotExists()
      .addColumn('md5', 'text', cb => cb.primaryKey().notNull())
      .addColumn('name', 'text', cb => cb.notNull())
      .addColumn('artist', 'text', cb => cb.notNull())
      .addColumn('charter', 'text', cb => cb.notNull())
      .addColumn('album_art_md5', 'text')
      .addColumn('diff_drums', 'integer')
      .addColumn('diff_drums_real', 'integer')
      .addColumn('diff_guitar', 'integer')
      .addColumn('diff_bass', 'integer')
      .addColumn('diff_keys', 'integer')
      .addColumn('song_length', 'integer')
      .addColumn('has_video_background', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('modified_time', 'text', cb => cb.notNull())
      .addColumn('saved_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_saved_charts_name')
      .ifNotExists()
      .on('saved_charts')
      .column('name')
      .execute();

    await db.schema
      .createIndex('idx_saved_charts_artist')
      .ifNotExists()
      .on('saved_charts')
      .column('artist')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_saved_charts_name').ifExists().execute();
    await db.schema.dropIndex('idx_saved_charts_artist').ifExists().execute();
    await db.schema.dropTable('saved_charts').ifExists().execute();
  },
};
