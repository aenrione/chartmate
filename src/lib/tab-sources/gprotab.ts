import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import type {GpSource, TabSearchResult} from './types';

const BASE_URL = 'https://gprotab.net';
const TAB_PATH_RE = /^\/en\/tabs\/([^/]+)\/([^/]+)$/;

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const GProTabSource: GpSource = {
  sourceId: 'gprotab',
  name: 'GProTab',

  async search(query: string): Promise<TabSearchResult[]> {
    const url = `${BASE_URL}/en/search?q=${encodeURIComponent(query)}`;
    const response = await tauriFetch(url, {
      headers: {accept: 'text/html'},
    });
    if (!response.ok) {
      throw new Error(`GProTab search failed: ${response.status}`);
    }
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const seen = new Set<string>();
    const results: TabSearchResult[] = [];

    doc.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(a => {
      const href = a.getAttribute('href') ?? '';
      const match = TAB_PATH_RE.exec(href);
      if (!match || seen.has(href)) return;
      seen.add(href);
      const [, artistSlug, songSlug] = match;
      results.push({
        id: `${artistSlug}/${songSlug}`,
        title: slugToTitle(songSlug),
        artist: slugToTitle(artistSlug),
        sourceId: 'gprotab',
        hasGp: true,
        viewUrl: `${BASE_URL}${href}`,
      });
    });

    return results;
  },

  async getDownloadUrl(result: TabSearchResult): Promise<string> {
    return `${BASE_URL}/en/tabs/${result.id}?download`;
  },
};
