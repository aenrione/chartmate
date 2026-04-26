import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { isSpotifyConnected, handleSpotifyCallback, initiateSpotifyLogin, clearSpotifyTokens } from '@/lib/spotify-auth';
import { storeGet, storeSet, storeDelete, STORE_KEYS } from '@/lib/store';
import { invalidateSpotifySdkCache, getSpotifySdk } from '@/lib/spotify-sdk/ClientInstance';
import { syncRecentlyPlayed } from '@/lib/spotify-sdk/SpotifyHistorySync';

export type SpotifyUserProfile = {
  id: string;
  display_name: string;
  email: string;
  image_url: string | null;
};

type SpotifyAuthContextType = {
  isConnected: boolean;
  expiresAt: Date | null;
  userProfile: SpotifyUserProfile | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SpotifyAuthContext = createContext<SpotifyAuthContextType>({
  isConnected: false,
  expiresAt: null,
  userProfile: null,
  connect: async () => {},
  disconnect: async () => {},
  refresh: async () => {},
});

async function fetchAndCacheUserProfile(): Promise<SpotifyUserProfile | null> {
  try {
    const sdk = await getSpotifySdk();
    if (!sdk) return null;
    const me = await sdk.currentUser.profile();
    const profile: SpotifyUserProfile = {
      id: me.id,
      display_name: me.display_name ?? me.id,
      email: me.email ?? '',
      image_url: me.images?.[0]?.url ?? null,
    };
    await storeSet(STORE_KEYS.SPOTIFY_USER_PROFILE, profile);
    return profile;
  } catch {
    return null;
  }
}

export function SpotifyAuthProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [userProfile, setUserProfile] = useState<SpotifyUserProfile | null>(null);
  const hasSyncedRef = useRef(false);

  const loadCachedProfile = async () => {
    const cached = await storeGet<SpotifyUserProfile>(STORE_KEYS.SPOTIFY_USER_PROFILE);
    if (cached) setUserProfile(cached);
  };

  const checkAndSetConnected = async (): Promise<boolean> => {
    const connected = await isSpotifyConnected();
    setIsConnected(connected);
    if (connected) {
      const expiresAtStr = await storeGet<string>(STORE_KEYS.SPOTIFY_TOKEN_EXPIRES_AT);
      setExpiresAt(expiresAtStr ? new Date(expiresAtStr) : null);
    } else {
      setExpiresAt(null);
    }
    return connected;
  };

  const connect = async (): Promise<void> => {
    await initiateSpotifyLogin();
  };

  const disconnect = async (): Promise<void> => {
    await clearSpotifyTokens();
    await storeDelete(STORE_KEYS.SPOTIFY_USER_PROFILE);
    invalidateSpotifySdkCache();
    setIsConnected(false);
    setExpiresAt(null);
    setUserProfile(null);
    hasSyncedRef.current = false;
  };

  const refresh = async (): Promise<void> => {
    await checkAndSetConnected();
  };

  const triggerRecentlyPlayedSync = () => {
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;
    syncRecentlyPlayed().catch(err => {
      console.warn('[SpotifyHistorySync] Sync error:', err);
    });
  };

  const afterConnect = async () => {
    triggerRecentlyPlayedSync();
    const profile = await fetchAndCacheUserProfile();
    if (profile) setUserProfile(profile);
  };

  useEffect(() => {
    loadCachedProfile();
    checkAndSetConnected().then(connected => {
      if (connected) afterConnect();
    });

    const handler = async (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      try {
        await handleSpotifyCallback(url);
        invalidateSpotifySdkCache();
        const connected = await checkAndSetConnected();
        if (connected) afterConnect();
      } catch (err) {
        console.error('[spotify-auth] callback failed:', err);
      }
    };

    window.addEventListener('spotify-callback', handler);
    return () => window.removeEventListener('spotify-callback', handler);
  }, []);

  return (
    <SpotifyAuthContext.Provider value={{ isConnected, expiresAt, userProfile, connect, disconnect, refresh }}>
      {children}
    </SpotifyAuthContext.Provider>
  );
}

export function useSpotifyAuth() {
  return useContext(SpotifyAuthContext);
}
