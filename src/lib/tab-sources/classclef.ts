import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import type {GpSource, PdfSource, TabSearchResult} from './types';

const BASE_URL = 'https://classclef.com';
const WP_API = `${BASE_URL}/wp-json/wp/v2`;
const GP_EXT_RE = /\.(gpx|gp[3-5])(\?.*)?$/i;
const PDF_EXT_RE = /\.pdf(\?.*)?$/i;

// Lazily resolved download URLs — populated at search time, fetched on demand if missing.
const downloadUrlCache = new Map<string, string>();
const pdfUrlCache = new Map<string, string>();

const HEADERS = {
  accept: 'application/json, text/html, */*',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

type WpPost = {
  id: number;
  title: {rendered: string};
  link: string;
  content: {rendered: string};
};

/** Split "Composer – Piece Title" into its two parts. */
function parseClassClefTitle(raw: string): {composer: string; piece: string} {
  // ClassClef uses an en-dash (–) as separator
  const sep = raw.includes(' – ') ? ' – ' : raw.includes(' - ') ? ' - ' : null;
  if (sep) {
    const idx = raw.indexOf(sep);
    const left = raw.slice(0, idx).trim();
    const right = raw.slice(idx + sep.length).trim();
    // Composer names are short and don't contain opus/key terms
    const looksLikeComposer = (s: string) =>
      s.length < 35 && !/\b(op\.|no\.|bwv|in [a-g]|major|minor|arr|arranged)\b/i.test(s);
    if (looksLikeComposer(left)) return {composer: left, piece: right};
    if (looksLikeComposer(right)) return {composer: right, piece: left};
  }
  return {composer: 'Classical Guitar', piece: raw};
}

function toAbsolute(href: string): string {
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  return `${BASE_URL}${href}`;
}

/** Find all GP/GPX and PDF download hrefs inside HTML content. */
function findFileLinks(html: string): {gp: string | null; pdf: string | null} {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let gp: string | null = null;
  let pdf: string | null = null;
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = a.getAttribute('href') ?? '';
    if (!gp && GP_EXT_RE.test(href)) gp = href;
    if (!pdf && PDF_EXT_RE.test(href)) pdf = href;
    if (gp && pdf) break;
  }
  return {gp, pdf};
}

export const ClassClefSource: GpSource & PdfSource = {
  sourceId: 'classclef',
  name: 'ClassClef',
  downloadHeaders: HEADERS,

  async search(query: string): Promise<TabSearchResult[]> {
    const url =
      `${WP_API}/posts?search=${encodeURIComponent(query)}&per_page=25` +
      `&_fields=id,title,link,content&orderby=relevance`;

    const response = await tauriFetch(url, {headers: HEADERS});
    if (!response.ok) {
      throw new Error(`ClassClef search failed: ${response.status}`);
    }

    const posts: WpPost[] = await response.json();
    const results: TabSearchResult[] = [];

    for (const post of posts) {
      const rawTitle = post.title.rendered
        .replace(/&#8211;/g, '–')
        .replace(/&#8212;/g, '—')
        .replace(/&amp;/g, '&')
        .replace(/<[^>]+>/g, '')
        .trim();

      const {composer, piece} = parseClassClefTitle(rawTitle);
      const id = String(post.id);

      const {gp: gpHref, pdf: pdfHref} = findFileLinks(post.content.rendered);
      if (gpHref) {
        const absolute = toAbsolute(gpHref);
        downloadUrlCache.set(id, absolute);
      }
      if (pdfHref) {
        const absolute = toAbsolute(pdfHref);
        pdfUrlCache.set(id, absolute);
      }

      results.push({
        id,
        title: piece,
        artist: composer,
        sourceId: 'classclef',
        hasGp: gpHref !== null,
        hasPdf: pdfHref !== null,
        viewUrl: post.link,
      });
    }

    return results;
  },

  async getDownloadUrl(result: TabSearchResult): Promise<string> {
    const cached = downloadUrlCache.get(result.id);
    if (cached) return cached;

    const {gp, pdf} = await fetchFileLinks(result);
    if (gp) return gp;
    if (pdf) throw new Error('Only a PDF is available for this piece — use Save PDF instead');
    throw new Error('No GP file found on this ClassClef page');
  },

  async getPdfUrl(result: TabSearchResult): Promise<string> {
    const cached = pdfUrlCache.get(result.id);
    if (cached) return cached;

    const {pdf} = await fetchFileLinks(result);
    if (pdf) return pdf;
    throw new Error('No PDF found on this ClassClef page');
  },
};

async function fetchFileLinks(
  result: TabSearchResult,
): Promise<{gp: string | null; pdf: string | null}> {
  if (!result.viewUrl) throw new Error('No view URL to resolve download from');
  const response = await tauriFetch(result.viewUrl, {headers: HEADERS});
  if (!response.ok) throw new Error(`ClassClef fetch failed: ${response.status}`);
  const html = await response.text();
  const {gp: gpHref, pdf: pdfHref} = findFileLinks(html);

  const gp = gpHref ? toAbsolute(gpHref) : null;
  const pdf = pdfHref ? toAbsolute(pdfHref) : null;
  if (gp) downloadUrlCache.set(result.id, gp);
  if (pdf) pdfUrlCache.set(result.id, pdf);
  return {gp, pdf};
}
