import {sql} from 'kysely';
import {type Kysely, type Migration} from 'kysely';

const ITEM_TYPES = `'song', 'song_section', 'composition', 'exercise'`;
const REFERENCE_TYPES = `'saved_chart', 'song_section', 'composition'`;

export const migration_022_repertoire_iq: Migration = {
  async up(db: Kysely<any>) {
    // Collections (like Anki decks)
    await db.schema
      .createTable('repertoire_collections')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('name', 'text', cb => cb.notNull().defaultTo('My Repertoire'))
      .addColumn('description', 'text')
      .addColumn('color', 'text', cb => cb.notNull().defaultTo('#6366f1'))
      .addColumn('created_at', 'text', cb => cb.notNull())
      .addColumn('updated_at', 'text', cb => cb.notNull())
      .execute();

    // Insert default collection
    await db
      .insertInto('repertoire_collections')
      .values({
        name: 'My Repertoire',
        description: 'Songs and exercises I want to remember',
        color: '#6366f1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();

    // Reviewable items (the "cards")
    await db.schema
      .createTable('repertoire_items')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('collection_id', 'integer', cb =>
        cb.notNull().defaultTo(1).references('repertoire_collections.id'),
      )
      .addColumn('item_type', 'text', cb =>
        cb.notNull().modifyEnd(sql`CHECK (item_type IN (${sql.raw(ITEM_TYPES)}))`),
      )
      .addColumn('title', 'text', cb => cb.notNull())
      .addColumn('artist', 'text')
      .addColumn('notes', 'text')
      .addColumn('target_bpm', 'integer')
      .addColumn('reference_type', 'text', cb =>
        cb.modifyEnd(sql`CHECK (reference_type IS NULL OR reference_type IN (${sql.raw(REFERENCE_TYPES)}))`),
      )
      .addColumn('reference_id', 'text')
      // SM-2 fields
      .addColumn('interval', 'integer', cb => cb.notNull().defaultTo(1))
      .addColumn('ease_factor', 'real', cb => cb.notNull().defaultTo(2.5))
      .addColumn('repetitions', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('next_review_date', 'text', cb => cb.notNull())
      .addColumn('last_reviewed_at', 'text')
      .addColumn('created_at', 'text', cb => cb.notNull())
      .addColumn('updated_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_repertoire_items_next_review')
      .ifNotExists()
      .on('repertoire_items')
      .column('next_review_date')
      .execute();

    await db.schema
      .createIndex('idx_repertoire_items_collection')
      .ifNotExists()
      .on('repertoire_items')
      .column('collection_id')
      .execute();

    await db.schema
      .createIndex('idx_repertoire_items_reference')
      .ifNotExists()
      .on('repertoire_items')
      .columns(['reference_type', 'reference_id'])
      .execute();

    // Review history
    await db.schema
      .createTable('repertoire_reviews')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('item_id', 'integer', cb =>
        cb.notNull().references('repertoire_items.id').onDelete('cascade'),
      )
      .addColumn('quality', 'integer', cb =>
        cb.notNull().modifyEnd(sql`CHECK (quality BETWEEN 0 AND 5)`),
      )
      .addColumn('interval_before', 'integer', cb => cb.notNull())
      .addColumn('interval_after', 'integer', cb => cb.notNull())
      .addColumn('ease_factor_before', 'real', cb => cb.notNull())
      .addColumn('ease_factor_after', 'real', cb => cb.notNull())
      .addColumn('duration_ms', 'integer')
      .addColumn('session_notes', 'text')
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_repertoire_reviews_item')
      .ifNotExists()
      .on('repertoire_reviews')
      .column('item_id')
      .execute();

    await db.schema
      .createIndex('idx_repertoire_reviews_created')
      .ifNotExists()
      .on('repertoire_reviews')
      .column('created_at')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_repertoire_reviews_created').ifExists().execute();
    await db.schema.dropIndex('idx_repertoire_reviews_item').ifExists().execute();
    await db.schema.dropTable('repertoire_reviews').ifExists().execute();
    await db.schema.dropIndex('idx_repertoire_items_reference').ifExists().execute();
    await db.schema.dropIndex('idx_repertoire_items_collection').ifExists().execute();
    await db.schema.dropIndex('idx_repertoire_items_next_review').ifExists().execute();
    await db.schema.dropTable('repertoire_items').ifExists().execute();
    await db.schema.dropTable('repertoire_collections').ifExists().execute();
  },
};
