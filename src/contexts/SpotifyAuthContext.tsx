import React, { createContext, useContext, useEffect, useState } from 'react';
import { isSpotifyConnected, handleSpotifyCallback } from '@/lib/spotify-auth';
import { invalidateSpotifySdkCache } from '@/lib/spotify-sdk/ClientInstance';

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

  const refresh = async () => {
    setIsConnected(await isSpotifyConnected());
  };

  useEffect(() => {
    refresh();

    const handler = async (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      console.log('[spotify-auth] callback event received:', url);
      try {
        await handleSpotifyCallback(url);
        console.log('[spotify-auth] token exchange succeeded');
        invalidateSpotifySdkCache();
        await refresh();
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
