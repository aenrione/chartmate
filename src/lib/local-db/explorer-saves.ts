import {getLocalDb} from './client';
import {normalizeStrForMatching} from './normalize';

export type ExplorerSave = {
  id: number;
  listName: string;
  artist: string;
  name: string;
  spotifyTrackUri: string | null;
  addedAt: string;
};

export async function getExplorerLists(): Promise<string[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('explorer_saves')
    .select('list_name')
    .distinct()
    .orderBy('list_name')
    .execute();
  return rows.map(r => r.list_name);
}

export async function getExplorerSaves(listName?: string): Promise<ExplorerSave[]> {
  const db = await getLocalDb();
  let query = db.selectFrom('explorer_saves').selectAll();
  if (listName) query = query.where('list_name', '=', listName);
  const rows = await query.orderBy('added_at', 'desc').execute();
  return rows.map(r => ({
    id: r.id,
    listName: r.list_name,
    artist: r.artist,
    name: r.name,
    spotifyTrackUri: r.spotify_track_uri,
    addedAt: r.added_at,
  }));
}

export async function saveToExplorerList(
  listName: string,
  track: {artist: string; name: string; spotifyTrackUri?: string | null},
): Promise<void> {
  const db = await getLocalDb();
  await db
    .insertInto('explorer_saves')
    .values({
      list_name: listName,
      artist: track.artist,
      name: track.name,
      artist_normalized: normalizeStrForMatching(track.artist),
      name_normalized: normalizeStrForMatching(track.name),
      spotify_track_uri: track.spotifyTrackUri ?? null,
      added_at: new Date().toISOString(),
    })
    .execute();
}

export async function removeExplorerSave(id: number): Promise<void> {
  const db = await getLocalDb();
  await db.deleteFrom('explorer_saves').where('id', '=', id).execute();
}

export async function isTrackSaved(
  artist: string,
  name: string,
  listName?: string,
): Promise<boolean> {
  const db = await getLocalDb();
  let query = db
    .selectFrom('explorer_saves')
    .select('id')
    .where('artist_normalized', '=', normalizeStrForMatching(artist))
    .where('name_normalized', '=', normalizeStrForMatching(name));
  if (listName) query = query.where('list_name', '=', listName);
  const row = await query.executeTakeFirst();
  return row != null;
}
