# Chartmate — Database Schema

SQLite database at `sqlite:chartmate.db` (Tauri app-data dir).  
ORM: [Kysely](https://kysely.dev/) with `ParseJSONResultsPlugin`.  
Types: auto-generated in `src/lib/local-db/types.ts`.  
Migrations: `src/lib/local-db/migrations/` (28 files, run automatically on startup).

---

## Tables

### `chorus_charts`
Mirrored Encore chart catalog (populated by background sync via `chorusChartDb`).

| Column | Type | Notes |
|---|---|---|
| `md5` | TEXT PK | Chart fingerprint, used as FK throughout |
| `name` | TEXT | Song title |
| `artist` | TEXT | |
| `charter` | TEXT | |
| `group_id` | INTEGER | Encore group ID |
| `artist_normalized` | TEXT | Lowercase, diacritics stripped |
| `name_normalized` | TEXT | |
| `charter_normalized` | TEXT | |
| `artist_bucket` | TEXT | First char bucket for indexing |
| `diff_guitar` | INTEGER\|NULL | |
| `diff_bass` | INTEGER\|NULL | |
| `diff_drums` | INTEGER\|NULL | |
| `diff_drums_real` | INTEGER\|NULL | |
| `diff_keys` | INTEGER\|NULL | |
| `song_length` | INTEGER\|NULL | ms |
| `has_video_background` | INTEGER | Boolean |
| `album_art_md5` | TEXT\|NULL | |
| `modified_time` | TEXT | |

### `chorus_metadata`
Key-value store for catalog sync state (e.g. last sync timestamp).

| Column | Type |
|---|---|
| `key` | TEXT |
| `value` | TEXT |
| `updated_at` | TEXT |

### `chorus_scan_sessions`
Tracks incremental Encore catalog sync progress.

| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `scan_since_time` | TEXT |
| `started_at` | TEXT |
| `completed_at` | TEXT\|NULL |
| `last_chart_id` | INTEGER\|NULL |
| `status` | TEXT |

### `local_charts`
User's locally installed charts (scanned from songs folder).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `song` | TEXT | |
| `artist` | TEXT | |
| `charter` | TEXT | |
| `data` | TEXT | JSON blob of chart metadata |
| `song_normalized` | TEXT | |
| `artist_normalized` | TEXT | |
| `charter_normalized` | TEXT | |
| `artist_bucket` | TEXT | |
| `modified_time` | TEXT | |
| `updated_at` | TEXT | |

---

### Spotify Tables

#### `spotify_playlists`
| Column | Type |
|---|---|
| `id` | TEXT PK |
| `snapshot_id` | TEXT |
| `name` | TEXT |
| `collaborative` | INTEGER (0/1) |
| `owner_display_name` | TEXT |
| `owner_external_url` | TEXT |
| `total_tracks` | INTEGER |
| `updated_at` | TEXT |

#### `spotify_albums`
| Column | Type |
|---|---|
| `id` | TEXT PK |
| `name` | TEXT |
| `artist_name` | TEXT |
| `total_tracks` | INTEGER |
| `updated_at` | TEXT |

#### `spotify_tracks`
| Column | Type |
|---|---|
| `id` | TEXT PK |
| `name` | TEXT |
| `artist` | TEXT |
| `artist_normalized` | TEXT\|NULL |
| `name_normalized` | TEXT\|NULL |
| `artist_bucket` | TEXT\|NULL |
| `updated_at` | TEXT |

#### `spotify_playlist_tracks`
Join table. FK cascade on delete.

| Column | Type |
|---|---|
| `playlist_id` | TEXT → `spotify_playlists.id` |
| `track_id` | TEXT → `spotify_tracks.id` |
| PK: `(playlist_id, track_id)` | |

#### `spotify_album_tracks`
| Column | Type |
|---|---|
| `album_id` | TEXT → `spotify_albums.id` |
| `track_id` | TEXT → `spotify_tracks.id` |
| `updated_at` | TEXT |

#### `spotify_track_chart_matches`
Cached matches between Spotify tracks and Encore charts.

| Column | Type |
|---|---|
| `spotify_id` | TEXT |
| `chart_md5` | TEXT |
| `matched_at` | INTEGER (unix ms) |

#### `spotify_history`
Aggregated play history (from Spotify export JSON import or recently-played API sync).

| Column | Type |
|---|---|
| `artist` | TEXT |
| `name` | TEXT |
| `artist_normalized` | TEXT |
| `name_normalized` | TEXT |
| `play_count` | INTEGER |
| `last_played` | TEXT\|NULL |
| `ms_played` | INTEGER |
| PK: `(artist_normalized, name_normalized)` | |

#### `spotify_history_imports`
Tracks which Spotify data export JSON files have been imported.

| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `filename` | TEXT |
| `file_size` | INTEGER |
| `imported_at` | TEXT |

---

### `saved_charts`
Charts the user has explicitly bookmarked/saved.

| Column | Type | Notes |
|---|---|---|
| `md5` | TEXT PK | Same as `chorus_charts.md5` |
| `name` | TEXT | |
| `artist` | TEXT | |
| `charter` | TEXT | |
| `album_art_md5` | TEXT\|NULL | |
| `diff_*` | INTEGER\|NULL | Difficulty per instrument |
| `song_length` | INTEGER\|NULL | ms |
| `has_video_background` | INTEGER | |
| `modified_time` | TEXT | |
| `saved_at` | TEXT | |
| `is_downloaded` | INTEGER (0/1) | |
| `tab_url` | TEXT\|NULL | Optional tab/chart URL |

---

### Setlists

#### `setlists`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT | |
| `description` | TEXT\|NULL | |
| `source_type` | TEXT | `'custom'`, `'spotify'`, `'source_game'` |
| `source_id` | TEXT\|NULL | e.g. Spotify playlist ID |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

#### `setlist_items`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `setlist_id` | INTEGER → `setlists.id` | |
| `item_type` | TEXT | `'chart'`, `'composition'`, `'pdf'` |
| `chart_md5` | TEXT\|NULL | → `saved_charts.md5` |
| `composition_id` | INTEGER\|NULL | → `tab_compositions.id` |
| `pdf_library_id` | INTEGER\|NULL | → `pdf_library.id` |
| `name` | TEXT | |
| `artist` | TEXT | |
| `charter` | TEXT\|NULL | |
| `position` | INTEGER | Sort order |
| `speed` | INTEGER | Playback speed % (default 100) |
| `added_at` | TEXT | |

---

### Practice Tracking

#### `practice_sessions`
Auto-started/stopped when a song is active in Playbook.

| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `setlist_item_id` | INTEGER |
| `status` | TEXT |
| `started_at` | TEXT |
| `ended_at` | TEXT\|NULL |
| `speed` | INTEGER |
| `notes` | TEXT\|NULL |

#### `song_sections`
User-defined sections within a chart (e.g. "Verse", "Chorus").

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `chart_md5` | TEXT | |
| `name` | TEXT | |
| `start_position` | INTEGER | Tick position |
| `end_position` | INTEGER | |
| `sort_order` | INTEGER | |
| `pdf_page` | INTEGER\|NULL | For PDF-linked sections |
| `pdf_y_offset` | INTEGER\|NULL | |

#### `section_progress`
Per-session progress status for each section.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `song_section_id` | INTEGER → `song_sections.id` | |
| `setlist_item_id` | INTEGER | |
| `status` | TEXT | `'not_started'`, `'in_progress'`, `'done'` |
| `updated_at` | TEXT | |

#### `song_annotations`
Text notes attached to sections.

| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `song_section_id` | INTEGER |
| `content` | TEXT |
| `created_at` | TEXT |
| `updated_at` | TEXT |

---

### `youtube_associations`
Maps a chart MD5 to a YouTube URL with an optional time offset.

| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `chart_md5` | TEXT |
| `youtube_url` | TEXT |
| `offset_ms` | INTEGER (default 0) |
| `created_at` | TEXT |

---

### `tab_compositions`
User-created or imported guitar tab compositions (stored as AlphaTab GP7 binary).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `title` | TEXT | |
| `artist` | TEXT | |
| `album` | TEXT | |
| `tempo` | INTEGER | BPM |
| `instrument` | TEXT | `'guitar'`, `'drums'`, etc. |
| `score_data` | BLOB | AlphaTab GP7 binary |
| `preview_image` | TEXT\|NULL | Base64 PNG thumbnail |
| `youtube_url` | TEXT\|NULL | |
| `is_saved` | INTEGER (0/1) | |
| `saved_at` | TEXT\|NULL | |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

---

### Training Tables

#### `fretboard_sessions`
| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `drill_type` | TEXT |
| `difficulty` | TEXT |
| `total_questions` | INTEGER |
| `correct_answers` | INTEGER |
| `duration_ms` | INTEGER |
| `xp_earned` | INTEGER |
| `created_at` | TEXT |

#### `fretboard_attempts`
| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `session_id` | INTEGER |
| `drill_type` | TEXT |
| `string_index` | INTEGER |
| `fret` | INTEGER |
| `expected_answer` | TEXT |
| `given_answer` | TEXT\|NULL |
| `status` | TEXT |
| `response_time_ms` | INTEGER |
| `created_at` | TEXT |

#### `ear_sessions`
| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `exercise_type` | TEXT |
| `difficulty` | TEXT |
| `total_questions` | INTEGER |
| `correct_answers` | INTEGER |
| `skipped_count` | INTEGER |
| `duration_ms` | INTEGER |
| `xp_earned` | INTEGER |
| `playback_mode` | TEXT |
| `direction` | TEXT |
| `speed` | TEXT |
| `created_at` | TEXT |

#### `ear_attempts`
| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `session_id` | INTEGER |
| `exercise_type` | TEXT |
| `prompt_item` | TEXT |
| `answer_context` | TEXT\|NULL |
| `expected_answer` | TEXT |
| `given_answer` | TEXT\|NULL |
| `status` | TEXT |
| `response_time_ms` | INTEGER |
| `created_at` | TEXT |

#### `fill_practice_sessions`
| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `fill_id` | TEXT |
| `bpm` | INTEGER |
| `learned` | INTEGER (0/1) |
| `created_at` | TEXT |

---

### Repertoire (Spaced Repetition)

#### `repertoire_collections`
| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `name` | TEXT (default 'My Repertoire') |
| `description` | TEXT\|NULL |
| `color` | TEXT |
| `created_at` | TEXT |
| `updated_at` | TEXT |

#### `repertoire_items`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `collection_id` | INTEGER | |
| `item_type` | TEXT | e.g. `'song'`, `'riff'`, `'chord'` |
| `title` | TEXT | |
| `artist` | TEXT\|NULL | |
| `notes` | TEXT\|NULL | |
| `target_bpm` | INTEGER\|NULL | |
| `saved_chart_md5` | TEXT\|NULL | Typed FK |
| `composition_id` | INTEGER\|NULL | Typed FK |
| `song_section_id` | INTEGER\|NULL | Typed FK |
| `reference_type` | TEXT\|NULL | **deprecated** |
| `reference_id` | TEXT\|NULL | **deprecated** |
| `interval` | INTEGER | SRS interval (days) |
| `ease_factor` | REAL | SRS ease factor |
| `repetitions` | INTEGER | SRS repetitions |
| `next_review_date` | TEXT | |
| `last_reviewed_at` | TEXT\|NULL | |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

#### `repertoire_reviews`
| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `item_id` | INTEGER |
| `quality` | INTEGER |
| `interval_before` | INTEGER |
| `interval_after` | INTEGER |
| `ease_factor_before` | REAL |
| `ease_factor_after` | REAL |
| `duration_ms` | INTEGER\|NULL |
| `session_notes` | TEXT\|NULL |
| `created_at` | TEXT |

---

### PDF Library

#### `pdf_library`
Scanned sheet music PDFs from the configured PDF library path.

| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `filename` | TEXT |
| `relative_path` | TEXT |
| `file_size_bytes` | INTEGER |
| `detected_title` | TEXT\|NULL |
| `detected_artist` | TEXT\|NULL |
| `added_at` | TEXT |

#### `chart_pdfs`
Links a chart MD5 to one or more PDFs.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `chart_md5` | TEXT | |
| `pdf_library_id` | INTEGER → `pdf_library.id` | |
| `label` | TEXT\|NULL | |
| `is_primary` | INTEGER (0/1) | |
| `linked_at` | TEXT | |

---

### `explorer_saves`
Saved tracks/songs from the Spotify Library Explorer, organized into named lists.

| Column | Type |
|---|---|
| `id` | INTEGER PK |
| `list_name` | TEXT (default 'default') |
| `artist` | TEXT |
| `name` | TEXT |
| `artist_normalized` | TEXT |
| `name_normalized` | TEXT |
| `spotify_track_uri` | TEXT\|NULL |
| `added_at` | TEXT |

---

## Migration History

| # | File | What it adds |
|---|---|---|
| 001 | `001_initial.ts` | Spotify playlists, albums, tracks, join tables |
| 002 | `002_chorus_charts.ts` | `chorus_charts`, `chorus_metadata`, `chorus_scan_sessions` |
| 003 | `003_local_charts.ts` | `local_charts` |
| 004 | `004_local_charts_normalized.ts` | Normalized columns on `local_charts` |
| 005 | `005_add_normalized_columns.ts` | Normalized columns on `chorus_charts`, `spotify_tracks` |
| 006 | `006_add_normalized_indexes.ts` | Indexes on normalized columns |
| 007 | `007_add_track_chart_matches.ts` | `spotify_track_chart_matches` |
| 008 | `008_add_spotify_history.ts` | `spotify_history` (v1) |
| 009 | `009_saved_charts.ts` | `saved_charts` |
| 010 | `010_setlists.ts` | `setlists`, `setlist_items`, `practice_sessions`, `song_sections`, `section_progress`, `song_annotations` |
| 011 | `011_youtube.ts` | `youtube_associations` |
| 012 | `012_playbook.ts` | Playbook-related columns |
| 013 | `013_tab_compositions.ts` | `tab_compositions` |
| 014 | `014_fretboard_iq.ts` | `fretboard_sessions`, `fretboard_attempts` |
| 015 | `015_saved_charts_downloaded.ts` | `is_downloaded` on `saved_charts` |
| 016 | `016_fill_trainer.ts` | `fill_practice_sessions` |
| 017 | `017_saved_chart_tab_url.ts` | `tab_url` on `saved_charts` |
| 018 | `018_pdf_library.ts` | `pdf_library`, `chart_pdfs` |
| 019 | `019_song_sections_pdf.ts` | `pdf_page`, `pdf_y_offset` on `song_sections` |
| 020 | `020_tab_compositions_saved.ts` | `is_saved`, `saved_at` on `tab_compositions` |
| 021 | `021_ear_training.ts` | `ear_sessions`, `ear_attempts` |
| 022 | `022_repertoire_iq.ts` | `repertoire_collections`, `repertoire_items`, `repertoire_reviews` |
| 023 | `023_repertoire_typed_refs.ts` | Typed FK columns on `repertoire_items` |
| 024 | `024_tab_compositions_preview_image.ts` | `preview_image` on `tab_compositions` |
| 025 | `025_tab_compositions_youtube_url.ts` | `youtube_url` on `tab_compositions` |
| 026 | `026_spotify_history_v2.ts` | `spotify_history_imports`, rebuild `spotify_history` |
| 027 | `027_explorer_saves.ts` | `explorer_saves` |
| 028 | `028_setlist_item_types.ts` | `item_type` + `composition_id` + `pdf_library_id` on `setlist_items` |

## Model Files

| File | Exposes |
|---|---|
| `src/lib/local-db/library.ts` | Chorus chart catalog queries, local chart sync |
| `src/lib/local-db/saved-charts.ts` | Save/unsave charts, download status |
| `src/lib/local-db/setlists.ts` | CRUD for setlists and setlist items |
| `src/lib/local-db/playbook.ts` | Practice sessions, sections, progress, annotations |
| `src/lib/local-db/tab-compositions.ts` | Tab composition CRUD, load/save GP7 blobs |
| `src/lib/local-db/repertoire.ts` | SRS repertoire items, reviews, stats |
| `src/lib/local-db/pdf-library.ts` | PDF library scan results, chart-PDF links |
| `src/lib/local-db/spotify-history/index.ts` | History import + recently-played sync |
| `src/lib/local-db/youtube.ts` | YouTube association CRUD |
| `src/lib/local-db/explorer-saves.ts` | Explorer list saves |
| `src/lib/local-db/ear-training.ts` | Ear training sessions and attempts |
| `src/lib/local-db/fill-trainer.ts` | Drum fill practice sessions |
| `src/lib/local-db/fretboard.ts` | Fretboard IQ sessions and attempts |
| `src/lib/local-db/queries.ts` | Shared query helpers |
| `src/lib/local-db/normalize.ts` | Text normalization utilities |
