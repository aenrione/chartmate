import {sql} from 'kysely';
import {type Kysely, type Migration} from 'kysely';

// Archiving hides a composition from library browsing without deleting anything.
// `archived_at` is the ISO timestamp it was archived at; NULL means active.
// Scores, tags and stems are untouched, so unarchiving restores it exactly.
export const migration_046_composition_archived: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable('tab_compositions')
      .addColumn('archived_at', 'text')
      .execute();

    // The library's default query is
    //   WHERE is_saved = 1 AND instrument = ? AND archived_at IS NULL
    // so index the active rows only: the partial index stays small as the
    // archive grows, and it also serves the "archived only" count below.
    await sql`
      CREATE INDEX IF NOT EXISTS idx_tab_compositions_active
      ON tab_compositions (instrument, is_saved)
      WHERE archived_at IS NULL
    `.execute(db);
  },

  async down(db: Kysely<any>) {
    await sql`DROP INDEX IF EXISTS idx_tab_compositions_active`.execute(db);
    await db.schema.alterTable('tab_compositions').dropColumn('archived_at').execute();
  },
};
