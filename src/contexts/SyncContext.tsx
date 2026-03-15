import { createContext, useContext, useEffect, useRef, ReactNode } from 'react';
import { useChorusChartDb, type ChorusChartProgress } from '@/lib/chorusChartDb';

type SyncContextValue = { syncStatus: ChorusChartProgress['status'] };
const SyncContext = createContext<SyncContextValue>({ syncStatus: 'idle' });

export function useSyncStatus() {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [progress, runSync] = useChorusChartDb();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    abortRef.current = abort;
    runSync(abort).catch(err => {
      if (err?.name !== 'AbortError') {
        console.warn('Chart sync failed:', err);
      }
    });
    return () => { abort.abort(); };
  }, []);

  return (
    <SyncContext.Provider value={{ syncStatus: progress.status }}>
      {children}
      {progress.status !== 'idle' && progress.status !== 'complete' && (
        <div className="fixed bottom-4 right-4 bg-muted text-muted-foreground text-sm px-3 py-2 rounded-md shadow">
          Syncing charts… {progress.numFetched} fetched
        </div>
      )}
    </SyncContext.Provider>
  );
}
