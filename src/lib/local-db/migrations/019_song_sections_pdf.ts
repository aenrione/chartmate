import {type Kysely, type Migration} from 'kysely';

export const migration_019_song_sections_pdf: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable('song_sections')
      .addColumn('pdf_page', 'integer')
      .execute();

    await db.schema
      .alterTable('song_sections')
      .addColumn('pdf_y_offset', 'real')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema
      .alterTable('song_sections')
      .dropColumn('pdf_y_offset')
      .execute();

    await db.schema
      .alterTable('song_sections')
      .dropColumn('pdf_page')
      .execute();
  },
};
