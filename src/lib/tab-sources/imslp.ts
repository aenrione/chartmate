/**
 * IMSLP (Petrucci Music Library) — public domain classical sheet music.
 * Search via MediaWiki API. Each search work page is fetched to enumerate
 * PDF editions; each edition becomes its own TabSearchResult row.
 * Cap: 5 works × 4 editions = up to 20 rows per query.
 */
import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import type {PdfSource, TabSearchResult} from './types';

const API = 'https://imslp.org/api.php';
const BASE = 'https://imslp.org';
const MAX_WORKS = 5;
const MAX_EDITIONS = 4;

const HEADERS = {
  accept: 'application/json, text/html, */*',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

interface MwSearchResult {
  title: string;
}

/** Parse "Piece Title (Composer, Full Name)" into {title, artist}. */
function parseImslpTitle(raw: string): {title: string; artist: string} {
  const m = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) return {title: m[1].trim(), artist: m[2].trim()};
  return {title: raw, artist: ''};
}

/** Fetch a work page and return up to MAX_EDITIONS PDF hrefs with labels. */
async function fetchEditions(
  pageTitle: string,
): Promise<Array<{label: string; url: string}>> {
  const url =
    `${API}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&format=json&origin=*`;
  const res = await tauriFetch(url, {headers: HEADERS});
  if (!res.ok) return [];

  let html: string;
  try {
    const json = await res.json() as {parse?: {text?: {'*'?: string}}};
    html = json?.parse?.text?.['*'] ?? '';
  } catch {
    return [];
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const editions: Array<{label: string; url: string}> = [];

  // IMSLP renders file rows as <tr> inside tables with class "wikitable". Each
  // row contains an <a href="/wiki/File:..."> and a direct .pdf download link.
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href*=".pdf"]'))) {
    const href = a.getAttribute('href') ?? '';
    const fullUrl = href.startsWith('http') ? href : `${BASE}${href}`;
    // Skip non-score PDFs (booklets, theory texts) — keep only those in /wiki/Special:IMSLPDisclaimerAccept
    if (!href.includes('IMSLP') && !href.includes('imslp')) continue;
    const label = a.closest('tr')?.querySelector('td')?.textContent?.trim() ?? '';
    editions.push({label, url: fullUrl});
    if (editions.length >= MAX_EDITIONS) break;
  }

  return editions;
}

export const ImslpSource: PdfSource = {
  sourceId: 'imslp',
  name: 'IMSLP',

  async search(query: string): Promise<TabSearchResult[]> {
    const searchUrl =
      `${API}?action=query&list=search&srsearch=${encodeURIComponent(query)}` +
      `&srnamespace=0&srlimit=${MAX_WORKS}&format=json&origin=*`;

    const res = await tauriFetch(searchUrl, {headers: HEADERS});
    if (!res.ok) throw new Error(`IMSLP search failed: ${res.status}`);

    let works: MwSearchResult[];
    try {
      const json = await res.json() as {query?: {search?: MwSearchResult[]}};
      works = json?.query?.search ?? [];
    } catch {
      throw new Error('IMSLP: could not parse search response');
    }

    // Fetch all work pages in parallel to enumerate editions
    const perWork = await Promise.all(
      works.map(async (work) => {
        const {title, artist} = parseImslpTitle(work.title);
        const editions = await fetchEditions(work.title);
        const pageUrl = `${BASE}/wiki/${encodeURIComponent(work.title.replace(/ /g, '_'))}`;

        if (editions.length === 0) {
          // No PDF found — return a single row with hasPdf:false so the user can at least View it
          return [{
            id: work.title,
            title,
            artist,
            sourceId: 'imslp',
            hasGp: false,
            hasPdf: false,
            viewUrl: pageUrl,
          } satisfies TabSearchResult];
        }

        return editions.map((ed, i): TabSearchResult => ({
          id: `${work.title}::${i}`,
          title: ed.label ? `${title} — ${ed.label}` : title,
          artist,
          sourceId: 'imslp',
          hasGp: false,
          hasPdf: true,
          viewUrl: pageUrl,
          // stash the direct PDF url in textTabUrl for retrieval in getPdfUrl
          textTabUrl: ed.url,
        }));
      }),
    );

    return perWork.flat();
  },

  async getPdfUrl(result: TabSearchResult): Promise<string> {
    if (result.textTabUrl) return result.textTabUrl;
    throw new Error('No PDF URL available for this IMSLP entry');
  },
};
