# Chartmate — Pages & User Flows

## App Shell

### First Launch (`FirstLaunchSetup`)
On first run, a modal blocks the UI asking the user to select their Clone Hero / YARG songs folder. This path is stored in `prefs.json` under `songs_folder_path`. Once set, `setupComplete` becomes `true` and the modal is hidden.

### Layout (`src/components/Layout.tsx`)
Sidebar navigation + main content area. Sidebar state managed by `SidebarContext`. The `SyncProvider` runs the Encore catalog background sync on mount and shows a toast while running.

---

## Route Map

```
/                          → Home (hub)
/browse                    → BrowsePage (search + download charts)
/library                   → LibraryPage (tabs for sub-sections)
  /library/saved-charts    → SavedChartsPage
  /library/pdf             → PdfLibraryTab
  /library/explorer-lists  → ExplorerListsPage
/setlists                  → SetlistsPage
/playbook/:setlistId       → PlaybookPage (practice mode)
/spotify                   → SpotifyPage
/updates                   → UpdatesPage
/tab-editor                → TabEditorPage (new composition)
/tab-editor/:id            → TabEditorPage (edit existing)
/sheet-music               → DrumsHubPage
  /sheet-music/search      → SheetMusicPage
  /sheet-music/:slug       → SheetMusicSongPage
/guitar                    → GuitarPage (hub)
  /guitar/song             → GuitarSongView (file viewer)
  /guitar/fretboard        → FretboardIQPage
    /guitar/fretboard/drill/:drillType  → FretboardDrillPage
    /guitar/fretboard/progress          → FretboardProgressPage
    /guitar/fretboard/summary           → FretboardSummaryPage
  /guitar/chords           → ChordFinderPage
  /guitar/ear              → EarIQPage
    /guitar/ear/session/:exerciseType   → EarSessionPage
    /guitar/ear/summary                 → EarSummaryPage
    /guitar/ear/progress                → EarProgressPage
    /guitar/ear/recommendations         → EarRecommendationsPage
  /guitar/repertoire       → RepertoireIQPage
    /guitar/repertoire/session          → RepertoireSessionPage
    /guitar/repertoire/summary          → RepertoireSummaryPage
    /guitar/repertoire/progress         → RepertoireProgressPage
    /guitar/repertoire/manage           → RepertoireManagePage
/rudiments                 → RudimentsPage
  /rudiments/:id           → RudimentPracticePage
/fills                     → FillsPage
  /fills/:id               → FillPracticePage
```

---

## User Flows

### 1. Browse & Download Charts

**Entry:** Sidebar → Browse (`/browse`)

**Page:** `BrowsePage`
- Contains `TabsBrowseTab` and `BrowseCharts` components
- User searches Encore catalog (`searchEncore` / `searchAdvanced` → `https://api.enchor.us/search`)
- Results shown in `SongsTable`
- User clicks download → chart `.sng` file fetched from `https://files.enchor.us/{md5}.sng` and written to songs folder
- User can also search Ignition4 (CustomsForge CDLC) via `TabsBrowseTab` — requires Ignition login first

**Ignition Login Flow:**
1. User clicks "Connect Ignition" → `IgnitionLoginDialog` shown
2. Frontend calls `invoke('ignition_open_auth')` → Rust opens hidden WebView on `ignition4.customsforge.com`
3. User logs in; injected JS detects `<meta name="dt-token">` → calls `invoke('ignition_auth_ready')`
4. Rust hides auth window, emits `ignition://ready` to main window
5. Frontend now can call `invoke('ignition_search', { query })` and `invoke('ignition_download', { cdlcId })`

---

### 2. Library Management

**Entry:** Sidebar → Library (`/library`)

**Sub-tabs:**
- **Saved Charts** (`/library/saved-charts`): Charts bookmarked by the user. Shows download status. User can open in Playbook or Tab Editor.
- **PDF Library** (`/library/pdf`): Sheet music PDFs scanned from the configured PDF library path. User can link PDFs to charts.
- **Explorer Lists** (`/library/explorer-lists`): Named lists built from the Spotify Library Explorer feature.

---

### 3. Setlists & Playbook (Practice Mode)

**Entry:** Sidebar → Setlists (`/setlists`) → click a setlist → `/playbook/:setlistId`

**SetlistsPage flow:**
- Lists all setlists from DB (`getSetlists()`)
- User can create a new setlist (name, description, source type)
- Can add items: charts (by `md5`), compositions (by `id`), or PDFs
- Setlist items have `position` (drag-reorder), `speed` (playback %)

**PlaybookPage flow:**
- Loads setlist + items from DB
- Wraps everything in `PlaybookProvider` context
- `PlaybookProvider` manages:
  - `activeIndex` — which song is current
  - `speed` — playback speed (25–200%), persisted per item to DB
  - `isPlaying` — AlphaTab play state
  - `loopSectionId` — which section to loop
  - `sections` / `sectionProgress` / `annotations` — loaded per active item
  - `sessionId` — auto-started practice session (started on item change, ended on cleanup)
  - `compositionScoreData` — GP7 binary for composition items
- Active item type branches:
  - `'chart'` → renders AlphaTab with chart data + sections sidebar
  - `'composition'` → loads GP7 blob from `tab_compositions` → renders in `CompositionViewer`
  - `'pdf'` → renders PDF viewer

**PlaybookSidebar:**
- Lists all setlist items
- Shows section progress status per item (derived from `section_progress`)
- Clicking an item calls `goToSong(index)`

---

### 4. Spotify Integration

**Entry:** Sidebar → Spotify (`/spotify`) or top-nav "Connect Spotify"

**Auth Flow (PKCE):**
1. `initiateSpotifyLogin()` generates PKCE verifier/challenge
2. Opens `https://accounts.spotify.com/authorize` in system browser via `tauri-plugin-opener`
3. Spotify redirects to `chartmate://auth/callback?code=...`
4. Deep link caught by `tauri-plugin-single-instance` → emitted as `deep-link://new-url` event
5. Frontend catches event → dispatches `spotify-callback` custom event
6. `SpotifyAuthContext` handler calls `handleSpotifyCallback(url)` → POSTs to `https://accounts.spotify.com/api/token`
7. Tokens stored in `prefs.json` via `tauri-plugin-store`
8. On success, `syncRecentlyPlayed()` runs once per session

**Spotify Scopes:** `user-read-email user-library-read playlist-read-private playlist-read-collaborative user-read-recently-played`

**SpotifyPage features:**
- Shows connected playlists/albums/tracks (from local SQLite cache)
- Matches tracks against Encore catalog (`spotify_track_chart_matches`)
- `SpotifyLibraryExplorer`: browse Spotify library, save tracks to explorer lists
- `SpotifyHistoryImportCard`: import Spotify data export JSON files to populate `spotify_history`
- `TrackDetailDrawer`: show chart matches for a selected track

**History Sync:**
- Phase 1: User imports Spotify data export JSON → `spotify_history` populated
- Phase 2 (automatic): `syncRecentlyPlayed()` runs on app start if connected, pulls last 50 recently-played tracks from Spotify API

---

### 5. Guitar Hub & Tab Viewer

**Entry:** Sidebar → Guitar (`/guitar`)

**GuitarPage** shows:
- Tab Viewer launcher (open GP / PSARC files)
- Fretboard IQ, Chord Finder, EarIQ, RepertoireIQ tool cards
- Recent files (from `localStorage: guitar.recentFiles`)
- Recent saved compositions (from `tab_compositions` DB)

**GuitarSongView** (`/guitar/song`):
- Receives file via React Router `location.state`:
  - `fileData: number[]` — raw bytes for GP files
  - `filePath: string` — path for PSARC (loaded via Tauri invoke)
  - `fileType: 'guitarpro' | 'rocksmith' | 'psarc'`
  - `psarcArrangement` — parsed Rocksmith arrangement (for PSARC)
- Renders `AlphaTabWrapper` with the file data
- Controls: play/pause, speed, track selection, scale
- Can save current score as a `tab_composition`

---

### 6. Tab Editor

**Entry:** `/tab-editor` (new) or `/tab-editor/:id` (edit existing)

**TabEditorPage:**
- Loads existing composition from `tab_compositions` if `:id` provided
- Full interactive tab editor using AlphaTab + `scoreOperations.ts`
- Keyboard-driven editing via `useEditorKeyboard`
- Cursor state via `useEditorCursor`
- Undo/redo via `undoManager`
- ASCII tab import via `asciiTabImporter`
- Save dialog (`SaveCompositionDialog`) writes to `tab_compositions` table

---

### 7. Drum Sheet Music

**Entry:** Sidebar → Sheet Music (`/sheet-music`) → `DrumsHubPage`

- Search for drum charts: `/sheet-music/search` → `SheetMusicPage`
- View individual chart: `/sheet-music/:slug` → `SheetMusicSongPage`
- Renders drum notation via AlphaTab
- Audio playback with per-track mute controls

---

### 8. Training Modules

#### Fretboard IQ (`/guitar/fretboard`)
- `FretboardIQPage`: intro + stats dashboard
- `FretboardDrillPage`: active drill (6 drill types: note names, intervals, etc.)
- `FretboardProgressPage`: historical progress charts
- `FretboardSummaryPage`: post-session summary
- Data in: `fretboard_sessions`, `fretboard_attempts`

#### Ear Training / EarIQ (`/guitar/ear`)
- `EarIQPage`: intro + exercise picker
- `EarSessionPage`: active session (interval/chord/scale recognition)
- `EarSummaryPage`, `EarProgressPage`, `EarRecommendationsPage`
- Data in: `ear_sessions`, `ear_attempts`

#### Repertoire IQ (`/guitar/repertoire`)
- Spaced repetition system for songs/riffs/chords
- `RepertoireIQPage`: due today count + start session
- `RepertoireSessionPage`: one item at a time, rate recall quality
- Reviews update `interval`, `ease_factor`, `next_review_date` on `repertoire_items`
- Data in: `repertoire_items`, `repertoire_reviews`, `repertoire_collections`

#### Rudiments (`/rudiments`)
- List of drum rudiments, each with a practice page
- Data in: (no DB — static definitions + fill patterns)

#### Fills (`/fills`)
- Drum fill practice with BPM control
- Data in: `fill_practice_sessions`

---

### 9. Updates Page (`/updates`)

Compares user's locally installed charts (`local_charts`) against the Encore catalog (`chorus_charts`) to surface charts with newer versions available. User can batch-download updates.

---

## Context / Data Flow Summary

```
App
├── SpotifyAuthProvider  →  isConnected, refresh()
│   └── SyncProvider    →  syncStatus (Encore catalog background sync)
│       └── SidebarProvider  →  sidebar open/close
│           └── Layout
│               └── [Route pages]
│                   └── PlaybookProvider (only on /playbook/:id)
│                       →  full session state: items, speed, sections, progress, annotations
```

All database calls go through `getLocalDb()` which initializes the Kysely instance on first call and runs all pending migrations. DB functions are called directly from page components and hooks — there is no global data cache layer (no React Query, no Redux).
