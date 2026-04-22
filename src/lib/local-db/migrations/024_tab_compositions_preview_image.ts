import {type Kysely, type Migration} from 'kysely';

export const migration_024_tab_compositions_preview_image: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable('tab_compositions')
      .addColumn('preview_image', 'text')
      .execute();
  },
  async down(db: Kysely<any>) {
    await db.schema.alterTable('tab_compositions').dropColumn('preview_image').execute();
  },
};
