import {invoke} from '@tauri-apps/api/core';
import type {TabSource, TabSearchResult} from './types';

export function invalidateDtTokenCache() {
  // No-op — token management moved to Rust/WebView side.
}

/** Returns base64-encoded PSARC bytes. Caller decodes. */
export async function downloadPsarcBytes(cdlcId: number): Promise<ArrayBuffer> {
  const b64: string = await invoke('ignition_download', {cdlcId});
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

type IgnitionEntry = {
  id: number;
  title: string;
  album: string;
  duration: string;
  year: number;
  downloads: number;
  version: number;
  file_pc_link: boolean;
  file_mac_link: boolean;
  artist: {id: number; name: string};
  author: {id: number; name: string};
  genre: string;
  tuning?: string;
};

const BASE = 'https://ignition4.customsforge.com';

export const IgnitionSource: TabSource = {
  sourceId: 'ignition4',
  name: 'Ignition4',

  async search(query: string): Promise<TabSearchResult[]> {
    const jsonStr: string = await invoke('ignition_search', {query});
    const entries: IgnitionEntry[] = JSON.parse(jsonStr);

    return entries.map(entry => ({
      id: String(entry.id),
      title: entry.title,
      artist: entry.artist?.name ?? 'Unknown',
      sourceId: 'ignition4',
      hasGp: false,
      hasPsarc: entry.file_pc_link || entry.file_mac_link,
      viewUrl: `${BASE}/cdlc/${entry.id}`,
    }));
  },
};
