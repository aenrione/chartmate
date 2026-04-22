# Chartmate — External Integrations

## 1. Spotify

### Authentication (PKCE)

File: `src/lib/spotify-auth.ts`

1. `initiateSpotifyLogin()` generates a 128-char random verifier and SHA-256 challenge
2. Opens `https://accounts.spotify.com/authorize` in system browser via `tauri-plugin-opener`
3. Redirect URI: `chartmate://auth/callback` (deep link scheme)
4. Deep link caught by `tauri-plugin-single-instance` → emitted as `deep-link://new-url` event on `app`
5. Frontend listener in `SpotifyAuthContext` dispatches `spotify-callback` custom DOM event
6. `handleSpotifyCallback(url)` exchanges code for tokens via POST to `https://accounts.spotify.com/api/token`
7. Tokens stored in `prefs.json` via `tauri-plugin-store` (keys: `spotify_access_token`, `spotify_refresh_token`, `spotify_token_expires_at`)
8. Auto-refresh: `getSpotifyAccessToken()` checks expiry with 30s buffer, refreshes automatically

### Scopes

```
user-read-email
user-library-read
playlist-read-private
playlist-read-collaborative
user-read-recently-played
```

### API Usage

All Spotify API calls go through `tauri-plugin-http` (`fetch` imported from `@tauri-apps/plugin-http`) to bypass browser CORS restrictions.

Files: `src/lib/spotify-sdk/`

Key operations:
- Fetch user playlists → stored in `spotify_playlists` + `spotify_playlist_tracks`
- Fetch album tracks → stored in `spotify_albums` + `spotify_album_tracks`
- Fetch recently played (50 tracks) → merged into `spotify_history` via `syncRecentlyPlayed()`

### History Import (Phase 1)

File: `src/components/SpotifyHistoryImportCard.tsx`

User selects Spotify data export JSON files (from `MyData/StreamingHistory*.json`). Each entry is merged into `spotify_history` (aggregating `play_count` and `ms_played`). Import records stored in `spotify_history_imports` to prevent double-import.

### Recently Played Sync (Phase 2)

File: `src/lib/spotify-sdk/SpotifyHistorySync.ts`  
Triggered once per session by `SpotifyAuthContext` after auth confirmed. Calls `https://api.spotify.com/v1/me/player/recently-played?limit=50`. Only fetches items after `spotify_history_last_synced_at`. Merges into `spotify_history`.

### Chart Matching

`spotify_track_chart_matches` stores pre-computed matches between Spotify track IDs and Encore chart MD5s. Matching is done by normalized artist+song name comparison against `chorus_charts`.

---

## 2. Encore (Enchor.us)

### Chart Catalog Sync

File: `src/lib/chorusChartDb/`

Background sync runs automatically on app start via `SyncContext`. Fetches the full Encore catalog using the advanced search API in paginated batches, storing everything in `chorus_charts`. Uses `chorus_scan_sessions` to track incremental sync progress (resumes from `last_chart_id`).

### Search API

File: `src/lib/search-encore.ts`

| Function | Endpoint | Notes |
|---|---|---|
| `searchEncore(search, instrument, page)` | `POST https://api.enchor.us/search` | Simple search |
| `searchAdvanced(options)` | `POST https://api.enchor.us/search/advanced` | Full filter set |
| `fetchAdvanced(options)` | Same, returns raw Response | Used by catalog sync |

Request body for `searchEncore`:
```json
{
  "search": "...",
  "page": 1,
  "instrument": null,
  "difficulty": null,
  "drumType": null,
  "source": "website"
}
```

Chart download URL format: `https://files.enchor.us/{md5}.sng`

---

## 3. Ignition4 / CustomsForge (CDLC)

### Architecture

File: `src-tauri/src/ignition.rs`

CustomsForge requires a login session cookie. To avoid managing cookies manually and to bypass CDN redirect CORS issues, the integration uses a hidden persistent WebView:

```
Frontend                Rust                 Hidden WebView
   │                     │                        │
   │── invoke('ignition_open_auth') ──────────────▶│ navigate to ignition4.customsforge.com
   │                     │                        │ user logs in
   │                     │◀── invoke('ignition_auth_ready') ─────│ JS detects dt-token meta
   │◀─ emit('ignition://ready') ─────────────────│
   │                     │                        │
   │── invoke('ignition_search', {query}) ──────────────────────▶│
   │                     │◀── invoke('ignition_callback', {id, ok, data}) ─│ fetch /cdlc
   │◀─ search results ──│
   │                     │                        │
   │── invoke('ignition_download', {cdlcId}) ─────────────────────▶│
   │                     │                        │ fetch /cdlc/{id}, parse DOM, return URL
   │                     │ open ephemeral hidden WebView with signed CDN URL
   │                     │ WebView on_download saves to app cache
   │◀─ base64 PSARC bytes ───────────────────────│
```

### Auth Detection

The `INIT_SCRIPT` injected into every page of the auth window watches for `<meta name="dt-token">`. When found, it calls `invoke('ignition_auth_ready')` which hides the auth window and emits `ignition://ready` to the main window.

### Download Flow

1. JS in auth window fetches `/cdlc/{id}` (same-origin, session cookie attached), parses page DOM for `a[href*="platform=pc"]` download link
2. Returns signed CDN URL to Rust via `ignition_callback`
3. Rust opens a **new ephemeral hidden WebView** navigating to that URL
4. `DOWNLOAD_INIT_SCRIPT` injected: auto-clicks Google Drive / Mediafire confirmation pages
5. `on_download` Tauri handler fires when WebView receives binary response → saves to `{app_cache_dir}/ignition-dl-{id}.psarc`
6. File read, base64-encoded, returned to frontend. Temp file deleted.
7. Timeout: 120 seconds for download, 30 seconds for JS callbacks.

### Rust State

`IgnitionState` (managed globally):
- `pending: Mutex<HashMap<u64, oneshot::Sender<CallbackPayload>>>` — in-flight JS→Rust callbacks
- `pending_downloads: Mutex<HashMap<u64, oneshot::Sender<Result<(), String>>>>` — in-flight downloads

---

## 4. YouTube

File: `src/lib/youtube-sync.ts`, `src/lib/youtube-utils.ts`

Users can associate a YouTube URL with any chart (`youtube_associations` table) with an `offset_ms` to sync playback. The YouTube player (`src/components/YouTubePlayer.tsx`) is embedded in the Playbook view when an association exists.

---

## 5. AlphaTab (Chart Rendering)

Library: `@coderline/alphatab`

File: `src/pages/guitar/AlphaTabWrapper.tsx`

Formats supported: `.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.gp7`

AlphaTab renders tablature (and optionally standard notation) from Guitar Pro binary files. It also handles audio playback using a SoundFont loaded from `src/lib/soundfont-store.ts`.

The `AlphaTabHandle` ref exposes:
- `getApi()` — direct access to the AlphaTabApi instance
- `playPause()`, `stop()`
- `setPlaybackSpeed(speed: number)`
- `setPlaybackRange(startTick, endTick)` / `clearPlaybackRange()`
- `renderScore(score, trackIndexes?)` / `renderTracks(tracks)`
- `setScale(scale)`

Events emitted to parent:
- `onScoreLoaded(score)` — when a file is parsed
- `onPositionChanged(currentTime, endTime, currentTick, endTick)` — during playback
- `onPlayerStateChanged(state)` — play/pause/stop transitions
- `onBeatMouseDown/Up(beat)` — click on a beat
- `onActiveBeatsChanged(beats)` — which beats are currently playing

---

## 6. Rocksmith / PSARC

Files: `src-tauri/src/psarc.rs`, `src/lib/rocksmith/`

Tauri commands:
- `parse_psarc(path)` → returns `{ arrangements: RocksmithArrangement[] }` — lists all guitar/bass arrangements in a `.psarc` file
- `extract_psarc_audio(path)` → extracts audio tracks

PSARC files are opened via native file dialog (`tauri-plugin-dialog`), read as bytes, and arrangements rendered via AlphaTab after conversion. The user can pick which arrangement to view.

---

## 7. `tauri-plugin-store` (Preferences)

File: `src/lib/store.ts`

Thin wrapper around `@tauri-apps/plugin-store`. Loads `prefs.json` lazily with `autoSave: true`. Exposes typed `storeGet<T>`, `storeSet`, `storeDelete` functions plus the `STORE_KEYS` enum.

This is the only persistence mechanism for user preferences and auth tokens — everything else is in SQLite.
