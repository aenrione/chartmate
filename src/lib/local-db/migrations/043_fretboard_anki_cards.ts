import {type Kysely, type Migration} from 'kysely';
import {sql} from 'kysely';

export const migration_043_fretboard_anki_cards: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('fretboard_cards')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('string_index', 'integer', cb => cb.notNull())
      .addColumn('fret', 'integer', cb => cb.notNull())
      .addColumn('direction', 'text', cb =>
        cb.notNull().modifyEnd(sql`CHECK (direction IN ('pos_to_note', 'note_to_pos'))`),
      )
      .addColumn('interval', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('ease_factor', 'real', cb => cb.notNull().defaultTo(2.5))
      .addColumn('repetitions', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('next_review_date', 'text', cb => cb.notNull())
      .addColumn('last_reviewed_at', 'text')
      .addColumn('created_at', 'text', cb => cb.notNull())
      .addUniqueConstraint('uq_fretboard_cards_string_fret_direction', [
        'string_index',
        'fret',
        'direction',
      ])
      .execute();

    await db.schema
      .createIndex('idx_fretboard_cards_review_date')
      .ifNotExists()
      .on('fretboard_cards')
      .column('next_review_date')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_fretboard_cards_review_date').ifExists().execute();
    await db.schema.dropTable('fretboard_cards').ifExists().execute();
  },
};
