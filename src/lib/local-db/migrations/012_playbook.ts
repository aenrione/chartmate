import {type Kysely, type Migration} from 'kysely';

export const migration_012_playbook: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('practice_sessions')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('setlist_item_id', 'integer', cb => cb.notNull().references('setlist_items.id'))
      .addColumn('status', 'text', cb => cb.notNull().defaultTo('active'))
      .addColumn('started_at', 'text', cb => cb.notNull())
      .addColumn('ended_at', 'text')
      .addColumn('speed', 'integer', cb => cb.notNull())
      .addColumn('notes', 'text')
      .execute();

    await db.schema
      .createIndex('idx_practice_sessions_item')
      .ifNotExists()
      .on('practice_sessions')
      .column('setlist_item_id')
      .execute();

    await db.schema
      .createIndex('idx_practice_sessions_started')
      .ifNotExists()
      .on('practice_sessions')
      .column('started_at')
      .execute();

    await db.schema
      .createTable('song_sections')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('chart_md5', 'text', cb => cb.notNull())
      .addColumn('name', 'text', cb => cb.notNull())
      .addColumn('start_position', 'real', cb => cb.notNull())
      .addColumn('end_position', 'real', cb => cb.notNull())
      .addColumn('sort_order', 'integer', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_song_sections_chart')
      .ifNotExists()
      .on('song_sections')
      .columns(['chart_md5', 'sort_order'])
      .execute();

    await db.schema
      .createTable('section_progress')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('song_section_id', 'integer', cb => cb.notNull().references('song_sections.id'))
      .addColumn('setlist_item_id', 'integer', cb => cb.notNull().references('setlist_items.id'))
      .addColumn('status', 'text', cb => cb.notNull().defaultTo('not_started'))
      .addColumn('updated_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_section_progress_section')
      .ifNotExists()
      .on('section_progress')
      .column('song_section_id')
      .execute();

    await db.schema
      .createIndex('idx_section_progress_item')
      .ifNotExists()
      .on('section_progress')
      .column('setlist_item_id')
      .execute();

    await db.schema
      .createTable('song_annotations')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('song_section_id', 'integer', cb => cb.notNull().references('song_sections.id'))
      .addColumn('content', 'text', cb => cb.notNull())
      .addColumn('created_at', 'text', cb => cb.notNull())
      .addColumn('updated_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_song_annotations_section')
      .ifNotExists()
      .on('song_annotations')
      .column('song_section_id')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_song_annotations_section').ifExists().execute();
    await db.schema.dropTable('song_annotations').ifExists().execute();
    await db.schema.dropIndex('idx_section_progress_item').ifExists().execute();
    await db.schema.dropIndex('idx_section_progress_section').ifExists().execute();
    await db.schema.dropTable('section_progress').ifExists().execute();
    await db.schema.dropIndex('idx_song_sections_chart').ifExists().execute();
    await db.schema.dropTable('song_sections').ifExists().execute();
    await db.schema.dropIndex('idx_practice_sessions_started').ifExists().execute();
    await db.schema.dropIndex('idx_practice_sessions_item').ifExists().execute();
    await db.schema.dropTable('practice_sessions').ifExists().execute();
  },
};
