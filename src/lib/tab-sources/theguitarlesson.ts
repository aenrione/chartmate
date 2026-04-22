import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import type {GpSource, TabSearchResult} from './types';

const BASE_URL = 'https://www.theguitarlesson.com';
const GP_EXT_RE = /\.(gpx|gp[3-5])(\?.*)?$/i;
const GP_QUALITY: Record<string, number> = {gp5: 4, gpx: 3, gp4: 2, gp3: 1};

// Lazily resolved download URLs.
const downloadUrlCache = new Map<string, string>();

const HEADERS = {
  accept: 'text/html, application/xhtml+xml, */*',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

const TAB_PAGE_RE = /\/guitar-pro-tabs\/[a-z0-9]/;

/** Pick the best GP file from a list of hrefs (prefer higher version numbers). */
function bestGpHref(hrefs: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const href of hrefs) {
    const ext = href.split('.').pop()?.toLowerCase() ?? '';
    const score = GP_QUALITY[ext] ?? 0;
    if (score > bestScore) {
      best = href;
      bestScore = score;
    }
  }
  return best;
}

function findGpLinks(doc: Document): string[] {
  const hrefs: string[] = [];
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = a.getAttribute('href') ?? '';
    if (GP_EXT_RE.test(href)) hrefs.push(href);
  }
  return hrefs;
}

/** Parse "Song Title – Artist Name" into {artist, title}. */
function parseTglTitle(text: string): {artist: string; title: string} {
  const sep = text.includes(' \u2013 ') ? ' \u2013 ' : text.includes(' - ') ? ' - ' : null;
  if (sep) {
    const idx = text.lastIndexOf(sep);
    const title = text.slice(0, idx).trim();
    const artist = text.slice(idx + sep.length).trim();
    if (artist.length < 50) return {artist, title};
  }
  return {artist: '', title: text.trim()};
}

export const TheGuitarLessonSource: GpSource = {
  sourceId: 'theguitarlesson',
  name: 'TheGuitarLesson',

  async search(query: string): Promise<TabSearchResult[]> {
    const url = `${BASE_URL}/guitar-pro-tabs/?s=${encodeURIComponent(query)}`;
    const response = await tauriFetch(url, {headers: HEADERS});
    if (!response.ok) {
      throw new Error(`TheGuitarLesson search failed: ${response.status}`);
    }
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const seen = new Set<string>();
    const results: TabSearchResult[] = [];

    // Results are in <article> elements with heading links
    const headingLinks = doc.querySelectorAll<HTMLAnchorElement>(
      'article h1 a, article h2 a, article h3 a',
    );

    for (const a of Array.from(headingLinks)) {
      const href = a.getAttribute('href') ?? '';
      if (!TAB_PAGE_RE.test(href) || seen.has(href)) continue;
      seen.add(href);

      const rawText = a.textContent?.trim() ?? '';
      const {artist, title} = parseTglTitle(rawText);
      const id = href; // use full URL as stable ID

      results.push({
        id,
        title: title || rawText,
        artist,
        sourceId: 'theguitarlesson',
        hasGp: true,
        viewUrl: href,
      });
    }

    return results;
  },

  async getDownloadUrl(result: TabSearchResult): Promise<string> {
    const cached = downloadUrlCache.get(result.id);
    if (cached) return cached;

    const pageUrl = result.viewUrl ?? result.id;
    if (!pageUrl) throw new Error('No page URL available');

    const response = await tauriFetch(pageUrl, {headers: HEADERS});
    if (!response.ok) throw new Error(`TheGuitarLesson fetch failed: ${response.status}`);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const hrefs = findGpLinks(doc);
    const best = bestGpHref(hrefs);
    if (!best) throw new Error('No GP file found on this page');

    downloadUrlCache.set(result.id, best);
    return best;
  },
};
