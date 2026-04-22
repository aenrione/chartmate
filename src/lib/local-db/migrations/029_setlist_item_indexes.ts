import {type Kysely, type Migration} from 'kysely';

export const migration_029_setlist_item_indexes: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createIndex('idx_setlist_items_composition_id')
      .ifNotExists()
      .on('setlist_items')
      .column('composition_id')
      .execute();
    await db.schema
      .createIndex('idx_setlist_items_pdf_library_id')
      .ifNotExists()
      .on('setlist_items')
      .column('pdf_library_id')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_setlist_items_composition_id').ifExists().execute();
    await db.schema.dropIndex('idx_setlist_items_pdf_library_id').ifExists().execute();
  },
};
