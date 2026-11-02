/**
 * In-window signal that library data changed outside the page's own actions — e.g. an agent
 * writing through the MCP bridge, which runs in this same webview. The library page listens
 * and refreshes in place.
 */
export const LIBRARY_CHANGED_EVENT = 'chartmate:library-changed';

export function notifyLibraryChanged(): void {
  window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
}
