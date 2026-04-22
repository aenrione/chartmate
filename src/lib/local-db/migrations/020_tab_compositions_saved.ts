import {type Kysely, type Migration} from 'kysely';

export const migration_020_tab_compositions_saved: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable('tab_compositions')
      .addColumn('is_saved', 'integer', cb => cb.notNull().defaultTo(0))
      .execute();
    await db.schema
      .alterTable('tab_compositions')
      .addColumn('saved_at', 'text')
      .execute();
  },
  async down(db: Kysely<any>) {
    await db.schema.alterTable('tab_compositions').dropColumn('saved_at').execute();
    await db.schema.alterTable('tab_compositions').dropColumn('is_saved').execute();
  },
};
