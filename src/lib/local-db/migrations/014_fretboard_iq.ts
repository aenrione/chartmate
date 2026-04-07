import {sql} from 'kysely';
import {type Kysely, type Migration} from 'kysely';

export const migration_014_fretboard_iq: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('fretboard_sessions')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('drill_type', 'text', cb =>
        cb.notNull().modifyEnd(sql`CHECK (drill_type IN ('note-finder', 'interval-spotter', 'scale-navigator', 'chord-tone-finder', 'octave-mapper', 'caged-shapes'))`),
      )
      .addColumn('difficulty', 'text', cb =>
        cb.notNull().modifyEnd(sql`CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'))`),
      )
      .addColumn('total_questions', 'integer', cb => cb.notNull())
      .addColumn('correct_answers', 'integer', cb => cb.notNull())
      .addColumn('duration_ms', 'integer', cb => cb.notNull())
      .addColumn('xp_earned', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_fretboard_sessions_type')
      .ifNotExists()
      .on('fretboard_sessions')
      .column('drill_type')
      .execute();

    await db.schema
      .createIndex('idx_fretboard_sessions_created')
      .ifNotExists()
      .on('fretboard_sessions')
      .column('created_at')
      .execute();

    await db.schema
      .createTable('fretboard_attempts')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('session_id', 'integer', cb =>
        cb.notNull().references('fretboard_sessions.id').onDelete('cascade'),
      )
      .addColumn('drill_type', 'text', cb =>
        cb.notNull().modifyEnd(sql`CHECK (drill_type IN ('note-finder', 'interval-spotter', 'scale-navigator', 'chord-tone-finder', 'octave-mapper', 'caged-shapes'))`),
      )
      .addColumn('string_index', 'integer', cb => cb.notNull())
      .addColumn('fret', 'integer', cb => cb.notNull())
      .addColumn('expected_answer', 'text', cb => cb.notNull())
      .addColumn('given_answer', 'text')
      .addColumn('status', 'text', cb =>
        cb.notNull().defaultTo('incorrect').modifyEnd(sql`CHECK (status IN ('correct', 'incorrect', 'skipped'))`),
      )
      .addColumn('response_time_ms', 'integer', cb => cb.notNull())
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_fretboard_attempts_session')
      .ifNotExists()
      .on('fretboard_attempts')
      .column('session_id')
      .execute();

    await db.schema
      .createIndex('idx_fretboard_attempts_position')
      .ifNotExists()
      .on('fretboard_attempts')
      .columns(['string_index', 'fret', 'drill_type'])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_fretboard_attempts_position').ifExists().execute();
    await db.schema.dropIndex('idx_fretboard_attempts_session').ifExists().execute();
    await db.schema.dropTable('fretboard_attempts').ifExists().execute();
    await db.schema.dropIndex('idx_fretboard_sessions_created').ifExists().execute();
    await db.schema.dropIndex('idx_fretboard_sessions_type').ifExists().execute();
    await db.schema.dropTable('fretboard_sessions').ifExists().execute();
  },
};
