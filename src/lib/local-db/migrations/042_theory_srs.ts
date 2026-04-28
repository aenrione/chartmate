import {sql} from 'kysely';
import {type Kysely, type Migration} from 'kysely';

const ITEM_TYPES_NEW = `'song', 'song_section', 'composition', 'exercise', 'theory'`;
const ITEM_TYPES_OLD = `'song', 'song_section', 'composition', 'exercise'`;
const REFERENCE_TYPES = `'saved_chart', 'song_section', 'composition'`;

async function tableExists(db: Kysely<any>, name: string): Promise<boolean> {
  const row = await sql<{name: string}>`
    SELECT name FROM sqlite_master WHERE type='table' AND name=${name}
  `.execute(db);
  return row.rows.length > 0;
}

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const row = await sql<{name: string}>`SELECT name FROM pragma_table_info(${table}) WHERE name=${column}`.execute(db);
  return row.rows.length > 0;
}

export const migration_042_theory_srs: Migration = {
  async up(db: Kysely<any>) {
    const itemsExists = await tableExists(db, 'repertoire_items');
    const newExists = await tableExists(db, 'repertoire_items_new');

    // ── Recovery cases (a previous run of this migration crashed mid-way) ──
    //
    // The original migration body did:
    //   1) DROP TABLE IF EXISTS repertoire_items_new
    //   2) CREATE TABLE repertoire_items_new ...
    //   3) INSERT INTO repertoire_items_new SELECT ... FROM repertoire_items
    //   4) DROP TABLE repertoire_items
    //   5) ALTER TABLE repertoire_items_new RENAME TO repertoire_items
    //   6) recreate indexes
    //
    // Failures between steps 4 and 5 leave the user with NO `repertoire_items` table and the
    // data still in `repertoire_items_new`. On the next migrator run the original first line
    // (DROP IF EXISTS repertoire_items_new) destroyed the data. The cases below salvage that.

    if (!itemsExists && newExists) {
      // Mid-recreate failure: the new table holds the user's data; just rename it.
      await sql`ALTER TABLE repertoire_items_new RENAME TO repertoire_items`.execute(db);
    } else if (!itemsExists && !newExists) {
      // Worst-case recovery: a prior failed run already wiped both. Recreate empty with the
      // new schema so the rest of the app has something to query.
      await sql`
        CREATE TABLE repertoire_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          collection_id INTEGER NOT NULL DEFAULT 1 REFERENCES repertoire_collections(id),
          item_type TEXT NOT NULL CHECK (item_type IN (${sql.raw(ITEM_TYPES_NEW)})),
          title TEXT NOT NULL,
          artist TEXT,
          notes TEXT,
          target_bpm INTEGER,
          reference_type TEXT CHECK (reference_type IS NULL OR reference_type IN (${sql.raw(REFERENCE_TYPES)})),
          reference_id TEXT,
          saved_chart_md5 TEXT,
          composition_id INTEGER,
          song_section_id INTEGER,
          theory_source TEXT,
          interval INTEGER NOT NULL DEFAULT 1,
          ease_factor REAL NOT NULL DEFAULT 2.5,
          repetitions INTEGER NOT NULL DEFAULT 0,
          next_review_date TEXT NOT NULL,
          last_reviewed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `.execute(db);
    } else if (itemsExists && await columnExists(db, 'repertoire_items', 'theory_source')) {
      // Already migrated (e.g. partial migration tracking). Nothing to do for the table.
      // Fall through to ensure indexes exist.
    } else {
      // Normal forward migration path — `repertoire_items` exists in old shape.
      await sql`DROP TABLE IF EXISTS repertoire_items_new`.execute(db);
      await sql`
        CREATE TABLE repertoire_items_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          collection_id INTEGER NOT NULL DEFAULT 1 REFERENCES repertoire_collections(id),
          item_type TEXT NOT NULL CHECK (item_type IN (${sql.raw(ITEM_TYPES_NEW)})),
          title TEXT NOT NULL,
          artist TEXT,
          notes TEXT,
          target_bpm INTEGER,
          reference_type TEXT CHECK (reference_type IS NULL OR reference_type IN (${sql.raw(REFERENCE_TYPES)})),
          reference_id TEXT,
          saved_chart_md5 TEXT,
          composition_id INTEGER,
          song_section_id INTEGER,
          theory_source TEXT,
          interval INTEGER NOT NULL DEFAULT 1,
          ease_factor REAL NOT NULL DEFAULT 2.5,
          repetitions INTEGER NOT NULL DEFAULT 0,
          next_review_date TEXT NOT NULL,
          last_reviewed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `.execute(db);

      await sql`
        INSERT INTO repertoire_items_new
          (id, collection_id, item_type, title, artist, notes, target_bpm,
           reference_type, reference_id, saved_chart_md5, composition_id,
           song_section_id, theory_source, interval, ease_factor, repetitions,
           next_review_date, last_reviewed_at, created_at, updated_at)
        SELECT
          id, collection_id, item_type, title, artist, notes, target_bpm,
          reference_type, reference_id, saved_chart_md5, composition_id,
          song_section_id, NULL,
          interval, ease_factor, repetitions,
          next_review_date, last_reviewed_at, created_at, updated_at
        FROM repertoire_items
      `.execute(db);

      await db.schema.dropIndex('idx_repertoire_items_next_review').ifExists().execute();
      await db.schema.dropIndex('idx_repertoire_items_collection').ifExists().execute();
      await db.schema.dropIndex('idx_repertoire_items_reference').ifExists().execute();
      await db.schema.dropIndex('idx_repertoire_items_saved_chart').ifExists().execute();
      await db.schema.dropIndex('idx_repertoire_items_composition').ifExists().execute();

      await sql`DROP TABLE repertoire_items`.execute(db);
      await sql`ALTER TABLE repertoire_items_new RENAME TO repertoire_items`.execute(db);
    }

    // Index re-creation is idempotent and runs in every branch.
    await db.schema.createIndex('idx_repertoire_items_next_review').ifNotExists().on('repertoire_items').column('next_review_date').execute();
    await db.schema.createIndex('idx_repertoire_items_collection').ifNotExists().on('repertoire_items').column('collection_id').execute();
    await db.schema.createIndex('idx_repertoire_items_reference').ifNotExists().on('repertoire_items').columns(['reference_type', 'reference_id']).execute();
    await db.schema.createIndex('idx_repertoire_items_saved_chart').ifNotExists().on('repertoire_items').column('saved_chart_md5').execute();
    await db.schema.createIndex('idx_repertoire_items_composition').ifNotExists().on('repertoire_items').column('composition_id').execute();
    await db.schema.createIndex('idx_repertoire_items_theory_source').ifNotExists().on('repertoire_items').column('theory_source').execute();
  },

  async down(db: Kysely<any>) {
    await sql`
      CREATE TABLE repertoire_items_old (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        collection_id INTEGER NOT NULL DEFAULT 1 REFERENCES repertoire_collections(id),
        item_type TEXT NOT NULL CHECK (item_type IN (${sql.raw(ITEM_TYPES_OLD)})),
        title TEXT NOT NULL,
        artist TEXT,
        notes TEXT,
        target_bpm INTEGER,
        reference_type TEXT CHECK (reference_type IS NULL OR reference_type IN (${sql.raw(REFERENCE_TYPES)})),
        reference_id TEXT,
        saved_chart_md5 TEXT,
        composition_id INTEGER,
        song_section_id INTEGER,
        interval INTEGER NOT NULL DEFAULT 1,
        ease_factor REAL NOT NULL DEFAULT 2.5,
        repetitions INTEGER NOT NULL DEFAULT 0,
        next_review_date TEXT NOT NULL,
        last_reviewed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `.execute(db);

    await sql`
      INSERT INTO repertoire_items_old
        (id, collection_id, item_type, title, artist, notes, target_bpm,
         reference_type, reference_id, saved_chart_md5, composition_id,
         song_section_id, interval, ease_factor, repetitions,
         next_review_date, last_reviewed_at, created_at, updated_at)
      SELECT
        id, collection_id, item_type, title, artist, notes, target_bpm,
        reference_type, reference_id, saved_chart_md5, composition_id,
        song_section_id, interval, ease_factor, repetitions,
        next_review_date, last_reviewed_at, created_at, updated_at
      FROM repertoire_items
      WHERE item_type != 'theory'
    `.execute(db);

    await db.schema.dropIndex('idx_repertoire_items_theory_source').ifExists().execute();
    await db.schema.dropIndex('idx_repertoire_items_next_review').ifExists().execute();
    await db.schema.dropIndex('idx_repertoire_items_collection').ifExists().execute();
    await db.schema.dropIndex('idx_repertoire_items_reference').ifExists().execute();
    await db.schema.dropIndex('idx_repertoire_items_saved_chart').ifExists().execute();
    await db.schema.dropIndex('idx_repertoire_items_composition').ifExists().execute();

    await sql`DROP TABLE repertoire_items`.execute(db);
    await sql`ALTER TABLE repertoire_items_old RENAME TO repertoire_items`.execute(db);

    await db.schema.createIndex('idx_repertoire_items_next_review').ifNotExists().on('repertoire_items').column('next_review_date').execute();
    await db.schema.createIndex('idx_repertoire_items_collection').ifNotExists().on('repertoire_items').column('collection_id').execute();
    await db.schema.createIndex('idx_repertoire_items_reference').ifNotExists().on('repertoire_items').columns(['reference_type', 'reference_id']).execute();
    await db.schema.createIndex('idx_repertoire_items_saved_chart').ifNotExists().on('repertoire_items').column('saved_chart_md5').execute();
    await db.schema.createIndex('idx_repertoire_items_composition').ifNotExists().on('repertoire_items').column('composition_id').execute();
  },
};
