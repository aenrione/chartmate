import {sql, type Kysely, type Migration} from 'kysely';

/**
 * Reinstates DB-side domain-integrity triggers for the progression layer:
 *
 * - `chk_xp_ledger_surface` whitelists `learn_xp_ledger.surface`. The original
 *   `chk_xp_ledger_source` was dropped in migration 037 because its hard-coded
 *   `(lesson | heart_bonus)` whitelist was blocking the new sources; we replace
 *   it here with a wider whitelist matching the TypeScript `Surface` union.
 * - `chk_active_missions_state` whitelists `active_missions.state`.
 *
 * Domain integrity belongs in the database — see migration 034's prior trigger
 * convention. Triggers fire on both INSERT and UPDATE.
 */
export const migration_040_progression_integrity_triggers: Migration = {
  async up(db: Kysely<any>) {
    await sql`CREATE TRIGGER IF NOT EXISTS chk_xp_ledger_surface_insert
      BEFORE INSERT ON learn_xp_ledger
      BEGIN
        SELECT RAISE(ABORT, 'invalid surface')
        WHERE NEW.surface IS NOT NULL
          AND NEW.surface NOT IN (
            'lesson', 'rudiment', 'fill', 'ear', 'fretboard',
            'repertoire', 'playbook', 'tab_session',
            'mission_bonus', 'achievement_bonus', 'program_goal'
          );
      END`.execute(db);

    await sql`CREATE TRIGGER IF NOT EXISTS chk_xp_ledger_surface_update
      BEFORE UPDATE OF surface ON learn_xp_ledger
      BEGIN
        SELECT RAISE(ABORT, 'invalid surface')
        WHERE NEW.surface IS NOT NULL
          AND NEW.surface NOT IN (
            'lesson', 'rudiment', 'fill', 'ear', 'fretboard',
            'repertoire', 'playbook', 'tab_session',
            'mission_bonus', 'achievement_bonus', 'program_goal'
          );
      END`.execute(db);

    await sql`CREATE TRIGGER IF NOT EXISTS chk_active_missions_state_insert
      BEFORE INSERT ON active_missions
      BEGIN
        SELECT RAISE(ABORT, 'invalid mission state')
        WHERE NEW.state NOT IN ('active', 'completed', 'expired');
      END`.execute(db);

    await sql`CREATE TRIGGER IF NOT EXISTS chk_active_missions_state_update
      BEFORE UPDATE OF state ON active_missions
      BEGIN
        SELECT RAISE(ABORT, 'invalid mission state')
        WHERE NEW.state NOT IN ('active', 'completed', 'expired');
      END`.execute(db);
  },

  async down(db: Kysely<any>) {
    await sql`DROP TRIGGER IF EXISTS chk_active_missions_state_update`.execute(db);
    await sql`DROP TRIGGER IF EXISTS chk_active_missions_state_insert`.execute(db);
    await sql`DROP TRIGGER IF EXISTS chk_xp_ledger_surface_update`.execute(db);
    await sql`DROP TRIGGER IF EXISTS chk_xp_ledger_surface_insert`.execute(db);
  },
};
