# Chartmate — Agent Guide

Chartmate is a **Tauri v2 desktop app** for Clone Hero / YARG players. React 19 frontend + Rust backend + SQLite database.

## Documentation

| Doc | What it covers |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Full tech stack, Tauri plugins, Rust commands, React contexts, state management, AlphaTab integration |
| [`docs/database.md`](docs/database.md) | All 30 SQLite tables with columns/types, relationships, migration history (001–028), model file index |
| [`docs/user-flows.md`](docs/user-flows.md) | Every route, page purpose, user journeys (Browse, Playbook, Spotify, Guitar Hub, Training, Tab Editor) |
| [`docs/integrations.md`](docs/integrations.md) | Spotify PKCE auth, Encore API, Ignition4/CustomsForge hidden-WebView download, YouTube, AlphaTab, PSARC |

**Read these docs first** before exploring the codebase — they map every major system.

---

## Key Files Quick Reference

### Entry Points
- `src/App.tsx` — router, all routes, root context providers
- `src-tauri/src/lib.rs` — Tauri builder, all plugins, all `invoke` commands registered

### Database
- `src/lib/local-db/client.ts` — Kysely init, WAL mode, migration runner
- `src/lib/local-db/types.ts` — auto-generated TypeScript types for all tables (`DB` interface)
- `src/lib/local-db/migrations/` — 28 sequential migration files
- `src/lib/local-db/*.ts` — one model file per domain (setlists, repertoire, pdf-library, etc.)

### State
- `src/lib/store.ts` — `prefs.json` key-value store (tokens, paths)
- `src/contexts/SpotifyAuthContext.tsx` — Spotify auth state + PKCE callback handler
- `src/contexts/SyncContext.tsx` — Encore catalog background sync status
- `src/pages/playbook/PlaybookProvider.tsx` — full practice session context (active item, speed, sections, progress)

### Major Features
- `src/pages/guitar/AlphaTabWrapper.tsx` — chart renderer (Guitar Pro files, PSARC)
- `src/lib/tab-editor/scoreOperations.ts` — tab editor note/beat/bar operations
- `src/lib/tab-editor/asciiTabImporter.ts` — ASCII tab → GP7 converter
- `src/lib/search-encore.ts` — Encore API search
- `src/lib/spotify-auth.ts` — Spotify PKCE flow
- `src-tauri/src/ignition.rs` — CustomsForge hidden WebView download system
- `src-tauri/src/psarc.rs` — Rocksmith PSARC parser

---

## Codebase Conventions

### Database
- All queries use **Kysely** (type-safe query builder). Raw SQL is rare (only for PRAGMAs in client.ts).
- `getLocalDb()` is called directly in model files and page components — no global query cache.
- Normalized text columns (`*_normalized`) are lowercase + diacritics-stripped for fuzzy matching.
- `md5` (chart fingerprint from Encore) is the primary FK linking `chorus_charts` → `saved_charts` → `setlist_items` → `song_sections`.

### IPC
- Frontend → Rust: `invoke('command_name', { args })` from `@tauri-apps/api/core`
- Rust → Frontend: `app.emit('event-name', payload)` caught by `listen()` in frontend
- HTTP requests that would fail CORS: use `fetch` from `@tauri-apps/plugin-http`
- File reads: `readFile` from `@tauri-apps/plugin-fs`

### Routing
- React Router v6 `createBrowserRouter`. All routes declared in `src/App.tsx`.
- Navigation state passed via `navigate('/path', { state: { ... } })` — no URL params for binary data.

### Styling
- Tailwind CSS v4 with Material Design 3-inspired tokens (`surface`, `on-surface`, `secondary`, `tertiary`, etc.)
- No CSS modules. All styling inline via Tailwind classes.

### No Global State Library
- No Redux, no Zustand, no Jotai, no React Query.
- State is local to components or shared via React Context.
- Server data fetched on mount with `useEffect` + `useState`.

---

## Running Locally

```bash
pnpm install
pnpm tauri dev       # dev mode (hot reload)
pnpm tauri build     # production bundle
```

Prerequisites: Rust (stable), Node.js 18+, pnpm.

Env var needed: `VITE_SPOTIFY_CLIENT_ID` (for Spotify OAuth).
