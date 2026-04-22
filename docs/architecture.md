# Chartmate — Architecture

## Overview

Chartmate is a Tauri v2 desktop app for Clone Hero / YARG players. The frontend is React 19 + TypeScript running in a WebView; the backend is Rust exposing native capabilities via Tauri IPC commands.

```
┌────────────────────────────────────────────────────────────┐
│                    React Frontend (WebView)                  │
│  React Router · React Contexts · Kysely → SQLite            │
├────────────────────────────────────────────────────────────┤
│                     Tauri IPC Layer                         │
│  invoke() / emit() / deep-link events                       │
├────────────────────────────────────────────────────────────┤
│                      Rust Backend                           │
│  tauri-plugin-sql · tauri-plugin-fs · tauri-plugin-http    │
│  tauri-plugin-store · tauri-plugin-deep-link               │
│  tauri-plugin-localhost · tauri-plugin-single-instance     │
└────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | Tauri v2 |
| Frontend | React 19, TypeScript, Tailwind CSS v4 |
| Routing | React Router v6 (`createBrowserRouter`) |
| Database | SQLite via `tauri-plugin-sql` + Kysely ORM |
| Persistence (prefs) | `tauri-plugin-store` → `prefs.json` |
| Chart rendering | AlphaTab (`@coderline/alphatab`) |
| Audio playback | AlphaTab built-in player + SoundFont |
| Icon set | Lucide React |
| Toast notifications | Sonner |

## Frontend Structure

```
src/
├── App.tsx                  # Router definition, RootLayout
├── components/              # Shared UI components
│   ├── Layout.tsx           # App shell (sidebar + main area)
│   ├── FirstLaunchSetup.tsx # Songs-folder picker modal
│   ├── IgnitionLoginDialog.tsx
│   ├── SpotifyHistoryImportCard.tsx
│   ├── SpotifyLibraryExplorer.tsx
│   ├── TrackDetailDrawer.tsx
│   ├── TabsBrowseTab.tsx
│   └── ui/                  # Primitive UI components (shadcn-style)
├── contexts/
│   ├── SpotifyAuthContext.tsx  # Spotify token state + callback handler
│   ├── SyncContext.tsx         # Chorus chart DB background sync status
│   └── SidebarContext.tsx      # Sidebar collapsed/expanded state
├── hooks/                   # Custom hooks
├── lib/                     # Core logic (DB, audio, search, etc.)
│   ├── local-db/            # Kysely DB client, models, migrations
│   ├── spotify-sdk/         # Spotify API client wrappers
│   ├── spotify-server/      # (legacy server helpers)
│   ├── tab-editor/          # Guitar tab editor engine
│   ├── audio-engine/        # Audio playback utilities
│   ├── chartSelection/      # Chart selection and comparison logic
│   ├── chorusChartDb/       # Encore chart catalog sync
│   ├── rocksmith/           # Rocksmith PSARC/XML types
│   └── store.ts             # tauri-plugin-store wrapper (prefs.json)
└── pages/                   # Route components (see user-flows.md)
```

## Rust Backend

File: `src-tauri/src/lib.rs`

### Registered Plugins

| Plugin | Purpose |
|---|---|
| `tauri-plugin-fs` | Read local files (GP files, PSARC, PDF) |
| `tauri-plugin-dialog` | Native file open/save dialogs |
| `tauri-plugin-store` | JSON key-value store (`prefs.json`) |
| `tauri-plugin-deep-link` | `chartmate://` OAuth callback scheme |
| `tauri-plugin-sql` | SQLite database access |
| `tauri-plugin-http` | Outbound HTTP requests (bypasses CORS) |
| `tauri-plugin-opener` | Open URLs in system browser |
| `tauri-plugin-localhost` | Serve frontend on `localhost:1430` in production |
| `tauri-plugin-single-instance` | Single window, re-emits deep-link on second launch |

### Tauri Commands

| Command | File | Description |
|---|---|---|
| `parse_psarc` | `psarc.rs` | Parse a Rocksmith `.psarc` file, return arrangement list |
| `extract_psarc_audio` | `psarc.rs` | Extract audio tracks from PSARC |
| `ignition_open_auth` | `ignition.rs` | Open/focus hidden CustomsForge auth WebView |
| `ignition_auth_ready` | `ignition.rs` | Called by auth WebView JS when login detected |
| `ignition_callback` | `ignition.rs` | Bridge for async JS→Rust callbacks |
| `ignition_search` | `ignition.rs` | Search Ignition4 CDLC catalog via auth window |
| `ignition_download` | `ignition.rs` | Download a PSARC from CustomsForge (2-step) |

### Deep Link Protocol

Scheme: `chartmate://`

- `chartmate://auth/callback?code=...` — Spotify OAuth redirect, caught by `tauri-plugin-single-instance` and emitted as a `deep-link://new-url` event to the frontend.

### App Configuration (`tauri.conf.json`)

- Window: 1280×800, resizable
- Asset protocol scope: `$HOME/**`
- CSP: null (disabled)
- Bundle targets: `app`

## State Management

### Persistent State (prefs.json via tauri-plugin-store)

Keys defined in `src/lib/store.ts`:

| Key | Value |
|---|---|
| `spotify_access_token` | Spotify OAuth access token |
| `spotify_refresh_token` | Spotify OAuth refresh token |
| `spotify_token_expires_at` | ISO timestamp |
| `songs_folder_path` | Local Clone Hero / YARG songs directory |
| `pdf_library_path` | Local PDF sheet music directory |
| `pdf_library_last_scan` | ISO timestamp of last PDF scan |
| `customsforge_session_cookie` | (legacy) CustomsForge session |
| `customsforge_psarc_path` | (legacy) PSARC output path |
| `spotify_history_last_synced_at` | ISO timestamp of last history sync |

### React Contexts

| Context | Provider | Provides |
|---|---|---|
| `SpotifyAuthContext` | `SpotifyAuthProvider` | `isConnected: boolean`, `refresh()` |
| `SyncContext` | `SyncProvider` | `syncStatus: 'idle' \| 'running' \| 'complete'` |
| `SidebarContext` | `SidebarProvider` | Sidebar open/close state |
| `PlaybookContext` | `PlaybookProvider` | Full playbook session state (see user-flows.md) |

### Local Storage (browser)

Used for lightweight per-feature state that doesn't need persistence across reinstalls:
- `guitar.recentFiles` — last 20 opened Guitar Pro / PSARC files

## Database Layer

SQLite database at `sqlite:chartmate.db` (app data dir).

- ORM: Kysely with `ParseJSONResultsPlugin`
- Migrations: 28 sequential migrations in `src/lib/local-db/migrations/`
- WAL mode enabled, busy_timeout = 5000ms
- Types auto-generated via `kysely-codegen` → `src/lib/local-db/types.ts`

See `docs/database.md` for full schema.

## Ignition / CustomsForge Download Architecture

Two-step approach to avoid CORS with CDN redirects:

1. A hidden persistent WebView loads `ignition4.customsforge.com` and injects `INIT_SCRIPT`. This window holds the logged-in session cookies.
2. When a search is requested, Rust evals `window.__ignition.search(id, query)` in the auth window. JS fetches from `/cdlc` (same-origin, no CORS), passes result back via `ignition_callback` invoke.
3. For downloads, JS parses the CDLC detail page DOM to extract the signed CDN URL, then an ephemeral hidden WebView navigates to it. WKWebView's `on_download` handler fires when the CDN returns a binary, saving to app cache dir.
4. Downloaded PSARC is read, base64-encoded, returned to frontend.

## Chart Rendering (AlphaTab)

`src/pages/guitar/AlphaTabWrapper.tsx` wraps `@coderline/alphatab`:

- Accepts Guitar Pro files (`.gp`, `.gp3`–`.gp7`, `.gpx`) as `ArrayBuffer` or URL
- Renders tablature and standard notation
- Exposes `AlphaTabHandle` ref: `playPause`, `stop`, `setPlaybackSpeed`, `setPlaybackRange`, `renderScore`, `renderTracks`, `setScale`
- Emits events: `onScoreLoaded`, `onPositionChanged`, `onPlayerStateChanged`, `onBeatMouseDown`, `onActiveBeatsChanged`
- Audio playback uses SoundFont loaded from `src/lib/soundfont-store.ts`
