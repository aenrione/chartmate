import {fetch as tauriFetch} from '@tauri-apps/plugin-http';

const DB_NAME = 'chartmate-soundfonts';
const DB_VERSION = 1;
const STORE_NAME = 'soundfonts';
const ACTIVE_KEY = 'chartmate-active-soundfont';

export interface SoundfontEntry {
  id: string;
  name: string;
  size: number;
  source: 'built-in' | 'imported' | 'downloaded';
  data: ArrayBuffer | null; // null for built-in (served from /public)
  url?: string; // for built-in soundfonts served from public dir
  createdAt: number;
}

export const BUILT_IN_SOUNDFONT: SoundfontEntry = {
  id: 'sonivox',
  name: 'Sonivox (Default)',
  size: 4_000_000,
  source: 'built-in',
  data: null,
  url: '/soundfont/sonivox.sf2',
  createdAt: 0,
};

export interface DownloadableSoundfont {
  id: string;
  name: string;
  description: string;
  size: string;
  downloadUrl: string;
  license: string;
}

export const DOWNLOADABLE_SOUNDFONTS: DownloadableSoundfont[] = [
  {
    id: 'generaluser-gs',
    name: 'GeneralUser GS',
    description: 'Full GM soundfont. Great guitar, bass, and drum patches.',
    size: '~30 MB',
    downloadUrl: 'https://musical-artifacts.com/artifacts/4625/GeneralUser_GS_v1.471.sf2',
    license: 'Free for any use',
  },
];

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {keyPath: 'id'});
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllSoundfonts(): Promise<SoundfontEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const userFonts = req.result as SoundfontEntry[];
      resolve([BUILT_IN_SOUNDFONT, ...userFonts]);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getSoundfont(id: string): Promise<SoundfontEntry | null> {
  if (id === 'sonivox') return BUILT_IN_SOUNDFONT;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve((req.result as SoundfontEntry) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSoundfont(entry: SoundfontEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteSoundfont(id: string): Promise<void> {
  if (id === 'sonivox') return; // can't delete built-in
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => {
      // If we deleted the active one, reset to default
      if (getActiveSoundfontId() === id) {
        setActiveSoundfontId('sonivox');
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export function getActiveSoundfontId(): string {
  return localStorage.getItem(ACTIVE_KEY) ?? 'sonivox';
}

export function setActiveSoundfontId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

/** Resolve the active soundfont to a URL string or Uint8Array for AlphaTab */
export async function loadActiveSoundfont(): Promise<string | Uint8Array> {
  const id = getActiveSoundfontId();
  const entry = await getSoundfont(id);
  if (!entry || entry.source === 'built-in') {
    return BUILT_IN_SOUNDFONT.url!;
  }
  return new Uint8Array(entry.data!);
}

export async function importSoundfontFile(file: File): Promise<SoundfontEntry> {
  const data = await file.arrayBuffer();
  const id = file.name.replace(/\.sf2$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const entry: SoundfontEntry = {
    id,
    name: file.name.replace(/\.sf2$/i, ''),
    size: data.byteLength,
    source: 'imported',
    data,
    createdAt: Date.now(),
  };
  await saveSoundfont(entry);
  return entry;
}

export async function downloadSoundfont(
  downloadable: DownloadableSoundfont,
  onProgress?: (loaded: number, total: number) => void,
): Promise<SoundfontEntry> {
  // Use Tauri's HTTP plugin to bypass CORS restrictions
  const response = await tauriFetch(downloadable.downloadUrl, {
    method: 'GET',
  });
  if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);

  const contentLength = Number(response.headers.get('content-length') ?? 0);

  // Try streaming with progress if body supports getReader
  let data: Uint8Array;
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      // Use estimated size (~30MB) if content-length is missing
      onProgress?.(loaded, contentLength || 30_000_000);
    }

    data = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } else {
    // Fallback: download entire response at once
    onProgress?.(0, contentLength || 30_000_000);
    const buf = await response.arrayBuffer();
    data = new Uint8Array(buf);
    onProgress?.(data.byteLength, data.byteLength);
  }

  const entry: SoundfontEntry = {
    id: downloadable.id,
    name: downloadable.name,
    size: data.byteLength,
    source: 'downloaded',
    data: data.buffer,
    createdAt: Date.now(),
  };
  await saveSoundfont(entry);
  return entry;
}
