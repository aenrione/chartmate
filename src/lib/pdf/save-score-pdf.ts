/**
 * Exports a score to PDF and puts it where the rest of the app expects PDFs:
 * the configured PDF library folder plus a `pdf_library` row, so the existing
 * viewer, setlists and WebDAV sync pick it up with no extra wiring.
 *
 * With no library folder configured it falls back to a plain browser download.
 */
import {writeFile} from '@tauri-apps/plugin-fs';
import {join} from '@tauri-apps/api/path';
import type {model} from '@coderline/alphatab';
import {storeGet, STORE_KEYS} from '@/lib/store';
import {upsertPdfLibraryEntry, linkChartPdf, getPdfsForChart} from '@/lib/local-db/pdf-library';
import {exportScoreToPdf, scorePdfFilename, type ScorePdfOptions} from './score-pdf';

export type SavedScorePdf = {
  filename: string;
  pageCount: number;
  /** Null when the PDF was downloaded instead of filed in the library. */
  pdfLibraryId: number | null;
  /** True when the PDF was linked to a chart and became its primary one. */
  linkedAsPrimary: boolean;
  warnings: string[];
};

export type SaveScorePdfOptions = ScorePdfOptions & {
  /**
   * Chart this score came from. Links the PDF to it so the chart viewer finds
   * it — without this the file exists but the song doesn't know about it.
   */
  chartMd5?: string;
};

export async function saveScorePdfToLibrary(
  score: model.Score,
  options: SaveScorePdfOptions = {},
): Promise<SavedScorePdf> {
  const {chartMd5, ...pdfOptions} = options;
  const {bytes, pageCount, warnings} = await exportScoreToPdf(score, pdfOptions);
  const filename = scorePdfFilename(score);

  const libraryPath = await storeGet<string>(STORE_KEYS.PDF_LIBRARY_PATH);
  if (!libraryPath) {
    const url = URL.createObjectURL(new Blob([bytes as BufferSource], {type: 'application/pdf'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return {filename, pageCount, pdfLibraryId: null, linkedAsPrimary: false, warnings};
  }

  await writeFile(await join(libraryPath, filename), bytes);
  const pdfLibraryId = await upsertPdfLibraryEntry({
    filename,
    relativePath: filename,
    fileSizeBytes: bytes.length,
    detectedTitle: score.title?.trim() || null,
    detectedArtist: score.artist?.trim() || null,
    addedAt: new Date().toISOString(),
  });

  // Become the primary PDF only if the chart hasn't got one already, so an
  // export never displaces a PDF the user chose.
  let linkedAsPrimary = false;
  if (chartMd5) {
    const existing = await getPdfsForChart(chartMd5);
    linkedAsPrimary = !existing.some(link => link.isPrimary && link.pdfLibraryId !== pdfLibraryId);
    await linkChartPdf(chartMd5, pdfLibraryId, null, linkedAsPrimary);
  }

  return {filename, pageCount, pdfLibraryId, linkedAsPrimary, warnings};
}
