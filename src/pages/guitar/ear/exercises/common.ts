// src/pages/guitar/ear/exercises/common.ts
import type {ItemWeight} from './types';

let questionCounter = 0;

export function nextQuestionId(): string {
  return `eq_${Date.now()}_${++questionCounter}`;
}

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickRandomExcluding<T>(arr: readonly T[], exclude: T): T {
  const filtered = arr.filter(x => x !== exclude);
  return pickRandom(filtered);
}

export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickWeightedItem(items: string[], weights: ItemWeight[]): string {
  if (weights.length === 0) return pickRandom(items);
  const weightMap = new Map(weights.map(w => [w.item, w.weight]));
  const weighted = items.map(item => ({item, weight: weightMap.get(item) ?? 1}));
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let r = Math.random() * total;
  for (const {item, weight} of weighted) {
    r -= weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

export function computeItemWeights(
  stats: Array<{promptItem: string; accuracy: number; totalAttempts: number}>,
  allItems: string[],
): ItemWeight[] {
  const statsMap = new Map(stats.map(s => [s.promptItem, s]));
  return allItems.map(item => {
    const s = statsMap.get(item);
    if (!s || s.totalAttempts === 0) return {item, weight: 2}; // unexplored
    if (s.accuracy < 0.4) return {item, weight: 3};
    return {item, weight: 1 / Math.max(s.accuracy, 0.01)};
  });
}

export function resolveDirection(direction: 'ascending' | 'descending' | 'both'): 'ascending' | 'descending' {
  if (direction === 'both') return Math.random() < 0.5 ? 'ascending' : 'descending';
  return direction;
}
