/**
 * Generates .chart file text for a drum fill pattern.
 * Output format matches what parseChartFile from @eliwhite/scan-chart expects.
 *
 * Drum note types (Clone Hero / scan-chart format):
 *   0 = kick
 *   1 = snare (red)
 *   2 = hi-hat / yellow cymbal
 *   3 = blue tom
 *   4 = green / floor tom
 *   5 = crash
 */

const RESOLUTION = 192;        // ticks per beat (quarter note)
const TICKS_PER_MEASURE = 768; // 4/4 at 192 PPQ  (192 × 4)
const TEMPO_BPM = 120;
const TEMPO_MILLIBEATS = TEMPO_BPM * 1000; // 120000  (.chart uses mBPM, not µs/beat)

/** [tick, drumType] — simultaneous notes share the same tick value */
export type NoteEntry = [tick: number, drum: number];

/**
 * Convert a fill pattern to .chart file text.
 *
 * @param notes         Array of [tick, drumType] pairs at 192 PPQ
 * @param lengthMeasures Number of 4/4 measures the fill occupies (1, 2, or 4)
 */
export function generateFillChartText(
  notes: NoteEntry[],
  lengthMeasures: number,
): string {
  const totalTicks = lengthMeasures * TICKS_PER_MEASURE;

  const lines: string[] = [];

  // ── [Song] ──────────────────────────────────────────────────────────────────
  lines.push('[Song]');
  lines.push('{');
  lines.push(`  Resolution = ${RESOLUTION}`);
  lines.push('}');
  lines.push('');

  // ── [SyncTrack] ─────────────────────────────────────────────────────────────
  lines.push('[SyncTrack]');
  lines.push('{');
  lines.push(`  0 = TS 4 2`);            // 4/4 time (denominator log₂: log2(4)=2)
  lines.push(`  0 = B ${TEMPO_MILLIBEATS}`);
  lines.push('}');
  lines.push('');

  // ── [ExpertDrums] ───────────────────────────────────────────────────────────
  lines.push('[ExpertDrums]');
  lines.push('{');

  for (const [tick, drum] of notes) {
    lines.push(`  ${tick} = N ${drum} 0`);
  }

  // Add a silent sustain marker at totalTicks so the chart length is correct.
  // Using a kick (type 0) at a tick that won't conflict with real notes ensures
  // scan-chart sees the full length even when the last note lands before the end.
  const lastNoteTick = notes.length > 0 ? Math.max(...notes.map(([t]) => t)) : 0;
  if (lastNoteTick < totalTicks) {
    lines.push(`  ${totalTicks} = N 0 0`);
  }

  lines.push('}');
  return lines.join('\n');
}
