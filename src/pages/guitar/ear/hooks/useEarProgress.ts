// src/pages/guitar/ear/hooks/useEarProgress.ts
import {useState, useEffect, useCallback} from 'react';
import {getEarItemStats, getEarUserStats, getBestEarSession} from '@/lib/local-db/ear-training';
import type {EarItemStats, EarUserStats, EarExerciseType} from '@/lib/local-db/ear-training';
import {computeItemWeights} from '../exercises/common';
import type {ItemWeight} from '../exercises/types';

export function useEarProgress(exerciseType?: EarExerciseType) {
  const [itemStats, setItemStats] = useState<EarItemStats[]>([]);
  const [userStats, setUserStats] = useState<EarUserStats | null>(null);
  const [weights, setWeights] = useState<ItemWeight[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getEarItemStats(exerciseType),
      getEarUserStats(),
    ]).then(([stats, uStats]) => {
      if (cancelled) return;
      setItemStats(stats);
      setUserStats(uStats);
      const allItems = stats.map(s => s.promptItem);
      setWeights(computeItemWeights(stats, allItems));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [exerciseType, version]);

  return {itemStats, userStats, weights, loading, refresh};
}

export function useBestSession(exerciseType: EarExerciseType) {
  const [best, setBest] = useState<Awaited<ReturnType<typeof getBestEarSession>>>(null);
  useEffect(() => {
    getBestEarSession(exerciseType).then(setBest);
  }, [exerciseType]);
  return best;
}
