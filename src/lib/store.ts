import { load } from '@tauri-apps/plugin-store';

let _store: Awaited<ReturnType<typeof load>> | null = null;

async function getStore() {
  if (!_store) {
    _store = await load('prefs.json', { defaults: {}, autoSave: true });
  }
  return _store;
}

export async function storeGet<T>(key: string): Promise<T | null> {
  const store = await getStore();
  return (await store.get<T>(key)) ?? null;
}

export async function storeSet(key: string, value: unknown): Promise<void> {
  const store = await getStore();
  await store.set(key, value);
}

export async function storeDelete(key: string): Promise<void> {
  const store = await getStore();
  await store.delete(key);
}

// Typed helpers
export const STORE_KEYS = {
  SPOTIFY_ACCESS_TOKEN: 'spotify_access_token',
  SPOTIFY_REFRESH_TOKEN: 'spotify_refresh_token',
  SPOTIFY_TOKEN_EXPIRES_AT: 'spotify_token_expires_at',
  SONGS_FOLDER_PATH: 'songs_folder_path',
  PDF_LIBRARY_PATH: 'pdf_library_path',
  PDF_LIBRARY_LAST_SCAN: 'pdf_library_last_scan',
} as const;
