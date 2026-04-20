import {type Kysely, type Migration} from 'kysely';

export const migration_025_tab_compositions_youtube_url: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable('tab_compositions')
      .addColumn('youtube_url', 'text')
      .execute();
  },
  async down(db: Kysely<any>) {
    await db.schema.alterTable('tab_compositions').dropColumn('youtube_url').execute();
  },
};
