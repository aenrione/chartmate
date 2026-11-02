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
import {upsertPdfLibraryEntry} from '@/lib/local-db/pdf-library';
import {exportScoreToPdf, scorePdfFilename, type ScorePdfOptions} from './score-pdf';

export type SavedScorePdf = {
  filename: string;
  pageCount: number;
  /** Null when the PDF was downloaded instead of filed in the library. */
  pdfLibraryId: number | null;
  warnings: string[];
};

export async function saveScorePdfToLibrary(
  score: model.Score,
  options: ScorePdfOptions = {},
): Promise<SavedScorePdf> {
  const {bytes, pageCount, warnings} = await exportScoreToPdf(score, options);
  const filename = scorePdfFilename(score);

  const libraryPath = await storeGet<string>(STORE_KEYS.PDF_LIBRARY_PATH);
  if (!libraryPath) {
    const url = URL.createObjectURL(new Blob([bytes as BufferSource], {type: 'application/pdf'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return {filename, pageCount, pdfLibraryId: null, warnings};
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

  return {filename, pageCount, pdfLibraryId, warnings};
}
