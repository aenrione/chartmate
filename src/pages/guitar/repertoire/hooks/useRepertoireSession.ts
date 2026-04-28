import {useState, useCallback, useRef, useEffect} from 'react';
import {RepertoireItem, recordReview} from '@/lib/local-db/repertoire';
import {ReviewQuality} from '@/lib/repertoire/sm2';
import {saveSession, clearSession} from '@/lib/repertoire/session-persistence';
import {recordEventSafely} from '@/lib/progression';

type Phase = 'showing_front' | 'showing_back' | 'completed';

interface SessionResult {
  item: RepertoireItem;
  quality: ReviewQuality;
}

interface UseRepertoireSessionReturn {
  phase: Phase;
  currentItem: RepertoireItem | null;
  currentIndex: number;
  totalItems: number;
  results: SessionResult[];
  sessionStartMs: number;
  showAssessment: () => void;
  rateItem: (quality: ReviewQuality) => Promise<void>;
}

export function useRepertoireSession(
  items: RepertoireItem[],
  initialIndex = 0,
  initialResults: SessionResult[] = [],
  startedAt?: string,
  initialShowingBack = false,
  filter = 'all',
): UseRepertoireSessionReturn {
  const [index, setIndex] = useState(initialIndex);
  const [phase, setPhase] = useState<Phase>('showing_front');
  const [results, setResults] = useState<SessionResult[]>(initialResults);

  // Apply showing_back once items + initial flags are loaded (async init means
  // useState initializer already ran with false before the load completed).
  const phaseInitialized = useRef(false);
  useEffect(() => {
    if (!phaseInitialized.current && items.length > 0) {
      phaseInitialized.current = true;
      if (initialShowingBack) setPhase('showing_back');
    }
  }, [items.length, initialShowingBack]);

  // Refs to avoid stale closures in rateItem
  const itemStartRef = useRef<number>(Date.now());
  const sessionStartRef = useRef<number>(Date.now());
  const startedAtRef = useRef<string>(startedAt ?? new Date().toISOString());
  // Mirror of results as plain pairs — always up-to-date inside callbacks
  const resultPairsRef = useRef(initialResults.map(r => ({itemId: r.item.id, quality: r.quality})));

  const currentItem = index < items.length ? items[index] : null;

  const showAssessment = useCallback(() => {
    setPhase('showing_back');
    saveSession({
      itemIds: items.map(i => i.id),
      currentIndex: index,
      resultPairs: resultPairsRef.current,
      startedAt: startedAtRef.current,
      showingBack: true,
      filter,
    });
  }, [items, index, filter]);

  const rateItem = useCallback(
    async (quality: ReviewQuality) => {
      if (!currentItem) return;
      const durationMs = Date.now() - itemStartRef.current;

      await recordReview(currentItem.id, quality, durationMs);

      await recordEventSafely({
        kind: 'repertoire_review',
        songId: String(currentItem.id),
        quality,
        // We don't currently track tempo per review; quality 5 (perfect recall) stands in.
        atTargetTempo: quality >= 5,
      });

      const nextIndex = index + 1;
      const newPair = {itemId: currentItem.id, quality};
      resultPairsRef.current = [...resultPairsRef.current, newPair];

      setResults(prev => [...prev, {item: currentItem, quality}]);

      if (nextIndex >= items.length) {
        setPhase('completed');
        clearSession();
      } else {
        setIndex(nextIndex);
        setPhase('showing_front');
        itemStartRef.current = Date.now();
        // Persist progress so navigating away doesn't lose the session
        saveSession({
          itemIds: items.map(i => i.id),
          currentIndex: nextIndex,
          resultPairs: resultPairsRef.current,
          startedAt: startedAtRef.current,
          filter,
        });
      }
    },
    [currentItem, index, items, filter],
  );

  return {
    phase,
    currentItem,
    currentIndex: index,
    totalItems: items.length,
    results,
    sessionStartMs: sessionStartRef.current,
    showAssessment,
    rateItem,
  };
}
