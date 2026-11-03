/**
 * The linking decision: an export has to be findable from the chart viewer
 * (which reads `chart_pdfs`) without displacing a PDF the user picked.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest';

const mocks = vi.hoisted(() => ({
  libraryPath: '/library' as string | null,
  existingLinks: [] as {pdfLibraryId: number; isPrimary: boolean}[],
  written: [] as {path: string; bytes: Uint8Array}[],
  links: [] as {chartMd5: string; pdfLibraryId: number; isPrimary: boolean}[],
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: vi.fn(async (path: string, bytes: Uint8Array) => { mocks.written.push({path, bytes}); }),
}));
vi.mock('@tauri-apps/api/path', () => ({
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}));
vi.mock('@/lib/store', () => ({
  storeGet: vi.fn(async () => mocks.libraryPath),
  STORE_KEYS: {PDF_LIBRARY_PATH: 'pdf_library_path'},
}));
vi.mock('@/lib/local-db/pdf-library', () => ({
  upsertPdfLibraryEntry: vi.fn(async () => 42),
  getPdfsForChart: vi.fn(async () => mocks.existingLinks),
  linkChartPdf: vi.fn(async (chartMd5: string, pdfLibraryId: number, _l: unknown, isPrimary: boolean) => {
    mocks.links.push({chartMd5, pdfLibraryId, isPrimary});
  }),
}));
vi.mock('../score-pdf', () => ({
  exportScoreToPdf: vi.fn(async () => ({bytes: new Uint8Array([1, 2, 3]), pageCount: 2, warnings: []})),
  scorePdfFilename: vi.fn(() => 'Artist - Title.pdf'),
}));

import {saveScorePdfToLibrary} from '../save-score-pdf';

const score = {title: 'Title', artist: 'Artist'} as never;

describe('saveScorePdfToLibrary', () => {
  beforeEach(() => {
    mocks.libraryPath = '/library';
    mocks.existingLinks = [];
    mocks.written = [];
    mocks.links = [];
  });

  it('writes into the PDF library folder', async () => {
    const saved = await saveScorePdfToLibrary(score);
    expect(mocks.written).toHaveLength(1);
    expect(mocks.written[0].path).toBe('/library/Artist - Title.pdf');
    expect(saved.pdfLibraryId).toBe(42);
    expect(saved.pageCount).toBe(2);
  });

  it('does not touch chart_pdfs when no chart is given', async () => {
    await saveScorePdfToLibrary(score);
    expect(mocks.links).toEqual([]);
  });

  it('links as primary when the chart has no PDF yet', async () => {
    const saved = await saveScorePdfToLibrary(score, {chartMd5: 'abc'});
    expect(mocks.links).toEqual([{chartMd5: 'abc', pdfLibraryId: 42, isPrimary: true}]);
    expect(saved.linkedAsPrimary).toBe(true);
  });

  it('links as secondary rather than displacing a PDF the user chose', async () => {
    mocks.existingLinks = [{pdfLibraryId: 7, isPrimary: true}];
    const saved = await saveScorePdfToLibrary(score, {chartMd5: 'abc'});
    expect(mocks.links).toEqual([{chartMd5: 'abc', pdfLibraryId: 42, isPrimary: false}]);
    expect(saved.linkedAsPrimary).toBe(false);
  });

  it('stays primary when re-exporting the same PDF', async () => {
    mocks.existingLinks = [{pdfLibraryId: 42, isPrimary: true}];
    const saved = await saveScorePdfToLibrary(score, {chartMd5: 'abc'});
    expect(saved.linkedAsPrimary).toBe(true);
  });

  it('falls back to a download and skips linking with no library folder', async () => {
    mocks.libraryPath = null;
    const createObjectURL = vi.fn(() => 'blob:x');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {...URL, createObjectURL, revokeObjectURL});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const saved = await saveScorePdfToLibrary(score, {chartMd5: 'abc'});

    expect(mocks.written).toEqual([]);
    expect(mocks.links).toEqual([]);
    expect(saved.pdfLibraryId).toBeNull();
    vi.unstubAllGlobals();
  });
});
