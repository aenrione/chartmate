# README media — what to capture and how

The README currently carries three images:

| File | Kind | Status |
|---|---|---|
| `docs/demo.jpeg` | hero screenshot | real, but pre-dates most of the app |
| `docs/media/feature-map.svg` | hand-authored diagram | current |
| `docs/media/architecture.svg` | hand-authored diagram | current |

The diagrams are plain SVG and edited by hand. They use the app's own tokens —
`#6c5ce7` primary, `#00cec9` secondary, `#ab5e00` tertiary, on a `#16151c` card —
so they read on both GitHub light and dark themes. Preview a change with:

```bash
qlmanage -t -s 1200 -o /tmp docs/media/architecture.svg && open /tmp/architecture.svg.png
```

## Still missing: real screenshots

Screenshots have to come from the native app. `pnpm dev` in a plain browser
throws on the first `invoke()` call (no Tauri runtime, no SQLite), so Playwright
cannot drive the UI — the only way is to run `pnpm tauri dev` or the bundled
`.app` and capture the window.

```bash
# capture a specific window interactively (click the window, Esc cancels)
screencapture -iWo -t png docs/media/<name>.png
```

Shoot at a uniform window size, light theme, and **scrub personal data** —
Spotify account name, real library contents, file paths — before committing.

### Shot list

| File | Route | What should be on screen |
|---|---|---|
| `hero.png` | `/playbook/:id` or `/guitar/song` | Replaces `demo.jpeg`. Notation + tab with the cursor mid-bar, sections sidebar, a section looped (amber), speed at something ≠ 100 % |
| `tab-editor.png` | `/tab-editor/:id` | Edit mode, note-input panel open, a strumming pattern visible, sidebar sections expanded |
| `learn.png` | `/learn` | Skill tree with a mix of locked/unlocked units, XP bar, daily missions |
| `fretboard-iq.png` | `/guitar/fretboard` | The hub with the daily-review count, plus a drill mid-question |
| `browse.png` | `/browse` | Tab search results spanning several sources in one list |
| `calendar.png` | `/calendar` | A month with real practice sessions logged |
| `mobile.png` | Android or iOS | Portrait, bottom nav visible — proves the mobile layout is real |

### Wiring them in

Each goes under its matching `###` section in the README, as a plain
`<img ... width="900" />`. Two-up rows read well for the smaller ones:

```html
<p align="center">
  <img src="./docs/media/learn.png" width="440" />
  <img src="./docs/media/fretboard-iq.png" width="440" />
</p>
```

A short GIF of section-looping or the Clone Hero highway in motion would carry
more than any still — keep it under ~5 MB and under ~10 s, since GitHub will not
lazy-load it.
