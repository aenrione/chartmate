import {useState, useEffect, useCallback} from 'react';
import {
  getUserStats,
  getPositionStats,
  getFretboardSessions,
  getBestSession,
  type UserStats,
  type PositionStats,
  type FretboardSession,
  type DrillType,
} from '@/lib/local-db/fretboard';
import type {PositionWeight} from '../drills/types';

export function useProgress() {
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const stats = await getUserStats();
      setUserStats(stats);
    } catch (error) {
      console.error('Failed to load user stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {userStats, loading, refresh};
}

export function usePositionStats(drillType?: DrillType) {
  const [stats, setStats] = useState<PositionStats[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPositionStats(drillType);
      setStats(data);
    } catch (error) {
      console.error('Failed to load position stats:', error);
    } finally {
      setLoading(false);
    }
  }, [drillType]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {stats, loading, refresh};
}

export function useDrillHistory(drillType?: DrillType, limit = 20) {
  const [sessions, setSessions] = useState<FretboardSession[]>([]);
  const [bestSession, setBestSession] = useState<FretboardSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [history, best] = await Promise.all([
        getFretboardSessions(drillType, limit),
        drillType ? getBestSession(drillType) : Promise.resolve(null),
      ]);
      setSessions(history);
      setBestSession(best);
    } catch (error) {
      console.error('Failed to load drill history:', error);
    } finally {
      setLoading(false);
    }
  }, [drillType, limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {sessions, bestSession, loading, refresh};
}

// ── Spaced Repetition Weights ────────────────────────────────────────────────

export function computeWeights(stats: PositionStats[]): PositionWeight[] {
  if (stats.length === 0) return [];

  return stats.map(s => ({
    string: s.stringIndex,
    fret: s.fret,
    // Inverse accuracy weighting: lower accuracy = higher weight
    // +0.1 prevents division by zero, clamp to reasonable range
    weight: Math.min(10, 1 / (s.accuracy + 0.1)),
  }));
}
