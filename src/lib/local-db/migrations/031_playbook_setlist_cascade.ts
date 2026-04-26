import {sql} from 'kysely';
import {type Kysely, type Migration} from 'kysely';

// practice_sessions and section_progress were created without ON DELETE CASCADE
// on setlist_item_id. Deleting a setlist item fails with FK constraint 787 when
// those tables have rows referencing it. Rebuild both tables with CASCADE.
export const migration_031_playbook_setlist_cascade: Migration = {
  async up(db: Kysely<any>) {
    await sql`PRAGMA foreign_keys = OFF`.execute(db);

    // Rebuild practice_sessions
    await sql`DROP TABLE IF EXISTS practice_sessions_new`.execute(db);
    await sql`
      CREATE TABLE practice_sessions_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        setlist_item_id INTEGER NOT NULL REFERENCES setlist_items(id) ON DELETE CASCADE,
        status          TEXT    NOT NULL DEFAULT 'active',
        started_at      TEXT    NOT NULL,
        ended_at        TEXT,
        speed           INTEGER NOT NULL,
        notes           TEXT
      )
    `.execute(db);
    await sql`
      INSERT INTO practice_sessions_new
        (id, setlist_item_id, status, started_at, ended_at, speed, notes)
      SELECT id, setlist_item_id, status, started_at, ended_at, speed, notes
      FROM practice_sessions
    `.execute(db);
    await sql`DROP TABLE practice_sessions`.execute(db);
    await sql`ALTER TABLE practice_sessions_new RENAME TO practice_sessions`.execute(db);

    await db.schema
      .createIndex('idx_practice_sessions_item')
      .ifNotExists()
      .on('practice_sessions')
      .column('setlist_item_id')
      .execute();
    await db.schema
      .createIndex('idx_practice_sessions_started')
      .ifNotExists()
      .on('practice_sessions')
      .column('started_at')
      .execute();

    // Rebuild section_progress
    await sql`DROP TABLE IF EXISTS section_progress_new`.execute(db);
    await sql`
      CREATE TABLE section_progress_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        song_section_id INTEGER NOT NULL REFERENCES song_sections(id),
        setlist_item_id INTEGER NOT NULL REFERENCES setlist_items(id) ON DELETE CASCADE,
        status          TEXT    NOT NULL DEFAULT 'not_started',
        updated_at      TEXT    NOT NULL
      )
    `.execute(db);
    await sql`
      INSERT INTO section_progress_new
        (id, song_section_id, setlist_item_id, status, updated_at)
      SELECT id, song_section_id, setlist_item_id, status, updated_at
      FROM section_progress
    `.execute(db);
    await sql`DROP TABLE section_progress`.execute(db);
    await sql`ALTER TABLE section_progress_new RENAME TO section_progress`.execute(db);

    await db.schema
      .createIndex('idx_section_progress_section')
      .ifNotExists()
      .on('section_progress')
      .column('song_section_id')
      .execute();
    await db.schema
      .createIndex('idx_section_progress_item')
      .ifNotExists()
      .on('section_progress')
      .column('setlist_item_id')
      .execute();

    await sql`PRAGMA foreign_keys = ON`.execute(db);
  },

  async down(db: Kysely<any>) {
    await sql`PRAGMA foreign_keys = OFF`.execute(db);

    await sql`DROP TABLE IF EXISTS practice_sessions_old`.execute(db);
    await sql`
      CREATE TABLE practice_sessions_old (
        id              INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        setlist_item_id INTEGER NOT NULL REFERENCES setlist_items(id),
        status          TEXT    NOT NULL DEFAULT 'active',
        started_at      TEXT    NOT NULL,
        ended_at        TEXT,
        speed           INTEGER NOT NULL,
        notes           TEXT
      )
    `.execute(db);
    await sql`
      INSERT INTO practice_sessions_old
        (id, setlist_item_id, status, started_at, ended_at, speed, notes)
      SELECT id, setlist_item_id, status, started_at, ended_at, speed, notes
      FROM practice_sessions
    `.execute(db);
    await sql`DROP TABLE practice_sessions`.execute(db);
    await sql`ALTER TABLE practice_sessions_old RENAME TO practice_sessions`.execute(db);

    await db.schema
      .createIndex('idx_practice_sessions_item')
      .ifNotExists()
      .on('practice_sessions')
      .column('setlist_item_id')
      .execute();
    await db.schema
      .createIndex('idx_practice_sessions_started')
      .ifNotExists()
      .on('practice_sessions')
      .column('started_at')
      .execute();

    await sql`DROP TABLE IF EXISTS section_progress_old`.execute(db);
    await sql`
      CREATE TABLE section_progress_old (
        id              INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        song_section_id INTEGER NOT NULL REFERENCES song_sections(id),
        setlist_item_id INTEGER NOT NULL REFERENCES setlist_items(id),
        status          TEXT    NOT NULL DEFAULT 'not_started',
        updated_at      TEXT    NOT NULL
      )
    `.execute(db);
    await sql`
      INSERT INTO section_progress_old
        (id, song_section_id, setlist_item_id, status, updated_at)
      SELECT id, song_section_id, setlist_item_id, status, updated_at
      FROM section_progress
    `.execute(db);
    await sql`DROP TABLE section_progress`.execute(db);
    await sql`ALTER TABLE section_progress_old RENAME TO section_progress`.execute(db);

    await db.schema
      .createIndex('idx_section_progress_section')
      .ifNotExists()
      .on('section_progress')
      .column('song_section_id')
      .execute();
    await db.schema
      .createIndex('idx_section_progress_item')
      .ifNotExists()
      .on('section_progress')
      .column('setlist_item_id')
      .execute();

    await sql`PRAGMA foreign_keys = ON`.execute(db);
  },
};
