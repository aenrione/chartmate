import {sql} from 'kysely';
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
  songLength: number | null;
  instrument: string | null;
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
    .leftJoin('saved_charts', 'saved_charts.md5', 'setlist_items.chart_md5')
    .leftJoin('tab_compositions', 'tab_compositions.id', 'setlist_items.composition_id')
    .select([
      'setlist_items.id',
      'setlist_items.setlist_id',
      'setlist_items.item_type',
      'setlist_items.chart_md5',
      'setlist_items.composition_id',
      'setlist_items.pdf_library_id',
      'setlist_items.name',
      'setlist_items.artist',
      'setlist_items.charter',
      'setlist_items.position',
      'setlist_items.speed',
      'setlist_items.added_at',
      'saved_charts.song_length',
      'tab_compositions.instrument',
    ])
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
    songLength: r.song_length ?? null,
    instrument: r.instrument ?? (r.item_type === 'chart' ? 'drums' : null),
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
  toIndex: number,
): Promise<void> {
  const db = await getLocalDb();

  // No explicit transaction: BEGIN/COMMIT across JS awaits routes through
  // different pool connections on the Rust side (tauri-plugin-sql), and only
  // the connection that ran PRAGMA busy_timeout has the timeout set — the
  // others fail instantly on any lock. The CASE UPDATE below is itself atomic.
  const rows = await db
    .selectFrom('setlist_items')
    .select(['id', 'position'])
    .where('setlist_id', '=', setlistId)
    .orderBy('position', 'asc')
    .execute();

  const fromIndex = rows.findIndex(r => r.id === itemId);
  if (fromIndex === -1 || fromIndex === toIndex) return;

  const ids = rows.map(r => r.id);
  const [moved] = ids.splice(fromIndex, 1);
  ids.splice(toIndex, 0, moved);

  const whenClauses = ids.map((id, i) => sql`WHEN ${id} THEN ${i}`);
  await sql`UPDATE setlist_items SET position = CASE id ${sql.join(whenClauses, sql` `)} ELSE position END WHERE setlist_id = ${setlistId}`.execute(db);

  await db
    .updateTable('setlists')
    .set({updated_at: getCurrentTimestamp()})
    .where('id', '=', setlistId)
    .execute();
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
