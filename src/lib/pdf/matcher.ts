import {search as fuzzySearch} from 'fast-fuzzy';
import type {PdfLibraryEntry} from '@/lib/local-db/pdf-library';
import type {SavedChartEntry} from '@/lib/local-db/saved-charts';

export type PdfMatchSuggestion = {
  pdf: PdfLibraryEntry;
  chart: SavedChartEntry;
  score: number;
  strategy: string;
};

/** Strategy interface — swap matching algorithm without touching the pipeline. */
export interface PdfMatchStrategy {
  readonly name: string;
  score(pdf: PdfLibraryEntry, chart: SavedChartEntry): number;
}

/** Match by normalized artist + title similarity using fast-fuzzy. */
export class FilenameSimilarityStrategy implements PdfMatchStrategy {
  readonly name = 'filename_similarity';

  score(pdf: PdfLibraryEntry, chart: SavedChartEntry): number {
    const pdfArtist = normalize(pdf.detectedArtist ?? '');
    const pdfTitle = normalize(pdf.detectedTitle ?? pdf.filename.replace(/\.pdf$/i, ''));
    const chartArtist = normalize(chart.artist);
    const chartTitle = normalize(chart.name);

    const titleScore = stringSimilarity(pdfTitle, chartTitle);
    if (!pdfArtist) return titleScore;

    const artistScore = stringSimilarity(pdfArtist, chartArtist);
    return titleScore * 0.6 + artistScore * 0.4;
  }
}

/** Match by parent folder name vs artist name. */
export class FolderNameStrategy implements PdfMatchStrategy {
  readonly name = 'folder_name';

  score(pdf: PdfLibraryEntry, chart: SavedChartEntry): number {
    const parts = pdf.relativePath.replace(/\\/g, '/').split('/');
    if (parts.length < 2) return 0;
    const folder = normalize(parts[parts.length - 2]);
    const artist = normalize(chart.artist);
    return stringSimilarity(folder, artist);
  }
}

const MATCH_THRESHOLD = 0.70;

/**
 * Run all strategies against all (pdf, chart) pairs.
 * Returns suggestions above MATCH_THRESHOLD, sorted by score descending.
 * Each PDF gets at most one suggestion (the best-scoring chart).
 */
export function findMatchSuggestions(
  pdfs: PdfLibraryEntry[],
  charts: SavedChartEntry[],
  strategies: PdfMatchStrategy[] = [new FilenameSimilarityStrategy(), new FolderNameStrategy()],
): PdfMatchSuggestion[] {
  const suggestions: PdfMatchSuggestion[] = [];

  for (const pdf of pdfs) {
    let best: PdfMatchSuggestion | null = null;

    for (const chart of charts) {
      for (const strategy of strategies) {
        const score = strategy.score(pdf, chart);
        if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
          best = {pdf, chart, score, strategy: strategy.name};
        }
      }
    }

    if (best) suggestions.push(best);
  }

  return suggestions.sort((a, b) => b.score - a.score);
}

// ── Helpers ───────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const results = fuzzySearch(a, [b], {returnMatchData: true});
  return results[0]?.score ?? 0;
}
