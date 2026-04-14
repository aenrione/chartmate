export type TabSearchResult = {
  id: string;
  title: string;
  artist: string;
  sourceId: string;
  /** True if a GP/GPX file is available for download. */
  hasGp: boolean;
  /** True if a PDF score is available for download. */
  hasPdf?: boolean;
  /** True if a Rocksmith PSARC file is available for download. */
  hasPsarc?: boolean;
  /** URL to view the tab in the source website. */
  viewUrl?: string;
  /**
   * For text-tab sources (classtab.org, Ultimate Guitar): URL to fetch the raw
   * ASCII text. The UI will run it through importFromAsciiTab automatically.
   */
  textTabUrl?: string;
};

/** Base interface every source must satisfy. */
export interface TabSource {
  sourceId: string;
  name: string;
  /** Optional HTTP headers to include when downloading files from this source. */
  downloadHeaders?: Record<string, string>;
  search(query: string): Promise<TabSearchResult[]>;
}

/** Sources that provide GP/GPX file downloads. */
export interface GpSource extends TabSource {
  getDownloadUrl(result: TabSearchResult): Promise<string>;
}

/** Sources that provide PDF score downloads. */
export interface PdfSource extends TabSource {
  getPdfUrl(result: TabSearchResult): Promise<string>;
}

/** Sources that provide raw ASCII tab text for importFromAsciiTab. */
export interface TextTabSource extends TabSource {
  getTextContent(result: TabSearchResult): Promise<string>;
}

export function isGpSource(s: TabSource): s is GpSource {
  return 'getDownloadUrl' in s;
}

export function isPdfSource(s: TabSource): s is PdfSource {
  return 'getPdfUrl' in s;
}

export function isTextTabSource(s: TabSource): s is TextTabSource {
  return 'getTextContent' in s;
}
