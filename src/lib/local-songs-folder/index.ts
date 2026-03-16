import { appCacheDir, join } from '@tauri-apps/api/path';
import { writeFile, remove, mkdir, exists } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import filenamify from 'filenamify/browser';
import { SngStream } from 'parse-sng';
import { upsertLocalCharts } from '@/lib/local-db/local-charts';
import { storeSet, STORE_KEYS } from '@/lib/store';
import { getOrPromptSongsFolder } from '@/lib/songs-folder';
import scanLocalCharts, { type SongAccumulator } from './scanLocalCharts';

type InstalledChartsResponse = {
  lastScanned: Date;
  installedCharts: SongAccumulator[];
};

export async function scanForInstalledCharts(
  callbackPerSong: () => void = () => {},
): Promise<InstalledChartsResponse> {
  const folderPath = await getOrPromptSongsFolder();
  const installedCharts: SongAccumulator[] = [];
  await scanLocalCharts(folderPath, installedCharts, callbackPerSong);
  await upsertLocalCharts(installedCharts);
  const lastScanned = new Date();
  await storeSet(STORE_KEYS.SONGS_FOLDER_PATH, folderPath); // persist last-scanned context
  return { lastScanned, installedCharts };
}

export async function getPreviewDownloadDirectory(): Promise<string> {
  const cacheDir = await appCacheDir();
  const previewDir = `${cacheDir}/previews`;
  await mkdir(previewDir, { recursive: true });
  return previewDir;
}

export async function downloadSong(
  artist: string,
  song: string,
  charter: string,
  url: string,
  options?: {
    folderPath?: string;
    replaceExisting?: boolean;
    asSng?: boolean;
  },
): Promise<{ destPath: string; fileName: string } | null> {
  const destFolder = options?.folderPath ?? await getOrPromptSongsFolder();
  const artistSongTitle = `${artist} - ${song} (${charter})`;
  const filename = filenamify(artistSongTitle, { replacement: '' });

  const response = await tauriFetch(url, { method: 'GET' });
  if (!response.body) return null;

  if (options?.asSng) {
    const destPath = await join(destFolder, `${filename}.sng`);
    if (options.replaceExisting && await exists(destPath)) {
      await remove(destPath);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(destPath, bytes);
    return { destPath, fileName: `${filename}.sng` };
  } else {
    const songDir = await join(destFolder, filename);
    if (options?.replaceExisting && await exists(songDir)) {
      await remove(songDir, { recursive: true });
    }
    await mkdir(songDir, { recursive: true });
    await extractSngToFolder(response.body, songDir);
    return { destPath: songDir, fileName: filename };
  }
}

async function extractSngToFolder(stream: ReadableStream, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sngStream = new SngStream(stream, { generateSongIni: true });
    sngStream.on('file', async (fileName: string, fileStream: ReadableStream, nextFile: (() => void) | null) => {
      try {
        const reader = fileStream.getReader();
        const chunks: Uint8Array[] = [];
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          if (value) chunks.push(value);
          done = d;
        }
        const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        const destPath = await join(destDir, fileName);
        await writeFile(destPath, combined);
        if (nextFile) nextFile();
        else resolve();
      } catch (err) {
        reject(err);
      }
    });
    sngStream.on('error', reject);
    sngStream.start();
  });
}
