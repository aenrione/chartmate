import type {FretPosition} from '../lib/musicTheory';
import type {PositionWeight} from './types';

let questionCounter = 0;

export function nextQuestionId(): string {
  return `q_${Date.now()}_${++questionCounter}`;
}

export function buildFretPositionPool(
  stringRange: [number, number],
  fretRange: [number, number],
): FretPosition[] {
  const positions: FretPosition[] = [];
  for (let s = stringRange[0]; s <= stringRange[1]; s++) {
    for (let f = fretRange[0]; f <= fretRange[1]; f++) {
      positions.push({string: s, fret: f});
    }
  }
  return positions;
}

export function pickWeightedPosition(
  pool: FretPosition[],
  weights?: PositionWeight[],
): FretPosition {
  if (!weights || weights.length === 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const weightMap = new Map<string, number>();
  for (const w of weights) {
    weightMap.set(`${w.string},${w.fret}`, w.weight);
  }

  const weighted = pool.map(pos => ({
    pos,
    weight: weightMap.get(`${pos.string},${pos.fret}`) ?? 1,
  }));

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let random = Math.random() * totalWeight;

  for (const {pos, weight} of weighted) {
    random -= weight;
    if (random <= 0) return pos;
  }

  return pool[pool.length - 1];
}

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickRandomExcluding<T>(arr: readonly T[], exclude: T): T {
  const filtered = arr.filter(x => x !== exclude);
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
