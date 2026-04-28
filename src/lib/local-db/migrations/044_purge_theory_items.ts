import {sql} from 'kysely';
import {type Kysely, type Migration} from 'kysely';

export const migration_044_purge_theory_items: Migration = {
  async up(db: Kysely<any>) {
    // Delete reviews for theory items first (FK cascade not guaranteed in all builds)
    await sql`
      DELETE FROM repertoire_reviews
      WHERE item_id IN (
        SELECT id FROM repertoire_items WHERE item_type = 'theory'
      )
    `.execute(db);

    await db
      .deleteFrom('repertoire_items')
      .where('item_type', '=', 'theory')
      .execute();
  },

  async down(_db: Kysely<any>) {
    // No-op: data cannot be restored
  },
};
