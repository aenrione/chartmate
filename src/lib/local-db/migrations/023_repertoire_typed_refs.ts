import {sql} from 'kysely';
import {type Kysely, type Migration} from 'kysely';

/**
 * Replace polymorphic (reference_type / reference_id) columns with typed,
 * FK-backed columns. Existing data is migrated. The old columns are kept as
 * deprecated and will be removed in a future migration once all writes use
 * the new columns.
 */
export const migration_023_repertoire_typed_refs: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable('repertoire_items')
      .addColumn('saved_chart_md5', 'text')
      .execute();

    await db.schema
      .alterTable('repertoire_items')
      .addColumn('composition_id', 'integer')
      .execute();

    await db.schema
      .alterTable('repertoire_items')
      .addColumn('song_section_id', 'integer')
      .execute();

    // Migrate existing polymorphic data to typed columns
    await sql`
      UPDATE repertoire_items
      SET saved_chart_md5 = reference_id
      WHERE reference_type = 'saved_chart'
    `.execute(db);

    await sql`
      UPDATE repertoire_items
      SET composition_id = CAST(reference_id AS INTEGER)
      WHERE reference_type = 'composition'
    `.execute(db);

    await sql`
      UPDATE repertoire_items
      SET song_section_id = CAST(reference_id AS INTEGER)
      WHERE reference_type = 'song_section'
    `.execute(db);

    await db.schema
      .createIndex('idx_repertoire_items_saved_chart')
      .ifNotExists()
      .on('repertoire_items')
      .column('saved_chart_md5')
      .execute();

    await db.schema
      .createIndex('idx_repertoire_items_composition')
      .ifNotExists()
      .on('repertoire_items')
      .column('composition_id')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_repertoire_items_composition').ifExists().execute();
    await db.schema.dropIndex('idx_repertoire_items_saved_chart').ifExists().execute();
    await db.schema.alterTable('repertoire_items').dropColumn('song_section_id').execute();
    await db.schema.alterTable('repertoire_items').dropColumn('composition_id').execute();
    await db.schema.alterTable('repertoire_items').dropColumn('saved_chart_md5').execute();
  },
};
