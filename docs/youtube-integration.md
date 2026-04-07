# YouTube Video Integration

Sync a YouTube video with any playback module in Chartmate. The system is designed around a generic `PlaybackClock` interface so any current or future playback engine can drive YouTube sync.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Playback Engine │────▶│ PlaybackClock│◀────│   YouTubeSync   │
│  (AudioManager,  │     │  interface   │     │  (drift correct, │
│   AlphaTab, etc) │     └──────────────┘     │   seek, tempo)   │
└─────────────────┘                           └────────┬────────┘
                                                       │
                                              ┌────────▼────────┐
                                              │  YouTubePlayer   │
                                              │  (IFrame API)    │
                                              └─────────────────┘
```

### PlaybackClock interface

Any playback engine must expose two readonly properties:

```ts
// src/lib/youtube-sync.ts
export interface PlaybackClock {
  readonly currentTime: number;  // current position in seconds
  readonly isPlaying: boolean;   // whether playback is running
}
```

`YouTubeSync` polls this every 200ms via `requestAnimationFrame` and corrects YouTube drift if it exceeds 300ms.

### Key files

| File | Purpose |
|------|---------|
| `src/lib/youtube-sync.ts` | `PlaybackClock` interface + `YouTubeSync` engine |
| `src/lib/youtube-utils.ts` | Pure utilities: `snapToYouTubeRate`, `extractYoutubeVideoId` |
| `src/components/YouTubePlayer.tsx` | React component wrapping YouTube IFrame API |
| `src/hooks/useYoutubeSync.ts` | Hook managing YouTube state, DB persistence, sync lifecycle |
| `src/lib/local-db/youtube.ts` | DB CRUD for `youtube_associations` table |
| `src/lib/local-db/migrations/011_youtube.ts` | Migration creating the table |

## Adding YouTube to a new playback module

### 1. Create a PlaybackClock adapter

Your engine already tracks position and play state. Expose them:

```ts
// Option A: your engine already satisfies the interface
// AudioManager has .currentTime and .isPlaying — just pass it directly
const clockRef = useRef<PlaybackClock | null>(null);
// ... later: clockRef.current = audioManager;

// Option B: create a lightweight adapter (e.g. for AlphaTab)
const positionRef = useRef({ currentTime: 0 });
const isPlayingRef = useRef(false);

const clockRef = useRef<PlaybackClock>({
  get currentTime() { return positionRef.current.currentTime / 1000; },
  get isPlaying() { return isPlayingRef.current; },
});
```

### 2. Call the hook

```ts
const {
  youtubeUrl,
  youtubeVideoId,
  youtubeOffsetMs,
  youtubeUrlInput,
  setYoutubeUrlInput,
  playerRef: youtubePlayerRef,
  syncRef: youtubeSyncRef,
  handleUrlSubmit: handleYoutubeUrlSubmit,
  handleRemove: handleYoutubeRemove,
  handleOffsetChange: handleYoutubeOffsetChange,
  handleReady: handleYoutubeReady,
  updateClock,
} = useYoutubeSync({
  songKey: 'some-stable-key',  // md5, file path hash, etc.
  clockRef,
  tempo: currentPlaybackSpeed, // 1.0 = normal
});
```

**`songKey`** must be a stable unique string for the song. It keys the DB row in `youtube_associations`. Examples:
- Drum view: `metadata.md5` (Chorus chart hash)
- Guitar view: `guitar:<hash-of-filepath>`
- Future module: any stable identifier

### 3. Wire playback events

The sync engine needs to know when your player plays, pauses, seeks, or changes speed:

```ts
// On play/seek to a specific time
youtubeSyncRef.current.onPlay(timeInSeconds);

// On pause
youtubeSyncRef.current.onPause();

// On resume (unpause)
youtubeSyncRef.current.onResume();

// On speed/tempo change
youtubeSyncRef.current.onTempoChange(newSpeed);
```

If your clock source is recreated (e.g. AudioManager destroyed and rebuilt):
```ts
updateClock(newAudioManager);
```

### 4. Render the UI

**Video panel** — renders above your main content:
```tsx
{youtubeVideoId && (
  <div className="rounded-lg overflow-hidden border bg-black" style={{height: '240px'}}>
    <YouTubePlayer
      ref={youtubePlayerRef}
      videoId={youtubeVideoId}
      onReady={handleYoutubeReady}
      className="w-full h-full"
    />
  </div>
)}
```

**Sidebar controls** — URL input, offset slider, rate mismatch warning:
```tsx
{youtubeVideoId ? (
  <div>
    {/* Show linked URL + unlink button */}
    {/* Offset slider: -10s to +10s, step 100ms */}
    {/* Rate mismatch warning when tempo doesn't match YouTube rates */}
  </div>
) : (
  <div>
    {/* URL input + Link button */}
  </div>
)}
```

See `SongView.tsx` or `GuitarSongView.tsx` for full sidebar UI examples.

## How sync works

1. **Primary clock**: Your playback engine is always the source of truth for position
2. **YouTubeSync polls** `clock.currentTime` every 200ms via `requestAnimationFrame`
3. **Drift correction**: If YouTube position differs from expected by >300ms, it seeks YouTube
4. **Offset**: User-configurable offset (stored in DB, debounced 500ms writes). Positive = YouTube starts later than chart
5. **Tempo**: YouTube only supports discrete rates (0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2). `snapToYouTubeRate()` finds the closest match. A warning is shown when the exact rate can't be matched

## Database schema

```sql
CREATE TABLE youtube_associations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chart_md5   TEXT NOT NULL,  -- actually a generic song key, not just md5
  youtube_url TEXT NOT NULL,
  offset_ms   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_youtube_associations_chart_md5 ON youtube_associations(chart_md5);
```

The `chart_md5` column is named historically but accepts any string key.

## Current integrations

| Module | Clock source | Song key | File |
|--------|-------------|----------|------|
| Drum sheet music | `AudioManager` (native PlaybackClock) | `metadata.md5` | `src/pages/sheet-music/SongView.tsx` |
| Guitar tabs | AlphaTab adapter (getter-based) | `guitar:<path-hash>` | `src/pages/guitar/GuitarSongView.tsx` |

## YouTube IFrame API notes

- CSP is `null` in `tauri.conf.json` — iframes load without restriction
- The API script is loaded lazily on first use (`loadYouTubeAPI()` in `YouTubePlayer.tsx`)
- Only discrete playback rates are supported by YouTube
- The `YouTubePlayerHandle` exposes `isPlaying()` to abstract away YouTube's internal state numbers
