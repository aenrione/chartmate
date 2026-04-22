import {sql} from 'kysely';
import {getLocalDb} from './client';

export type SyncMetaKeys = {
  device_id?: string;
  last_pushed_at?: string;
  last_pulled_at?: string;
  sync_base_hash?: string;
  sync_remote_etag?: string;
};

export type DbExport = {
  schema_version: number;
  exported_at: string;
  full_sync: boolean;
  tables: Record<string, unknown[]>;
};

// Tier 1: always-sync user data (22 tables, sync_meta excluded — managed separately)
const TIER1_TABLES = [
  'saved_charts',
  'setlists',
  'setlist_items',
  'practice_sessions',
  'song_sections',
  'section_progress',
  'song_annotations',
  'tab_compositions',
  'youtube_associations',
  'fretboard_sessions',
  'fretboard_attempts',
  'ear_sessions',
  'ear_attempts',
  'fill_practice_sessions',
  'pdf_library',
  'chart_pdfs',
  'explorer_saves',
  'repertoire_collections',
  'repertoire_items',
  'repertoire_reviews',
  'spotify_history',
  'spotify_history_imports',
] as const;

// Tier 2: large Chorus tables — only when fullSync is true (~5 MB gzipped)
const TIER2_TABLES = [
  'chorus_charts',
  'chorus_metadata',
  'chorus_scan_sessions',
] as const;

// Import in dependency order (parents before children)
const IMPORT_ORDER: string[] = [
  'saved_charts',
  'setlists',
  'tab_compositions',
  'song_sections',
  'pdf_library',
  'fretboard_sessions',
  'ear_sessions',
  'repertoire_collections',
  'explorer_saves',
  'youtube_associations',
  'fill_practice_sessions',
  'spotify_history',
  'spotify_history_imports',
  // children:
  'setlist_items',
  'practice_sessions',
  'song_annotations',
  'section_progress',
  'chart_pdfs',
  'fretboard_attempts',
  'ear_attempts',
  'repertoire_items',
  'repertoire_reviews',
  // tier 2 (appended at end — standalone, no FK deps on user tables):
  'chorus_charts',
  'chorus_metadata',
  'chorus_scan_sessions',
];

const CHUNK_SIZE = 100;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Tauri SQL returns SQLite BLOBs as number[] — convert to base64 for JSON transport
function numberArrayToBase64(raw: number[] | Uint8Array): string {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

// Decode base64 back to Uint8Array for re-insertion as SQLite BLOB
function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function exportUserTables(
  opts: {fullSync?: boolean} = {},
): Promise<{json: string; hash: string}> {
  const db = await getLocalDb();
  const tables: Record<string, unknown[]> = {};

  const tablesToExport: string[] = opts.fullSync
    ? [...TIER1_TABLES, ...TIER2_TABLES]
    : [...TIER1_TABLES];

  for (const table of tablesToExport) {
    const rows = await (db.selectFrom(table as any).selectAll().execute()) as Record<
      string,
      unknown
    >[];

    if (table === 'tab_compositions') {
      tables[table] = rows.map(row => ({
        ...row,
        score_data:
          row.score_data != null
            ? numberArrayToBase64(row.score_data as number[])
            : null,
      }));
    } else {
      tables[table] = rows;
    }
  }

  const exportObj: DbExport = {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    full_sync: opts.fullSync ?? false,
    tables,
  };

  const json = JSON.stringify(exportObj);
  const hash = await sha256hex(json);
  return {json, hash};
}

export async function importUserTables(json: string): Promise<void> {
  const exportObj: DbExport = JSON.parse(json);
  const {tables} = exportObj;

  const db = await getLocalDb();

  await sql`PRAGMA foreign_keys = OFF`.execute(db);
  try {
    await db.transaction().execute(async trx => {
      // Delete in reverse dependency order so no FK violations if they were enabled
      const toDelete = IMPORT_ORDER.filter(t => t in tables).reverse();
      for (const table of toDelete) {
        await (trx.deleteFrom(table as any).execute());
      }

      // Insert in dependency order
      const toInsert = IMPORT_ORDER.filter(t => t in tables);
      for (const table of toInsert) {
        const rows = tables[table] as Record<string, unknown>[];
        if (!rows?.length) continue;

        const processedRows =
          table === 'tab_compositions'
            ? rows.map(row => ({
                ...row,
                score_data:
                  row.score_data != null
                    ? base64ToUint8Array(row.score_data as string)
                    : null,
              }))
            : rows;

        for (const batch of chunk(processedRows, CHUNK_SIZE)) {
          await (trx.insertInto(table as any).values(batch as any).execute());
        }
      }
    });
  } finally {
    await sql`PRAGMA foreign_keys = ON`.execute(db);
  }
}

// ─── sync_meta helpers ────────────────────────────────────────────────────────

export async function getOrCreateDeviceId(): Promise<string> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('sync_meta')
    .selectAll()
    .where('key', '=', 'device_id')
    .executeTakeFirst();
  if (row) return row.value;
  const id = crypto.randomUUID();
  await db.insertInto('sync_meta').values({key: 'device_id', value: id}).execute();
  return id;
}

export async function getSyncMeta(): Promise<SyncMetaKeys> {
  const db = await getLocalDb();
  const rows = await db.selectFrom('sync_meta').selectAll().execute();
  const meta: SyncMetaKeys = {};
  for (const row of rows) {
    (meta as Record<string, string>)[row.key] = row.value;
  }
  return meta;
}

export async function updateSyncMeta(patch: SyncMetaKeys): Promise<void> {
  const db = await getLocalDb();
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) continue;
    await db
      .insertInto('sync_meta')
      .values({key, value})
      .onConflict(oc => oc.column('key').doUpdateSet({value}))
      .execute();
  }
}
