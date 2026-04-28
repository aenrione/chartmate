import {type Kysely, type Migration, sql} from 'kysely';

/**
 * Active usage time tracking + session-table consistency.
 *
 * - `app_sessions`: heartbeat-driven log of contiguous active windows (visible + interacting).
 *   `duration_ms` accumulates from periodic heartbeats, so a crash loses at most one tick.
 *   No stored `date` column — query with `date(started_at)` (Hernandez: no calculated fields).
 *   `context` is constrained to a known set so structured pages can tag their windows.
 *
 * - Adds `duration_ms` to `fill_practice_sessions` and `practice_sessions` so every session
 *   table can answer "how much time was spent" with a single SUM, matching the convention
 *   already used by `fretboard_sessions` and `ear_sessions`.
 */
export const migration_041_active_time_tracking: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('app_sessions')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('started_at', 'text', cb => cb.notNull())
      .addColumn('ended_at', 'text')
      .addColumn('duration_ms', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('context', 'text', cb =>
        cb
          .notNull()
          .defaultTo('browse')
          .check(sql`context IN ('browse','lesson','drill','ear','repertoire','fill','rudiment','tab_editor','playbook')`),
      )
      .execute();

    await db.schema
      .createIndex('idx_app_sessions_started_at')
      .ifNotExists()
      .on('app_sessions')
      .columns(['started_at'])
      .execute();

    await db.schema
      .createIndex('idx_app_sessions_context_started')
      .ifNotExists()
      .on('app_sessions')
      .columns(['context', 'started_at'])
      .execute();

    await db.schema
      .alterTable('fill_practice_sessions')
      .addColumn('duration_ms', 'integer', cb => cb.notNull().defaultTo(0))
      .execute();

    await db.schema
      .alterTable('practice_sessions')
      .addColumn('duration_ms', 'integer')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.alterTable('practice_sessions').dropColumn('duration_ms').execute();
    await db.schema.alterTable('fill_practice_sessions').dropColumn('duration_ms').execute();
    await db.schema.dropIndex('idx_app_sessions_context_started').ifExists().execute();
    await db.schema.dropIndex('idx_app_sessions_started_at').ifExists().execute();
    await db.schema.dropTable('app_sessions').ifExists().execute();
  },
};
