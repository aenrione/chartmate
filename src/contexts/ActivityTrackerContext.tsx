import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import {
  addHeartbeat,
  closeSession,
  openSession,
  reapOrphanSessions,
  type ActivityContext,
} from '@/lib/local-db/active-time';

const HEARTBEAT_MS = 30_000;
const DEFAULT_IDLE_MS = 3 * 60_000;
const IDLE_BY_CONTEXT: Record<ActivityContext, number> = {
  browse: DEFAULT_IDLE_MS,
  lesson: 2 * 60_000,
  drill: 60_000,
  ear: 90_000,
  repertoire: 5 * 60_000,
  fill: 2 * 60_000,
  rudiment: 2 * 60_000,
  tab_editor: 4 * 60_000,
  playbook: 5 * 60_000,
};

type Phase = 'active' | 'idle' | 'paused' | 'closed';
type Event = 'activity' | 'idle_timeout' | 'hide' | 'show' | 'unmount';

function reduce(phase: Phase, event: Event): Phase {
  switch (phase) {
    case 'active':
      if (event === 'idle_timeout') return 'idle';
      if (event === 'hide') return 'paused';
      if (event === 'unmount') return 'closed';
      return phase;
    case 'idle':
      if (event === 'activity') return 'active';
      if (event === 'hide') return 'paused';
      if (event === 'unmount') return 'closed';
      return phase;
    case 'paused':
      if (event === 'show') return 'active';
      if (event === 'unmount') return 'closed';
      return phase;
    case 'closed':
      return phase;
  }
}

interface ActivityTrackerValue {
  setContext: (ctx: ActivityContext) => void;
}

const ActivityTrackerContext = createContext<ActivityTrackerValue>({
  setContext: () => {},
});

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

export function ActivityTrackerProvider({children}: {children: ReactNode}) {
  const [phase, dispatch] = useReducer(reduce, 'active' as Phase);

  const contextRef = useRef<ActivityContext>('browse');
  const sessionIdRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>(phase);
  const idleTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(Date.now());

  phaseRef.current = phase;

  const idleThreshold = IDLE_BY_CONTEXT[contextRef.current] ?? DEFAULT_IDLE_MS;

  const startSessionIfNeeded = useCallback(async () => {
    if (sessionIdRef.current != null) return;
    try {
      sessionIdRef.current = await openSession(contextRef.current);
      lastTickRef.current = Date.now();
    } catch (err) {
      console.warn('[activity-tracker] openSession failed', err);
    }
  }, []);

  const flushHeartbeat = useCallback(async () => {
    const id = sessionIdRef.current;
    if (id == null) return;
    const now = Date.now();
    const delta = Math.max(0, now - lastTickRef.current);
    lastTickRef.current = now;
    if (delta === 0) return;
    try {
      await addHeartbeat(id, delta);
    } catch (err) {
      console.warn('[activity-tracker] heartbeat failed', err);
    }
  }, []);

  const endCurrentSession = useCallback(async () => {
    const id = sessionIdRef.current;
    if (id == null) return;
    sessionIdRef.current = null;
    const now = Date.now();
    const delta = Math.max(0, now - lastTickRef.current);
    try {
      await closeSession(id, delta);
    } catch (err) {
      console.warn('[activity-tracker] closeSession failed', err);
    }
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      dispatch('idle_timeout');
    }, IDLE_BY_CONTEXT[contextRef.current] ?? DEFAULT_IDLE_MS);
  }, []);

  const onActivity = useCallback(() => {
    if (phaseRef.current === 'active') {
      resetIdleTimer();
      return;
    }
    if (phaseRef.current === 'idle') {
      dispatch('activity');
    }
  }, [resetIdleTimer]);

  // Mount: reap orphans + start session + listeners
  useEffect(() => {
    void reapOrphanSessions().catch(() => {});
    void startSessionIfNeeded();
    resetIdleTimer();

    const handleVisibility = () => {
      if (document.hidden) dispatch('hide');
      else dispatch('show');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', () => dispatch('hide'));
    window.addEventListener('focus', () => dispatch('show'));

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, {passive: true});
    }

    const handleUnload = () => {
      // Best-effort sync close on unload — heartbeat already covers most loss.
      const id = sessionIdRef.current;
      if (id == null) return;
      const delta = Math.max(0, Date.now() - lastTickRef.current);
      void addHeartbeat(id, delta).catch(() => {});
      void closeSession(id, 0).catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      dispatch('unmount');
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
      if (heartbeatTimerRef.current != null) window.clearInterval(heartbeatTimerRef.current);
      void endCurrentSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase effects: drive heartbeat + session lifecycle
  useEffect(() => {
    if (heartbeatTimerRef.current != null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    if (phase === 'active') {
      void startSessionIfNeeded();
      resetIdleTimer();
      heartbeatTimerRef.current = window.setInterval(() => {
        void flushHeartbeat();
      }, HEARTBEAT_MS);
    } else if (phase === 'idle' || phase === 'paused') {
      if (idleTimerRef.current != null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      void (async () => {
        await flushHeartbeat();
        await endCurrentSession();
      })();
    }
  }, [phase, startSessionIfNeeded, flushHeartbeat, endCurrentSession, resetIdleTimer, idleThreshold]);

  const setContext = useCallback(
    (ctx: ActivityContext) => {
      if (contextRef.current === ctx) return;
      contextRef.current = ctx;
      // Close current session and open a new one tagged with the new context.
      void (async () => {
        await flushHeartbeat();
        await endCurrentSession();
        if (phaseRef.current === 'active') {
          await startSessionIfNeeded();
          resetIdleTimer();
        }
      })();
    },
    [flushHeartbeat, endCurrentSession, startSessionIfNeeded, resetIdleTimer],
  );

  return (
    <ActivityTrackerContext.Provider value={{setContext}}>
      {children}
    </ActivityTrackerContext.Provider>
  );
}

export function useActivityTracker() {
  return useContext(ActivityTrackerContext);
}

/** Tag the current page's active time with a specific context for the duration of mount. */
export function useActivityContext(ctx: ActivityContext) {
  const {setContext} = useActivityTracker();
  useEffect(() => {
    setContext(ctx);
    return () => setContext('browse');
  }, [ctx, setContext]);
}
