import {sql} from 'kysely';
import {type Kysely, type Migration} from 'kysely';

// Free-form tags on library compositions. One row per (composition, tag).
// `tag` is COLLATE NOCASE so the primary key also rejects "Rock" next to "rock"
// (ASCII only; the app dedupes Unicode case in normalizeTags before writing).
export const migration_045_composition_tags: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('composition_tags')
      .ifNotExists()
      .addColumn('composition_id', 'integer', cb =>
        cb.notNull().references('tab_compositions.id').onDelete('cascade'),
      )
      .addColumn('tag', 'text', cb => cb.notNull().modifyEnd(sql`COLLATE NOCASE`))
      .addPrimaryKeyConstraint('composition_tags_pk', ['composition_id', 'tag'])
      .execute();

    // The primary key covers lookups by composition; this one covers filtering
    // and grouping by tag.
    await db.schema
      .createIndex('idx_composition_tags_tag')
      .ifNotExists()
      .on('composition_tags')
      .column('tag')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_composition_tags_tag').ifExists().execute();
    await db.schema.dropTable('composition_tags').ifExists().execute();
  },
};
