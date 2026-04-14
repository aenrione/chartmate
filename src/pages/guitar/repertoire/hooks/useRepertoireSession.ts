import {useState, useCallback, useRef} from 'react';
import {RepertoireItem, recordReview} from '@/lib/local-db/repertoire';
import {ReviewQuality} from '@/lib/repertoire/sm2';

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

export function useRepertoireSession(items: RepertoireItem[]): UseRepertoireSessionReturn {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('showing_front');
  const [results, setResults] = useState<SessionResult[]>([]);
  const itemStartRef = useRef<number>(Date.now());
  const sessionStartRef = useRef<number>(Date.now());

  const currentItem = index < items.length ? items[index] : null;

  const showAssessment = useCallback(() => {
    setPhase('showing_back');
  }, []);

  const rateItem = useCallback(
    async (quality: ReviewQuality) => {
      if (!currentItem) return;
      const durationMs = Date.now() - itemStartRef.current;

      await recordReview(currentItem.id, quality, durationMs);

      setResults(prev => [...prev, {item: currentItem, quality}]);

      const nextIndex = index + 1;
      if (nextIndex >= items.length) {
        setPhase('completed');
      } else {
        setIndex(nextIndex);
        setPhase('showing_front');
        itemStartRef.current = Date.now();
      }
    },
    [currentItem, index, items.length],
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
