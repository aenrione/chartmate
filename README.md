<div align="center">

<img src="./src-tauri/icons/128x128@2x.png" alt="Chartmate" width="104" height="104" />

# Chartmate

**A local-first practice room for guitar and drums.**<br/>
Find the music, read it, slow it down, loop the hard bar, and keep a record of what you actually practiced.

[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=black)](https://rustup.rs/)
[![SQLite](https://img.shields.io/badge/SQLite-local--first-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![MCP](https://img.shields.io/badge/MCP-server-2edcd7)](#also-an-mcp-server)
[![Built with AI](https://img.shields.io/badge/built%20with-AI%20coding%20agents-8f7fff)](#ai-disclosure)

<img src="./docs/demo.jpeg" alt="Chartmate rendering a chart as drum sheet music next to a Clone Hero note highway, with difficulty, speed and section controls in the sidebar" />

</div>

---

## What it is

Chartmate started as a chart browser for [Clone Hero](https://clonehero.net/) and [YARG](https://yarg.in/). It became the app I actually wanted: one window where a song goes from *"I'd like to play that"* to *"I can play that"*.

It searches eight tab sites and the Encore catalog, renders what it finds as real notation, plays it back with a cursor you can follow, loops any section at any speed, lets you fix the tab yourself, and remembers what you drilled. Everything lives in one SQLite file on your machine — no account, no server, nothing uploaded.

For people who practice from tabs and are tired of juggling a browser tab, a PDF, a YouTube video at 0.75×, and a notebook.

---

## What's inside

<div align="center">
  <img src="./docs/media/feature-map.svg" alt="Six feature areas: play and practice, write and edit tabs, train, find music, learn, and an MCP agent surface" width="900" />
</div>

✅ solid · 🚧 new or still moving · 🧪 experimental · ⚠️ works, but depends on someone else's site and breaks when they change it

| | Feature | |
|---|---|:-:|
| **Play &amp; practice** | Notation + tab with a synced playback cursor | ✅ |
| | Clone Hero note highway for drum charts | ✅ |
| | Speed 25–200 % and section looping, without touching the file | ✅ |
| | Per-track stems, click track, lyrics | ✅ |
| | YouTube synced to the bar you're on | 🚧 |
| | Setlists → Playbook, with per-section progress | ✅ |
| **Write &amp; edit** | Keyboard-driven Guitar Pro editor, undo/redo | ✅ |
| | ASCII tab → GP7 import | ✅ |
| | View vs. Edit mode, so practice can't rewrite the score | 🚧 |
| | Strumming patterns and fingering hints | 🚧 |
| | Tags, grouping and archiving in the library | 🚧 |
| | Export to PDF / print sheets | 🧪 |
| **Train** | EarIQ — interval and chord recognition | ✅ |
| | RepertoireIQ — spaced repetition for songs | ✅ |
| | Drum rudiments and fills with a metronome | ✅ |
| | Chord finder | ✅ |
| | Fretboard IQ — note drills on an SM-2 scheduler | 🚧 |
| **Find music** | Encore catalog — browse and download charts | ✅ |
| | Updates — newer versions of charts you already have | ✅ |
| | Eight tab sources searched at once | ⚠️ |
| | Spotify library → charts you can actually play | ⚠️ |
| | CustomsForge Ignition4 CDLC download | ⚠️ |
| | Rocksmith `.psarc` parsing | 🚧 |
| **Learn** | Bundled curriculum — guitar, drums, theory | 🚧 |
| | Skill tree with unlock gating | 🚧 |
| | XP, levels, daily missions, achievements | 🚧 |
| | Programs — your own multi-week practice plans | 🚧 |
| | Calendar and practice-session history | 🚧 |
| | User layer that overrides bundled lessons | 🚧 |
| **Agents &amp; platforms** | MCP server — library and curriculum tools | 🚧 |
| | macOS desktop | ✅ |
| | Windows / Linux desktop | 🚧 |
| | Android / iOS | 🚧 |

---

## Also an MCP server

While the app runs it serves [MCP](https://modelcontextprotocol.io/) on `127.0.0.1:4871`, loopback only. Point a client at it and an assistant can work on your library:

| Tool | What it does |
|---|---|
| `search_tabs` / `save_tab_to_library` | Search the eight tab sources, pull one in as Guitar Pro |
| `search_charts` | Search the Encore Clone Hero / YARG catalog |
| `create_composition` / `update_composition_score` | Write a transcription into the library |
| `update_composition_meta` | Title, artist, tempo, YouTube link, thumbnail |
| `upsert_lesson` / `upsert_unit` | Author curriculum that shows up in the app |

Transport is Rust ([`mcp.rs`](src-tauri/src/mcp.rs)), tools are TypeScript ([`src/lib/mcp/`](src/lib/mcp/)) — the WebView is the only process allowed to write the SQLite file. What it unlocks: *"find a tab for this song, work out its rhythm from the recording, build me a lesson around it."* The skills in `.claude/skills/` do exactly that.

---

## Getting started

Needs [Rust](https://rustup.rs/) (stable), [Node](https://nodejs.org/) 18+, [pnpm](https://pnpm.io/), and the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
git clone https://github.com/aenrione/chartmate.git
cd chartmate
pnpm install
pnpm tauri dev
```

> [!NOTE]
> `pnpm dev` alone won't work. The app reaches SQLite and the filesystem through Tauri, so it needs the native shell.

```bash
pnpm tauri build          # desktop bundle → src-tauri/target/release/bundle/
pnpm android:build        # Android APK (debug)
pnpm tauri ios init       # once, to regenerate the gitignored Xcode project
pnpm ios:build            # iOS (debugging export)
```

On first launch Chartmate asks for your Clone Hero / YARG songs folder — used for scanning, downloading and update checks. Skip it and the chart features stay quiet; tabs, training and curriculum don't need it.

Spotify is opt-in and read-only. Set `VITE_SPOTIFY_CLIENT_ID`, click *Connect Spotify*, and the OAuth callback returns through the `chartmate://` deep link. Tokens stay in a local `prefs.json`.

---

## How it fits together

<div align="center">
  <img src="./docs/media/architecture.svg" alt="Architecture: a React 19 frontend in a WebView holding pages, AlphaTab, Kysely and the MCP tool registry; a Tauri v2 IPC layer; a Rust backend with plugins and native commands; SQLite and prefs.json on disk; AI agents connecting over loopback port 4871" width="920" />
</div>

**The WebView owns the data, Rust owns the OS.** Every query goes through Kysely in TypeScript. Rust handles only what a WebView can't: parsing Rocksmith archives, driving a hidden auth WebView for CDLC downloads, serving the MCP port, and deep links. No global state library — state is local or in a React context.

```
src/
├── pages/            # one folder per surface — playbook, tab-editor, learn, guitar, …
├── lib/
│   ├── local-db/     # Kysely client, models, 47 migrations
│   ├── tab-editor/   # score operations, ASCII import, keyboard engine
│   ├── tab-sources/  # the eight scrapers
│   ├── mcp/          # MCP tool definitions
│   └── curriculum/   # lesson loader + user override layer
└── curriculum/       # bundled lessons
src-tauri/src/        # lib.rs, psarc.rs, ignition.rs, mcp.rs
scripts/              # rhythm/transcription tooling (Python + TS)
```

| Doc | Covers |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Tech stack, Tauri plugins, Rust commands, AlphaTab integration |
| [`docs/database.md`](docs/database.md) | Every SQLite table, relationships, migration history |
| [`docs/user-flows.md`](docs/user-flows.md) | Every route and the journey through it |
| [`docs/integrations.md`](docs/integrations.md) | Spotify PKCE, Encore API, Ignition4, YouTube, PSARC |

The agent guide at the repo root has the conventions and a key-file map, written for coding agents landing in a fresh context.

---

## Development

```bash
pnpm test                 # vitest unit tests
pnpm test:ct              # Playwright component tests
pnpm test:e2e:editor      # editor playback, Chromium + WebKit — needs Node 22.13+
```

The playback tests mount the real editor and measure Web Audio output, but stub native IPC and YouTube. Check a real build before trusting a playback change.

---

## Caveats

- **Scrapers break.** The ⚠️ rows depend on sites with no obligation to keep their markup stable. They fail loudly rather than returning nothing, so you'll know.
- **Respect the sources.** This is a client for catalogs other people run. Don't hammer them, and honor the licensing of what you download.
- **The schema still moves.** 47 migrations and counting — back up your SQLite file before pulling a big change.
- **macOS is the daily driver.** Everything else gets built and spot-checked, not lived in.

---

## Contributing

Issues and PRs welcome — especially "this scraper is broken" and "this code is nonsense, here's why." Open an issue first for anything non-trivial, and run `pnpm test` before you push.

## Acknowledgements

[AlphaTab](https://alphatab.net/) for notation rendering and playback · [Encore](https://enchor.us) for the chart catalog · [`@eliwhite/scan-chart`](https://www.npmjs.com/package/@eliwhite/scan-chart) · [Tauri](https://v2.tauri.app/) · [Kysely](https://kysely.dev/) · [Three.js](https://threejs.org/) for the note highway · [VexFlow](https://www.vexflow.com/) · the Clone Hero, YARG and CustomsForge communities.

---

<a id="ai-disclosure"></a>

## ⚠️ About the code

**Built largely with AI coding agents** — Claude Code, mostly. I directed it, reviewed much of it, and shipped it, but I didn't hand-write most of this and won't pretend otherwise.

- **Don't read it as a sample of my engineering.** It's a sample of what agent-driven development produces when the goal is "a working app for me", not "a codebase I'd defend in review".
- **Quality is uneven.** The editor's playback logic, the ASCII importer and the migration layer are tested and deliberate. Plenty else is first-draft that happened to work — dead paths, inconsistent conventions, comments written by something that was guessing.
- **Nothing here is load-bearing for anyone but me.** No security review, no audit, no stability promise.

"Why on earth is it like that" issues are genuinely welcome; the answer is usually "an agent wrote it and it passed." The commit history and the plans under `docs/superpowers/` are left in as the honest record.

## License

MIT — © 2026 aenrione. See [`LICENSE`](LICENSE).

[AlphaTab](https://github.com/CoderLine/alphaTab/blob/main/LICENSE) is MPL-2.0 and pdf.js is Apache-2.0; both are used unmodified, so redistributing a build means keeping their notices. Charts and tabs you download belong to whoever made them, not to this license.
