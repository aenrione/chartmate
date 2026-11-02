/**
 * Assembles the files a Clone Hero / YARG song folder is made of, and packs
 * them for delivery — either as loose files written into a chosen directory,
 * or as a single .zip.
 *
 * Everything here is in-memory and platform-free; writing to disk is the
 * caller's job (Tauri's fs in the app, node:fs in the CLI).
 */

import {zipSync} from 'fflate';
import {writeChart} from './writeChart';
import {estimateDiffDrums, writeSongIni} from './songIni';
import {validateChartDocument, type ChartIssue} from './validate';
import {AUDIO_FILE_NAME, silentWav} from './audio';
import {albumArtFor} from './albumArt';
import type {ChartDocument} from './types';

export interface ChartFile {
  name: string;
  data: Uint8Array;
}

export interface BuildFolderOptions {
  lengthMs: number;
  /** The rendered stem. Omit and a silent one of the right length is used. */
  audio?: Uint8Array;
  audioFileName?: string;
  /**
   * PNG or JPG bytes. Omit and a generated tile keyed to the title is used;
   * pass null for no art at all.
   */
  albumArt?: Uint8Array | null;
  albumArtFileName?: string;
  charter?: string;
  /** Export-level remarks to show the user, e.g. a documented collapse. */
  notes?: string[];
}

export interface ChartFolder {
  /** Filesystem-safe folder name. */
  name: string;
  files: ChartFile[];
  issues: ChartIssue[];
  /** True when the stem is silence rather than a SoundFont render. */
  audioIsSilent: boolean;
  /** Export-level remarks, separate from the chart issues scan-chart knows. */
  notes: string[];
}

const utf8 = (text: string) => new TextEncoder().encode(text);

/** Conservative across macOS, Windows and Linux. */
export function safeFolderName(name: string): string {
  const cleaned = name
    // Reserved on Windows. Spaces and hyphens stay — these names read
    // "Artist - Title".
    .replace(/[<>:"/\\|?*]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return cleaned.slice(0, 120) || 'Untitled';
}

export function buildChartFolder(
  doc: ChartDocument,
  options: BuildFolderOptions,
): ChartFolder {
  const issues = validateChartDocument(doc);
  const noteCount = Object.values(doc.notes).flat().filter(Boolean).length;

  const audioFileName = options.audioFileName ?? AUDIO_FILE_NAME;
  const audioIsSilent = options.audio === undefined;
  const audio = options.audio ?? silentWav(options.lengthMs + 1500);

  // The chart's MusicStream must name the file we actually write.
  const chart: ChartDocument = {
    ...doc,
    song: {...doc.song, musicStream: audioFileName},
  };

  const files: ChartFile[] = [
    {name: 'notes.chart', data: utf8(writeChart(chart))},
    {
      name: 'song.ini',
      data: utf8(
        writeSongIni({
          name: doc.song.name,
          artist: doc.song.artist,
          album: doc.song.album,
          genre: doc.song.genre,
          year: doc.song.year,
          charter: options.charter ?? doc.song.charter,
          songLength: options.lengthMs,
          diffDrums: estimateDiffDrums(noteCount, options.lengthMs),
        }),
      ),
    },
    {name: audioFileName, data: audio},
  ];

  const albumArt =
    options.albumArt === null ? null : (options.albumArt ?? albumArtFor(doc.song.name));
  if (albumArt) {
    files.push({name: options.albumArtFileName ?? 'album.png', data: albumArt});
  }

  return {
    name: safeFolderName(`${doc.song.artist} - ${doc.song.name}`),
    files,
    issues,
    audioIsSilent,
    notes: options.notes ?? [],
  };
}

/** One folder as a .zip containing a single top-level directory. */
export function zipChartFolder(folder: ChartFolder): Uint8Array {
  return zipChartFolders([folder]);
}

/** Several folders in one .zip, each as its own top-level directory. */
export function zipChartFolders(folders: ChartFolder[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  const used = new Map<string, number>();

  for (const folder of folders) {
    // Two lessons can share a title; never let one silently overwrite another.
    const seen = used.get(folder.name) ?? 0;
    used.set(folder.name, seen + 1);
    const name = seen === 0 ? folder.name : `${folder.name} (${seen + 1})`;
    for (const file of folder.files) {
      entries[`${name}/${file.name}`] = file.data;
    }
  }

  return zipSync(entries, {level: 6});
}
