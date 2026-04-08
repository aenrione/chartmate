import {sql} from 'kysely';
import {type Kysely, type Migration} from 'kysely';

const EXERCISE_TYPES = [
  'interval-recognition','chord-recognition','perfect-pitch',
  'scale-recognition','scale-degrees','chord-progressions',
  'intervals-in-context','melodic-dictation',
].map(t => `'${t}'`).join(', ');

export const migration_021_ear_training: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('ear_sessions')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('exercise_type', 'text', cb =>
        cb.notNull().modifyEnd(sql`CHECK (exercise_type IN (${sql.raw(EXERCISE_TYPES)}))`),
      )
      .addColumn('difficulty', 'text', cb =>
        cb.notNull().modifyEnd(sql`CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'))`),
      )
      .addColumn('total_questions', 'integer', cb => cb.notNull())
      .addColumn('correct_answers', 'integer', cb => cb.notNull())
      .addColumn('skipped_count', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('duration_ms', 'integer', cb => cb.notNull())
      .addColumn('xp_earned', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('playback_mode', 'text', cb =>
        cb.notNull().defaultTo('melodic').modifyEnd(sql`CHECK (playback_mode IN ('melodic', 'harmonic'))`),
      )
      .addColumn('direction', 'text', cb =>
        cb.notNull().defaultTo('both').modifyEnd(sql`CHECK (direction IN ('ascending', 'descending', 'both'))`),
      )
      .addColumn('speed', 'text', cb =>
        cb.notNull().defaultTo('medium').modifyEnd(sql`CHECK (speed IN ('slow', 'medium', 'fast'))`),
      )
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_ear_sessions_type')
      .ifNotExists()
      .on('ear_sessions')
      .column('exercise_type')
      .execute();

    await db.schema
      .createIndex('idx_ear_sessions_created')
      .ifNotExists()
      .on('ear_sessions')
      .column('created_at')
      .execute();

    await db.schema
      .createTable('ear_attempts')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('session_id', 'integer', cb =>
        cb.notNull().references('ear_sessions.id').onDelete('cascade'),
      )
      .addColumn('exercise_type', 'text', cb =>
        cb.notNull().modifyEnd(sql`CHECK (exercise_type IN (${sql.raw(EXERCISE_TYPES)}))`),
      )
      .addColumn('prompt_item', 'text', cb => cb.notNull())
      .addColumn('answer_context', 'text')
      .addColumn('expected_answer', 'text', cb => cb.notNull())
      .addColumn('given_answer', 'text')
      .addColumn('status', 'text', cb =>
        cb.notNull().defaultTo('incorrect').modifyEnd(sql`CHECK (status IN ('correct', 'incorrect', 'skipped'))`),
      )
      .addColumn('response_time_ms', 'integer', cb => cb.notNull())
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_ear_attempts_session')
      .ifNotExists()
      .on('ear_attempts')
      .column('session_id')
      .execute();

    await db.schema
      .createIndex('idx_ear_attempts_item_type')
      .ifNotExists()
      .on('ear_attempts')
      .columns(['prompt_item', 'exercise_type'])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_ear_attempts_item_type').ifExists().execute();
    await db.schema.dropIndex('idx_ear_attempts_session').ifExists().execute();
    await db.schema.dropTable('ear_attempts').ifExists().execute();
    await db.schema.dropIndex('idx_ear_sessions_created').ifExists().execute();
    await db.schema.dropIndex('idx_ear_sessions_type').ifExists().execute();
    await db.schema.dropTable('ear_sessions').ifExists().execute();
  },
};
