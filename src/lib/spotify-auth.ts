import { storeGet, storeSet, storeDelete, STORE_KEYS } from '@/lib/store';

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;
const REDIRECT_URI = 'chartmate://auth/callback';
const SCOPES = 'user-read-email user-library-read playlist-read-private playlist-read-collaborative';

export type SpotifyTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO string
};

function generateVerifier(length = 128): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, b => chars[b % chars.length]).join('');
}

async function generateChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Stored in memory only — valid for one auth session
let pendingVerifier: string | null = null;

export async function initiateSpotifyLogin(): Promise<void> {
  const verifier = generateVerifier();
  const challenge = await generateChallenge(verifier);
  pendingVerifier = verifier;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
  });

  // Try opener plugin first, fall back to window.open
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(`https://accounts.spotify.com/authorize?${params}`);
  } catch {
    window.open(`https://accounts.spotify.com/authorize?${params}`, '_blank');
  }
}

export async function handleSpotifyCallback(callbackUrl: string): Promise<void> {
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  if (!code || !pendingVerifier) throw new Error('Invalid callback or no pending auth');

  const verifier = pendingVerifier;
  pendingVerifier = null;

  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });

  if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`);
  const json = await resp.json();

  const expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();
  await storeSet(STORE_KEYS.SPOTIFY_ACCESS_TOKEN, json.access_token);
  await storeSet(STORE_KEYS.SPOTIFY_REFRESH_TOKEN, json.refresh_token);
  await storeSet(STORE_KEYS.SPOTIFY_TOKEN_EXPIRES_AT, expiresAt);
}

export type ProtectedAccessToken = {
  access_token: string;
  expires_at: Date;
};

export async function getSpotifyAccessToken(): Promise<ProtectedAccessToken> {
  const accessToken = await storeGet<string>(STORE_KEYS.SPOTIFY_ACCESS_TOKEN);
  const expiresAtStr = await storeGet<string>(STORE_KEYS.SPOTIFY_TOKEN_EXPIRES_AT);
  const refreshToken = await storeGet<string>(STORE_KEYS.SPOTIFY_REFRESH_TOKEN);

  if (!accessToken || !expiresAtStr || !refreshToken) {
    throw new Error('Not authenticated with Spotify');
  }

  const expiresAt = new Date(expiresAtStr);
  if (expiresAt.getTime() - 30_000 > Date.now()) {
    return { access_token: accessToken, expires_at: expiresAt };
  }

  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });

  if (!resp.ok) throw new Error('Spotify token refresh failed');
  const json = await resp.json();

  const newExpiresAt = new Date(Date.now() + json.expires_in * 1000);
  await storeSet(STORE_KEYS.SPOTIFY_ACCESS_TOKEN, json.access_token);
  await storeSet(STORE_KEYS.SPOTIFY_TOKEN_EXPIRES_AT, newExpiresAt.toISOString());
  if (json.refresh_token) {
    await storeSet(STORE_KEYS.SPOTIFY_REFRESH_TOKEN, json.refresh_token);
  }

  return { access_token: json.access_token, expires_at: newExpiresAt };
}

export async function clearSpotifyTokens(): Promise<void> {
  await storeDelete(STORE_KEYS.SPOTIFY_ACCESS_TOKEN);
  await storeDelete(STORE_KEYS.SPOTIFY_REFRESH_TOKEN);
  await storeDelete(STORE_KEYS.SPOTIFY_TOKEN_EXPIRES_AT);
}

export async function isSpotifyConnected(): Promise<boolean> {
  const token = await storeGet<string>(STORE_KEYS.SPOTIFY_ACCESS_TOKEN);
  return token !== null;
}
