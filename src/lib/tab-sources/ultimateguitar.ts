/**
 * Ultimate Guitar source — search tabs and extract ASCII content from tab pages.
 * UG uses Cloudflare, so requests work from a real user machine (Tauri) but not
 * from server-side tooling. Tab content lives in a JSON blob on each page.
 *
 * Supports tab-type search results (ASCII tablature only, not chord sheets).
 */
import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import type {TextTabSource, TabSearchResult} from './types';

const BASE_URL = 'https://www.ultimate-guitar.com';
const SEARCH_URL = `${BASE_URL}/search.php`;

/** Browser-like headers that pass Cloudflare's basic bot checks on UG tab pages. */
function makeHeaders(referer?: string): Record<string, string> {
  return {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    referer: referer ?? BASE_URL,
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };
}

// ── Search result parsing ─────────────────────────────────────────────────────

interface UgSearchResult {
  id: number;
  song_name: string;
  artist_name: string;
  tab_url: string;
  type: string;
  rating: number;
}

/** Extract the js-store JSON blob from a UG HTML page. */
function extractStoreJson(html: string): unknown | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Modern UG: <div class="js-store" data-content="...">
  const storeEl = doc.querySelector('.js-store[data-content]');
  if (storeEl) {
    try {
      // getAttribute() already decodes HTML entities (&quot; → ") so raw is valid JSON
      const raw = storeEl.getAttribute('data-content') ?? '';
      return JSON.parse(raw);
    } catch {
      // fall through
    }
  }

  // Fallback: look for JSON in a <script> tag
  for (const script of Array.from(doc.querySelectorAll('script'))) {
    const text = script.textContent ?? '';
    const m = text.match(/window\.UGAPP_STATE\s*=\s*(\{.+?\});?\s*$/ms)
      ?? text.match(/data-content='(\{.+?\})'/ms);
    if (m) {
      try { return JSON.parse(m[1]); } catch { /* skip */ }
    }
  }
  return null;
}

function getSearchResults(store: unknown): UgSearchResult[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = store as any;
    const results = s?.store?.page?.data?.results
      ?? s?.data?.results
      ?? s?.results
      ?? [];
    return Array.isArray(results) ? results : [];
  } catch {
    return [];
  }
}

function getTabContent(store: unknown): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = store as any;
    return s?.store?.page?.data?.tab_view?.wiki_tab?.content
      ?? s?.store?.page?.data?.tab?.content
      ?? s?.data?.tab_view?.wiki_tab?.content
      ?? s?.data?.tab?.content
      ?? s?.tab?.content
      ?? null;
  } catch {
    return null;
  }
}

/**
 * Strip UG markup from tab content:
 *   [tab]…[/tab] wraps tab lines
 *   [ch]…[/ch]  wraps chord names
 *   [Verse], [Chorus], etc. are section headers
 */
function extractAsciiText(ugContent: string): string {
  return ugContent
    .replace(/\[tab\]([\s\S]*?)\[\/tab\]/gi, '$1')
    .replace(/\[ch\](.*?)\[\/ch\]/gi, '$1')
    .replace(/\[[A-Za-z0-9 _-]+\]/g, '')   // strip remaining [Section] markers
    .trim();
}

// ── TabSource implementation ──────────────────────────────────────────────────

export const UltimateGuitarSource: TextTabSource = {
  sourceId: 'ultimateguitar',
  name: 'Ultimate Guitar',

  async search(query: string): Promise<TabSearchResult[]> {
    const url =
      `${SEARCH_URL}?search_type=title&value=${encodeURIComponent(query)}&type[]=tabs`;

    const res = await tauriFetch(url, {headers: makeHeaders()});
    if (!res.ok) throw new Error(`Ultimate Guitar search failed: ${res.status}`);
    const html = await res.text();

    const store = extractStoreJson(html);
    if (!store) throw new Error('Could not parse Ultimate Guitar search results');

    const raw = getSearchResults(store);

    return raw
      .filter(r => r.type?.toLowerCase() === 'tabs' || r.type?.toLowerCase() === 'tab')
      .slice(0, 30)
      .map(r => ({
        id: String(r.id),
        title: r.song_name,
        artist: r.artist_name,
        sourceId: 'ultimateguitar',
        hasGp: false,
        viewUrl: r.tab_url,
        textTabUrl: r.tab_url,
      }));
  },

  /**
   * Fetch a UG tab page and return the raw ASCII text ready for importFromAsciiTab.
   * Called by the UI before running the importer.
   */
  async getTextContent(result: TabSearchResult): Promise<string> {
    if (!result.textTabUrl) throw new Error('No tab URL');
    const res = await tauriFetch(result.textTabUrl, {
      headers: makeHeaders(`${BASE_URL}/`),
    });
    if (!res.ok) throw new Error(`Ultimate Guitar tab fetch failed: ${res.status}`);
    const html = await res.text();
    const store = extractStoreJson(html);
    if (!store) throw new Error('Could not extract tab content from Ultimate Guitar page (Cloudflare may have blocked the request)');
    const content = getTabContent(store);
    if (!content) throw new Error('No tab content found on this page');
    return extractAsciiText(content);
  },
};
