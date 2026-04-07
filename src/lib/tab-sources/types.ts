export type TabSearchResult = {
  id: string;
  title: string;
  artist: string;
  sourceId: string;
  /** True if a GP file can be downloaded directly (requires auth for some sources). */
  hasGp: boolean;
  /** URL to view the tab in the source website. */
  viewUrl?: string;
};

export interface TabSource {
  sourceId: string;
  name: string;
  search(query: string): Promise<TabSearchResult[]>;
  /** Resolves the GP file download URL. May throw if auth is required. */
  getDownloadUrl(result: TabSearchResult): Promise<string>;
}
