import {sql} from 'kysely';
import {type Kysely, type Migration} from 'kysely';

export const migration_010_setlists: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('setlists')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('name', 'text', cb => cb.notNull())
      .addColumn('description', 'text')
      .addColumn('source_type', 'text', cb =>
        cb.notNull().defaultTo('custom').modifyEnd(sql`CHECK (source_type IN ('custom', 'spotify', 'source_game'))`),
      )
      .addColumn('source_id', 'text')
      .addColumn('created_at', 'text', cb => cb.notNull())
      .addColumn('updated_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createTable('setlist_items')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('setlist_id', 'integer', cb => cb.notNull().references('setlists.id').onDelete('cascade'))
      .addColumn('chart_md5', 'text', cb => cb.notNull())
      .addColumn('name', 'text', cb => cb.notNull())
      .addColumn('artist', 'text', cb => cb.notNull())
      .addColumn('charter', 'text', cb => cb.notNull())
      .addColumn('position', 'integer', cb => cb.notNull())
      .addColumn('speed', 'integer', cb => cb.notNull().defaultTo(100))
      .addColumn('added_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_setlist_items_setlist_id')
      .ifNotExists()
      .on('setlist_items')
      .column('setlist_id')
      .execute();

    await db.schema
      .createIndex('idx_setlist_items_position')
      .ifNotExists()
      .on('setlist_items')
      .columns(['setlist_id', 'position'])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_setlist_items_position').ifExists().execute();
    await db.schema.dropIndex('idx_setlist_items_setlist_id').ifExists().execute();
    await db.schema.dropTable('setlist_items').ifExists().execute();
    await db.schema.dropTable('setlists').ifExists().execute();
  },
};
