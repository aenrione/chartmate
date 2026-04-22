/**
 * Classtab.org source — ~3 000 classical guitar tabs in plain ASCII format.
 * No search API; we fetch the full index once, cache it, then filter in-memory.
 * Tab files are plain .txt — opened via importFromAsciiTab in the UI.
 */
import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import type {TabSource, TabSearchResult} from './types';

const BASE = 'https://www.classtab.org';
const INDEX_URL = `${BASE}/index_old.htm`;

const HEADERS = {
  accept: 'text/html,*/*',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

interface IndexEntry {
  filename: string;
  label: string;       // link text from the index (e.g. "Bach JS – BWV 999 Prelude in C minor")
  composer: string;    // derived from the surrounding composer heading
}

let indexCache: IndexEntry[] | null = null;
let indexFetchPromise: Promise<IndexEntry[]> | null = null;

async function fetchIndex(): Promise<IndexEntry[]> {
  if (indexCache) return indexCache;
  if (indexFetchPromise) return indexFetchPromise;

  indexFetchPromise = (async () => {
    const res = await tauriFetch(INDEX_URL, {headers: HEADERS});
    if (!res.ok) throw new Error(`Classtab index fetch failed: ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const entries: IndexEntry[] = [];

    // Composers appear as bold/heading text, tabs as <a href="*.txt"> links.
    // Walk all anchors; infer composer from preceding h2/h3/b/strong or dt text.
    let currentComposer = '';
    for (const node of Array.from(doc.body.childNodes)) {
      walkNode(node, {
        onComposer: (name) => { currentComposer = name; },
        onTab: (filename, label) => {
          entries.push({filename, label, composer: currentComposer});
        },
      });
    }

    indexCache = entries;
    return entries;
  })();

  return indexFetchPromise;
}

interface WalkCallbacks {
  onComposer(name: string): void;
  onTab(filename: string, label: string): void;
}

function walkNode(node: Node, cb: WalkCallbacks): void {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    // Composer headings
    if (tag === 'h2' || tag === 'h3' || tag === 'dt') {
      const text = el.textContent?.trim() ?? '';
      if (text) cb.onComposer(text.split('(')[0].trim());
    }
    // Bold text used as composer heading in older HTML
    if ((tag === 'b' || tag === 'strong') && !el.closest('a')) {
      const text = el.textContent?.trim() ?? '';
      if (text && text.length > 3 && text.length < 80) cb.onComposer(text.split('(')[0].trim());
    }
    // Tab links
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? '';
      if (href.endsWith('.txt') && !href.startsWith('http')) {
        const label = el.textContent?.trim() ?? href.replace('.txt', '');
        cb.onTab(href, label);
        return; // don't walk children
      }
    }

    for (const child of Array.from(node.childNodes)) {
      walkNode(child, cb);
    }
  } else {
    // text nodes: skip
  }
}

function normalise(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export const ClasstabSource: TabSource = {
  sourceId: 'classtab',
  name: 'Classtab',

  async search(query: string): Promise<TabSearchResult[]> {
    const index = await fetchIndex();
    const q = normalise(query);
    const terms = q.split(' ').filter(Boolean);

    return index
      .filter(e => {
        const hay = normalise(`${e.composer} ${e.label} ${e.filename}`);
        return terms.every(t => hay.includes(t));
      })
      .slice(0, 40)
      .map(e => ({
        id: e.filename,
        title: e.label || e.filename.replace('.txt', '').replace(/_/g, ' '),
        artist: e.composer,
        sourceId: 'classtab',
        hasGp: false,
        hasPdf: false,
        viewUrl: `${BASE}/${e.filename}`,
        textTabUrl: `${BASE}/${e.filename}`,
      }));
  },

};
