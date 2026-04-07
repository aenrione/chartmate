import {getLocalDb} from './client';
import {getCurrentTimestamp} from './db-utils';

export interface YoutubeAssociation {
  id: number;
  chart_md5: string;
  youtube_url: string;
  offset_ms: number;
  created_at: string;
}

export async function getYoutubeAssociation(
  chartMd5: string,
): Promise<YoutubeAssociation | undefined> {
  const db = await getLocalDb();
  return db
    .selectFrom('youtube_associations')
    .selectAll()
    .where('chart_md5', '=', chartMd5)
    .executeTakeFirst() as Promise<YoutubeAssociation | undefined>;
}

export async function saveYoutubeAssociation(
  chartMd5: string,
  youtubeUrl: string,
  offsetMs: number = 0,
): Promise<void> {
  const db = await getLocalDb();
  // Delete existing association for this chart, then insert new one
  await db
    .deleteFrom('youtube_associations')
    .where('chart_md5', '=', chartMd5)
    .execute();
  await db
    .insertInto('youtube_associations')
    .values({
      chart_md5: chartMd5,
      youtube_url: youtubeUrl,
      offset_ms: offsetMs,
      created_at: getCurrentTimestamp(),
    })
    .execute();
}

export async function updateYoutubeOffset(
  chartMd5: string,
  offsetMs: number,
): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('youtube_associations')
    .set({offset_ms: offsetMs})
    .where('chart_md5', '=', chartMd5)
    .execute();
}

export async function deleteYoutubeAssociation(
  chartMd5: string,
): Promise<void> {
  const db = await getLocalDb();
  await db
    .deleteFrom('youtube_associations')
    .where('chart_md5', '=', chartMd5)
    .execute();
}

