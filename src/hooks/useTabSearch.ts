import {useState, useCallback} from 'react';
import {TAB_SOURCES, type TabSource, type TabSearchResult} from '@/lib/tab-sources';

type SearchState = {
  results: TabSearchResult[];
  loading: boolean;
  error: string | null;
};

export function useTabSearch(enabledSources: TabSource[] = TAB_SOURCES) {
  const sourceKey = enabledSources.map(s => s.sourceId).join(',');
  const [state, setState] = useState<SearchState>({
    results: [],
    loading: false,
    error: null,
  });

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setState({results: [], loading: false, error: null});
      return;
    }
    if (enabledSources.length === 0) {
      setState({results: [], loading: false, error: null});
      return;
    }
    setState(s => ({...s, loading: true, error: null}));
    try {
      const settled = await Promise.allSettled(
        enabledSources.map(source => source.search(query)),
      );
      const results: TabSearchResult[] = [];
      const errors: string[] = [];
      settled.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled') {
          results.push(...outcome.value);
        } else {
          const reason = outcome.reason;
          const msg = reason instanceof Error
            ? reason.message
            : typeof reason === 'string'
              ? reason
              : JSON.stringify(reason);
          console.error(`[useTabSearch] ${enabledSources[i].name} failed:`, reason);
          errors.push(`${enabledSources[i].name}: ${msg}`);
        }
      });
      setState({
        results,
        loading: false,
        error: errors.length ? errors.join('; ') : null,
      });
    } catch (err) {
      setState({results: [], loading: false, error: String(err)});
    }
  }, [sourceKey]);

  return {...state, search};
}
