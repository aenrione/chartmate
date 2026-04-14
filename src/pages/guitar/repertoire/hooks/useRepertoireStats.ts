import {useState, useEffect} from 'react';
import {RepertoireStats, getRepertoireStats, getItemsDueToday} from '@/lib/local-db/repertoire';
import type {RepertoireItem} from '@/lib/local-db/repertoire';

interface UseRepertoireStatsReturn {
  stats: RepertoireStats | null;
  dueItems: RepertoireItem[];
  loading: boolean;
  refresh: () => void;
}

export function useRepertoireStats(): UseRepertoireStatsReturn {
  const [stats, setStats] = useState<RepertoireStats | null>(null);
  const [dueItems, setDueItems] = useState<RepertoireItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getRepertoireStats(), getItemsDueToday()])
      .then(([s, items]) => {
        if (!cancelled) {
          setStats(s);
          setDueItems(items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = () => setTick(t => t + 1);

  return {stats, dueItems, loading, refresh};
}
