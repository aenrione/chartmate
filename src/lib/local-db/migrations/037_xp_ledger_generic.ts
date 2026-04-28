import {sql, type Kysely, type Migration} from 'kysely';

/**
 * Promotes learn_xp_ledger from a lesson-only ledger into a unified, multi-surface ledger.
 *
 * - Adds `surface` (e.g. 'lesson' | 'rudiment' | 'fill' | ... | 'mission_bonus' | 'achievement_bonus'),
 *   `ref_id` (per-surface object reference), and `dedupe_key` (UNIQUE) so idempotency becomes a
 *   DB invariant instead of an app-code race.
 * - Drops the `chk_xp_ledger_source` trigger from migration 034 — it whitelists only
 *   'lesson' | 'heart_bonus' and would block every new source. TS types enforce the discriminator.
 * - Adds an (instrument, earned_at) index for "today's XP per instrument" queries used by
 *   levels and missions.
 */
export const migration_037_xp_ledger_generic: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .alterTable('learn_xp_ledger')
      .addColumn('surface', 'text')
      .execute();

    await db.schema
      .alterTable('learn_xp_ledger')
      .addColumn('ref_id', 'text')
      .execute();

    await db.schema
      .alterTable('learn_xp_ledger')
      .addColumn('dedupe_key', 'text')
      .execute();

    // SQLite allows multiple NULLs in a UNIQUE index; existing rows (dedupe_key=NULL) are safe.
    await db.schema
      .createIndex('uq_xp_ledger_dedupe_key')
      .on('learn_xp_ledger')
      .column('dedupe_key')
      .unique()
      .ifNotExists()
      .execute();

    await db.schema
      .createIndex('idx_xp_ledger_instrument_earned_at')
      .on('learn_xp_ledger')
      .columns(['instrument', 'earned_at'])
      .ifNotExists()
      .execute();

    await sql`DROP TRIGGER IF EXISTS chk_xp_ledger_source`.execute(db);
  },

  async down(db: Kysely<any>) {
    // Recreate the trigger so a roll-back restores the original whitelist.
    await sql`CREATE TRIGGER IF NOT EXISTS chk_xp_ledger_source
      BEFORE INSERT ON learn_xp_ledger
      BEGIN
        SELECT RAISE(ABORT, 'source must be lesson or heart_bonus')
        WHERE NEW.source NOT IN ('lesson', 'heart_bonus');
      END`.execute(db);

    await db.schema.dropIndex('idx_xp_ledger_instrument_earned_at').ifExists().execute();
    await db.schema.dropIndex('uq_xp_ledger_dedupe_key').ifExists().execute();

    // Note: we do NOT drop the added columns — SQLite DROP COLUMN requires a table rebuild and
    // these columns are nullable & harmless. Down migrations are best-effort in this codebase
    // (see 035_learn_schema_fixes.ts).
  },
};
