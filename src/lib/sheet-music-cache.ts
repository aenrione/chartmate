import { appCacheDir, join } from '@tauri-apps/api/path';
import { readFile, writeFile, mkdir, exists, readDir } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { SngStream } from 'parse-sng';

const MIME_MAP: Record<string, string> = {
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/opus',
  chart: 'text/plain',
  mid: 'audio/midi',
  ini: 'text/plain',
};

function getMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

export async function getCachedChartDir(md5: string): Promise<string> {
  const cacheDir = await appCacheDir();
  return join(cacheDir, 'sheet_music', md5);
}

export async function isChartCached(md5: string): Promise<boolean> {
  const dir = await getCachedChartDir(md5);
  if (!(await exists(dir))) return false;
  try {
    const entries = await readDir(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

export async function fetchAndCacheChart(md5: string): Promise<void> {
  const dir = await getCachedChartDir(md5);
  await mkdir(dir, { recursive: true });

  const url = `https://files.enchor.us/${md5}.sng`;
  const response = await tauriFetch(url);
  if (!response.ok) throw new Error(`Failed to fetch chart ${md5}: ${response.status} ${response.statusText}`);
  if (!response.body) throw new Error(`Failed to fetch chart ${md5}: no response body`);

  await new Promise<void>((resolve, reject) => {
    const sngStream = new SngStream(response.body!, { generateSongIni: true });
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
        const total = chunks.reduce((a, c) => a + c.length, 0);
        const buf = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) { buf.set(c, off); off += c.length; }
        const filePath = await join(dir, fileName);
        await writeFile(filePath, buf);
        if (nextFile) nextFile(); else resolve();
      } catch (err) {
        reject(err);
      }
    });
    sngStream.on('error', reject);
    sngStream.start();
  });
}

export async function readCachedFile(md5: string, fileName: string): Promise<File> {
  const dir = await getCachedChartDir(md5);
  const filePath = await join(dir, fileName);
  const bytes = await readFile(filePath);
  const mime = getMime(fileName);
  const blob = new Blob([bytes], { type: mime });
  return new File([blob], fileName);
}

export async function listCachedFiles(md5: string): Promise<string[]> {
  const dir = await getCachedChartDir(md5);
  const entries = await readDir(dir);
  return entries.map(e => e.name).filter(Boolean) as string[];
}
