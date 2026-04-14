# ChartMate Tab Skill + ASCII Importer Improvements

**Date:** 2026-04-14  
**Status:** Approved

---

## Overview

Two deliverables:

1. **`/chartmate-tab` skill** — Claude skill that takes a song name, searches the web for its ASCII tab, and outputs a ready-to-import block with metadata header.
2. **ASCII importer metadata support** — thin pre-processor in `importFromAsciiTab()` that strips the metadata header and passes title/artist/tempo as import options.
3. **ASCII importer test suite expansion** — comprehensive new test cases to harden the parser.

---

## Deliverable 1: `/chartmate-tab` Skill

### File

`~/.claude/skills/chartmate-tab/SKILL.md`

### Trigger

User invokes `/chartmate-tab <song name>` or `/chartmate-tab <song> by <artist>`.

### Steps Claude Follows

1. Parse song name + optional artist from user input.
2. Search tab sources in order using `WebSearch`:
   - Ultimate Guitar (`site:ultimate-guitar.com`)
   - Songsterr (`site:songsterr.com`)
   - Classtab (`site:classtab.org`)
   - Classical Guitar Shed, ClassClef, The Guitar Lesson
   - Fallback: generic `WebSearch` for `"<song> <artist> guitar tab ASCII"`
3. `WebFetch` the best result to get raw ASCII tab text.
4. Strip site markup: `[tab]`, `[/tab]`, `[ch]`, `[/ch]`, UG prose, ads.
5. Detect or estimate tempo (from page metadata, song knowledge, or omit if unknown).
6. Output ready-to-import block:

```
Title: <song title>
Artist: <artist name>
Tempo: <bpm or omit if unknown>

e|---0-2-3-5---|
B|-------------|
G|-------------|
D|-------------|
A|-------------|
E|-------------|
```

7. Tell user to paste into the app's **Import ASCII Tab** dialog.
8. If no tab found across all sources, tell user and suggest they try a different search query.

### Output Contract

- Metadata lines come **before** the tab, one per line, format `Key: Value`.
- Supported keys: `Title`, `Artist`, `Tempo` (BPM integer).
- Tab text follows immediately after metadata lines (no blank section separator required, but a blank line is fine).
- No trailing prose after the tab block.

---

## Deliverable 2: ASCII Importer Metadata Support

### File

`src/lib/tab-editor/asciiTabImporter.ts`

### Change

Add `parseTabBlock()` helper **before** the existing parsing logic:

```typescript
interface TabBlockParsed {
  tabText: string;
  extractedOptions: AsciiImportOptions;
}

function parseTabBlock(input: string): TabBlockParsed {
  // Read leading lines matching /^(Title|Artist|Tempo):\s*(.+)$/i
  // Extract into AsciiImportOptions
  // Return remaining text as tabText
}
```

`importFromAsciiTab(text, options)` calls `parseTabBlock(text)` first, then merges:
- Extracted metadata as base
- Passed-in `options` override (passed-in wins on conflict)

### Behavior

- Lines not matching `Key: Value` at the top of the input stop header parsing — rest is tab text.
- A blank line between header and tab is tolerated.
- `Tempo` value parsed as integer; invalid values ignored.
- No changes to existing parsing logic below this pre-processor.

---

## Deliverable 3: ASCII Importer Test Expansion

### File

`src/lib/tab-editor/__tests__/asciiTabImporter.test.ts`

### New Test Categories

| Category | Cases |
|---|---|
| **Techniques** | bends (`b`), slides (`/` `\`), vibrato (`~`), hammer-on (`h`), pull-off (`p`) — assert correct `NoteEffect` on resulting notes |
| **Frets** | double-digit (10–24), open strings (0), multiple notes same beat (chord) |
| **Time signatures** | 3/4, 6/8, 5/4 auto-detection from beat count per bar |
| **String counts** | 4-string bass auto-detection, 7-string guitar |
| **Bar structures** | empty bars, multi-system tabs (multiple stacked systems), pickup bars |
| **Markup stripping** | `[tab]...[/tab]` wrapper, `[ch]...[/ch]` chord labels, UG prose between systems |
| **Edge cases** | trailing whitespace on lines, missing string labels, mixed-case labels (`e` vs `E`) |
| **Metadata header** | `Title:` / `Artist:` / `Tempo:` parsed into options; passed-in options override extracted; non-header lines not consumed |

### Test Structure

Each test: input ASCII string → call `importFromAsciiTab()` → assert on resulting `Score` object:
- Correct note fret/string positions
- Correct note effects applied
- Correct time signature on `MasterBar`
- Correct metadata on `Score` (title, artist)
- Correct tempo on `Automation`

---

## Non-Goals

- No UI changes to the import dialog.
- No changes to GP7 export/import flow.
- Skill does not auto-import into the app programmatically — user pastes manually.
- No tempo detection heuristics beyond what's available on the source page.

---

## Files Changed

| File | Change |
|---|---|
| `~/.claude/skills/chartmate-tab/SKILL.md` | NEW — skill definition |
| `src/lib/tab-editor/asciiTabImporter.ts` | ADD `parseTabBlock()` pre-processor |
| `src/lib/tab-editor/__tests__/asciiTabImporter.test.ts` | ADD new test cases |
