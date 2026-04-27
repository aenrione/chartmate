import {getLocalDb} from './client';
import {getCurrentTimestamp} from './db-utils';

export interface StemAssociation {
  song_key: string;
  stem_folder_path: string;
  created_at: string;
}

export async function getStemAssociation(
  songKey: string,
): Promise<StemAssociation | undefined> {
  const db = await getLocalDb();
  return db
    .selectFrom('stem_associations')
    .selectAll()
    .where('song_key', '=', songKey)
    .executeTakeFirst() as Promise<StemAssociation | undefined>;
}

export async function saveStemAssociation(
  songKey: string,
  stemFolderPath: string,
): Promise<void> {
  const db = await getLocalDb();
  await db
    .insertInto('stem_associations')
    .values({song_key: songKey, stem_folder_path: stemFolderPath, created_at: getCurrentTimestamp()})
    .onConflict(oc => oc.column('song_key').doUpdateSet({stem_folder_path: stemFolderPath}))
    .execute();
}

export async function deleteStemAssociation(songKey: string): Promise<void> {
  const db = await getLocalDb();
  await db
    .deleteFrom('stem_associations')
    .where('song_key', '=', songKey)
    .execute();
}
