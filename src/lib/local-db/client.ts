import {Kysely, Migrator, ParseJSONResultsPlugin} from 'kysely';
import type {DB} from './types';
import {TauriSqliteDialect} from './tauri-sql-dialect';

let localDb: Kysely<DB> | null = null;
let dbInitializationPromise: Promise<Kysely<DB>> | null = null;

export async function getLocalDb(): Promise<Kysely<DB>> {
  if (localDb) return localDb;
  if (dbInitializationPromise) return dbInitializationPromise;
  dbInitializationPromise = initializeDatabase();
  return dbInitializationPromise;
}

async function initializeDatabase(): Promise<Kysely<DB>> {
  try {
    const dialect = new TauriSqliteDialect('sqlite:chartmate.db');
    const db = new Kysely<DB>({
      dialect,
      plugins: [new ParseJSONResultsPlugin()],
    });

    const migrator = new Migrator({
      db,
      provider: {
        async getMigrations() {
          const {migrations} = await import('./migrations/');
          return migrations;
        },
      },
    });

    const {error, results} = await migrator.migrateToLatest();
    if (error) throw error;
    console.log('Migrations completed:', results);

    localDb = db;
    return localDb;
  } catch (error) {
    dbInitializationPromise = null;
    throw error;
  }
}

export async function checkLocalDbHealth(): Promise<boolean> {
  try {
    const db = await getLocalDb();
    await db.selectFrom('spotify_playlists').select('id').limit(1).execute();
    return true;
  } catch {
    return false;
  }
}
