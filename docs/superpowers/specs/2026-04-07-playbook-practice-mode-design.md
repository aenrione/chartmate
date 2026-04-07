# Playbook Practice Mode Design

## Problem

Musicians using Chartmate can organize songs into setlists, but there's no way to practice through them as a cohesive session. Users want to flip through songs like a real chart book — reading notation, adjusting speed, looping difficult sections, and tracking their progress over time. The app has renderers for drum sheet music, guitar tablature (AlphaTab), and Rocksmith charts, but they exist as isolated tools with no practice workflow connecting them.

## Solution Overview

A full-screen **Playbook** mode that opens from a setlist and presents songs one at a time in a page-by-page format. Each song renders using the appropriate existing chart renderer based on its source type. A collapsible left sidebar provides practice tools: section navigation, speed control, looping, audio playback with stem isolation, and personal annotations. Progress is tracked at both song and section level with practice history over time.

## Visual Reference

Three Stitch mockups were generated and reviewed (project `7991228380108628835`):
- **Full View** — sidebar open with setlist navigator, sections, practice controls, audio stems, annotations panel
- **Focused View** — sidebar collapsed to icon strip, floating playback controls, tempo/key/signature HUD badges
- **Transition State** — page-turn animation between songs with previous/next song cards and session metadata

## Design Decisions

### 1. Route & Entry Point

**Route:** `/playbook/:setlistId`

**Entry:** A "Practice" button on the `SetlistsPage` setlist editor header. Clicking it navigates to the playbook with that setlist loaded.

**Layout integration:** The playbook renders inside the existing `Layout` component but the main Layout sidebar is hidden in playbook mode — the playbook's own sidebar replaces it. The top nav bar remains for orientation but can be minimized. This is achieved by passing a layout mode prop or detecting the `/playbook` route in `Layout.tsx`.

### 2. Component Architecture

```
PlaybookPage
├── PlaybookProvider (React Context for shared state)
│   ├── PlaybookSidebar (collapsible left panel, 280px → 64px icon strip)
│   │   ├── SongNavigator (thumbnail list of setlist songs with status dots)
│   │   ├── SectionsPanel (user-defined sections with progress badges)
│   │   ├── PracticeControls (speed slider, loop toggle, play/pause, metronome)
│   │   ├── AudioControls (stem selector, mute/solo toggles, volume)
│   │   └── AnnotationsPanel (section-anchored notes, add/edit inline)
│   │
│   └── PlaybookMain (chart area)
│       ├── PlaybookTopBar (back to setlist, setlist name, song counter, prev/next)
│       ├── SongHeader (title, artist, instrument badge, BPM, key, tuning, status)
│       ├── ChartViewer (adapter that delegates to correct renderer)
│       │   ├── → DrumSheetMusicRenderer (existing sheet music component)
│       │   ├── → AlphaTabRenderer (existing guitar/bass tab component)
│       │   └── → EncoreChartRenderer (for Clone Hero .sng charts)
│       ├── LoopOverlay (visual indicator when a section is being looped)
│       ├── PageTurnAffordances (left/right edge hover zones + keyboard hints)
│       └── PlaybackProgressBar (thin bar at bottom of chart area)
```

### 3. PlaybookProvider (Shared State)

The `PlaybookProvider` wraps the entire page and exposes via context:

| State | Type | Purpose |
|-------|------|---------|
| `setlist` | `Setlist` | Current setlist metadata |
| `items` | `SetlistItem[]` | Ordered songs in the setlist |
| `activeIndex` | `number` | Currently displayed song (0-based) |
| `isPlaying` | `boolean` | Audio playback state |
| `speed` | `number` | Current speed percentage (from setlist item) |
| `loopRange` | `{sectionId: number} \| null` | Active loop target |
| `sidebarExpanded` | `boolean` | Sidebar open/collapsed |
| `sections` | `SongSection[]` | Sections for current song |
| `sectionProgress` | `SectionProgress[]` | Progress for current song's sections in this setlist context |
| `annotations` | `SongAnnotation[]` | Notes for current song |
| `practiceSession` | `PracticeSession \| null` | Active session record |
| `audioMode` | `'stems' \| 'full' \| 'metronome'` | What audio is available |

**Actions:** `goToSong(index)`, `nextSong()`, `prevSong()`, `setSpeed(n)`, `togglePlay()`, `setLoop(sectionId | null)`, `toggleSidebar()`, `updateSectionStatus(sectionId, status)`, `addAnnotation(sectionId, content)`, `endSession()`

### 4. Sidebar Design

**Expanded state (280px):** Matches the Stitch "Full View" mockup. Five collapsible panels stacked vertically in a scrollable aside:

1. **Setlist Navigator** — Shows all songs with small album art thumbnails (from `albumArtMd5`), song name, artist, and a status dot:
   - Gray (`text-outline`) = not started
   - Red (`text-error`) = needs work
   - Amber (`text-tertiary`) = practicing
   - Green (`text-green-400`) = nailed it
   - Active song highlighted with `bg-surface-container-high` and `border-l-2 border-primary`

2. **Sections Panel** — Lists sections for current song. Each row shows: section name, status icon, timestamp. Active/looping section highlighted with `bg-surface-container text-primary border-l-2 border-primary`. Click to jump chart to that section. Long-press or right-click to set loop.

3. **Practice Controls** — Speed slider (5–200%, snaps to 5% increments, `accent-primary`), play/pause/skip buttons (prev 10s, play, next 10s), toggle buttons for loop/metronome in a `bg-surface-container rounded-xl` row.

4. **Audio Controls** — Adapts to what's available:
   - **Stems:** Per-stem volume sliders with mute/solo toggles. "My Guitar" / "Backing Track" / "Drums" etc.
   - **Full audio:** Single volume + speed control
   - **No audio:** Metronome with BPM input (derived from chart or manual)

5. **Annotations Panel** — List of notes for current song, each anchored to a section. Glass-morphism card style (`glass-panel` utility). "Add Annotation" button at bottom. Inline editing with auto-save.

**Collapsed state (64px icon strip):** Matches the Stitch "Focused View" mockup. Five icon buttons vertically stacked (using lucide icons): `ListMusic`, `LayoutList`, `Gauge`, `Volume2`, `StickyNote`. Clicking an icon expands the sidebar to that panel. Active panel icon highlighted with `bg-surface-container text-primary rounded-xl`.

**Toggle:** Button at bottom of sidebar or keyboard shortcut (`[` key).

### 5. Chart Viewer (Adapter)

The `ChartViewer` component inspects the current setlist item's chart data and delegates to the correct renderer:

| Source | Renderer | Detection |
|--------|----------|-----------|
| Drum charts | Existing `SheetMusicSongPage` renderer | `diff_drums != null && diff_drums >= 0` and no guitar/bass |
| Guitar Pro / Rocksmith | Existing `AlphaTab` renderer via `GuitarSongView` | File is `.gp*`, `.psarc`, `.xml`, or has guitar/bass diffs |
| Encore `.sng` | Fetch from `https://files.enchor.us/{md5}.sng` and render | Default for saved charts with `chart_md5` |

The adapter wraps each renderer to:
- Accept speed from context and apply it
- Expose section boundaries (if detectable from chart data)
- Forward play/pause/seek commands from context
- Fill the available space (`flex-1 min-h-0 overflow-y-auto`)

**Chart area background:** `bg-surface-container-lowest` (`#0e0e0e`) for maximum contrast with notation.

**Page turn affordances:** Left and right edge zones (48px wide) with gradient overlays (`from-black/40 to-transparent`). Appear on hover. Click or keyboard arrow to navigate songs. Also supports swipe gesture on trackpad.

### 6. Song Transition

When navigating between songs:

1. Current song slides out (CSS `transform: translateX(-100%)` with 300ms ease)
2. New song slides in from the right (`translateX(100%)` → `translateX(0)`)
3. During transition, a brief interstitial shows:
   - "Next Up" badge with instrument type
   - New song title (large, `font-headline font-extrabold`)
   - Previous → Current song cards (matching Stitch transition mockup)
4. Practice session for previous song is auto-saved
5. New song's sections, progress, and annotations are loaded

**V1 simplification:** Use a CSS slide transition rather than the page-peel effect from the Stitch mockup. The peel animation can be a V2 enhancement.

### 7. Floating Playback Controls

When sidebar is collapsed, a floating glassmorphism pill appears at the bottom center of the chart area (matching the Stitch focused view):

```
[|< ] [ ▶ ] [ >|]  |  Metronome  Loop  |  01:24 ━━━━━━━━━━━ 04:12
```

- `glass-panel` background with `rounded-full` shape
- Transport: prev song, play/pause (large gradient button `from-primary to-primary-container`), next song
- Toggles: metronome, loop (with active state coloring)
- Scrubber: current time, progress bar (`bg-primary`), total time
- Appears with fade-in when sidebar collapses, fades out when sidebar expands

### 8. Song Header

Displayed above the chart renderer in the main area:

```
Neon Cathedral  [Guitar Tab]        F# Minor | Eb Standard
Celestial Soundscape • 120 BPM • 4/4 Time              Status: Practicing
```

- Title: `text-3xl font-headline font-extrabold text-on-surface tracking-tighter`
- Instrument badge: contextual color — `bg-secondary-container/20 text-secondary` for guitar, `bg-tertiary-container/20 text-tertiary` for drums
- Metadata (artist, BPM, time signature): `text-on-surface-variant font-medium`
- Key/Tuning: `font-mono font-bold text-primary` aligned right
- Song status: colored badge matching the status dot colors

### 9. Database Schema (4 New Tables)

**Migration `011_playbook`:**

```sql
-- Practice sessions
CREATE TABLE practice_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setlist_item_id INTEGER NOT NULL REFERENCES setlist_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'abandoned'
  started_at TEXT NOT NULL,
  ended_at TEXT,
  speed INTEGER NOT NULL,
  notes TEXT,
  CONSTRAINT valid_status CHECK (status IN ('active', 'completed', 'abandoned'))
);
CREATE INDEX idx_practice_sessions_setlist_item ON practice_sessions(setlist_item_id);
CREATE INDEX idx_practice_sessions_started_at ON practice_sessions(started_at);

-- Song sections (shared across setlists via chart_md5)
CREATE TABLE song_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chart_md5 TEXT NOT NULL,
  name TEXT NOT NULL,
  start_position REAL NOT NULL,  -- 0.0–1.0 normalized
  end_position REAL NOT NULL,    -- 0.0–1.0 normalized
  sort_order INTEGER NOT NULL
);
CREATE INDEX idx_song_sections_chart ON song_sections(chart_md5, sort_order);

-- Section progress (per setlist item context)
CREATE TABLE section_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_section_id INTEGER NOT NULL REFERENCES song_sections(id) ON DELETE CASCADE,
  setlist_item_id INTEGER NOT NULL REFERENCES setlist_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started',  -- 'not_started' | 'needs_work' | 'practicing' | 'nailed_it'
  updated_at TEXT NOT NULL,
  CONSTRAINT valid_status CHECK (status IN ('not_started', 'needs_work', 'practicing', 'nailed_it'))
);
CREATE INDEX idx_section_progress_section ON section_progress(song_section_id);
CREATE INDEX idx_section_progress_item ON section_progress(setlist_item_id);

-- Annotations (anchored to sections)
CREATE TABLE song_annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_section_id INTEGER NOT NULL REFERENCES song_sections(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_song_annotations_section ON song_annotations(song_section_id);
```

**Key design decisions:**
- **Normalized positions** (0.0–1.0) for sections — speed-independent, reusable across different playback speeds
- **Sections tied to `chart_md5`** — shared across setlists for the same song
- **Progress tied to `setlist_item_id` + `song_section_id`** — different progress in different setlists
- **Annotations tied to sections** — no ambiguous dual-anchor
- **`ON DELETE CASCADE`** on all FKs — clean cascade deletion
- **Session lifecycle** — `active` → `completed` or `abandoned`. On app startup, mark any `active` sessions as `abandoned`.

### 10. Data Access Layer

New file: `src/lib/local-db/playbook.ts`

**Functions:**

```typescript
// Practice sessions
startPracticeSession(setlistItemId: number, speed: number): Promise<number>
endPracticeSession(sessionId: number, notes?: string): Promise<void>
abandonOrphanedSessions(): Promise<void>  // called on app startup
getPracticeHistory(setlistItemId: number): Promise<PracticeSession[]>

// Song sections
getSectionsForChart(chartMd5: string): Promise<SongSection[]>
createSection(chartMd5: string, name: string, startPos: number, endPos: number): Promise<number>
updateSection(sectionId: number, updates: Partial<SongSection>): Promise<void>
deleteSection(sectionId: number): Promise<void>
reorderSections(chartMd5: string, sectionId: number, newSortOrder: number): Promise<void>

// Section progress
getSectionProgress(setlistItemId: number): Promise<SectionProgress[]>
updateSectionStatus(sectionId: number, setlistItemId: number, status: ProgressStatus): Promise<void>
getSongStatus(setlistItemId: number): ProgressStatus  // derived from section statuses

// Annotations
getAnnotations(chartMd5: string): Promise<SongAnnotation[]>
createAnnotation(sectionId: number, content: string): Promise<number>
updateAnnotation(annotationId: number, content: string): Promise<void>
deleteAnnotation(annotationId: number): Promise<void>
```

**Song-level status derivation:** A song's overall status is the "worst" of its section statuses: if any section is `needs_work`, the song is `needs_work`. If all are `nailed_it`, the song is `nailed_it`. If mixed, it's `practicing`. If no sections exist, it's `not_started`.

### 11. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / next song |
| `Space` | Play / pause |
| `[` | Toggle sidebar |
| `L` | Toggle loop on current section |
| `M` | Toggle metronome |
| `+` / `-` | Speed up / slow down by 5% |
| `1`–`9` | Jump to section by index |
| `Esc` | Exit playbook (back to setlist) |

### 12. Styling Patterns

All new components follow the established design system from the git diff analysis:

- **Page background:** `bg-surface` for sidebar, `bg-surface-container-lowest` for chart area
- **Sidebar:** `bg-surface-container-low border-r border-white/5`
- **Section labels:** `text-[10px] uppercase tracking-widest text-on-surface-variant font-bold` (JetBrains Mono)
- **Headings:** `font-headline` (Plus Jakarta Sans)
- **Mono values:** `font-mono` (JetBrains Mono) for timestamps, BPM, counters
- **Active states:** `bg-surface-container text-primary` or `bg-surface-container-high`
- **Hover states:** `hover:bg-surface-container` or `hover:bg-surface-variant/50`
- **Cards/panels:** `bg-surface-container-low rounded-2xl border border-white/[0.04]`
- **Glass panels:** `glass-panel` utility (for floating controls, annotations HUD)
- **Primary accent:** `text-primary` / `bg-primary-container` for active/focus states
- **Instrument colors:** `text-secondary` / `bg-secondary-container` for guitar, `text-tertiary` / `bg-tertiary-container` for drums
- **Buttons:** `active:scale-[0.98]` micro-interaction, gradient primary buttons `bg-gradient-to-br from-primary to-primary-container`
- **Shadows:** `shadow-studio-sm`, `shadow-studio`, `shadow-studio-lg`
- **Icons:** lucide-react exclusively
- **Transitions:** `transition-all duration-200` or `duration-300` for layout shifts

### 13. Scope & Phasing

**V1 (This implementation):**
- Playbook page with sidebar (expanded + collapsed states)
- Chart viewer adapter (drums, guitar/AlphaTab, Encore charts)
- Song navigation (page-by-page with slide transition)
- Practice controls (speed, play/pause, loop)
- Section management (create, edit, reorder, delete)
- Section progress tracking (status per section per setlist item)
- Practice session logging (start/end/duration)
- Annotations (CRUD, section-anchored)
- Audio playback with speed control (when available)
- Keyboard shortcuts
- Floating playback controls (collapsed sidebar mode)
- All 4 database tables + data access layer

**V2 (Future):**
- Page-peel CSS animation for song transitions
- Stem isolation (mute/solo individual audio tracks)
- Mastery/accuracy tracking with scoring
- Live audio input visualization
- Auto-detected sections from chart data (beat/bar analysis)
- Practice statistics dashboard (trends over time)
- Export practice log
- Metronome with count-in
