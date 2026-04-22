import {sql} from 'kysely';
import {type Kysely, type Migration} from 'kysely';

export const migration_028_setlist_item_types: Migration = {
  async up(db: Kysely<any>) {
    // Disable FK checks while we rebuild the table so the rename is safe.
    await sql`PRAGMA foreign_keys = OFF`.execute(db);

    // SQLite doesn't support ALTER COLUMN — rebuild the table to make
    // chart_md5 nullable and add item_type / composition_id / pdf_library_id.
    await sql`DROP TABLE IF EXISTS setlist_items_new`.execute(db);

    await sql`
      CREATE TABLE setlist_items_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        setlist_id      INTEGER NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
        item_type       TEXT    NOT NULL DEFAULT 'chart'
                                CHECK (item_type IN ('chart', 'composition', 'pdf')),
        chart_md5       TEXT,
        composition_id  INTEGER,
        pdf_library_id  INTEGER,
        name            TEXT    NOT NULL,
        artist          TEXT    NOT NULL,
        charter         TEXT,
        position        INTEGER NOT NULL,
        speed           INTEGER NOT NULL DEFAULT 100,
        added_at        TEXT    NOT NULL
      )
    `.execute(db);

    await sql`
      INSERT INTO setlist_items_new
        (id, setlist_id, item_type, chart_md5, name, artist, charter, position, speed, added_at)
      SELECT
        id, setlist_id, 'chart', chart_md5, name, artist, charter, position, speed, added_at
      FROM setlist_items
    `.execute(db);

    await sql`DROP TABLE setlist_items`.execute(db);
    await sql`ALTER TABLE setlist_items_new RENAME TO setlist_items`.execute(db);

    await db.schema
      .createIndex('idx_setlist_items_setlist_id')
      .ifNotExists()
      .on('setlist_items')
      .column('setlist_id')
      .execute();

    await db.schema
      .createIndex('idx_setlist_items_position')
      .ifNotExists()
      .on('setlist_items')
      .columns(['setlist_id', 'position'])
      .execute();

    await sql`PRAGMA foreign_keys = ON`.execute(db);
  },

  async down(db: Kysely<any>) {
    await sql`PRAGMA foreign_keys = OFF`.execute(db);

    await sql`DROP TABLE IF EXISTS setlist_items_old`.execute(db);

    await sql`
      CREATE TABLE setlist_items_old (
        id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        setlist_id  INTEGER NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
        chart_md5   TEXT    NOT NULL,
        name        TEXT    NOT NULL,
        artist      TEXT    NOT NULL,
        charter     TEXT    NOT NULL,
        position    INTEGER NOT NULL,
        speed       INTEGER NOT NULL DEFAULT 100,
        added_at    TEXT    NOT NULL
      )
    `.execute(db);

    // Only migrate chart rows — non-chart rows are dropped on rollback.
    await sql`
      INSERT INTO setlist_items_old
        (id, setlist_id, chart_md5, name, artist, charter, position, speed, added_at)
      SELECT
        id, setlist_id, chart_md5, name, artist, COALESCE(charter, ''), position, speed, added_at
      FROM setlist_items
      WHERE item_type = 'chart' AND chart_md5 IS NOT NULL
    `.execute(db);

    await sql`DROP TABLE setlist_items`.execute(db);
    await sql`ALTER TABLE setlist_items_old RENAME TO setlist_items`.execute(db);

    await db.schema
      .createIndex('idx_setlist_items_setlist_id')
      .ifNotExists()
      .on('setlist_items')
      .column('setlist_id')
      .execute();

    await db.schema
      .createIndex('idx_setlist_items_position')
      .ifNotExists()
      .on('setlist_items')
      .columns(['setlist_id', 'position'])
      .execute();

    await sql`PRAGMA foreign_keys = ON`.execute(db);
  },
};
