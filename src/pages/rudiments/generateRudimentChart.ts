import {SUBDIVISION_TICKS, type Subdivision} from '@/lib/chart-export/fromRudiment';

/**
 * Dynamically generates .chart file text for a rudiment at a given subdivision.
 * This allows changing the notation (e.g., from 16th notes to quarter notes)
 * so the visual matches the sound.
 */

const RESOLUTION = 192;
const TEMPO_BPM = 120;
// .chart format uses millibeats per minute (mBPM), NOT microseconds per beat
const TEMPO_MILLIBEATS = TEMPO_BPM * 1000; // 120000

// Note type 1 = Red = Snare in drum chart format
const SNARE = 1;

// The subdivision vocabulary lives with the chart exporter, so the practice
// view and the Clone Hero export cannot drift apart.
export type {Subdivision};

/**
 * Generate a .chart file string for a rudiment with a specific note count
 * at the given subdivision.
 *
 * @param noteCount Number of notes in one cycle of the pattern
 * @param subdivision Which note value to use
 * @param repeats How many times to repeat the pattern (default: enough to fill 2+ measures)
 */
export function generateRudimentChartText(
  noteCount: number,
  subdivision: Subdivision,
): string {
  const tickInterval = SUBDIVISION_TICKS[subdivision];
  const ticksPerMeasure = RESOLUTION * 4; // 4/4 time = 768 ticks
  const patternTicks = noteCount * tickInterval;

  // Calculate how many repeats to fill at least 2 measures
  const minTicks = ticksPerMeasure * 2;
  const repeats = Math.max(1, Math.ceil(minTicks / patternTicks));
  const totalNotes = noteCount * repeats;

  const lines: string[] = [];

  lines.push('[Song]');
  lines.push('{');
  lines.push(`  Resolution = ${RESOLUTION}`);
  lines.push('}');
  lines.push('');

  lines.push('[SyncTrack]');
  lines.push('{');
  lines.push(`  0 = TS 4 2`); // 4/4 time (denominator log2: log2(4)=2)
  lines.push(`  0 = B ${TEMPO_MILLIBEATS}`);
  lines.push('}');
  lines.push('');

  lines.push('[ExpertDrums]');
  lines.push('{');

  for (let i = 0; i < totalNotes; i++) {
    const tick = i * tickInterval;
    lines.push(`  ${tick} = N ${SNARE} 0`);
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Get the number of notes in one cycle of a rudiment pattern.
 * Parsed from the sticking string.
 */
export function getPatternNoteCount(sticking: string): number {
  const tokens = sticking.replace(/·/g, '').trim().split(/\s+/);
  return tokens.length;
}
