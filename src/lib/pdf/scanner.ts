import {readDir, stat} from '@tauri-apps/plugin-fs';
import {join} from '@tauri-apps/api/path';

export type ScannedPdf = {
  filename: string;
  relativePath: string;
  absolutePath: string;
  fileSizeBytes: number;
  detectedTitle: string | null;
  detectedArtist: string | null;
};

/**
 * Parse a PDF filename into title/artist components.
 * Handles common formats:
 *   "Artist - Title.pdf"
 *   "Title.pdf"
 */
export function parseFilename(filename: string): {title: string | null; artist: string | null} {
  const base = filename.replace(/\.pdf$/i, '').trim();

  const dashIdx = base.indexOf(' - ');
  if (dashIdx !== -1) {
    const left = base.slice(0, dashIdx).trim();
    const right = base.slice(dashIdx + 3).trim();
    return {artist: left, title: right};
  }

  return {title: base, artist: null};
}

/**
 * Recursively scan a directory for .pdf files.
 * Returns paths relative to rootDir.
 */
export async function scanPdfDirectory(rootDir: string): Promise<ScannedPdf[]> {
  const results: ScannedPdf[] = [];
  await walkDir(rootDir, rootDir, results);
  return results;
}

async function walkDir(rootDir: string, currentDir: string, results: ScannedPdf[]): Promise<void> {
  let entries;
  try {
    entries = await readDir(currentDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const absolutePath = await join(currentDir, entry.name);

    if (entry.isDirectory) {
      await walkDir(rootDir, absolutePath, results);
    } else if (entry.isFile && entry.name.toLowerCase().endsWith('.pdf')) {
      let fileSize = 0;
      try {
        const info = await stat(absolutePath);
        fileSize = info.size;
      } catch {
        // size stays 0
      }

      const relativePath = absolutePath.startsWith(rootDir)
        ? absolutePath.slice(rootDir.length).replace(/^[/\\]/, '')
        : absolutePath;

      const {title, artist} = parseFilename(entry.name);

      results.push({
        filename: entry.name,
        relativePath,
        absolutePath,
        fileSizeBytes: fileSize,
        detectedTitle: title,
        detectedArtist: artist,
      });
    }
  }
}
