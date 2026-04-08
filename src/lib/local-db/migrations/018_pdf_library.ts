import {type Kysely, type Migration} from 'kysely';

export const migration_018_pdf_library: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('pdf_library')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('filename', 'text', cb => cb.notNull())
      .addColumn('relative_path', 'text', cb => cb.notNull().unique())
      .addColumn('file_size_bytes', 'integer', cb => cb.notNull())
      .addColumn('detected_title', 'text')
      .addColumn('detected_artist', 'text')
      .addColumn('added_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_pdf_library_relative_path')
      .ifNotExists()
      .on('pdf_library')
      .column('relative_path')
      .execute();

    await db.schema
      .createTable('chart_pdfs')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('chart_md5', 'text', cb => cb.notNull().references('saved_charts.md5'))
      .addColumn('pdf_library_id', 'integer', cb => cb.notNull().references('pdf_library.id'))
      .addColumn('label', 'text')
      .addColumn('is_primary', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('linked_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_chart_pdfs_chart_md5')
      .ifNotExists()
      .on('chart_pdfs')
      .column('chart_md5')
      .execute();

    await db.schema
      .createIndex('idx_chart_pdfs_unique')
      .ifNotExists()
      .on('chart_pdfs')
      .columns(['chart_md5', 'pdf_library_id'])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_chart_pdfs_unique').ifExists().execute();
    await db.schema.dropIndex('idx_chart_pdfs_chart_md5').ifExists().execute();
    await db.schema.dropTable('chart_pdfs').ifExists().execute();
    await db.schema.dropIndex('idx_pdf_library_relative_path').ifExists().execute();
    await db.schema.dropTable('pdf_library').ifExists().execute();
  },
};
