/**
 * Per-instrument level math. Pure — no DB access.
 *
 * The level curve is `cumXpAtLevelEnd(n) = 50 * n * (n + 1)`:
 *   level 1 ends at  100 cum XP
 *   level 2 ends at  300
 *   level 3 ends at  600
 *   level 4 ends at 1000
 *   level 5 ends at 1500
 */

/**
 * Tunes the level curve. With coefficient 50:
 *   level 1 ends at 100 XP, 2 → 300, 3 → 600, 4 → 1000, 5 → 1500, …
 * Larger coefficient ⇒ longer levels.
 */
const LEVEL_CURVE_COEFFICIENT = 50;

/**
 * Cumulative XP at which `level` is finished (i.e. the threshold to reach `level + 1`).
 * `cumXpAtLevelEnd(0) = 0` so level 1 starts at 0 XP.
 */
export function cumXpAtLevelEnd(level: number): number {
  if (level <= 0) return 0;
  return LEVEL_CURVE_COEFFICIENT * level * (level + 1);
}

/** The level a user is at given their cumulative XP. Always >= 1. */
export function levelFromCumXp(cumXp: number): number {
  if (cumXp <= 0) return 1;
  let level = 1;
  while (cumXpAtLevelEnd(level) <= cumXp) {
    level += 1;
  }
  return level;
}

/** XP earned within the current level (0..xpToNextLevel). */
export function xpIntoLevel(cumXp: number): number {
  const level = levelFromCumXp(cumXp);
  return cumXp - cumXpAtLevelEnd(level - 1);
}

/** XP remaining to advance to the next level. */
export function xpToNextLevel(cumXp: number): number {
  const level = levelFromCumXp(cumXp);
  return cumXpAtLevelEnd(level) - cumXp;
}

export interface LevelState {
  cum_xp: number;
  level: number;
  xp_into_level: number;
  xp_to_next: number;
}

export interface LevelDelta extends LevelState {
  leveledUp: boolean;
  newLevel?: number;
  prevLevel: number;
}

/**
 * Apply a positive XP gain to an existing level state. Pure — used by the engine to compute the
 * new state and the celebration trigger in one shot. `gainedXp` of 0 is a no-op (no level change).
 */
export function applyXpToLevels(prev: { cum_xp: number; level: number }, gainedXp: number): LevelDelta {
  const safeGain = Math.max(0, Math.floor(gainedXp));
  const newCumXp = prev.cum_xp + safeGain;
  const newLevel = levelFromCumXp(newCumXp);
  const leveledUp = newLevel > prev.level;
  return {
    cum_xp: newCumXp,
    level: newLevel,
    xp_into_level: xpIntoLevel(newCumXp),
    xp_to_next: xpToNextLevel(newCumXp),
    leveledUp,
    newLevel: leveledUp ? newLevel : undefined,
    prevLevel: prev.level,
  };
}
