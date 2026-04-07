import {type Kysely, type Migration} from 'kysely';

export const migration_011_youtube: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('youtube_associations')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('chart_md5', 'text', cb => cb.notNull().unique())
      .addColumn('youtube_url', 'text', cb => cb.notNull())
      .addColumn('offset_ms', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_youtube_associations_chart_md5')
      .ifNotExists()
      .on('youtube_associations')
      .column('chart_md5')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_youtube_associations_chart_md5').ifExists().execute();
    await db.schema.dropTable('youtube_associations').ifExists().execute();
  },
};
