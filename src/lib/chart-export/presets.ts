/**
 * The three things the app exports: a tab's drum track, the rudiments, and
 * the curriculum lessons.
 *
 * Thin wrappers so the pages call one function instead of repeating the
 * document → folder dance, and so the CLI and the UI produce byte-identical
 * folders from the same inputs.
 */

import type {model} from '@coderline/alphatab';
import type {Lesson, LoadedUnit} from '@/lib/curriculum/types';
import type {Rudiment} from '@/pages/rudiments/rudimentData';
import {buildChartFolder, type ChartFolder} from './chartFolder';
import {isExportable, lessonToChartDocument} from './fromLesson';
import {rudimentToChartDocument, type Subdivision} from './fromRudiment';
import {scoreToChartDocument} from './fromScore';

type Score = InstanceType<typeof model.Score>;

export interface RudimentExportOptions {
  bpm?: number;
  subdivision?: Subdivision;
  repeats?: number;
}

export function buildRudimentFolders(
  rudiments: Rudiment[],
  options: RudimentExportOptions = {},
): ChartFolder[] {
  return rudiments.map(rudiment => {
    const {doc, lengthMs, gracesDropped} = rudimentToChartDocument({
      name: rudiment.name,
      sticking: rudiment.sticking,
      bpm: options.bpm,
      subdivision: options.subdivision,
      repeats: options.repeats,
    });
    return buildChartFolder(doc, {
      lengthMs,
      notes: gracesDropped
        ? [`${rudiment.name}: too fast to chart the grace strokes; main strokes only`]
        : [],
    });
  });
}

export interface ScoreExportResult {
  folder: ChartFolder;
  /** GM notes with no lane, counted — e.g. a cowbell-free congas part. */
  dropped: Record<number, number>;
}

/**
 * A tab's drum track as one chart folder.
 *
 * Throws when the score has no percussion track; callers should check with
 * `hasPercussionTrack` first so the menu item can be hidden rather than
 * offered and then refused.
 */
export function buildScoreFolder(
  score: Score,
  options: {charter?: string} = {},
): ScoreExportResult {
  const {doc, lengthMs, dropped, tickShift} = scoreToChartDocument(score, {
    charter: options.charter,
  });

  const notes: string[] = [];
  const droppedCount = Object.values(dropped).reduce((a, b) => a + b, 0);
  if (droppedCount > 0) {
    notes.push(
      `${droppedCount} percussion hit${droppedCount === 1 ? '' : 's'} had no lane and were dropped (MIDI ${Object.keys(dropped).join(', ')})`,
    );
  }
  if (tickShift > 0) {
    notes.push(`Grace beats shifted the chart by ${tickShift} ticks; bar 1 does not start at 0`);
  }

  return {folder: buildChartFolder(doc, {lengthMs, notes}), dropped};
}

export interface LessonExportResult {
  folders: ChartFolder[];
  /** Lessons with no drum pattern to play. */
  skipped: string[];
  /** Track names no piece matched, across every lesson. */
  unmappedTracks: string[];
}

export function buildLessonFolders(
  lessons: {lesson: Lesson; unitTitle?: string}[],
): LessonExportResult {
  const folders: ChartFolder[] = [];
  const skipped: string[] = [];
  const unmapped = new Set<string>();

  for (const {lesson, unitTitle} of lessons) {
    if (!isExportable(lesson)) {
      skipped.push(lesson.id);
      continue;
    }
    const {doc, lengthMs, unmappedTracks} = lessonToChartDocument(lesson, {unitTitle});
    for (const name of unmappedTracks) unmapped.add(name);
    folders.push(buildChartFolder(doc, {lengthMs}));
  }

  return {folders, skipped, unmappedTracks: [...unmapped]};
}

/** Flattens loaded units into the shape buildLessonFolders wants. */
export function lessonsOfUnits(
  units: LoadedUnit[],
): {lesson: Lesson; unitTitle: string}[] {
  return units.flatMap(unit =>
    unit.loadedLessons.map(lesson => ({lesson, unitTitle: unit.title})),
  );
}
