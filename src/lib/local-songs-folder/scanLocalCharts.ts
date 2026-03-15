import { readDir, readFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { parse } from '@/lib/ini-parser';
import { SngStream } from 'parse-sng';
import { removeStyleTags } from '@/lib/ui-utils';

export type SongIniData = {
  name: string;
  artist: string;
  charter: string;
  diff_drums?: number | null;
  diff_drums_real?: number | null;
  diff_guitar?: number | null;
  song_length?: number | null;
  frets?: string | null;
};

export type SongAccumulator = {
  artist: string;
  song: string;
  modifiedTime: string;
  charter: string;
  data: SongIniData;
  file: string; // This will throw if you access it
  handleInfo: {
    parentDir: string;
    fileName: string;
  };
};

export default async function scanLocalCharts(
  dirPath: string,
  songs: SongAccumulator[],
  callbackPerSong: () => void,
): Promise<void> {
  const entries = await readDir(dirPath);
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of sorted) {
    const entryPath = await join(dirPath, entry.name);
    if (entry.isDirectory) {
      await scanLocalChartsDirectory(dirPath, entryPath, entry.name, songs, callbackPerSong);
    } else if (entry.isFile && entry.name.toLowerCase().endsWith('.sng')) {
      await scanLocalSngFile(dirPath, entryPath, entry.name, songs, callbackPerSong);
    }
  }
}

async function scanLocalChartsDirectory(
  parentDirPath: string,
  currentDirPath: string,
  currentDirName: string,
  accumulator: SongAccumulator[],
  callbackPerSong: () => void,
): Promise<void> {
  let newestDate = 0;
  let songIniData: SongIniData | null = null;

  try {
    const entries = await readDir(currentDirPath);
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of sorted) {
      const entryPath = await join(currentDirPath, entry.name);

      if (entry.isDirectory) {
        await scanLocalChartsDirectory(
          currentDirPath,
          entryPath,
          entry.name,
          accumulator,
          callbackPerSong,
        );
      } else if (entry.isFile) {
        if (entry.name.toLowerCase().endsWith('.sng')) {
          await scanLocalSngFile(currentDirPath, entryPath, entry.name, accumulator, callbackPerSong);
          continue;
        }

        if (entry.name === 'song.ini') {
          try {
            const bytes = await readFile(entryPath);
            const text = new TextDecoder().decode(bytes);
            const values = parse(text);
            // @ts-ignore Assuming JSON matches TypeScript
            songIniData = values.iniObject?.song || values.iniObject?.Song;
          } catch (e) {
            console.log('Could not scan song.ini of', currentDirName);
            continue;
          }
        }

        // Use a fixed timestamp since Tauri fs doesn't expose lastModified easily
        // We track newestDate as 0 fallback; real mtime not available via readDir
        newestDate = newestDate || Date.now();
      }
    }
  } catch (e) {
    console.error(`Error scanning directory ${parentDirPath}/${currentDirName}`, e);
    return;
  }

  if (songIniData != null) {
    const convertedSongIniData = convertValues(songIniData);
    const chart: SongAccumulator = {
      artist: removeStyleTags(songIniData.artist ?? ''),
      song: removeStyleTags(songIniData.name ?? ''),
      modifiedTime: new Date(newestDate).toISOString(),
      charter: removeStyleTags(songIniData.charter || songIniData.frets || ''),
      data: convertedSongIniData,
      handleInfo: {
        parentDir: parentDirPath,
        fileName: currentDirName,
      },
      file: '',
    };
    Object.defineProperty(chart, 'file', {
      get() {
        throw new Error('Charts from disk do not have a download URL');
      },
      enumerable: false,
    });

    accumulator.push(chart);
    callbackPerSong();
  }
}

async function scanLocalSngFile(
  parentDirPath: string,
  filePath: string,
  fileName: string,
  accumulator: SongAccumulator[],
  callbackPerSong: () => void,
): Promise<void> {
  let songIniData: SongIniData | null;

  try {
    const bytes = await readFile(filePath);
    const blob = new Blob([bytes]);
    const stream = blob.stream();

    songIniData = await new Promise<SongIniData | null>((resolve, reject) => {
      let localSongIniData: SongIniData | null = null;
      const sngStream = new SngStream(stream, { generateSongIni: true });
      sngStream.on('file', async (innerFileName: string, fileStream: ReadableStream, nextFile: (() => void) | null) => {
        try {
          if (innerFileName === 'song.ini') {
            const text = await new Response(fileStream).text();
            const values = parse(text);
            // @ts-ignore Assuming JSON matches TypeScript
            localSongIniData = values.iniObject?.song || values.iniObject?.Song;
          } else {
            const reader = fileStream.getReader();
            while (true) {
              const result = await reader.read();
              if (result.done) break;
            }
          }
        } catch (e) {
          console.log('Could not scan song.ini of', fileName);
        }

        if (nextFile) {
          nextFile();
        } else {
          resolve(localSongIniData);
        }
      });
      sngStream.on('error', (err: unknown) => reject(err));
      sngStream.start();
    });
  } catch (e) {
    console.error(`Error scanning sng file ${parentDirPath}/${fileName}`, e);
    return;
  }

  if (songIniData != null) {
    const convertedSongIniData = convertValues(songIniData);
    const chart: SongAccumulator = {
      artist: removeStyleTags(songIniData.artist ?? ''),
      song: removeStyleTags(songIniData.name ?? ''),
      modifiedTime: new Date().toISOString(),
      charter: removeStyleTags(songIniData.charter || songIniData.frets || ''),
      data: convertedSongIniData,
      handleInfo: {
        parentDir: parentDirPath,
        fileName: fileName,
      },
      file: '',
    };
    Object.defineProperty(chart, 'file', {
      get() {
        throw new Error('Charts from disk do not have a download URL');
      },
      enumerable: false,
    });

    accumulator.push(chart);
    callbackPerSong();
  }
}

function convertValues(songIniData: SongIniData): SongIniData {
  const mappedEntries = Object.entries(songIniData).map(([key, value]) => {
    const tryIntValue = parseInt(String(value), 10);
    if (value == tryIntValue || value == tryIntValue.toString()) {
      return [key, tryIntValue];
    }

    if (value == 'True') {
      return [key, true];
    } else if (value == 'False') {
      return [key, false];
    }

    return [key, value];
  });

  return Object.fromEntries(mappedEntries) as SongIniData;
}

export type ChartInstalledChecker = (
  artist: string,
  song: string,
  charter: string,
) => boolean;

function createLookupKey(artist: string, song: string, charter: string) {
  return `${artist} - ${song} - ${charter}`;
}

export function createIsInstalledFilter(
  installedSongs: SongAccumulator[],
): ChartInstalledChecker {
  const installedCharts = new Set<string>();

  for (const installedSong of installedSongs) {
    const { artist, song, charter } = installedSong;
    installedCharts.add(createLookupKey(artist, song, charter));
  }

  return function isChartInstalled(
    artist: string,
    song: string,
    charter: string,
  ) {
    return installedCharts.has(createLookupKey(artist, song, charter));
  };
}
