import {type Kysely, type Migration} from 'kysely';

export const migration_015_saved_charts_downloaded: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable('saved_charts')
      .addColumn('is_downloaded', 'integer', cb => cb.notNull().defaultTo(0))
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema
      .alterTable('saved_charts')
      .dropColumn('is_downloaded')
      .execute();
  },
};
