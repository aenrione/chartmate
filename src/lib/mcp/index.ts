import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';

import {isDesktop} from '@/lib/platform';
import {notifyLibraryChanged} from '@/lib/library-events';
import {TOOLS as SONG_TOOLS} from './tools';
import {CURRICULUM_TOOLS} from './curriculum-tools';

const TOOLS = [...SONG_TOOLS, ...CURRICULUM_TOOLS];

/** Tools that change the composition library; an open library page refreshes after them. */
const LIBRARY_WRITE_TOOLS = new Set([
  'save_tab_to_library',
  'create_composition',
  'update_composition_score',
  'update_composition_meta',
]);

/**
 * Returned by MCP `initialize`, so an agent understands the shape of this
 * server before it calls anything.
 */
const INSTRUCTIONS = `
Chartmate is a desktop app for learning guitar and drums. This server exposes
its song library and its curriculum so you can build custom learning material.

Two groups of tools:

1. Finding music
   search_tabs           search 8 tab/sheet-music sources
   save_tab_to_library   download a tab into Chartmate as Guitar Pro, returns "db:<id>"
   search_charts         search the Encore catalog of Clone Hero / YARG charts
   list_compositions     tabs already in the library, with their "db:<id>" refs
   create_composition        add a Guitar Pro file you built (e.g. a transcription) to the library
   get_composition_score     read a composition's Guitar Pro bytes (base64) + metadata
   update_composition_score  replace a composition's Guitar Pro bytes (keeps metadata)
   update_composition_meta   set title/artist/album/tempo, YouTube link and thumbnail
   tab_ingest_guide          READ THIS FIRST before adding or fixing a tab in the library

2. Authoring lessons
   curriculum_guide      READ THIS FIRST before writing any lesson
   list_curriculum       units and lesson ids, bundled vs user
   get_lesson            read a lesson to use as a template
   upsert_lesson         write a lesson
   upsert_unit           list lesson ids in a unit so they appear in the app
   delete_custom_lesson  remove your override, restoring the bundled lesson

The built-in curriculum is compiled into the app and is read-only. Anything you
write goes into a user layer on disk that overrides bundled content by id and is
additive for new ids — so you can extend or replace lessons without destroying
the defaults, and deleting your file always restores the original.

A typical task ("teach someone this song"): search_tabs -> save_tab_to_library
to get a "db:<id>", then follow tab_ingest_guide (recording, tuning, tempo,
sections, rhythm), then upsert_lesson with a tab-exercise activity referencing
that id, then upsert_unit so the lesson is reachable.

Tools fail loudly with specific messages. Some tab sources are scrapers that
break or need login; search_tabs reports those in failedSources and still
returns whatever the other sources found.
`.trim();

type CallPayload = {
  id: number;
  name: string;
  arguments: Record<string, unknown> | null;
};

/**
 * Wire the webview into the Rust MCP transport (`src-tauri/src/mcp.rs`).
 *
 * Tools run here rather than in Rust because they reuse `tab-sources/` and the
 * Kysely layer, and this is the process that owns the SQLite connection.
 * Desktop only — the Rust module is `#[cfg(desktop)]`.
 */
export async function startMcpBridge(): Promise<void> {
  if (!isDesktop) return;

  await invoke('mcp_set_tools', {
    tools: TOOLS.map(({name, description, inputSchema}) => ({
      name,
      description,
      inputSchema,
    })),
    instructions: INSTRUCTIONS,
  });

  await listen<CallPayload>('mcp:call', async ({payload}) => {
    const {id, name} = payload;
    const tool = TOOLS.find(t => t.name === name);

    if (!tool) {
      await invoke('mcp_respond', {id, error: `unknown tool: ${name}`});
      return;
    }

    try {
      const content = await tool.run(payload.arguments ?? {});
      if (LIBRARY_WRITE_TOOLS.has(name)) notifyLibraryChanged();
      await invoke('mcp_respond', {id, result: {content}});
    } catch (err) {
      await invoke('mcp_respond', {
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const port = await invoke<number>('mcp_port');
  console.log(`[mcp] bridge ready — ${TOOLS.length} tools on http://127.0.0.1:${port}`);
}
