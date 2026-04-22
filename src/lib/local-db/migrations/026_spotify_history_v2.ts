import {type Kysely, type Migration} from 'kysely';

export const migration_026_spotify_history_v2: Migration = {
  async up(db: Kysely<any>) {
    // Add last_played and ms_played to spotify_history
    await db.schema
      .alterTable('spotify_history')
      .addColumn('last_played', 'text')
      .execute();

    await db.schema
      .alterTable('spotify_history')
      .addColumn('ms_played', 'integer', cb => cb.defaultTo(0))
      .execute();

    // Table to track which JSON dump files have been imported (for idempotency)
    await db.schema
      .createTable('spotify_history_imports')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement())
      .addColumn('filename', 'text', cb => cb.notNull())
      .addColumn('file_size', 'integer', cb => cb.notNull())
      .addColumn('imported_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_spotify_history_imports_filename')
      .ifNotExists()
      .on('spotify_history_imports')
      .column('filename')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema
      .dropIndex('idx_spotify_history_imports_filename')
      .ifExists()
      .execute();

    await db.schema.dropTable('spotify_history_imports').ifExists().execute();

    // SQLite does not support DROP COLUMN in older versions; recreate the table
    // For simplicity just leave the columns on down — this is non-production.
  },
};
