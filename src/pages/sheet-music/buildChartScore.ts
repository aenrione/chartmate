/**
 * Builds the AlphaTab score a Clone Hero chart is displayed as.
 *
 * Shared by the on-screen sheet music and the PDF export so both show the same
 * notes, lyrics and sections — exporting from the DOM was never an option, but
 * exporting the same score the screen renders is.
 */
import type {model} from '@coderline/alphatab';
import type {ParsedChart} from '@/lib/preview/chorus-chart-processing';
import convertToAlphaTabDrums from './convertToAlphaTabDrums';
import cleanLyrics from './cleanLyrics';

export type BuildChartScoreOptions = {
  showLyrics?: boolean;
  noteAnnotations?: string[];
  /** On screen these stay blank; the PDF wants a real header. */
  title?: string;
  artist?: string;
};

export function buildChartScore(
  chart: ParsedChart,
  track: ParsedChart['trackData'][0],
  {showLyrics = true, noteAnnotations, title, artist}: BuildChartScoreOptions = {},
): InstanceType<typeof model.Score> {
  const lyrics = showLyrics
    ? ((chart as any).lyrics as {tick: number; text: string; msTime: number}[] | undefined)
        ?.filter(lyric => !lyric.text.includes('['))
        .map(lyric => ({...lyric, text: cleanLyrics(lyric.text)})) ?? []
    : [];

  const score = convertToAlphaTabDrums(chart, track, {
    noteAnnotations,
    lyrics,
    sections: chart.sections,
  });

  if (title) score.title = title;
  if (artist) score.artist = artist;
  return score;
}
