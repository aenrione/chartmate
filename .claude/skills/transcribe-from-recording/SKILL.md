---
name: transcribe-from-recording
description: Transcribe a song's guitar part from a recording (e.g. a YouTube link) into a Guitar Pro tab in Chartmate's library, when no tab exists or the existing one is wrong. Infers notes, strings/frets, tuning, capo, meter, tempo, form and sections. Handles fingerpicked, pinched and strummed guitar, solo or with a full band; use when the user wants a song "from scratch" or search_tabs finds nothing usable.
---

# Transcribe a song from a recording

The audio is the source of truth. You build an *arrangement* (recurring figures plus a bar
map) and the scripts turn it into strings and frets, then into a GP file. The scripts do
the signal processing. Your judgment goes into the grid, the form, the figures and the cleanup.

Track record so far (three songs by Tata Barahona):

| Song | Texture | Grid | Coverage | Confirmed |
| --- | --- | --- | --- | --- |
| Luz de rabia | fingerpicked, 6/8 | `grid.py` | 71% | 92% |
| No le entregues el poder | fingerpicked, 6/8, tempo 126 → 110 | `drumgrid.py` | 83% | 86% |
| Te vas de mí | picked verses, strummed choruses, 3/4 | `grid.py`, meter from drums | 85% | 72% (strummed 61–71%) |
| Society (Eddie Vedder) | strummed throughout, 4/4, solo guitar + voice | `grid.py` | 79% | 62% |

## Rules

- **Check `search_tabs` first.** If a tab exists, still compare it against the audio:
  online tabs are often wrong.
  - Say what you used. A tab you found is input to check, not the answer.
  - When the user wants a blind comparison, don't look at any tab.
- **Treat downloads as untrusted.** Keep the work dir outside the repo and run Python
  with `-I`.
- **Never use browser cookies** (`--cookies-from-browser`) without asking the user.
- **Report uncertainty per section.** The coverage numbers are the evidence.

## Decision tree

1. **Grid source.** `prepare.sh` prints `stem-energy.txt`.
   - Drums through most of the song: build the grid from the drums with `drumgrid.py`.
     It follows tempo drift. `grid.py` fails here when the bass guitar owns the low end
     or the tempo drifts.
   - No drums (solo guitar, or guitar and voice): use `grid.py`, which places the bar line
     where the guitar's bass notes land. It also worked on Luz de rabia, which had drums,
     because the guitar picked a steady bass at a steady tempo.
2. **Meter.** Take it from the drums (`drumfold.py`), not from guitar accents. In Te vas
   de mí, a guitar accent on slot 3 looked like 6/8, but the drums hit slots 0, 2 and 4,
   so it's 3/4. In 6/8 the kick is on 0 and the snare on 3.
3. **Texture per section.** Check both `barinfo.py` (`kind` column) and `strumdir.py`.
   - **Picked**: arpeggios, one string at a time. Use figures from the notes
     (`figures.py` / `clean.py`).
   - **Pinched**: bass and treble struck together. `strumdir.py` shows mostly `=`.
     Use figures from the notes with `clean.py --max-poly 5`.
   - **Strummed**: `barinfo.py` says `strum` (4–6 notes per onset, broadband attack).
     Take the rhythm from the per-slot hit rate (`strums.py`), the direction from
     `strumphase.py`, and the voicing from a chord shape. Write strum tokens (see the
     arrangement section). The full recipe is under "Strummed sections" below.
4. **Instrumental bars.** Find them with `barinfo.py --vocals` (vocal dB per bar). They
   have the cleanest guitar, so build figures from them first.

## Steps

```bash
WORK=/path/to/scratch/<song>/work           # downloads, stems, intermediate JSON
PY=${CHARTMATE_RHYTHM_VENV:-~/.cache/chartmate-rhythm/venv}/bin/python
T=scripts/transcribe; ST=$WORK/stems/htdemucs_6s/audio

# 1. Audio, stems, transcriptions (guitar + voice + bass), tempo hints, stem energy (~2 min).
#    Exit 2 = age-gated / sign-in video: see "Age-gated videos" below.
scripts/rhythm/prepare.sh "<youtube-url|audio-file>" "$WORK"

# 2a. Grid with drums: --beat ~ the felt beat (6/8: the dotted quarter); bar 1 is the
#     kick-heavy beat (or force it with --first-bar T). A window flagged "kick peak moved"
#     means a slip: re-track from after it with --start/--first-bar, then join with gridsplice.py.
$PY -I $T/drumgrid.py $ST/drums.wav $WORK/grid.json --beat 0.78 --beats-per-bar 2 --slots-per-beat 3 [--no-trim]
$PY -I $T/drumfold.py $ST/drums.wav $WORK/grid.json --period 6      # meter and phase check
# 2b. Grid without drums: slot = the shortest strong period in tempo.txt; --per-bar 6 for 6/8.
$PY -I $T/grid.py $WORK/guitar.wav $WORK/notes.csv $WORK/grid.json --slot 0.29 --per-bar 6

# 3. Snap notes to the grid; sung notes get flagged as likely bleed. Offsets bunched near
#    +-0.5 or +-0.33 mean you need --sub 2 or 3 in grid.py.
$PY -I $T/quantize.py $WORK/notes.csv $WORK/grid.json $WORK/quant.json --vocals $WORK/vocal-notes.csv

# 4. Lead sheet and texture per bar, then the strum and pinch checks for the sections that need them.
$PY -I $T/barinfo.py $WORK/guitar.wav $WORK/notes.csv $WORK/grid.json $WORK/barinfo.json --vocals $ST/vocals.wav
$PY -I $T/strumdir.py $WORK/guitar.wav $WORK/grid.json --bars 33-48       # = means pinch
$PY -I $T/strums.py $WORK/guitar.wav $WORK/notes.csv $WORK/grid.json $WORK/strums.json --bars 33-48 --print
$PY -I $T/strumphase.py $WORK/guitar.wav $WORK/grid.json --bars 33-48 --block 16   # down/up

# 5. Figures. Label bars by chord and position (chordlabels.py, or by hand), then take
#    each label's consensus notes.
$PY -I $T/quantize.py $WORK/bass-notes.csv $WORK/grid.json $WORK/bquant.json
$PY -I $T/chordlabels.py $WORK/guitar.wav $WORK/grid.json $WORK/bquant.json $WORK/labels.json --chords "G=G,B,D;C=C,E,G;D=D,F#,A"
#    chordlabels.py names the chord; barchroma.py shows the numbers behind the name, so you
#    can split a label that is two voicings. --map takes the bar map you already believe.
$PY -I $T/barchroma.py $WORK/guitar.wav $WORK/grid.json --pcs G,B,D,F# --vocals $ST/vocals.wav --map GGDA...
$PY -I $T/figures.py $WORK/quant.json $WORK/figures.json --labels $WORK/labels.json
$PY -I $T/clean.py $WORK/quant.json $WORK/draft.json --figures $WORK/figures.json [--max-poly 5]

# 6. Write the arrangement from the draft (by hand, or as code like
#    examples/te-vas-de-mi.make_arr.py). Then rebuild after every edit:
#    fingering -> [annotate-score options] -> GP -> selfcheck
NODE=node PY=$PY $T/rebuild.sh arrangement.json $WORK out.gp [--section-tempo] [--brush "125:2=down"]

# 7. Which heard notes the weak bars lack. Fix the figure, then go back to 6.
$PY -I $T/misses.py $WORK/score.json $WORK/quant.json --bars 33-48 [--loose]
```

Then add it to the library:
1. MCP `create_composition` with the base64 of `out.gp`, plus `youtubeUrl` and
   `previewImage` (`https://i.ytimg.com/vi/<id>/hqdefault.jpg`).
2. `scripts/rhythm/attach-stems.sh "$WORK/stems/htdemucs_6s/audio" <id>`.

Each script's header documents its options and formats.

## Arrangement (`fingering.py` input)

- **Figures.** One pitch list per slot, e.g. `[["G2","D3"], [], ["B3"], ...]`. Empty
  slots extend the previous note. Notes ring.
- **Explicit bars.** `{"beats": [...], "fermata": true}`, for one-offs and rubato
  endings. A beat may carry `chord`, `brush` and `pickStroke`.
- **Strums.** Add `"shapes": {"G": "320033", "D/A": "x00232"}`, with frets listed from
  string 6 to string 1. Then a slot can be a strum token:
  - `"G:D"`: downstroke on every string of the shape.
  - `"G:U:1-3"`: upstroke on strings 1–3 only.

  - `"G:Dx"` / `"G:Ux:1-3"`: a **muted** stroke, written as dead notes (x) on every string
    of the stroke. A stroke the hand *skips* is an empty slot instead, not a token.
  - `"G:U!:1-5"` / `"G:D!!"`: an **accented** stroke, and a heavy one. Combines with `x`
    (`"G:Dx!"`). See "Accents" below for how to decide which slots get one.

  Strum notes are pinned to the shape and don't ring. The GP gets brush arrows plus a
  chord name and diagram wherever the chord changes. `build-gp.ts --pickstroke` also
  adds pick-direction marks.
- **Named picked chords.** Write the figure as `{"chords": {"0": "Bm7", "3": "A#m7"}, "slots": [...]}`.
- **Tempo drift.** `annotate-score.py --section-tempo` sets a tempo mark at each section,
  measured from the grid.

## What a strumming chart looks like

What the GP file carries, and what it can't:

| Thing | Where it lives | How |
| --- | --- | --- |
| The counted grid (1 & 2 & 3 & 4 &) | the notation itself | one beat per slot, so eighth-note slots print as a row of eighths |
| Down / up | brush arrow on the beat | `"stroke"` from a strum token; `--pickstroke` adds the ∨ / ∧ pick marks too |
| Which strings a stroke covers | the notes in the beat | `"G:U:1-5"` — the arrow then spans only those strings |
| Muted stroke | dead notes (x) | `"G:Dx"`, verified to round-trip through GP7 |
| Accented stroke | `accentuated` on every note of the beat | `"G:U!"` (normal) / `"G:U!!"` (heavy), round-trips through GP7 |
| Skipped stroke | a rest, or the previous beat lengthened | an empty slot in the figure |
| Where the chord changes | chord name + diagram above the staff | `"shapes"`; `fingering.py` prints the name only where it changes |
| Whether a section repeats | section marks | `"sections"` in the arrangement |

### Accents

Which strokes the hand hits harder is measurable, and since Society it is also writable.

- **Measure it two ways and only trust the agreement.** Per slot, over every bar of the
  section: the onset-flux attack strength (`strums.json`'s `strength`) **divided by that
  bar's own median**, so a loud bar doesn't look like an accent; and the post-onset RMS gain
  (dB from the 50 ms after the onset against the 50 ms before). Society's off-beats came out
  at 1.25–1.46 relative and 3.0–4.1 dB against 0.49–0.92 and 0.0–3.1 for the on-beats.
- **Quantise honestly.** GP7 has three levels: none, normal (`>`), heavy (`^`). A continuous
  contrast has to be squeezed into them, so pick the cut by *consistency*, not by the mean:
  accent the slots that are above their bar's median in most bars, and reserve heavy for the
  one slot that is highest on every measure you have. Society: `!` on three off-beats (64%,
  62% and 84% of bars above median), `!!` on the 84% one, nothing on the fourth off-beat,
  which measured no louder than the on-beats. 228 of 608 strokes, 37%.
- **Say the cut in the report.** "Accented the three slots that measured ≥1.25× their bar's
  median" is checkable; "the upstrokes are stronger" is not.
- AlphaTab draws the accent glyph only on the standard-notation staff, never on the tab
  staff. For a tab reader the accent shows up in the app's strumming-pattern panel, as a
  `>` over the count row.

One thing the format still will not do, so say it in the report instead:

- **One pattern printed once, above a block.** GP repeats the strokes in every bar. A chart
  that said "this pattern, for 16 bars" would be easier to learn from, but it would have to
  be an app feature, not a GP feature.

## Judgment calls

- **Tuning and capo**
  - Lowest sustained note: E2 means standard or dropped tuning; anything lower means
    the guitar is tuned down.
  - Key: the pitch-class weights. Look for shapes that make the figure easy; open
    strings in the pattern are a strong hint.
  - Capo evidence:
    - An E2 in the guitar stem while the bass stem plays something else means the open
      low E is sounding, so there is no capo.
    - Video frames (`ffmpeg -ss <t> -i video -frames:v 1 f.png`) can rule out a capo,
      but album-cover and posed videos tell you nothing.
- **Labels**
  - Label bars by chord and position in the progression: `G1` and `G2` for a two-bar G,
    and `Gs` for a single bar.
  - Split a label when the bars under it lead into different bars and play differently.
    No le entregues el poder split `Cs` into `Cp`, `Ct` and `Cw`.
  - Plain pitch clustering merges different chords in dense sections.
  - A note kept in at least half of a figure's occurrences is real. Ghosts appear in only a few.
  - **One chord letter can hide two voicings.** A bar map of letters is not a transcription:
    the same letter can be two shapes the player alternates, and nothing in a chord detector
    will tell you, because both shapes answer to the same name. The tell is in `misses.py`:
    the *same* pitch missed in a *systematic subset* of one label's bars. Society missed D3
    in every G bar that came just before a D bar — those bars are a plain G (`355433`, which
    has D), the rest are Gmaj7 (`324002`, which doesn't). One shape for both cost 3 points of
    coverage and 6 of confirmed.
  - `barchroma.py` is the check: per bar, the energy of the pitch classes that separate the
    candidates, with a vocal-dB column. Read the column, not the label. The split is real
    when it repeats at the same position in every occurrence of a section (Society's 6-bar
    G run read `G Gmaj7 G Gmaj7 Gmaj7 G` in all three verses) and when the odd bars are *not*
    the loud-vocal ones.
- **Ghosts**
  - basic-pitch often adds the octave or 12th above a real note. `clean.py` removes most
    of them.
  - `clean.py --max-poly 3` (the default) is for arpeggios. On pinched chords it dropped
    real top notes (F#4 and G4 in No le entregues el poder). Use 5–6 there.
  - Voice bleed: drop guitar notes that match what the voice sings, unless the vocal
    stem is near silent there.
- **Low notes**: a low note could be the bass guitar bleeding in. Keep it only if it's in
  the guitar stem where the bass stem has nothing.
- **Strummed sections**. Five questions, in this order; each has its own evidence.
  1. **Which slots are struck.** The slots hit in most repeats (`strums.py`, read as hit or
     no hit). Also read the *strength* row: a slot struck in 84% of bars at 60% of the
     others' strength is a ghost stroke, not a full one, and belongs in the chart as the
     light stroke it is. Check whether it is also *damped* before calling it muted — compare
     the RMS ~15 ms and ~160 ms after the onset. In Society beat 2 did not decay at all, so
     it is written as a light stroke, not a dead-note chuck.
  2. **Which strings each stroke covers.** Not taste — count. Per slot, over all bars of
     that chord, take the share of clearly-heard notes on the bottom strings (`quant.json`,
     midi <= 50). In Society beats 1 and 3 came out at .48 and .44, beat 2 at .28: the
     beat-2 downstroke only brushes the top three strings. Then sweep the string range in
     the arrangement and rebuild — the right answer raises coverage *without* raising the
     unmatched share. Stop when more strings only buy coverage: six strings everywhere
     always "wins" on coverage and destroys the thing you are trying to teach.
  3. **The voicing.** A common shape, swept the same way. The `+oct` column is the tell: a
     high `+oct` means the shape has the right pitch classes in the wrong octave. Society's
     G sat at 58% coverage / 31% `+oct` as a plain `320002`, and at 66% / 18% as `324002` —
     the F#3 that `misses.py` reported 45 times was a real note, not a basic-pitch ghost.
  4. **Down or up.** Run `strumphase.py`. See "Strum direction" below.
  5. **Which strokes are accented.** See "Accents" above. Do it last: it needs the slots
     and the directions already settled.
  - Expect 55–70% "confirmed" against 85–92% for picked parts. Confirmed is capped by
    basic-pitch, which will not transcribe six simultaneous strings; coverage is the number
    to push on.
- **One-offs**: smooth a one-off variant to the standard figure and list the bars you
  smoothed. Write a figure that occurs only once as an explicit bar, and say it rests on
  a single occurrence.
- **Rubato endings**: write them as explicit bars with fermatas, outside the grid.
  `selfcheck.py` skips them.
- **Reading `selfcheck.py`**
  - "Confirmed" for a bar built from that same bar's audio proves little.
  - Coverage on sections built from repetition is the real measure.
  - A loud voice lowers coverage. Changing figures to chase it can make it worse, so
    compare before and after.

## Cover videos with on-screen chords

A cover video that prints its chords and strumming pattern on screen is a second guitarist's
reading of the same record, and it is worth having — especially for **capo and voicings**,
which are the two things audio alone pins down worst. It is evidence to check against, never
the answer to copy.

```bash
uvx yt-dlp@latest -f "bv*[height<=720]+ba/b[height<=720]" -o cover.%\(ext\)s "<url>"
ffmpeg -nostdin -ss 40 -i cover.webm -frames:v 1 -vf scale=960:-1 f.png   # then Read f.png
```

- One frame usually carries the whole thing: the capo banner, a chord diagram, a section
  banner, the bar grid and the strumming pattern. Sample a frame every ~10 s, crop the chart
  strip (`-vf crop=W:H:X:Y`) and tile them (`-filter_complex tile=1xN`) to read the form in
  one image. `scripts/rhythm/video-cursor.py` reads the other layout, a Guitar-Pro-style tab
  strip with an orange cursor.
- **Transpose before comparing.** "Capo on 2nd" means the printed shapes are not the sounding
  chords. Society's cover printed C G F Am; sounding, that is D A G Bm — the record's key.
- Then test every claim against the record, by the pitch class that separates the candidates
  (`barchroma.py`). Society's cover claimed capo 2 and both of its implied voicings failed:
  the record's G has F# and no D (so it is the open `324002`, not a capo-2 F barre), and the
  record's A has E ≫ C# (so it is the open `x02220`, not a capo-2 G shape). Two independent
  voicing tests rejected the capo; the record won.
- **The trap: covers simplify, and covers substitute.** Expect them to be wrong in two
  specific ways.
  - *Fewer strokes.* Society's cover printed six strokes a bar where `strums.py` measures
    eight, and the two it dropped are the two **strongest** slots on the record.
  - *Relative substitutes.* Its Bm where the record plays Gmaj7 — the two share B and F#,
    so it sounds fine over the track and is easier to play. Chroma separates them on the
    one class they don't share (G vs D), and the cover's own audio reads Bm, so it really
    is playing a different chord, not being misheard.
- A disagreement is still useful: it is a question you would not have asked. The cover's
  fourth chord is what sent me back to the G bars, where there really was a second voicing —
  just not the one the cover named.

## Age-gated videos

When `prepare.sh` exits with code 2, YouTube wants a signed-in session. Don't use cookies.
1. Find the artist's own upload of the same recording: the official channel, or the
   "Artist - Topic" upload.
2. Run `prepare.sh` on that.
3. Check it's the same recording, not a live take or another edit: compare the durations
   and run `xcorr.py a.wav b.wav` between candidates. Two uploads of the poder recording
   scored 0.96; if unsure, score a known-different take for contrast.
4. If nothing matches, ask the user for a file.

## Strum direction

Partly solved, as of Society. Split it in two; only the second half is still soft.

- **Does the hand alternate?** Solved, and measured without the grid: `strumphase.py`
  correlates the attack-strength sequence of consecutive onsets with itself at lag 1 and 2.
  Alternating strumming gives r1 < 0 and r2 > 0 (Society: −0.35 / +0.37). It is specific,
  not just sensitive — a fingerpicked section reads r1 ≈ 0 (Te vas de mí's verses: +0.00),
  and a strum pattern with *skipped* slots reads r1 < 0 but r2 < 0 too, because skipping a
  slot breaks the alternation between consecutive onsets.
- **Which branch is down?** A lean, not a certainty. The one cue that survived two songs is
  the number of resolvable sub-peaks in the onset-flux attack: a downstroke sweeps 5–6
  strings and breaks into more of them than a 3–4 string upstroke. Predicted from the
  mechanics first, then measured: AUC .85 on Society and .57 on the Te vas de mí choruses,
  both pointing at on-beat = down. Per stroke it is useless; per block of 8–16 bars (~60
  strokes a side) it called the same way in 5/5 and 7/8 blocks.
- **What does not work.** The band-lag column in `strums.py` and `strumdir.py` is at chance
  (203/402 slots on Society). Spectral tilt tracks the *accent*, not the direction. Envelope
  rise time looked good on Society (AUC .61) and **flipped sign** on Te vas de mí (.37), so
  it is printed as a diagnostic and does not vote. Treat any single-song result here as
  unproven until it survives a second recording.
- **How to report it.** If the alternation test fires and the blocks agree, say direction
  was measured and give the AUC. If either fails, keep the pendulum (on-beat down, off-beat
  up) and label it an assumption — that is still the right default, it just is not evidence.

## Known gaps (improve these next)

1. **Per-stroke direction.** Only sections get an answer, never individual strokes, and a
   section where the player breaks the alternation (skipping a stroke without the hand
   skipping with it) is invisible to all of this.
2. **Tempo maps for rubato.** Both grids assume a steady pulse, apart from the slow
   drift `drumgrid.py` follows. Rubato intros and endings are explicit bars, and tempo
   is only set per section.
3. **`figures.py`**: group by chord first and picking pattern second. `chordlabels.py`
   does the chord part, but only from a candidate list you provide.
4. **`clean.py`**: write `arrangement.json` directly, so hand edits are diffs.
5. **Synthesis check**: render the score and compare it with the guitar stem, to catch
   octave and voicing errors that pitch matching misses.

## Examples (`examples/`)

- `luz-de-rabia.*`: fingerpicked 6/8, grid from the guitar, position labels for choruses.
- `no-le-entregues-el-poder.*`: fingerpicked and pinched 6/8 with a full band, grid from
  the drums. Rebuild with `--section-tempo --brush "125:2=down"`.
- `te-vas-de-mi.*`: 3/4 with picked verses and strummed choruses, using shapes, strum
  tokens and chord names. `make_arr.py` writes the arrangement as code.
- `society.*`: 4/4, solo guitar and voice, strummed end to end. Four shapes, one bar-long
  figure per chord, and a bar map of chord letters — the whole arrangement is 30 lines of
  Python. The example to copy for a song that is only strumming. Note the two G's: upper-case
  `G` is Gmaj7 `324002`, lower-case `g` is the barre G `355433`, and telling them apart is
  what took it from 76%/56% to 79%/62%.

## Report back

- Grid source, tempo (or drift) and meter, with the drum evidence.
- Tuning and capo, with evidence.
- The form with timestamps, and the texture of each section.
- Coverage and confidence per section.
- Bars you smoothed, or that rest on a single occurrence.
- For a strummed part: the pattern per section, which slots you accented and on what
  measurement, and how you quantised it into GP7's three levels.
- Notes you doubted, and whether strum direction was measured (`strumphase.py`'s AUC and
  block agreement) or assumed (the pendulum).
- How it compares with any existing tab.
