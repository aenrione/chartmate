/**
 * A chart you are *viewing* in the Drums section is already a Clone Hero
 * chart — it came from Encore as a .sng or a chart folder, and saving it for
 * offline use unpacks the real files into the app's data directory.
 *
 * So getting it into your Songs folder is a copy, not an export. Running it
 * back through writeChart would throw away everything that is not the drum
 * track: the guitar and vocal parts, the real audio, the album art, the
 * original tempo map's sync. This module hands over the files as they are.
 */

import {listPersistedFiles, readPersistedFile} from '@/lib/chart-persistent-store';
import {safeFolderName, type ChartFolder} from './chartFolder';

export interface SavedChartMeta {
  md5: string;
  name: string;
  artist: string;
}

/**
 * The persisted chart as a ChartFolder, so it travels through the same
 * delivery path (folder picker or .zip) as everything else this module
 * exports.
 */
export async function buildSavedChartFolder(
  meta: SavedChartMeta,
): Promise<ChartFolder> {
  const fileNames = await listPersistedFiles(meta.md5);
  if (fileNames.length === 0) {
    throw new Error('This chart is not saved offline yet — save it first.');
  }

  const files = await Promise.all(
    fileNames.map(async name => {
      const file = await readPersistedFile(meta.md5, name);
      return {name, data: new Uint8Array(await file.arrayBuffer())};
    }),
  );

  return {
    name: safeFolderName(`${meta.artist} - ${meta.name}`),
    files,
    // These are the original files; whatever Encore thinks of them is already
    // settled, and re-running our own validator on a chart we did not write
    // would be reporting on someone else's work.
    issues: [],
    audioIsSilent: false,
    notes: [],
  };
}
