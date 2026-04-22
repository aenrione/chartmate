import {type Kysely, type Migration} from 'kysely';

export const migration_017_saved_chart_tab_url: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable('saved_charts')
      .addColumn('tab_url', 'text')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema
      .alterTable('saved_charts')
      .dropColumn('tab_url')
      .execute();
  },
};
