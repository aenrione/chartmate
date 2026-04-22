import {useEffect, useState} from 'react';
import {getLocalDb} from '@/lib/local-db/client';
import {normalizeStrForMatching} from '@/lib/local-db/normalize';

export type HistoryEntry = {
  playCount: number;
  lastPlayed: string | null;
  totalMsPlayed: number | null;
};

export type SpotifyHistoryMap = Map<string, HistoryEntry>;

function makeKey(artist: string, name: string): string {
  return normalizeStrForMatching(artist) + '::' + normalizeStrForMatching(name);
}

export function useSpotifyHistory(): SpotifyHistoryMap {
  const [map, setMap] = useState<SpotifyHistoryMap>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const db = await getLocalDb();
        const rows = await db
          .selectFrom('spotify_history')
          .select([
            'artist',
            'name',
            'play_count',
          ])
          .execute();

        if (cancelled) return;

        const result: SpotifyHistoryMap = new Map();
        for (const row of rows) {
          const key = makeKey(row.artist, row.name);
          const existing = result.get(key);
          const playCount = Number(row.play_count) || 0;

          if (!existing || playCount > existing.playCount) {
            result.set(key, {
              playCount,
              lastPlayed: (row as any).last_played ?? null,
              totalMsPlayed: (row as any).total_ms_played ?? null,
            });
          }
        }
        setMap(result);
      } catch {
        // Migration not run yet or table missing — silently degrade
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return map;
}

export {makeKey as makeHistoryKey};
