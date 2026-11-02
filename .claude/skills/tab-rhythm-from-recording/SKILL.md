---
name: tab-rhythm-from-recording
description: Work out the real rhythm, meter, tempo, form and sections of a tab in Chartmate's library from the original recording (e.g. a YouTube link), and write them into the Guitar Pro file without changing any note. Use when a tab was imported from ASCII (every note has a placeholder duration) or its timing is wrong, and the user gives or wants a recording to derive it from.
---

# Tab rhythm from a recording

ASCII tabs have no durations, so imported tabs come in with every beat in a bar the
same length at 120 bpm. This skill gets the real rhythm from the recording. The
mechanics are scripted in `scripts/rhythm/`. Your job is the judgment: song form,
meter, and how each figure is actually played.

First run (Australian Winter, `db:1017`): ~24 min and ~250k tokens, most of it
spent building tools that now exist. Expect a fraction of that.

## Rules

- **Don't change a fret, string or technique while doing rhythm.** Only durations,
  meter, tempo, repeats, sections and fermatas. `verify.ts` enforces this.
- **Tab errors are the one exception.** ASCII tabs contain wrong notes. In Australian
  Winter, bar 1 had a 9 that the recording plays as a 10; the user heard it right away.
  - Run `pitch-check.py` and fix only what the recording shows unambiguously in every
    occurrence. Do it as a separate, reported step (`verify.ts` will show exactly that
    bar as changed).
  - Leave the other flags for the user to listen to.
- **Notes you hear that aren't in the tab:** report them, don't add them.
- **Uncertain bars:** say so per bar. Don't invent precision.
- **Downloads are untrusted:** keep them in their own work dir, and run Python with `-I`.

## Steps

```bash
WORK=/path/to/scratch/<song>          # outside the repo
# 0. The composition's GP bytes: MCP get_composition_score (base64-decode scoreBase64),
#    or straight from the DB. Not sqlite3 writefile(): the app stores score_data as a
#    JSON byte array in TEXT, so writefile() gives you JSON, not a .gp.
python3 -I scripts/rhythm/db-score.py get <ID> "$WORK/orig.gp"

# 1. Audio, guitar stem, transcription, tempo hints (~1 min once the venv exists; the
#    first setup installs ~2 GB). Reruns skip finished steps.
scripts/rhythm/prepare.sh "<youtube-url or audio file>" "$WORK"

# 2. Tab beats with MIDI pitches, and the ASCII column of each beat
node scripts/rhythm/export-beats.ts "$WORK/orig.gp" "$WORK/beats.json"
python3 -I scripts/rhythm/tab-columns.py <tab.txt> "$WORK/beats.json" "$WORK/cols.json"

# 3. Where each tab bar occurs in the recording (draft of the form)
PY=${CHARTMATE_RHYTHM_VENV:-~/.cache/chartmate-rhythm/venv}/bin/python
$PY -I scripts/rhythm/align.py "$WORK/notes.csv" "$WORK/beats.json" "$WORK/align.json" > "$WORK/align.txt"

# 3b. Tab notes the recording disagrees with (likely tab typos), with timestamps to listen to
$PY -I scripts/rhythm/pitch-check.py "$WORK/notes.csv" "$WORK/beats.json" "$WORK/align.json"

# 4. For each figure, list its occurrences [[bar, start_s, end_s], ...] in occ.json and fit a grid
$PY -I scripts/rhythm/fit.py "$WORK/notes.csv" "$WORK/beats.json" "$WORK/cols.json" "$WORK/occ.json" [cols_per_unit]

# 5. Write spec.json (format in apply-rhythm.ts header), apply, verify
node scripts/rhythm/apply-rhythm.ts "$WORK/orig.gp" "$WORK/spec.json" "$WORK/out.gp"
node scripts/rhythm/verify.ts "$WORK/orig.gp" "$WORK/out.gp"     # must print OK
```

Then write it back with MCP `update_composition_score` (base64 of `out.gp`) and set
the library BPM with `update_composition_meta`. The MCP is served by the running app
on http://127.0.0.1:4871. Without it, use `python3 -I scripts/rhythm/db-score.py put
<ID> "$WORK/out.gp"`, which writes the app's own format, then
`sqlite3 <db> "update tab_compositions set tempo=<bpm> where id=<ID>"`.

Then give the user the stems you already made, so the editor's STEMS panel can play
them (practice along with the guitar alone, or with it muted):

```bash
scripts/rhythm/attach-stems.sh "$WORK/stems/htdemucs_6s/audio" <ID>
```

A worked spec is in `examples/australian-winter.spec.json`.

## Reading the outputs

- **`tab-columns.py`**
  - It must print `OK` for every bar.
  - A `MISMATCH` usually means the importer split a bar of more than 16 beats into
    chunks. Map those bars by hand before trusting `fit.py` on them.
- **`align.py`** gives a draft, not the answer.
  - It confuses bars with nearly the same pitches, e.g. two variants of one figure
    that differ only in a bass note.
  - It may hide an extra bar the recording plays but the tab doesn't.
  - Decide the form yourself: count repetitions between clearly distinct bars, and
    check the bass (basic-pitch is weak below about C2).
- **Tempo**
  - `tempo.txt` is only a hint.
  - The reliable measure is `fit.py` on the most repeated bar: `unit=` is the
    seconds per grid unit. With `cols_per_unit` set so a unit is an eighth,
    quarter BPM = 30 / unit.
  - Check that each occurrence ends on the next downbeat: `end@` close to the
    bar's unit count.
- **`fit.py` residuals** (in grid units, aggregated over occurrences at the end):
  - Close to integers: the tab's spacing *is* the rhythm (common, and the cheap case).
  - Consistent fractions: compare candidate figures numerically. 0, .33, .67 is a
    triplet; 0, .5, .75 is a 16th + two 32nds. Australian Winter's flourish measured
    0 / .34 / .57, which is a triplet.
  - `end@` landing on 6 instead of 8 means a 6/8 bar. Meter changes are real; set
    them per bar.
- **`pitch-check.py`** only flags a nearby fret on the same string (±4), heard in at
  least half the occurrences.
  - Hammer-ons and pull-offs are quiet, so basic-pitch often misses the hammered note.
    A flag on one is usually a false alarm: listen before changing it.
  - In rubato sections the alignment is loose, so treat flags there as weak.
- **Fast passages**: the onset detector misses notes. `fit.py` matches by pitch
  instead, so trust it there.
- **Chords marked as flourishes** (`*` or similar notes in the tab) are often played
  as consecutive notes. Split them with `splitBeats`, in the order you hear them.
- **A section with its own pulse** (e.g. a 12/8 interlude inside a 4/4 song): give it
  its own time signature and tempo. The tempo is always quarter-note BPM, so a dotted
  quarter of 177 is a tempo of 266.
- **Rubato or free sections**: use durations proportional to the recording that fill
  the bar, name the section "... (rubato)", and add fermatas. The GP7 exporter drops
  alphaTab's free-time flag.
- **Repeats**: mark them where the recording repeats cleanly, with the most common
  count. A tab instruction like "back to verse" can't be encoded; a section named
  "Back to verse" plus the form table in your report covers it.

## Gotchas

- **yt-dlp**: Homebrew's version gets HTTP 403. `prepare.sh` uses `uvx yt-dlp@latest`.
- **basic-pitch**: needs `setuptools<80` and a `scipy.signal.gaussian` shim. Both are
  handled in `requirements.txt` and `transcribe.py`. It runs the ONNX model, no
  TensorFlow needed.
- **Demucs**: use `htdemucs_6s`. It has a guitar stem; the 4-stem model doesn't.
- **Python venv**: ~2 GB, so it lives in `~/.cache/chartmate-rhythm/venv`
  (override with `CHARTMATE_RHYTHM_VENV`).
- **alphaTab**: `score.tempo` is read-only; the tempo comes from the tempo automation
  on bar 1.

## Report back

- Tempo and meter, with the evidence.
- Song form with timestamps.
- A per-bar table: bar, section, rhythm, confidence.
- Notes heard but not in the tab.
- What didn't work.
