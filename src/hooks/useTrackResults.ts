import {useRef, useState, useCallback} from 'react';
import {ChartResponseEncore} from '@/lib/chartSelection';
import {searchEncore, type EncoreResponse} from '@/lib/search-encore';
import {TAB_SOURCES, type TabSearchResult} from '@/lib/tab-sources';
import {normalizeStrForMatching} from '@/lib/local-db/normalize';

type LoadState = 'idle' | 'loading' | 'done' | 'error';

export type ChartResults = {
  state: LoadState;
  charts: ChartResponseEncore[];
  error: string | null;
};

export type TabResults = {
  state: LoadState;
  tabs: TabSearchResult[];
  error: string | null;
};

function normalizeKey(artist: string, name: string): string {
  return normalizeStrForMatching(artist) + '::' + normalizeStrForMatching(name);
}

export function useChartResultsCache() {
  const cache = useRef<Map<string, ChartResults>>(new Map());
  const [, forceUpdate] = useState(0);

  const get = useCallback(
    (artist: string, name: string): ChartResults => {
      const key = normalizeKey(artist, name);
      return (
        cache.current.get(key) ?? {state: 'idle', charts: [], error: null}
      );
    },
    [],
  );

  const trigger = useCallback(async (artist: string, name: string) => {
    const key = normalizeKey(artist, name);
    const existing = cache.current.get(key);
    if (existing && existing.state !== 'idle') return;

    cache.current.set(key, {state: 'loading', charts: [], error: null});
    forceUpdate(n => n + 1);

    try {
      const query = `${artist} ${name}`;
      const response: EncoreResponse = await searchEncore(query, null);
      const charts = response.data.map(chart => ({
        ...chart,
        file: `https://files.enchor.us/${chart.md5}.sng`,
      }));
      cache.current.set(key, {state: 'done', charts, error: null});
    } catch (err) {
      cache.current.set(key, {
        state: 'error',
        charts: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }

    forceUpdate(n => n + 1);
  }, []);

  return {get, trigger};
}

export function useTabResultsCache() {
  const cache = useRef<Map<string, TabResults>>(new Map());
  const [, forceUpdate] = useState(0);

  const get = useCallback(
    (artist: string, name: string): TabResults => {
      const key = normalizeKey(artist, name);
      return (
        cache.current.get(key) ?? {state: 'idle', tabs: [], error: null}
      );
    },
    [],
  );

  const trigger = useCallback(async (artist: string, name: string) => {
    const key = normalizeKey(artist, name);
    const existing = cache.current.get(key);
    if (existing && existing.state !== 'idle') return;

    cache.current.set(key, {state: 'loading', tabs: [], error: null});
    forceUpdate(n => n + 1);

    try {
      const query = `${artist} ${name}`;
      const settled = await Promise.allSettled(
        TAB_SOURCES.map(source => source.search(query)),
      );
      const tabs: TabSearchResult[] = [];
      const errors: string[] = [];
      settled.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled') {
          tabs.push(...outcome.value);
        } else {
          const reason = outcome.reason;
          const msg =
            reason instanceof Error
              ? reason.message
              : typeof reason === 'string'
                ? reason
                : JSON.stringify(reason);
          errors.push(`${TAB_SOURCES[i].name}: ${msg}`);
        }
      });
      cache.current.set(key, {
        state: 'done',
        tabs,
        error: errors.length ? errors.join('; ') : null,
      });
    } catch (err) {
      cache.current.set(key, {
        state: 'error',
        tabs: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }

    forceUpdate(n => n + 1);
  }, []);

  return {get, trigger};
}
