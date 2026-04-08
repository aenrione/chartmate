import {getLocalDb} from './client';

export type PdfLibraryEntry = {
  id: number;
  filename: string;
  relativePath: string;
  fileSizeBytes: number;
  detectedTitle: string | null;
  detectedArtist: string | null;
  addedAt: string;
};

export type ChartPdfLink = {
  id: number;
  chartMd5: string;
  pdfLibraryId: number;
  label: string | null;
  isPrimary: boolean;
  linkedAt: string;
  // Joined from pdf_library:
  filename: string;
  relativePath: string;
};

function rowToPdfEntry(row: any): PdfLibraryEntry {
  return {
    id: row.id,
    filename: row.filename,
    relativePath: row.relative_path,
    fileSizeBytes: row.file_size_bytes,
    detectedTitle: row.detected_title ?? null,
    detectedArtist: row.detected_artist ?? null,
    addedAt: row.added_at,
  };
}

// ── pdf_library operations ────────────────────────────────────────────

export async function getAllPdfLibraryEntries(): Promise<PdfLibraryEntry[]> {
  const db = await getLocalDb();
  const rows = await db.selectFrom('pdf_library').selectAll().orderBy('filename', 'asc').execute();
  return rows.map(rowToPdfEntry);
}

export async function upsertPdfLibraryEntry(entry: Omit<PdfLibraryEntry, 'id'>): Promise<number> {
  const db = await getLocalDb();
  const existing = await db
    .selectFrom('pdf_library')
    .select('id')
    .where('relative_path', '=', entry.relativePath)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('pdf_library')
      .set({
        filename: entry.filename,
        file_size_bytes: entry.fileSizeBytes,
        detected_title: entry.detectedTitle,
        detected_artist: entry.detectedArtist,
      })
      .where('id', '=', existing.id)
      .execute();
    return existing.id;
  }

  const result = await db
    .insertInto('pdf_library')
    .values({
      filename: entry.filename,
      relative_path: entry.relativePath,
      file_size_bytes: entry.fileSizeBytes,
      detected_title: entry.detectedTitle,
      detected_artist: entry.detectedArtist,
      added_at: entry.addedAt,
    })
    .executeTakeFirstOrThrow();

  return Number(result.insertId);
}

export async function deletePdfLibraryEntry(id: number): Promise<void> {
  const db = await getLocalDb();
  await db.deleteFrom('pdf_library').where('id', '=', id).execute();
}

// ── chart_pdfs operations ─────────────────────────────────────────────

export async function getPdfsForChart(chartMd5: string): Promise<ChartPdfLink[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('chart_pdfs')
    .innerJoin('pdf_library', 'pdf_library.id', 'chart_pdfs.pdf_library_id')
    .selectAll('chart_pdfs')
    .select(['pdf_library.filename', 'pdf_library.relative_path'])
    .where('chart_pdfs.chart_md5', '=', chartMd5)
    .orderBy('chart_pdfs.is_primary', 'desc')
    .execute();

  return rows.map(row => ({
    id: row.id,
    chartMd5: row.chart_md5,
    pdfLibraryId: row.pdf_library_id,
    label: row.label ?? null,
    isPrimary: row.is_primary === 1,
    linkedAt: row.linked_at,
    filename: row.filename,
    relativePath: row.relative_path,
  }));
}

export async function getPrimaryPdfForChart(chartMd5: string): Promise<ChartPdfLink | null> {
  const links = await getPdfsForChart(chartMd5);
  return links.find(l => l.isPrimary) ?? links[0] ?? null;
}

export async function linkChartPdf(
  chartMd5: string,
  pdfLibraryId: number,
  label: string | null,
  isPrimary: boolean,
): Promise<void> {
  const db = await getLocalDb();

  if (isPrimary) {
    await db
      .updateTable('chart_pdfs')
      .set({is_primary: 0})
      .where('chart_md5', '=', chartMd5)
      .execute();
  }

  await db
    .insertInto('chart_pdfs')
    .values({
      chart_md5: chartMd5,
      pdf_library_id: pdfLibraryId,
      label: label,
      is_primary: isPrimary ? 1 : 0,
      linked_at: new Date().toISOString(),
    })
    .onConflict(oc =>
      oc.columns(['chart_md5', 'pdf_library_id']).doUpdateSet({
        label: label,
        is_primary: isPrimary ? 1 : 0,
        linked_at: new Date().toISOString(),
      }),
    )
    .execute();
}

export async function unlinkChartPdf(chartMd5: string, pdfLibraryId: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .deleteFrom('chart_pdfs')
    .where('chart_md5', '=', chartMd5)
    .where('pdf_library_id', '=', pdfLibraryId)
    .execute();
}

export async function setPrimaryPdf(chartMd5: string, pdfLibraryId: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('chart_pdfs')
    .set({is_primary: 0})
    .where('chart_md5', '=', chartMd5)
    .execute();

  await db
    .updateTable('chart_pdfs')
    .set({is_primary: 1})
    .where('chart_md5', '=', chartMd5)
    .where('pdf_library_id', '=', pdfLibraryId)
    .execute();
}

export async function getLinkedChartMd5sForPdf(pdfLibraryId: number): Promise<string[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('chart_pdfs')
    .select('chart_md5')
    .where('pdf_library_id', '=', pdfLibraryId)
    .execute();
  return rows.map(r => r.chart_md5);
}

export async function getPdfLibraryEntriesWithLinkStatus(): Promise<
  Array<PdfLibraryEntry & {linkedChartMd5s: string[]}>
> {
  const entries = await getAllPdfLibraryEntries();
  const db = await getLocalDb();
  const allLinks = await db.selectFrom('chart_pdfs').select(['pdf_library_id', 'chart_md5']).execute();

  return entries.map(entry => ({
    ...entry,
    linkedChartMd5s: allLinks
      .filter(l => l.pdf_library_id === entry.id)
      .map(l => l.chart_md5),
  }));
}
