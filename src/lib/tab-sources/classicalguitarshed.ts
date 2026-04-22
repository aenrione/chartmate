/**
 * ClassicalGuitarShed.com — 1,300+ classical guitar scores as PDF (standard notation + TAB).
 * WordPress site; search via ?s= param. PDF URL resolved lazily on first "Save PDF" click.
 */
import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import type {PdfSource, TabSearchResult} from './types';

const BASE = 'https://www.classicalguitarshed.com';
const PDF_RE = /\.pdf(\?.*)?$/i;

const HEADERS = {
  accept: 'text/html,*/*',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

const pdfUrlCache = new Map<string, string>();

function findPdfHref(doc: Document): string | null {
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = a.getAttribute('href') ?? '';
    if (PDF_RE.test(href)) return href.startsWith('http') ? href : `${BASE}${href}`;
  }
  return null;
}

export const ClassicalGuitarShedSource: PdfSource = {
  sourceId: 'classicalguitarshed',
  name: 'CGShed',

  async search(query: string): Promise<TabSearchResult[]> {
    const res = await tauriFetch(`${BASE}/?s=${encodeURIComponent(query)}`, {headers: HEADERS});
    if (!res.ok) throw new Error(`ClassicalGuitarShed search failed: ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const seen = new Set<string>();
    const results: TabSearchResult[] = [];

    for (const a of Array.from(
      doc.querySelectorAll<HTMLAnchorElement>('article h1 a, article h2 a, article h3 a, h2.entry-title a'),
    )) {
      const href = a.getAttribute('href') ?? '';
      if (!href || seen.has(href)) continue;
      seen.add(href);
      results.push({
        id: href,
        title: a.textContent?.trim() ?? href,
        artist: 'Classical Guitar',
        sourceId: 'classicalguitarshed',
        hasGp: false,
        hasPdf: true,
        viewUrl: href,
      });
      if (results.length >= 25) break;
    }

    return results;
  },

  async getPdfUrl(result: TabSearchResult): Promise<string> {
    const cached = pdfUrlCache.get(result.id);
    if (cached) return cached;

    const res = await tauriFetch(result.viewUrl ?? result.id, {headers: HEADERS});
    if (!res.ok) throw new Error(`ClassicalGuitarShed fetch failed: ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const pdf = findPdfHref(doc);
    if (!pdf) throw new Error('No PDF found on this page');
    pdfUrlCache.set(result.id, pdf);
    return pdf;
  },
};
