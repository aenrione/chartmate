// src/pages/guitar/ear/hooks/useRecommendation.ts
import {useState, useEffect} from 'react';
import {getEarItemStats} from '@/lib/local-db/ear-training';
import {getPositionStats} from '@/lib/local-db/fretboard';
import type {EarItemStats} from '@/lib/local-db/ear-training';
import type {PositionStats} from '@/lib/local-db/fretboard';

export interface Recommendation {
  tool: 'eariq' | 'fretboardiq';
  exerciseType: string;
  item: string;
  accuracy: number;
  reason: string;
}

// Strategy v1: lowest accuracy across both tools
function accuracyBasedRecommend(
  earStats: EarItemStats[],
  fretStats: PositionStats[],
): Recommendation[] {
  const earRecs: Recommendation[] = earStats
    .filter(s => s.totalAttempts >= 3)
    .map(s => ({
      tool: 'eariq' as const,
      exerciseType: s.exerciseType,
      item: s.promptItem,
      accuracy: s.accuracy,
      reason: `${Math.round(s.accuracy * 100)}% accuracy`,
    }));

  const fretRecs: Recommendation[] = fretStats
    .filter(s => s.totalAttempts >= 3)
    .map(s => ({
      tool: 'fretboardiq' as const,
      exerciseType: s.drillType,
      item: `${s.drillType} — string ${s.stringIndex + 1}, fret ${s.fret}`,
      accuracy: s.accuracy,
      reason: `${Math.round(s.accuracy * 100)}% accuracy on fret ${s.fret}`,
    }));

  return [...earRecs, ...fretRecs]
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);
}

export function useRecommendation() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getEarItemStats(),
      getPositionStats(),
    ]).then(([earStats, fretStats]) => {
      if (cancelled) return;
      setRecommendations(accuracyBasedRecommend(earStats, fretStats));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return {recommendations, loading};
}
