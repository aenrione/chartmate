/**
 * The checks Encore actually enforces through scan-chart, run before we write
 * anything, so a bad export is reported here instead of being discovered in
 * Clone Hero.
 *
 * Every threshold and condition below mirrors
 * `node_modules/@eliwhite/scan-chart/dist/index.mjs` rather than the published
 * documentation, which disagrees with it in two places: the leading-silence
 * threshold is 1000 ms there (not 2000), and the no-star-power warning
 * explicitly exempts drums.
 *
 * Sustain rules (MIN_SUSTAIN_GAP_MS = 40, MIN_SUSTAIN_MS = 100) are not
 * checked: every drum note this exporter writes has length 0, so there is no
 * sustain to be too short or too close.
 */

import {PIECE_TO_LANE} from '@/lib/drums/pieces';
import type {ChartDocument, ChartNote} from './types';

/** Two note groups closer than this are a charting mistake, not a flam. */
export const BROKEN_NOTE_MS = 15;
export const MIN_LEADING_SILENCE_MS = 1000;
/**
 * Three or more non-kick lanes at one tick. scan-chart calls this "strongly
 * discouraged" rather than invalid, and it is: a ride, a hi-hat and a snare
 * together is real music that two hands cannot play. Reported as a warning,
 * not an error — several jazz and Afro-Cuban lessons legitimately do it.
 */
export const MAX_SIMULTANEOUS_PADS = 2;

export type ChartIssueSeverity = 'error' | 'warning';

export interface ChartIssue {
  severity: ChartIssueSeverity;
  type:
    | 'brokenNote'
    | 'invalidChord'
    | 'noNotes'
    | 'noSections'
    | 'smallLeadingSilence'
    | 'isDefaultBPM';
  message: string;
  tick?: number;
}

function tickToMs(doc: ChartDocument, tick: number): number {
  let ms = 0;
  let cursor = 0;
  let bpm = doc.tempos[0]?.bpm ?? 120;
  for (const tempo of doc.tempos) {
    if (tempo.tick >= tick) break;
    ms += ((tempo.tick - cursor) / doc.resolution) * (60000 / bpm);
    cursor = tempo.tick;
    bpm = tempo.bpm;
  }
  return ms + ((tick - cursor) / doc.resolution) * (60000 / bpm);
}

export function validateChartDocument(doc: ChartDocument): ChartIssue[] {
  const issues: ChartIssue[] = [];
  const notes: ChartNote[] = Object.values(doc.notes).flat().filter(Boolean);

  if (notes.length === 0) {
    issues.push({severity: 'error', type: 'noNotes', message: 'The chart has no notes'});
    return issues;
  }

  const sorted = [...notes].sort((a, b) => a.tick - b.tick);
  const ticks = [...new Set(sorted.map(n => n.tick))].sort((a, b) => a - b);

  // Too many pads at once.
  const padsAtTick = new Map<number, number>();
  for (const note of sorted) {
    if (PIECE_TO_LANE[note.piece].lane === 0) continue;
    padsAtTick.set(note.tick, (padsAtTick.get(note.tick) ?? 0) + 1);
  }
  for (const [tick, count] of padsAtTick) {
    if (count > MAX_SIMULTANEOUS_PADS) {
      issues.push({
        severity: 'warning',
        type: 'invalidChord',
        tick,
        message: `${count} non-kick lanes at tick ${tick}; two hands can play at most ${MAX_SIMULTANEOUS_PADS}`,
      });
    }
  }

  // Two consecutive note groups too close together to be played. scan-chart
  // measures this between groups, not per lane, so a flam's grace stroke is
  // judged against whatever came before it rather than against the same pad.
  for (let i = 1; i < ticks.length; i++) {
    const gap = tickToMs(doc, ticks[i]) - tickToMs(doc, ticks[i - 1]);
    if (gap > 0 && gap <= BROKEN_NOTE_MS) {
      issues.push({
        severity: 'error',
        type: 'brokenNote',
        tick: ticks[i],
        message: `Two hits ${gap.toFixed(1)} ms apart at tick ${ticks[i]}`,
      });
    }
  }

  const leadingSilence = tickToMs(doc, sorted[0].tick);
  if (leadingSilence < MIN_LEADING_SILENCE_MS) {
    issues.push({
      severity: 'warning',
      type: 'smallLeadingSilence',
      message: `Only ${Math.round(leadingSilence)} ms before the first note; Encore wants at least ${MIN_LEADING_SILENCE_MS}`,
    });
  }

  if (doc.sections.length === 0) {
    issues.push({
      severity: 'warning',
      type: 'noSections',
      message: 'The chart has no section markers',
    });
  }

  // Both halves must be default; a chart at a constant 120 in 7/8 is mapped.
  const defaultTempo = doc.tempos.length === 1 && doc.tempos[0].bpm === 120;
  const defaultTimeSignature =
    doc.timeSignatures.length === 1 &&
    doc.timeSignatures[0].numerator === 4 &&
    doc.timeSignatures[0].denominator === 4;
  if (defaultTempo && defaultTimeSignature) {
    issues.push({
      severity: 'warning',
      type: 'isDefaultBPM',
      message: 'Only a default 120 BPM 4/4 marker — the chart looks un-tempo-mapped',
    });
  }

  // Star power is deliberately not checked: scan-chart's noStarPower warning
  // excludes drums outright (`track.instrument !== 'drums'`), so reporting it
  // on a drum export would be noise on every single chart.

  return issues;
}

export function hasErrors(issues: ChartIssue[]): boolean {
  return issues.some(i => i.severity === 'error');
}
