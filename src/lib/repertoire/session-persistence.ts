/**
 * Persists an in-progress repertoire review session to localStorage so the
 * user can navigate away (e.g. to open a chart) and return without losing
 * their place.
 *
 * The session expires automatically after 24 hours.
 */

const KEY = 'repertoire_iq_active_session';

export interface PersistedSession {
  /** Item IDs in the shuffled review order */
  itemIds: number[];
  /** Index of the current (not-yet-rated) item */
  currentIndex: number;
  /** Results for items already rated this session */
  resultPairs: {itemId: number; quality: number}[];
  /** ISO timestamp — used for expiry */
  startedAt: string;
}

export function saveSession(session: PersistedSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // localStorage unavailable — silently skip
  }
}

export function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as PersistedSession;
    // Expire sessions older than 24 h
    const ageMs = Date.now() - new Date(session.startedAt).getTime();
    if (ageMs > 86_400_000) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** How many items are still left in the persisted session */
export function getSessionItemsRemaining(): number {
  const s = loadSession();
  return s ? s.itemIds.length - s.currentIndex : 0;
}
