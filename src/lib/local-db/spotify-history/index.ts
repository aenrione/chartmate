import {normalizeStrForMatching} from '../normalize';
import {getLocalDb} from '../client';

const MAX_VARIABLE_NUMBER = 32766;
// 6 columns in the main insert: artist, artist_normalized, name, name_normalized, play_count, last_played, ms_played = 7
const BATCH_SIZE = Math.floor(MAX_VARIABLE_NUMBER / 7);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One entry from a Spotify Streaming_History_Audio_*.json file */
export type StreamingHistoryEntry = {
  /** ISO timestamp of when the track was played, e.g. "2023-10-01T12:00:00Z" */
  ts: string;
  master_metadata_track_name: string | null;
  master_metadata_album_artist_name: string | null;
  ms_played: number;
};

/** Aggregated play data for a single (artist, track) pair */
type AggregatedPlay = {
  artist: string;
  name: string;
  playCount: number;
  msPlayed: number;
  lastPlayed: string; // ISO timestamp of most recent play
};

// ---------------------------------------------------------------------------
// Phase 1 – JSON history import
// ---------------------------------------------------------------------------

/**
 * Parse raw JSON entries from Streaming_History_Audio_*.json and aggregate
 * them into (artist, track, playCount, msPlayed, lastPlayed) records.
 * Entries with null artist or track name are skipped.
 */
export function parseStreamingHistoryJson(
  entries: StreamingHistoryEntry[],
): AggregatedPlay[] {
  const map = new Map<string, AggregatedPlay>();

  for (const entry of entries) {
    const artist = entry.master_metadata_album_artist_name?.trim();
    const name = entry.master_metadata_track_name?.trim();
    if (!artist || !name) continue;

    const key = `${artist.toLowerCase()}|${name.toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.playCount += 1;
      existing.msPlayed += entry.ms_played ?? 0;
      if (entry.ts > existing.lastPlayed) {
        existing.lastPlayed = entry.ts;
      }
    } else {
      map.set(key, {
        artist,
        name,
        playCount: 1,
        msPlayed: entry.ms_played ?? 0,
        lastPlayed: entry.ts,
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Check whether a JSON file has already been imported (idempotency guard).
 * Matches on filename + file size.
 */
export async function isHistoryFileAlreadyImported(
  filename: string,
  fileSize: number,
): Promise<boolean> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('spotify_history_imports')
    .select('id')
    .where('filename', '=', filename)
    .where('file_size', '=', fileSize)
    .executeTakeFirst();
  return row != null;
}

/**
 * Bulk-import aggregated plays from JSON history files.
 * Upserts into spotify_history (incrementing play_count, summing ms_played,
 * keeping the latest last_played), then records the file as imported.
 */
export async function importHistoryFromJson(
  aggregated: AggregatedPlay[],
  importedFilename: string,
  fileSize: number,
): Promise<void> {
  const db = await getLocalDb();

  await db.transaction().execute(async trx => {
    // Upsert in batches
    for (let i = 0; i < aggregated.length; i += BATCH_SIZE) {
      const batch = aggregated.slice(i, i + BATCH_SIZE);
      const rows = batch.map(p => ({
        artist: p.artist,
        artist_normalized: normalizeStrForMatching(p.artist),
        name: p.name,
        name_normalized: normalizeStrForMatching(p.name),
        play_count: p.playCount,
        ms_played: p.msPlayed,
        last_played: p.lastPlayed,
      }));

      await trx
        .insertInto('spotify_history')
        .values(rows)
        .onConflict(oc =>
          oc.columns(['artist', 'name']).doUpdateSet(eb => ({
            play_count: eb.fn.coalesce(
              // @ts-ignore — Kysely raw SQL in doUpdateSet
              eb.raw('spotify_history.play_count + excluded.play_count'),
              eb.ref('excluded.play_count'),
            ),
            ms_played: eb.fn.coalesce(
              // @ts-ignore
              eb.raw('spotify_history.ms_played + excluded.ms_played'),
              eb.ref('excluded.ms_played'),
            ),
            last_played: eb.fn.coalesce(
              // @ts-ignore — keep the more-recent of the two timestamps
              eb.raw(
                "CASE WHEN spotify_history.last_played > excluded.last_played THEN spotify_history.last_played ELSE excluded.last_played END",
              ),
              eb.ref('excluded.last_played'),
            ),
          })),
        )
        .execute();
    }

    // Mark file as imported
    await trx
      .insertInto('spotify_history_imports')
      .values({
        filename: importedFilename,
        file_size: fileSize,
        imported_at: new Date().toISOString(),
      })
      .execute();
  });
}

// ---------------------------------------------------------------------------
// Phase 2 – Spotify API recently-played upsert
// ---------------------------------------------------------------------------

export type RecentlyPlayedItem = {
  trackName: string;
  artistName: string;
  playedAt: string; // ISO timestamp
};

/**
 * Upsert recently-played items fetched from the Spotify API into
 * spotify_history. Increments play_count by 1 per new item, updates
 * last_played if the new played_at is more recent.
 */
export async function upsertRecentlyPlayed(
  items: RecentlyPlayedItem[],
): Promise<void> {
  if (items.length === 0) return;
  const db = await getLocalDb();

  // Aggregate items: if the same track appears multiple times in the batch,
  // merge them before upserting.
  const batchMap = new Map<string, AggregatedPlay>();
  for (const item of items) {
    const artist = item.artistName.trim();
    const name = item.trackName.trim();
    if (!artist || !name) continue;
    const key = `${artist.toLowerCase()}|${name.toLowerCase()}`;
    const existing = batchMap.get(key);
    if (existing) {
      existing.playCount += 1;
      if (item.playedAt > existing.lastPlayed) {
        existing.lastPlayed = item.playedAt;
      }
    } else {
      batchMap.set(key, {
        artist,
        name,
        playCount: 1,
        msPlayed: 0,
        lastPlayed: item.playedAt,
      });
    }
  }

  const rows = Array.from(batchMap.values()).map(p => ({
    artist: p.artist,
    artist_normalized: normalizeStrForMatching(p.artist),
    name: p.name,
    name_normalized: normalizeStrForMatching(p.name),
    play_count: p.playCount,
    ms_played: 0,
    last_played: p.lastPlayed,
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db
      .insertInto('spotify_history')
      .values(batch)
      .onConflict(oc =>
        oc.columns(['artist', 'name']).doUpdateSet(eb => ({
          play_count: eb.fn.coalesce(
            // @ts-ignore
            eb.raw('spotify_history.play_count + excluded.play_count'),
            eb.ref('excluded.play_count'),
          ),
          last_played: eb.fn.coalesce(
            // @ts-ignore
            eb.raw(
              "CASE WHEN spotify_history.last_played > excluded.last_played THEN spotify_history.last_played ELSE excluded.last_played END",
            ),
            eb.ref('excluded.last_played'),
          ),
        })),
      )
      .execute();
  }
}

// ---------------------------------------------------------------------------
// Shared queries
// ---------------------------------------------------------------------------

export async function hasSpotifyHistory(): Promise<boolean> {
  const db = await getLocalDb();
  const result = await db
    .selectFrom('spotify_history')
    .select(db.fn.countAll().as('count'))
    .executeTakeFirst();
  return Number(result?.count ?? 0) > 0;
}
