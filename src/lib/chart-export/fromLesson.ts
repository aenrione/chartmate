/**
 * A curriculum Lesson → ChartDocument.
 *
 * A lesson's `drum-pattern` activities become one playable chart: each
 * activity is a section, repeated so it is long enough to actually settle into.
 * Activities of any other type carry no rhythm and are skipped.
 *
 * Pure on purpose — it takes a Lesson object, not a lesson id — so the same
 * code runs under Vite in the app and under plain Node in the CLI, which has
 * no `import.meta.glob`.
 */

import type {Lesson, DrumPatternActivity} from '@/lib/curriculum/types';
import {
  patternsToChartDocument,
  type PatternBlock,
  type PatternsToChartResult,
} from './fromDrumPattern';

export function drumPatternsOf(lesson: Lesson): DrumPatternActivity[] {
  return lesson.activities.filter(
    (a): a is DrumPatternActivity => a.type === 'drum-pattern',
  );
}

export function isExportable(lesson: Lesson): boolean {
  return drumPatternsOf(lesson).length > 0;
}

export interface LessonToChartOptions {
  /** Unit title, used as the album so a unit's lessons group together. */
  unitTitle?: string;
  charter?: string;
  repeats?: number;
}

export function lessonToChartDocument(
  lesson: Lesson,
  options: LessonToChartOptions = {},
): PatternsToChartResult {
  const activities = drumPatternsOf(lesson);
  if (activities.length === 0) {
    throw new Error(`Lesson "${lesson.id}" has no drum patterns to export`);
  }

  const blocks: PatternBlock[] = activities.map((activity, index) => ({
    title: activity.title ?? `${lesson.title} ${index + 1}`,
    timeSignature: activity.timeSignature,
    subdivisions: activity.subdivisions,
    bpm: activity.bpm,
    tracks: activity.tracks.map(t => ({name: t.name, pattern: t.pattern})),
    repeats: options.repeats,
  }));

  return patternsToChartDocument(blocks, {
    name: lesson.title,
    artist: 'Chartmate Curriculum',
    album: options.unitTitle,
    charter: options.charter ?? 'Chartmate',
    genre: 'Practice',
  });
}
