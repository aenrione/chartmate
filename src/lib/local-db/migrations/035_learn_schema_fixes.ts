import type {Kysely} from 'kysely';
import {sql} from 'kysely';

export const migration_035_learn_schema_fixes = {
  async up(db: Kysely<any>): Promise<void> {
    // Index for XP ledger date-range queries
    await db.schema
      .createIndex('idx_xp_ledger_earned_at')
      .on('learn_xp_ledger')
      .column('earned_at')
      .ifNotExists()
      .execute();

    // Fix section_progress — rebuild adding ON DELETE CASCADE on song_section_id
    // Real schema (after migration 031): id, song_section_id, setlist_item_id, status, updated_at
    await sql`DROP TABLE IF EXISTS section_progress_new`.execute(db);
    await sql`
      CREATE TABLE section_progress_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        song_section_id INTEGER NOT NULL REFERENCES song_sections(id) ON DELETE CASCADE,
        setlist_item_id INTEGER NOT NULL REFERENCES setlist_items(id) ON DELETE CASCADE,
        status          TEXT    NOT NULL DEFAULT 'not_started',
        updated_at      TEXT    NOT NULL
      )
    `.execute(db);
    await sql`
      INSERT INTO section_progress_new (id, song_section_id, setlist_item_id, status, updated_at)
      SELECT id, song_section_id, setlist_item_id, status, updated_at FROM section_progress
    `.execute(db);
    await sql`DROP TABLE section_progress`.execute(db);
    await sql`ALTER TABLE section_progress_new RENAME TO section_progress`.execute(db);
    await db.schema.createIndex('idx_section_progress_section').ifNotExists().on('section_progress').column('song_section_id').execute();
    await db.schema.createIndex('idx_section_progress_item').ifNotExists().on('section_progress').column('setlist_item_id').execute();
  },

  async down(db: Kysely<any>): Promise<void> {
    await db.schema.dropIndex('idx_xp_ledger_earned_at').ifExists().execute();
  },
};
