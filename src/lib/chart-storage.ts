import { join } from '@tauri-apps/api/path';
import { readFile, writeFile, mkdir, exists, readDir, remove } from '@tauri-apps/plugin-fs';
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

export interface ChartStorageConfig {
  getBaseDir: () => Promise<string>;
  subdir: string;
}

export interface ChartStorage {
  getChartDir: (md5: string) => Promise<string>;
  isStored: (md5: string) => Promise<boolean>;
  fetchAndStore: (md5: string) => Promise<void>;
  readFile: (md5: string, fileName: string) => Promise<File>;
  listFiles: (md5: string) => Promise<string[]>;
  deleteChart: (md5: string) => Promise<void>;
}

export function createChartStorage(config: ChartStorageConfig): ChartStorage {
  async function getChartDir(md5: string): Promise<string> {
    const baseDir = await config.getBaseDir();
    return join(baseDir, config.subdir, md5);
  }

  async function isStored(md5: string): Promise<boolean> {
    const dir = await getChartDir(md5);
    if (!(await exists(dir))) return false;
    try {
      const entries = await readDir(dir);
      return entries.length > 0;
    } catch {
      return false;
    }
  }

  async function fetchAndStore(md5: string): Promise<void> {
    const dir = await getChartDir(md5);
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
          await writeFile(await join(dir, fileName), buf);
          if (nextFile) nextFile(); else resolve();
        } catch (err) {
          reject(err);
        }
      });
      sngStream.on('error', reject);
      sngStream.start();
    });
  }

  async function readStoredFile(md5: string, fileName: string): Promise<File> {
    const dir = await getChartDir(md5);
    const filePath = await join(dir, fileName);
    const bytes = await readFile(filePath);
    const mime = getMime(fileName);
    return new File([new Blob([bytes], { type: mime })], fileName);
  }

  async function listFiles(md5: string): Promise<string[]> {
    const dir = await getChartDir(md5);
    const entries = await readDir(dir);
    return entries.map(e => e.name).filter(Boolean) as string[];
  }

  async function deleteChart(md5: string): Promise<void> {
    const dir = await getChartDir(md5);
    try {
      await remove(dir, { recursive: true });
    } catch {
      // Directory may not exist; safe to ignore
    }
  }

  return {
    getChartDir,
    isStored,
    fetchAndStore,
    readFile: readStoredFile,
    listFiles,
    deleteChart,
  };
}
