import { open } from '@tauri-apps/plugin-dialog';
import { storeGet, storeSet, STORE_KEYS } from '@/lib/store';

export async function getSongsFolderPath(): Promise<string | null> {
  return storeGet<string>(STORE_KEYS.SONGS_FOLDER_PATH);
}

export async function promptForSongsFolder(): Promise<string> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select your Songs directory',
  });
  if (!selected || typeof selected !== 'string') {
    throw new Error('User canceled picker');
  }
  await storeSet(STORE_KEYS.SONGS_FOLDER_PATH, selected);
  return selected;
}

export async function getOrPromptSongsFolder(): Promise<string> {
  const existing = await getSongsFolderPath();
  if (existing) return existing;
  return promptForSongsFolder();
}
