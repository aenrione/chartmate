/**
 * Utilities for computing seek positions when clicking beats during playback.
 *
 * AlphaTab sets `beat.absolutePlaybackStart` lazily — only after the playback cursor
 * has passed through that beat. For beats in bars the cursor hasn't reached yet the
 * value is 0. `computeSeekTick` falls back to a proportional bar-index estimate so
 * seeking always works, even before MIDI generation has caught up.
 */

interface BeatLike {
  absolutePlaybackStart: number;
  voice?: {
    bar?: {
      masterBar?: {index?: number};
    };
  };
}

/**
 * Return the MIDI tick to seek to for a given beat.
 * Uses `beat.absolutePlaybackStart` when valid (> 0).
 * Falls back to a bar-proportional estimate when the beat hasn't been
 * MIDI-processed yet (`absolutePlaybackStart === 0` for a non-first bar).
 */
export function computeSeekTick(
  beat: BeatLike,
  totalBars: number,
  endTick: number,
): number {
  if (beat.absolutePlaybackStart > 0) return beat.absolutePlaybackStart;

  const barIdx = beat.voice?.bar?.masterBar?.index ?? 0;
  if (barIdx > 0 && totalBars > 1 && endTick > 0) {
    return Math.round((barIdx / totalBars) * endTick);
  }

  return 0;
}

/**
 * Convert a MIDI tick position to seconds using the total tick/time mapping
 * obtained from AlphaTab's `playerPositionChanged` event.
 */
export function tickToSeconds(tick: number, endTick: number, endTimeMs: number): number {
  if (tick <= 0 || endTick <= 0 || endTimeMs <= 0) return 0;
  return (tick / endTick) * (endTimeMs / 1000);
}

interface ScoreLike {
  tracks: Array<{
    staves: Array<{
      bars: Array<{
        voices: Array<{
          beats: Array<{absolutePlaybackStart: number}>;
        }>;
      }>;
    }>;
  }>;
  masterBars: Array<unknown>;
}

/**
 * Return the MIDI start tick for a bar index.
 * Uses the first beat's absolutePlaybackStart when valid, otherwise a proportional estimate.
 * Returns endTick when barIndex >= totalBars (for range end computations).
 */
export function barIndexToTick(
  score: ScoreLike,
  barIndex: number,
  totalBars: number,
  endTick: number,
): number {
  if (barIndex >= totalBars) return endTick;
  const firstBeat = score.tracks[0]?.staves[0]?.bars[barIndex]?.voices[0]?.beats[0];
  if (firstBeat && firstBeat.absolutePlaybackStart > 0) {
    return firstBeat.absolutePlaybackStart;
  }
  if (totalBars > 1 && endTick > 0) {
    return Math.round((barIndex / totalBars) * endTick);
  }
  return 0;
}
