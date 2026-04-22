import {getLocalDb} from './client';
import {getCurrentTimestamp} from './db-utils';
import {ChartResponseEncore} from '@/lib/chartSelection';
import type {TabComposition} from './tab-compositions';
import type {PdfLibraryEntry} from './pdf-library';

export type Setlist = {
  id: number;
  name: string;
  description: string | null;
  sourceType: 'custom' | 'spotify' | 'source_game';
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
};

export type SetlistItem = {
  id: number;
  setlistId: number;
  itemType: 'chart' | 'composition' | 'pdf';
  chartMd5: string | null;
  compositionId: number | null;
  pdfLibraryId: number | null;
  name: string;
  artist: string;
  charter: string | null;
  position: number;
  speed: number;
  addedAt: string;
};

export async function getSetlists(): Promise<Setlist[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('setlists')
    .leftJoin('setlist_items', 'setlist_items.setlist_id', 'setlists.id')
    .select([
      'setlists.id',
      'setlists.name',
      'setlists.description',
      'setlists.source_type',
      'setlists.source_id',
      'setlists.created_at',
      'setlists.updated_at',
      db.fn.count<number>('setlist_items.id').as('item_count'),
    ])
    .groupBy('setlists.id')
    .orderBy('setlists.updated_at', 'desc')
    .execute();

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    sourceType: r.source_type as Setlist['sourceType'],
    sourceId: r.source_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    itemCount: r.item_count ?? 0,
  }));
}

export async function createSetlist(
  name: string,
  sourceType: Setlist['sourceType'] = 'custom',
  sourceId?: string,
  description?: string,
): Promise<number> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  const result = await db
    .insertInto('setlists')
    .values({
      name,
      description: description ?? null,
      source_type: sourceType,
      source_id: sourceId ?? null,
      created_at: now,
      updated_at: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function updateSetlist(
  id: number,
  updates: {name?: string; description?: string},
): Promise<void> {
  const db = await getLocalDb();
  const values: Record<string, string> = {updated_at: getCurrentTimestamp()};
  if (updates.name !== undefined) values.name = updates.name;
  if (updates.description !== undefined) values.description = updates.description;
  await db.updateTable('setlists').set(values).where('id', '=', id).execute();
}

export async function deleteSetlist(id: number): Promise<void> {
  const db = await getLocalDb();
  return db.transaction().execute(async trx => {
    await trx.deleteFrom('setlist_items').where('setlist_id', '=', id).execute();
    await trx.deleteFrom('setlists').where('id', '=', id).execute();
  });
}

export async function getSetlistItems(setlistId: number): Promise<SetlistItem[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('setlist_items')
    .selectAll()
    .where('setlist_id', '=', setlistId)
    .orderBy('position', 'asc')
    .execute();

  return rows.map(r => ({
    id: r.id,
    setlistId: r.setlist_id,
    itemType: (r.item_type ?? 'chart') as SetlistItem['itemType'],
    chartMd5: r.chart_md5 ?? null,
    compositionId: r.composition_id ?? null,
    pdfLibraryId: r.pdf_library_id ?? null,
    name: r.name,
    artist: r.artist,
    charter: r.charter ?? null,
    position: r.position,
    speed: r.speed,
    addedAt: r.added_at,
  }));
}

export async function addSetlistItem(
  setlistId: number,
  chart: {md5: string; name: string; artist: string; charter: string},
  speed: number = 100,
): Promise<void> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();

  await db.transaction().execute(async trx => {
    const last = await trx
      .selectFrom('setlist_items')
      .select(trx.fn.max<number>('position').as('max_pos'))
      .where('setlist_id', '=', setlistId)
      .executeTakeFirst();
    const nextPos = (last?.max_pos ?? -1) + 1;

    await trx
      .insertInto('setlist_items')
      .values({
        setlist_id: setlistId,
        item_type: 'chart',
        chart_md5: chart.md5,
        composition_id: null,
        pdf_library_id: null,
        name: chart.name,
        artist: chart.artist,
        charter: chart.charter,
        position: nextPos,
        speed,
        added_at: now,
      })
      .execute();

    await trx
      .updateTable('setlists')
      .set({updated_at: now})
      .where('id', '=', setlistId)
      .execute();
  });
}

export async function removeSetlistItem(itemId: number): Promise<void> {
  const db = await getLocalDb();
  const item = await db
    .selectFrom('setlist_items')
    .select(['setlist_id', 'position'])
    .where('id', '=', itemId)
    .executeTakeFirst();
  if (!item) return;

  return db.transaction().execute(async trx => {
    await trx.deleteFrom('setlist_items').where('id', '=', itemId).execute();

    // Shift positions down for items after the removed one
    await trx
      .updateTable('setlist_items')
      .set(eb => ({position: eb('position', '-', 1)}))
      .where('setlist_id', '=', item.setlist_id)
      .where('position', '>', item.position)
      .execute();

    await trx
      .updateTable('setlists')
      .set({updated_at: getCurrentTimestamp()})
      .where('id', '=', item.setlist_id)
      .execute();
  });
}

export async function reorderSetlistItem(
  setlistId: number,
  itemId: number,
  newPosition: number,
): Promise<void> {
  const db = await getLocalDb();

  const item = await db
    .selectFrom('setlist_items')
    .select('position')
    .where('id', '=', itemId)
    .executeTakeFirst();
  if (!item) return;

  const oldPos = item.position;
  if (oldPos === newPosition) return;

  return db.transaction().execute(async trx => {
    if (newPosition < oldPos) {
      // Moving up: shift items in [newPos, oldPos-1] down by 1
      await trx
        .updateTable('setlist_items')
        .set(eb => ({position: eb('position', '+', 1)}))
        .where('setlist_id', '=', setlistId)
        .where('position', '>=', newPosition)
        .where('position', '<', oldPos)
        .execute();
    } else {
      // Moving down: shift items in [oldPos+1, newPos] up by 1
      await trx
        .updateTable('setlist_items')
        .set(eb => ({position: eb('position', '-', 1)}))
        .where('setlist_id', '=', setlistId)
        .where('position', '>', oldPos)
        .where('position', '<=', newPosition)
        .execute();
    }

    await trx
      .updateTable('setlist_items')
      .set({position: newPosition})
      .where('id', '=', itemId)
      .execute();

    await trx
      .updateTable('setlists')
      .set({updated_at: getCurrentTimestamp()})
      .where('id', '=', setlistId)
      .execute();
  });
}

export async function updateSetlistItemSpeed(
  itemId: number,
  speed: number,
): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('setlist_items')
    .set({speed})
    .where('id', '=', itemId)
    .execute();
}

export async function addChartsToSetlist(
  setlistId: number,
  charts: {md5: string; name: string; artist: string; charter: string}[],
): Promise<void> {
  if (charts.length === 0) return;
  const db = await getLocalDb();
  const now = getCurrentTimestamp();

  await db.transaction().execute(async trx => {
    const last = await trx
      .selectFrom('setlist_items')
      .select(trx.fn.max<number>('position').as('max_pos'))
      .where('setlist_id', '=', setlistId)
      .executeTakeFirst();
    let nextPos = (last?.max_pos ?? -1) + 1;

    await trx
      .insertInto('setlist_items')
      .values(
        charts.map(chart => ({
          setlist_id: setlistId,
          item_type: 'chart',
          chart_md5: chart.md5,
          composition_id: null,
          pdf_library_id: null,
          name: chart.name,
          artist: chart.artist,
          charter: chart.charter,
          position: nextPos++,
          speed: 100,
          added_at: now,
        })),
      )
      .execute();

    await trx
      .updateTable('setlists')
      .set({updated_at: now})
      .where('id', '=', setlistId)
      .execute();
  });
}

export async function addCompositionsToSetlist(
  setlistId: number,
  comps: Array<Pick<TabComposition, 'id' | 'title' | 'artist'>>,
): Promise<void> {
  if (comps.length === 0) return;
  const db = await getLocalDb();
  const now = getCurrentTimestamp();

  await db.transaction().execute(async trx => {
    const last = await trx
      .selectFrom('setlist_items')
      .select(trx.fn.max<number>('position').as('max_pos'))
      .where('setlist_id', '=', setlistId)
      .executeTakeFirst();
    let nextPos = (last?.max_pos ?? -1) + 1;

    await trx
      .insertInto('setlist_items')
      .values(comps.map(c => ({
        setlist_id: setlistId,
        item_type: 'composition',
        chart_md5: null,
        composition_id: c.id,
        pdf_library_id: null,
        name: c.title,
        artist: c.artist,
        charter: null,
        position: nextPos++,
        speed: 100,
        added_at: now,
      })))
      .execute();

    await trx
      .updateTable('setlists')
      .set({updated_at: now})
      .where('id', '=', setlistId)
      .execute();
  });
}

export async function addPdfsToSetlist(
  setlistId: number,
  pdfs: Array<Pick<PdfLibraryEntry, 'id' | 'filename' | 'detectedTitle' | 'detectedArtist'>>,
): Promise<void> {
  if (pdfs.length === 0) return;
  const db = await getLocalDb();
  const now = getCurrentTimestamp();

  await db.transaction().execute(async trx => {
    const last = await trx
      .selectFrom('setlist_items')
      .select(trx.fn.max<number>('position').as('max_pos'))
      .where('setlist_id', '=', setlistId)
      .executeTakeFirst();
    let nextPos = (last?.max_pos ?? -1) + 1;

    await trx
      .insertInto('setlist_items')
      .values(pdfs.map(p => ({
        setlist_id: setlistId,
        item_type: 'pdf',
        chart_md5: null,
        composition_id: null,
        pdf_library_id: p.id,
        name: p.detectedTitle ?? p.filename,
        artist: p.detectedArtist ?? '',
        charter: null,
        position: nextPos++,
        speed: 100,
        added_at: now,
      })))
      .execute();

    await trx
      .updateTable('setlists')
      .set({updated_at: now})
      .where('id', '=', setlistId)
      .execute();
  });
}
