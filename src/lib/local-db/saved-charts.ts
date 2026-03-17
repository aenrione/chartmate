import {getLocalDb} from './client';
import {ChartResponseEncore} from '@/lib/chartSelection';

export async function saveChart(chart: ChartResponseEncore): Promise<void> {
  const db = await getLocalDb();
  await db
    .insertInto('saved_charts')
    .values({
      md5: chart.md5,
      name: chart.name,
      artist: chart.artist,
      charter: chart.charter,
      album_art_md5: chart.albumArtMd5 || null,
      diff_drums: chart.diff_drums ?? null,
      diff_drums_real: chart.diff_drums_real ?? null,
      diff_guitar: chart.diff_guitar ?? null,
      diff_bass: chart.diff_bass ?? null,
      diff_keys: chart.diff_keys ?? null,
      song_length: chart.song_length ?? null,
      has_video_background: chart.hasVideoBackground ? 1 : 0,
      modified_time: chart.modifiedTime,
      saved_at: new Date().toISOString(),
    })
    .onConflict(oc => oc.column('md5').doNothing())
    .execute();
}

export async function unsaveChart(md5: string): Promise<void> {
  const db = await getLocalDb();
  await db.deleteFrom('saved_charts').where('md5', '=', md5).execute();
}

export async function isChartSaved(md5: string): Promise<boolean> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('saved_charts')
    .select('md5')
    .where('md5', '=', md5)
    .executeTakeFirst();
  return !!row;
}

export async function getSavedCharts(search?: string): Promise<ChartResponseEncore[]> {
  const db = await getLocalDb();
  let query = db
    .selectFrom('saved_charts')
    .selectAll()
    .orderBy('saved_at', 'desc');

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.where(eb =>
      eb.or([
        eb('name', 'like', term),
        eb('artist', 'like', term),
        eb('charter', 'like', term),
      ])
    );
  }

  const rows = await query.execute();

  return rows.map(row => ({
    md5: row.md5,
    name: row.name,
    artist: row.artist,
    charter: row.charter,
    albumArtMd5: row.album_art_md5 ?? '',
    diff_drums: row.diff_drums,
    diff_drums_real: row.diff_drums_real,
    diff_guitar: row.diff_guitar,
    diff_bass: row.diff_bass,
    diff_keys: row.diff_keys,
    song_length: row.song_length,
    hasVideoBackground: row.has_video_background === 1,
    modifiedTime: row.modified_time,
    notesData: {} as any,
    file: `https://files.enchor.us/${row.md5}.sng`,
  }));
}
