/**
 * Phase 2: Ongoing sync of recently-played tracks via the Spotify Web API.
 *
 * On each app launch (when Spotify auth is available) this calls
 * GET /me/player/recently-played with an `after` cursor so we only fetch
 * plays that happened since the last sync.  Results are upserted into the
 * local `spotify_history` table and the cursor is persisted so subsequent
 * syncs are incremental.
 */

import {getSpotifySdk} from './ClientInstance';
import {storeGet, storeSet, STORE_KEYS} from '@/lib/store';
import {upsertRecentlyPlayed, type RecentlyPlayedItem} from '@/lib/local-db/spotify-history';

/**
 * Fetch all recently-played tracks from the Spotify API since the last sync
 * and upsert them into `spotify_history`.
 *
 * Returns the number of new items synced, or null if Spotify is not
 * authenticated.
 */
export async function syncRecentlyPlayed(): Promise<number | null> {
  const sdk = await getSpotifySdk();
  if (sdk == null) {
    console.log('[SpotifyHistorySync] Spotify SDK not available – skipping sync');
    return null;
  }

  // Retrieve the cursor from the last successful sync
  const lastSyncedAt = await storeGet<string>(STORE_KEYS.SPOTIFY_HISTORY_LAST_SYNCED_AT);

  // Convert ISO timestamp → Unix ms for the `after` query param
  const afterMs = lastSyncedAt ? new Date(lastSyncedAt).getTime() : undefined;

  let items: RecentlyPlayedItem[] = [];
  let newestPlayedAt: string | null = null;

  try {
    // The SDK typings expose `player.getRecentlyPlayedTracks`
    // Signature: getRecentlyPlayedTracks(limit?, options?)
    // We pass `after` as a Unix timestamp in milliseconds.
    const response = await (sdk.player as any).getRecentlyPlayedTracks(
      50,
      afterMs != null ? {after: afterMs} : undefined,
    );

    const rawItems: Array<{
      track: {
        name: string;
        artists: Array<{name: string}>;
      };
      played_at: string;
    }> = response?.items ?? [];

    for (const item of rawItems) {
      const trackName = item.track?.name?.trim();
      const artistName = item.track?.artists?.[0]?.name?.trim();
      if (!trackName || !artistName) continue;

      items.push({
        trackName,
        artistName,
        playedAt: item.played_at,
      });

      if (newestPlayedAt == null || item.played_at > newestPlayedAt) {
        newestPlayedAt = item.played_at;
      }
    }
  } catch (err) {
    console.warn('[SpotifyHistorySync] Failed to fetch recently-played tracks:', err);
    return null;
  }

  if (items.length === 0) {
    console.log('[SpotifyHistorySync] No new plays since last sync');
    return 0;
  }

  await upsertRecentlyPlayed(items);

  // Persist the newest played_at so the next sync only fetches what's new.
  // We advance by 1 ms to avoid re-fetching the exact boundary item.
  if (newestPlayedAt != null) {
    const advancedMs = new Date(newestPlayedAt).getTime() + 1;
    await storeSet(STORE_KEYS.SPOTIFY_HISTORY_LAST_SYNCED_AT, new Date(advancedMs).toISOString());
  }

  console.log(`[SpotifyHistorySync] Synced ${items.length} recently-played items`);
  return items.length;
}
