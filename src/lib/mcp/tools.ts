import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import {importer, Settings} from '@coderline/alphatab';

import {
  TAB_SOURCES,
  getSource,
  isGpSource,
  isTextTabSource,
  type TabSearchResult,
} from '@/lib/tab-sources';
import {searchEncore} from '@/lib/search-encore';
import {
  isArchived,
  listCompositions,
  loadComposition,
  markCompositionSaved,
  saveComposition,
  setCompositionArchived,
  updateCompositionMeta,
  type ArchiveScope,
} from '@/lib/local-db/tab-compositions';
import {normalizeTags} from '@/lib/composition-tags';
import {importFromAsciiTab} from '@/lib/tab-editor/asciiTabImporter';
import {exportToGp7} from '@/lib/tab-editor/exporters';

import {text, type McpTool} from './types';

const SOURCE_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Mirrors `fetchGpBytes` in TabsBrowseTab.tsx. */
async function fetchGpBytes(result: TabSearchResult): Promise<ArrayBuffer> {
  const source = getSource(result.sourceId);
  if (!source || !isGpSource(source)) {
    throw new Error(`Source "${result.sourceId}" has no GP download`);
  }
  const url = await source.getDownloadUrl(result);
  const response = await tauriFetch(
    url,
    source.downloadHeaders ? {headers: source.downloadHeaders} : undefined,
  );
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  return response.arrayBuffer();
}

/** Mirrors `handleOpenTextTab` in TabsBrowseTab.tsx: ASCII → Score → GP7 bytes. */
async function fetchTextTabAsGp(result: TabSearchResult): Promise<ArrayBuffer> {
  const source = getSource(result.sourceId);
  let raw: string;
  if (source && isTextTabSource(source)) {
    raw = await source.getTextContent(result);
  } else {
    const url = result.textTabUrl ?? result.viewUrl;
    if (!url) throw new Error('No URL to fetch tab text from');
    const res = await tauriFetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    raw = await res.text();
  }
  const score = importFromAsciiTab(raw, {title: result.title, artist: result.artist});
  return exportToGp7(score).buffer as ArrayBuffer;
}

export const TAB_INGEST_GUIDE = `
# Adding a tab to the library properly

save_tab_to_library gets the notes in. Everything below is what makes the tab
actually usable, and none of it is automatic. Do every step and report which
facts you verified against the recording and which you assumed.

## 1. Find the recording the tab is based on

- Search YouTube for "<artist> <title>". Prefer the official upload: the
  "<Artist> - Topic" channel (album audio) or the artist's channel.
- Confirm a candidate with oEmbed (no API key):
  https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json
  The title and author_name must match.
- Match the version: tabs titled "Live", "V2", "Acoustic", etc. often follow a
  different recording, with a different key, tuning or tempo.

## 2. Link it

update_composition_meta with:
  youtubeUrl    https://www.youtube.com/watch?v=<id>
  previewImage  https://i.ytimg.com/vi/<id>/hqdefault.jpg

## 3. Verify tuning and capo

The ASCII importer reads a "Tuning:" line, falls back to the string labels
("C|", "G|", ...), and reads "Capo: N". Check the result with
get_composition_score: staff.stringTuning (MIDI, highest string first) and
staff.capo. Common traps:
- Detune comments are ignored: "DADGBE (down a half step)" imports as DADGBE.
- A capo mentioned only in prose ("capo at 3rd fret") is not read.
- Versions of the same song are often in different tunings (album vs live).
- Without any declaration, the importer assumes standard tuning.
Cross-check against the recording: the key and the lowest open notes. If
everything sounds a semitone or a whole step off, the tab is missing a detune
or a capo.

## 4. Tempo and meter

Take the BPM and time signature from the recording, never the default 120 4/4.
Set them in the score (score.tempo plus the tempo automation on bar 1, and
masterBar time signatures) and set the tempo with update_composition_meta too.

The song key lives in the key signature of bar 1 (masterBar.keySignature:
sharps positive, flats negative; a minor key uses its relative major's
signature). The editor's KEY selector reads it from there. 0 reads as "no key",
because it is also GP's default, so a song in C major or A minor shows no key.

## 5. Sections and form

The importer turns labels such as "Intro :", "Verse :" and "[Chorus]" into
section markers. Check they are present and named sensibly. ASCII tabs are not
linear: "X2" repeats are not expanded, and notes like "back to verse" are
ignored. Mark repeats (masterBar.isRepeatStart / repeatCount) so the score
follows the recording's form.

## 6. Rhythm

ASCII tabs carry no durations; the importer gives every beat in a bar the same
length. Correct the durations from the recording, and say per bar how sure you
are. Never change frets or strings while fixing rhythm.

If you are working in the Chartmate repo, follow the tab-rhythm-from-recording
skill (.claude/skills/) and its scripts (scripts/rhythm/): they do the download,
stem separation, transcription, alignment and verification for you. The method,
if you have to do it by hand:
- Get the audio (yt-dlp, latest release), isolate the guitar (Demucs
  htdemucs_6s) and transcribe notes with onsets (basic-pitch).
- Align the tab's pitch sequence to the transcription to find where each bar
  occurs. Similar bars get confused, so decide the song form yourself.
- For each repeated figure, fit an even grid to its occurrences, starting from
  the ASCII column spacing (often already the rhythm). Read where notes fall:
  integers mean straight notes, .33/.67 mean triplets. A bar that ends after 6
  eighths instead of 8 is 6/8.
- Measure tempo from the most repeated bar, not from a global estimate. A
  section with its own pulse gets its own meter and tempo. Rubato sections get
  proportional durations, a "(rubato)" section name and fermatas.
- Notes heard but not in the tab are reported, never added.
- Check the tab's pitches against the transcription too: ASCII tabs have wrong
  notes. Fix a fret only when every occurrence in the recording shows the same
  nearby note on that string, and report it. Quiet hammer-ons fool the
  transcription, so flags on those are often false.
- If you separated stems, attach them to the composition (in the repo:
  scripts/rhythm/attach-stems.sh) so the user can practice with them.
- Reload your export and check: same notes per bar, same tuning, every bar
  adds up to its time signature.

## No tab exists

search_tabs finds nothing, or only chords? The song can be transcribed from the
recording. Fingerpicked guitar works well (92% of score notes confirmed in the
audio on the first try); strummed sections come out as chord shapes plus a strum
rhythm (about 65% confirmed, strum direction assumed). In the Chartmate repo,
follow the transcribe-from-recording skill (.claude/skills/) and scripts/transcribe/.
The method:
1. Separate stems and transcribe them: guitar, plus voice and bass to recognise bleed.
2. Build the grid: from the drum stem when there's a band, else from the guitar's
   bass notes. Confirm the meter from where the drums land.
3. Snap notes to that grid. Per section, decide picked, pinched or strummed.
4. Group bars that play the same figure, and keep the notes most occurrences agree on.
5. Pick tuning and capo from the lowest notes and an easy fingering.
6. Assign strings and frets by minimising hand movement.
7. Build the GP and measure coverage against the audio.
Then add it with create_composition and do steps 2–5 above. If a tab does
exist, check it against the audio anyway: online tabs are often wrong.

## Editing a score

get_composition_score returns scoreBase64. Load it with alphaTab
(importer.ScoreLoader.loadScoreFromBytes), edit the model, export it with
exporter.Gp7Exporter, and write it back with update_composition_score. Reload
your export first to check that the note count and tuning are unchanged.
`.trim();

export const TOOLS: McpTool[] = [
  {
    name: 'tab_ingest_guide',
    description:
      'Read this before adding or fixing a tab in the library. Checklist for linking the ' +
      'recording and thumbnail and for verifying tuning, capo, tempo, sections and rhythm.',
    inputSchema: {type: 'object', properties: {}},
    async run() {
      return text(TAB_INGEST_GUIDE);
    },
  },

  {
    name: 'search_tabs',
    description:
      'Search every configured tab source (GProTab, ClassClef, TheGuitarLesson, Classtab, ' +
      'Ultimate Guitar, ClassicalGuitarShed, IMSLP, Ignition4) for a song. Returns result ' +
      'objects — pass one verbatim to save_tab_to_library. Scrapers break often, so sources ' +
      'that fail are reported in failedSources instead of failing the whole call.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {type: 'string', description: 'Song and/or artist, e.g. "radiohead creep"'},
        sources: {
          type: 'array',
          items: {type: 'string'},
          description: 'Optional sourceId allowlist. Omit to search all.',
        },
        limit: {type: 'number', description: 'Max results per source (default 10)'},
      },
      required: ['query'],
    },
    async run({query, sources, limit = 10}) {
      const wanted: typeof TAB_SOURCES = Array.isArray(sources) && sources.length
        ? TAB_SOURCES.filter(s => sources.includes(s.sourceId))
        : TAB_SOURCES;

      // One hung scraper must not stall the whole call: each source gets its own deadline
      // and lands in failedSources when it misses it.
      const settled = await Promise.allSettled(wanted.map(s => withTimeout(s.search(query), SOURCE_TIMEOUT_MS)));

      const results: TabSearchResult[] = [];
      const failedSources: {sourceId: string; error: string}[] = [];
      settled.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled') {
          results.push(...outcome.value.slice(0, limit));
        } else {
          failedSources.push({
            sourceId: wanted[i].sourceId,
            error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
          });
        }
      });

      return text({count: results.length, results, failedSources});
    },
  },

  {
    name: 'save_tab_to_library',
    description:
      "Download a tab and save it into Chartmate's composition library as Guitar Pro 7. " +
      'Returns the composition id, which a curriculum tab-exercise activity references as ' +
      '"db:<id>". Handles GP sources and ASCII-text sources; PDF-only sources (ClassClef, ' +
      'ClassicalGuitarShed, IMSLP) are not supported yet.',
    inputSchema: {
      type: 'object',
      properties: {
        result: {
          type: 'object',
          description: 'A result object exactly as returned by search_tabs.',
        },
        instrument: {
          type: 'string',
          description: 'guitar (default), bass, or drums',
        },
      },
      required: ['result'],
    },
    async run({result, instrument = 'guitar'}) {
      const r = result as TabSearchResult;
      if (!r?.sourceId || !r?.id) {
        throw new Error('result must be an object from search_tabs (needs sourceId and id)');
      }

      const source = getSource(r.sourceId);
      if (!source) throw new Error(`Unknown source "${r.sourceId}"`);

      let bytes: ArrayBuffer;
      if (r.hasGp && isGpSource(source)) {
        bytes = await fetchGpBytes(r);
      } else if (r.textTabUrl || isTextTabSource(source)) {
        bytes = await fetchTextTabAsGp(r);
      } else {
        throw new Error(
          `"${r.sourceId}" offers no GP or text tab for this result (PDF-only sources are unsupported)`,
        );
      }

      const id = await saveComposition(bytes, {
        title: r.title,
        artist: r.artist,
        album: '',
        tempo: 120,
        instrument,
      });
      await markCompositionSaved(id);

      return text({
        compositionId: id,
        reference: `db:${id}`,
        title: r.title,
        artist: r.artist,
      });
    },
  },

  {
    name: 'search_charts',
    description:
      'Search the Encore (enchor.us) catalog of Clone Hero / YARG charts. Use this for ' +
      'playable charts; use search_tabs for sheet music and tablature.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {type: 'string', description: 'Song and/or artist'},
        instrument: {
          type: 'string',
          description: 'Optional filter: guitar, bass, drums, keys, vocals',
        },
        page: {type: 'number', description: 'Page number, 1-based (default 1)'},
      },
      required: ['query'],
    },
    async run({query, instrument = null, page = 1}) {
      const response = await searchEncore(query, instrument, page);
      return text({
        found: response.found,
        charts: response.data.map(c => ({
          name: c.name,
          artist: c.artist,
          charter: c.charter,
          md5: c.md5,
          songLength: c.song_length ?? null,
          difficulties: {
            guitar: c.diff_guitar ?? null,
            bass: c.diff_bass ?? null,
            drums: c.diff_drums ?? null,
            keys: c.diff_keys ?? null,
          },
        })),
      });
    },
  },

  {
    name: 'list_compositions',
    description:
      "List tabs already in Chartmate's composition library, newest first. Each id can be " +
      'referenced from a curriculum tab-exercise activity as "db:<id>". Each entry includes ' +
      'its tags (string[]) and whether it is archived (archived: boolean, archivedAt). ' +
      'Archived tabs are hidden from library browsing in the app but still work when ' +
      'referenced directly, and they are listed here by default. Pass archived: true to ' +
      'list only archived ones, false to list only active ones.',
    inputSchema: {
      type: 'object',
      properties: {
        archived: {
          type: 'boolean',
          description: 'Filter by archive state. Omit to list every composition (the default).',
        },
      },
    },
    async run({archived}) {
      const scope: ArchiveScope =
        archived === undefined ? 'all' : archived ? 'archived' : 'active';
      const compositions = await listCompositions(scope);
      return text({
        count: compositions.length,
        compositions: compositions.map(c => ({...c, archived: isArchived(c)})),
      });
    },
  },

  {
    name: 'get_composition_score',
    description:
      'Read a library composition as Guitar Pro bytes (base64) plus its metadata, so you can ' +
      'edit it with AlphaTab (or any GP tool) and write it back with update_composition_score.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {type: 'number', description: 'Composition id (the number in "db:<id>")'},
      },
      required: ['id'],
    },
    async run({id}) {
      const existing = await loadComposition(Number(id));
      if (!existing) throw new Error(`No composition with id ${id}`);

      const bytes = new Uint8Array(existing.scoreData);
      let bin = '';
      bytes.forEach(b => (bin += String.fromCharCode(b)));

      return text({...existing.meta, reference: `db:${existing.meta.id}`, scoreBase64: btoa(bin)});
    },
  },

  {
    name: 'update_composition_score',
    description:
      'Replace the score of an existing library composition with new Guitar Pro bytes ' +
      '(e.g. after correcting rhythm). Title, artist, album, preview and saved state are kept; ' +
      "tempo is taken from the new score. The bytes must load in AlphaTab or nothing is written.",
    inputSchema: {
      type: 'object',
      properties: {
        id: {type: 'number', description: 'Composition id (the number in "db:<id>")'},
        scoreBase64: {type: 'string', description: 'Guitar Pro file (GP7 preferred) as base64'},
      },
      required: ['id', 'scoreBase64'],
    },
    async run({id, scoreBase64}) {
      const existing = await loadComposition(Number(id));
      if (!existing) throw new Error(`No composition with id ${id}`);

      const bin = atob(String(scoreBase64));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      let score;
      try {
        score = importer.ScoreLoader.loadScoreFromBytes(bytes, new Settings());
      } catch (e) {
        throw new Error(`scoreBase64 is not a readable Guitar Pro file: ${e instanceof Error ? e.message : e}`);
      }

      const {meta} = existing;
      await saveComposition(bytes.buffer as ArrayBuffer, {
        id: meta.id,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        tempo: Math.round(score.tempo),
        instrument: meta.instrument,
        previewImage: meta.previewImage,
        youtubeUrl: meta.youtubeUrl,
      });

      return text({
        compositionId: meta.id,
        reference: `db:${meta.id}`,
        tempo: Math.round(score.tempo),
        bars: score.masterBars.length,
      });
    },
  },

  {
    name: 'create_composition',
    description:
      'Add a new composition to the library from Guitar Pro bytes you built yourself (e.g. a ' +
      'transcription from a recording, when no tab exists). Returns the "db:<id>" reference. ' +
      'Tempo is taken from the score. The bytes must load in AlphaTab or nothing is written. ' +
      'Optional tags (string[]) label it in the library.',
    inputSchema: {
      type: 'object',
      properties: {
        scoreBase64: {type: 'string', description: 'Guitar Pro file (GP7 preferred) as base64'},
        title: {type: 'string'},
        artist: {type: 'string'},
        album: {type: 'string'},
        instrument: {type: 'string', description: 'guitar (default), bass, or drums'},
        youtubeUrl: {type: 'string', description: 'The recording it was transcribed from'},
        previewImage: {type: 'string', description: 'Image URL used as the library card'},
        tags: {
          type: 'array',
          items: {type: 'string'},
          description: 'Library tags, e.g. ["fingerstyle", "to learn"]. Trimmed; duplicates ignoring case are dropped.',
        },
      },
      required: ['scoreBase64', 'title', 'artist'],
    },
    async run({scoreBase64, title, artist, album = '', instrument = 'guitar', youtubeUrl = null, previewImage = null, tags}) {
      if (tags !== undefined && !Array.isArray(tags)) throw new Error('tags must be an array of strings');

      const bin = atob(String(scoreBase64));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      let score;
      try {
        score = importer.ScoreLoader.loadScoreFromBytes(bytes, new Settings());
      } catch (e) {
        throw new Error(`scoreBase64 is not a readable Guitar Pro file: ${e instanceof Error ? e.message : e}`);
      }

      const tempo = Math.round(score.tempo);
      const id = await saveComposition(bytes.buffer as ArrayBuffer, {
        title, artist, album, tempo, instrument, previewImage, youtubeUrl, tags,
      });
      await markCompositionSaved(id);

      return text({
        compositionId: id,
        reference: `db:${id}`,
        tempo,
        bars: score.masterBars.length,
        tags: normalizeTags(tags ?? []),
      });
    },
  },

  {
    name: 'update_composition_meta',
    description:
      'Update library metadata of a composition without touching its score. Only the fields ' +
      'you pass change. Use it to link the recording (youtubeUrl) and its thumbnail ' +
      '(previewImage, e.g. https://i.ytimg.com/vi/<videoId>/hqdefault.jpg) and to set the ' +
      'real tempo. Pass null to clear youtubeUrl or previewImage. Pass tags (string[]) to ' +
      'replace the whole tag set ([] clears it); omit tags to keep them. Pass archived: true ' +
      'to archive it (hidden from library browsing, nothing deleted — score, tags and stems ' +
      'are kept and "db:<id>" references keep working) or archived: false to restore it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {type: 'number', description: 'Composition id (the number in "db:<id>")'},
        title: {type: 'string'},
        artist: {type: 'string'},
        album: {type: 'string'},
        tempo: {type: 'number', description: 'BPM shown in the library'},
        instrument: {type: 'string', description: 'guitar, bass, or drums'},
        youtubeUrl: {type: ['string', 'null']},
        previewImage: {type: ['string', 'null'], description: 'Image URL used as the library card'},
        tags: {
          type: 'array',
          items: {type: 'string'},
          description: 'Replaces all tags of the composition. Trimmed; duplicates ignoring case are dropped.',
        },
        archived: {
          type: 'boolean',
          description: 'true hides it from library browsing (reversible), false restores it.',
        },
      },
      required: ['id'],
    },
    async run({id, ...changes}) {
      if ('tags' in changes && !Array.isArray(changes.tags)) throw new Error('tags must be an array of strings');
      if ('archived' in changes && typeof changes.archived !== 'boolean') {
        throw new Error('archived must be a boolean');
      }

      const existing = await loadComposition(Number(id));
      if (!existing) throw new Error(`No composition with id ${id}`);

      const meta = {...existing.meta};
      for (const key of ['title', 'artist', 'album', 'tempo', 'instrument', 'youtubeUrl', 'previewImage'] as const) {
        if (key in changes) (meta as any)[key] = changes[key];
      }
      // Only touch tags when the caller passed them.
      const tags = 'tags' in changes ? normalizeTags(changes.tags) : undefined;
      if (tags) meta.tags = tags;
      await updateCompositionMeta(meta.id, {...meta, tags});

      // Archiving is a separate column from the metadata update above.
      if ('archived' in changes) {
        meta.archivedAt = await setCompositionArchived(meta.id, changes.archived as boolean);
      }

      return text({...meta, archived: isArchived(meta), reference: `db:${meta.id}`});
    },
  },
];
