# ChartMate Tab Skill + ASCII Importer Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `/chartmate-tab` Claude skill that fetches real ASCII tabs from the web and outputs a ready-to-import block; update `importFromAsciiTab()` to parse metadata from that block; expand the ASCII importer test suite.

**Architecture:** Three independent deliverables — (1) a skill markdown file Claude follows when invoked, (2) a thin `parseTabBlock()` pre-processor added to the existing importer, (3) new test cases added to the existing test file. No UI changes needed.

**Tech Stack:** TypeScript, Vitest, AlphaTab (`@coderline/alphatab`), Claude skill markdown.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `~/.claude/skills/chartmate-tab/SKILL.md` | CREATE | Skill definition Claude follows |
| `src/lib/tab-editor/asciiTabImporter.ts` | MODIFY | Add `parseTabBlock()` pre-processor |
| `src/lib/tab-editor/__tests__/asciiTabImporter.test.ts` | MODIFY | Add new test cases |

---

## Task 1: Add `parseTabBlock()` to ASCII importer

**Files:**
- Modify: `src/lib/tab-editor/asciiTabImporter.ts`

- [ ] **Step 1: Write the failing tests for metadata header parsing**

Add this describe block to the END of `src/lib/tab-editor/__tests__/asciiTabImporter.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// Metadata header parsing (parseTabBlock)
// ---------------------------------------------------------------------------

describe('importFromAsciiTab – metadata header', () => {
  const TAB_WITH_HEADER = `Title: Stairway to Heaven
Artist: Led Zeppelin
Tempo: 72

e|---0---2---|
B|---1---3---|
G|---0---2---|
D|---2---0---|
A|---3-------|
E|-----------|`;

  it('parses Title from header', () => {
    const score = importFromAsciiTab(TAB_WITH_HEADER);
    expect(score.title).toBe('Stairway to Heaven');
  });

  it('parses Artist from header', () => {
    const score = importFromAsciiTab(TAB_WITH_HEADER);
    expect(score.artist).toBe('Led Zeppelin');
  });

  it('parses Tempo from header and applies it', () => {
    const score = importFromAsciiTab(TAB_WITH_HEADER);
    expect(score.masterBars[0].tempoAutomations[0].value).toBe(72);
  });

  it('passed-in options override extracted header values', () => {
    const score = importFromAsciiTab(TAB_WITH_HEADER, {title: 'Override', artist: 'Override Artist', tempo: 200});
    expect(score.title).toBe('Override');
    expect(score.artist).toBe('Override Artist');
    expect(score.masterBars[0].tempoAutomations[0].value).toBe(200);
  });

  it('still parses tab notes after the header', () => {
    const score = importFromAsciiTab(TAB_WITH_HEADER);
    expect(countNotes(score)).toBeGreaterThan(0);
  });

  it('tab with no header still works', () => {
    const tab = `e|---0---2---|\nB|---1---3---|\nG|---0---2---|\nD|---2---0---|\nA|---3-------|\nE|-----------|`;
    const score = importFromAsciiTab(tab, {title: 'Plain', artist: 'NoHeader'});
    expect(score.title).toBe('Plain');
    expect(countNotes(score)).toBeGreaterThan(0);
  });

  it('invalid Tempo value is ignored, falls back to default', () => {
    const tab = `Title: Test\nTempo: notanumber\n\ne|---0---|\nB|-------|\nG|-------|\nD|-------|\nA|-------|\nE|-------|`;
    const score = importFromAsciiTab(tab);
    expect(score.masterBars[0].tempoAutomations[0].value).toBe(120);
  });

  it('header keys are case-insensitive', () => {
    const tab = `title: My Song\nartist: My Artist\ntempo: 100\n\ne|---0---|\nB|-------|\nG|-------|\nD|-------|\nA|-------|\nE|-------|`;
    const score = importFromAsciiTab(tab);
    expect(score.title).toBe('My Song');
    expect(score.artist).toBe('My Artist');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/alfredoenrione/my-github/mine/chartmate && npm test -- --reporter=verbose 2>&1 | grep -A 3 "metadata header"
```

Expected: 7 failing tests ("score.title is 'Imported Tab'" not "Stairway to Heaven", etc.)

- [ ] **Step 3: Add `parseTabBlock()` to the importer**

In `src/lib/tab-editor/asciiTabImporter.ts`, add this function **above** the `importFromAsciiTab` export (after the `AsciiImportOptions` interface):

```typescript
interface TabBlockParsed {
  tabText: string;
  extractedOptions: AsciiImportOptions;
}

/**
 * Strip a leading metadata header (Title/Artist/Tempo lines) from the input.
 * Returns the remaining tab text and whatever options were extracted.
 * The caller merges extracted options with any explicitly passed options;
 * explicitly passed options win on conflict.
 */
function parseTabBlock(input: string): TabBlockParsed {
  const lines = input.split('\n');
  const extracted: AsciiImportOptions = {};
  let i = 0;

  // Skip leading blank lines before the header
  while (i < lines.length && lines[i].trim() === '') i++;

  // Consume header lines (Key: Value) — stop at first non-matching non-blank line
  while (i < lines.length) {
    const line = lines[i].trim();
    const m = line.match(/^(Title|Artist|Tempo):\s*(.+)$/i);
    if (m) {
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === 'title') extracted.title = val;
      else if (key === 'artist') extracted.artist = val;
      else if (key === 'tempo') {
        const n = parseInt(val, 10);
        if (!isNaN(n)) extracted.tempo = n;
      }
      i++;
    } else if (line === '') {
      // Blank separator line between header and tab body — consume and stop
      i++;
      break;
    } else {
      // Non-matching non-blank line: header is done, leave this line in tabText
      break;
    }
  }

  return {tabText: lines.slice(i).join('\n'), extractedOptions: extracted};
}
```

- [ ] **Step 4: Update `importFromAsciiTab` to call `parseTabBlock`**

Replace the opening of `importFromAsciiTab` (lines 41–45 in the original file):

```typescript
// BEFORE:
export function importFromAsciiTab(
  text: string,
  options: AsciiImportOptions = {},
): ScoreInstance {
  const {title = 'Imported Tab', artist = '', tempo = 120} = options;
```

```typescript
// AFTER:
export function importFromAsciiTab(
  text: string,
  options: AsciiImportOptions = {},
): ScoreInstance {
  const {tabText, extractedOptions} = parseTabBlock(text);
  const merged: AsciiImportOptions = {...extractedOptions, ...options};
  const {title = 'Imported Tab', artist = '', tempo = 120} = merged;
  text = tabText;
```

- [ ] **Step 5: Run tests to verify metadata tests pass**

```bash
cd /Users/alfredoenrione/my-github/mine/chartmate && npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|metadata header)"
```

Expected: all 7 metadata header tests PASS, all previously passing tests still PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/alfredoenrione/my-github/mine/chartmate
git add src/lib/tab-editor/asciiTabImporter.ts src/lib/tab-editor/__tests__/asciiTabImporter.test.ts
git commit -m "feat: parse Title/Artist/Tempo metadata header in importFromAsciiTab"
```

---

## Task 2: Expand ASCII importer test suite

**Files:**
- Modify: `src/lib/tab-editor/__tests__/asciiTabImporter.test.ts`

- [ ] **Step 1: Add technique tests**

Append this describe block to `asciiTabImporter.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// Technique detection
// ---------------------------------------------------------------------------

describe('importFromAsciiTab – techniques', () => {
  function firstNote(score: ReturnType<typeof importFromAsciiTab>) {
    return score.tracks[0].staves[0].bars[0].voices[0].beats
      .find(b => b.notes.length > 0)!.notes[0];
  }

  it('h marks note as hammerPullOrigin', () => {
    const tab = `e|---5h7---|\nB|---------|\nG|---------|\nD|---------|\nA|---------|\nE|---------|`;
    const note = firstNote(importFromAsciiTab(tab));
    expect(note.fret).toBe(5);
    expect(note.isHammerPullOrigin).toBe(true);
  });

  it('p marks note as hammerPullOrigin', () => {
    const tab = `e|---7p5---|\nB|---------|\nG|---------|\nD|---------|\nA|---------|\nE|---------|`;
    const note = firstNote(importFromAsciiTab(tab));
    expect(note.fret).toBe(7);
    expect(note.isHammerPullOrigin).toBe(true);
  });

  it('/ sets slideOutType to Legato', () => {
    const tab = `e|---5/7---|\nB|---------|\nG|---------|\nD|---------|\nA|---------|\nE|---------|`;
    const note = firstNote(importFromAsciiTab(tab));
    expect(note.slideOutType).toBe(model.SlideOutType.Legato);
  });

  it('\\ sets slideOutType to Shift', () => {
    const tab = `e|---7\\5---|\nB|---------|\nG|---------|\nD|---------|\nA|---------|\nE|---------|`;
    const note = firstNote(importFromAsciiTab(tab));
    expect(note.slideOutType).toBe(model.SlideOutType.Shift);
  });

  it('~ sets vibrato to Slight', () => {
    const tab = `e|---5~----|\nB|---------|\nG|---------|\nD|---------|\nA|---------|\nE|---------|`;
    const note = firstNote(importFromAsciiTab(tab));
    expect(note.vibrato).toBe(model.VibratoType.Slight);
  });

  it('note with no technique has no effects set', () => {
    const tab = `e|---5-----|\nB|---------|\nG|---------|\nD|---------|\nA|---------|\nE|---------|`;
    const note = firstNote(importFromAsciiTab(tab));
    expect(note.isHammerPullOrigin).toBe(false);
    expect(note.slideOutType).toBe(model.SlideOutType.None);
    expect(note.vibrato).toBe(model.VibratoType.None);
  });
});
```

Also add the `model` import to the test file top — it's already imported in `asciiTabImporter.ts`; tests need it too. Add after the existing import line:

```typescript
import {model} from '@coderline/alphatab';
```

- [ ] **Step 2: Add time signature detection tests**

```typescript
// ---------------------------------------------------------------------------
// Time signature detection
// ---------------------------------------------------------------------------

describe('importFromAsciiTab – time signature detection', () => {
  function timeSig(score: ReturnType<typeof importFromAsciiTab>) {
    const mb = score.masterBars[0];
    return {num: mb.timeSignatureNumerator, denom: mb.timeSignatureDenominator};
  }

  it('4 beats per bar → 4/4', () => {
    // 4 distinct note columns in one bar
    const tab = `e|---0---2---4---5---|\nB|-------------------|\nG|-------------------|\nD|-------------------|\nA|-------------------|\nE|-------------------|`;
    expect(timeSig(importFromAsciiTab(tab))).toEqual({num: 4, denom: 4});
  });

  it('3 beats per bar → 3/4', () => {
    const tab = `e|---0---2---4---|\nB|---------------|\nG|---------------|\nD|---------------|\nA|---------------|\nE|---------------|`;
    expect(timeSig(importFromAsciiTab(tab))).toEqual({num: 3, denom: 4});
  });

  it('6 beats per bar → 6/8', () => {
    const tab = `e|---0---2---3---5---7---9---|\nB|---------------------------|\nG|---------------------------|\nD|---------------------------|\nA|---------------------------|\nE|---------------------------|`;
    expect(timeSig(importFromAsciiTab(tab))).toEqual({num: 6, denom: 8});
  });

  it('2 beats per bar → 2/4', () => {
    const tab = `e|---0---5---|\nB|-----------|\nG|-----------|\nD|-----------|\nA|-----------|\nE|-----------|`;
    expect(timeSig(importFromAsciiTab(tab))).toEqual({num: 2, denom: 4});
  });
});
```

- [ ] **Step 3: Add chord (multi-note beat) and 7-string tests**

```typescript
// ---------------------------------------------------------------------------
// Chords (multiple notes on same beat) and 7-string
// ---------------------------------------------------------------------------

describe('importFromAsciiTab – chords and string counts', () => {
  it('notes aligned in same column form a chord (multiple notes per beat)', () => {
    // A-shape barre at fret 2 — all strings played simultaneously
    const tab = [
      'e|---2---|',
      'B|---3---|',
      'G|---2---|',
      'D|---4---|',
      'A|---4---|',
      'E|---2---|',
    ].join('\n');
    const score = importFromAsciiTab(tab);
    const firstBeat = score.tracks[0].staves[0].bars[0].voices[0].beats
      .find(b => b.notes.length > 0)!;
    expect(firstBeat.notes.length).toBeGreaterThanOrEqual(4);
  });

  it('7-string snippet produces a 7-string track', () => {
    const tab = [
      'e|---0---|',
      'B|---0---|',
      'G|---0---|',
      'D|---0---|',
      'A|---0---|',
      'E|---0---|',
      'B|---0---|',
    ].join('\n');
    const score = importFromAsciiTab(tab);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(7);
  });
});
```

- [ ] **Step 4: Add markup stripping and whitespace edge case tests**

```typescript
// ---------------------------------------------------------------------------
// Markup stripping and whitespace edge cases
// ---------------------------------------------------------------------------

describe('importFromAsciiTab – markup and whitespace', () => {
  it('strips [tab][/tab] wrappers', () => {
    const tab = `[tab]\ne|---0---2---|\nB|---1---3---|\nG|---0---2---|\nD|---2---0---|\nA|---3-------|\nE|-----------|\n[/tab]`;
    expect(() => importFromAsciiTab(tab)).not.toThrow();
    expect(countNotes(importFromAsciiTab(tab))).toBeGreaterThan(0);
  });

  it('strips [ch] chord names', () => {
    const tab = `[ch]Am[/ch]\ne|---0---|\nB|---1---|\nG|---2---|\nD|---2---|\nA|---0---|\nE|-------|`;
    const score = importFromAsciiTab(tab);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(6);
  });

  it('trailing whitespace on tab lines does not break parsing', () => {
    const tab = `e|---0---2---|   \nB|---1---3---|   \nG|---0---2---|   \nD|---2---0---|   \nA|---3-------|   \nE|-----------|   `;
    expect(() => importFromAsciiTab(tab)).not.toThrow();
    expect(countNotes(importFromAsciiTab(tab))).toBeGreaterThan(0);
  });

  it('mixed-case string labels (e vs E) are both recognised', () => {
    const lowerTab = `e|---0---|\nb|---1---|\ng|---0---|\nd|---2---|\na|---3---|\ne|-------|`;
    const score = importFromAsciiTab(lowerTab);
    expect(score.tracks[0].staves[0].stringTuning.tunings).toHaveLength(6);
    expect(countNotes(score)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run the full test suite and confirm all pass**

```bash
cd /Users/alfredoenrione/my-github/mine/chartmate && npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: all tests PASS. If any fail, read the error and fix the tab fixture (most common cause: column alignment meaning notes cluster differently than expected — adjust spacing in the fixture string).

- [ ] **Step 6: Commit**

```bash
cd /Users/alfredoenrione/my-github/mine/chartmate
git add src/lib/tab-editor/__tests__/asciiTabImporter.test.ts
git commit -m "test: expand ASCII importer test suite — techniques, time sigs, chords, markup, whitespace"
```

---

## Task 3: Create `/chartmate-tab` Claude Skill

**Files:**
- Create: `~/.claude/skills/chartmate-tab/SKILL.md`

- [ ] **Step 1: Write the skill file**

Create `~/.claude/skills/chartmate-tab/SKILL.md` with this exact content:

```markdown
---
name: chartmate-tab
description: Fetch a guitar ASCII tab from the web for a given song and output a ready-to-import block for ChartMate
triggers:
  - /chartmate-tab
---

# ChartMate Tab Finder

You are helping the user find a guitar ASCII tab for ChartMate. When invoked, search the web for the best ASCII tab and output a formatted block the user can paste directly into the app's Import ASCII Tab dialog.

## Input

The user provides: `/chartmate-tab <song name>` or `/chartmate-tab <song> by <artist>`

Parse the song name and artist from the input.

## Search Strategy

Search tab sources in this order. Stop at the first source that returns usable ASCII tab content.

**Round 1 — Known tab sites (use WebSearch with site: operator):**
1. `site:ultimate-guitar.com "<song>" "<artist>" tab`
2. `site:songsterr.com "<song>" "<artist>"`
3. `site:classtab.org "<song>"`
4. `site:classicalguitarshed.com "<song>" tab`
5. `site:classclef.com "<song>" tab`
6. `site:theguitarlesson.com "<song>" tab`

**Round 2 — Fallback (if Round 1 finds nothing):**
- `WebSearch: "<song>" "<artist>" guitar tab ASCII`
- Pick the most credible result and WebFetch it.

Use `WebFetch` on the best URL found to retrieve the actual tab content.

## Content Extraction

After fetching the page:
1. Strip all HTML tags.
2. Remove `[tab]`, `[/tab]`, `[ch]`, `[/ch]` markers.
3. Remove `[Intro]`, `[Verse]`, `[Chorus]` and similar section labels.
4. Remove prose paragraphs — keep only lines that look like tab strings (lines with dashes and digits, optionally prefixed with a string name like `e|`, `B|`, etc.).
5. If multiple versions exist on the page, prefer the one with the most tab content.

## Tempo Estimation

- If the page lists a BPM, use it.
- If not, use your knowledge of the song to estimate a reasonable BPM.
- If truly unknown, omit the `Tempo:` line from the output.

## Output Format

Output ONLY the following block — nothing before or after it (no prose, no explanation):

```
Title: <song title, title case>
Artist: <artist name>
Tempo: <bpm as integer>

<ASCII tab content here>
```

After the block, on a new line, add one sentence:
> Paste the block above into ChartMate's **Import ASCII Tab** dialog.

## Failure Case

If no usable ASCII tab is found after both rounds:

> No ASCII tab found for "<song>" by "<artist>". Try `/chartmate-tab <alternate spelling>` or search manually on ultimate-guitar.com.

Do not output a partial or made-up tab.
```

- [ ] **Step 2: Verify the skill file exists and is readable**

```bash
cat ~/.claude/skills/chartmate-tab/SKILL.md | head -5
```

Expected: first 5 lines of the file printed without error.

- [ ] **Step 3: Test the skill manually**

In Claude Code, type:
```
/chartmate-tab Wish You Were Here by Pink Floyd
```

Verify:
- Output starts with `Title: Wish You Were Here`
- Output contains `Artist: Pink Floyd`
- Output contains ASCII tab lines (`e|`, `B|`, etc.)
- Output ends with the paste instruction sentence.

---

## Verification Checklist

- [ ] `npm test` passes with zero failures
- [ ] New metadata header tests all pass (7 tests)
- [ ] New technique tests all pass (6 tests)
- [ ] New time signature tests all pass (4 tests)
- [ ] New chord/7-string tests all pass (2 tests)
- [ ] New markup/whitespace tests all pass (4 tests)
- [ ] Previously passing tests still pass (regression check)
- [ ] `~/.claude/skills/chartmate-tab/SKILL.md` exists and is syntactically valid
- [ ] `/chartmate-tab <song>` invocation outputs correct format block
- [ ] Metadata block pasted into ChartMate import dialog populates title/artist/tempo correctly
