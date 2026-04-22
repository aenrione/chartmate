import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { isSpotifyConnected, handleSpotifyCallback } from '@/lib/spotify-auth';
import { invalidateSpotifySdkCache } from '@/lib/spotify-sdk/ClientInstance';
import { syncRecentlyPlayed } from '@/lib/spotify-sdk/SpotifyHistorySync';

type SpotifyAuthContextType = {
  isConnected: boolean;
  refresh: () => Promise<void>;
};

const SpotifyAuthContext = createContext<SpotifyAuthContextType>({
  isConnected: false,
  refresh: async () => {},
});

export function SpotifyAuthProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  // Track whether we've already kicked off a recently-played sync this session
  const hasSyncedRef = useRef(false);

  const checkAndSetConnected = async (): Promise<boolean> => {
    const connected = await isSpotifyConnected();
    setIsConnected(connected);
    return connected;
  };

  /** Public refresh: returns void for context consumers */
  const refresh = async (): Promise<void> => {
    await checkAndSetConnected();
  };

  /** Run Phase 2 sync once per session after auth is confirmed */
  const triggerRecentlyPlayedSync = () => {
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;
    syncRecentlyPlayed().catch(err => {
      console.warn('[SpotifyHistorySync] Sync error:', err);
    });
  };

  useEffect(() => {
    checkAndSetConnected().then(connected => {
      if (connected) triggerRecentlyPlayedSync();
    });

    const handler = async (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      console.log('[spotify-auth] callback event received:', url);
      try {
        await handleSpotifyCallback(url);
        console.log('[spotify-auth] token exchange succeeded');
        invalidateSpotifySdkCache();
        const connected = await checkAndSetConnected();
        if (connected) triggerRecentlyPlayedSync();
      } catch (err) {
        console.error('[spotify-auth] callback failed:', err);
      }
    };

    window.addEventListener('spotify-callback', handler);
    return () => window.removeEventListener('spotify-callback', handler);
  }, []);

  return (
    <SpotifyAuthContext.Provider value={{ isConnected, refresh }}>
      {children}
    </SpotifyAuthContext.Provider>
  );
}

export function useSpotifyAuth() {
  return useContext(SpotifyAuthContext);
}
