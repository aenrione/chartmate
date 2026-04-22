// Observer event bus for WebDAV sync lifecycle.
// Components subscribe via onSyncEvent to refresh their own data slices —
// no full page reload needed after a pull.

export type SyncEvent =
  | 'sync:push-complete'
  | 'sync:pull-complete'
  | 'sync:conflict';

const bus = new EventTarget();

export function emitSyncEvent(event: SyncEvent): void {
  bus.dispatchEvent(new CustomEvent(event));
}

/** Subscribe to a sync event. Returns an unsubscribe function for useEffect cleanup. */
export function onSyncEvent(event: SyncEvent, cb: () => void): () => void {
  bus.addEventListener(event, cb);
  return () => bus.removeEventListener(event, cb);
}
