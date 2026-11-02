---
name: batch-rhythm-from-videos
description: Recover the real rhythm of many placeholder-rhythm tabs (ASCII imports where every note is the same value at 120) from recordings of them, in one batch, and review only what the tool flags. Use when the user has a list of library tabs with linked recordings (e.g. "Simple Guitar Tabs" videos) and wants their rhythm without running a full agent per song. For one song done by hand, use tab-rhythm-from-recording instead.
---

# Batch rhythm from recordings

`scripts/rhythm/auto-rhythm.py` does one song end to end: recording + placeholder GP →
rebar spec → `out.gp` → report with a verdict. `batch-rhythm.py` runs it over a candidate
list. No agent tokens per song: the cost is CPU time.

The core path uses only the audio, so it works for any recording of the tab's own
arrangement. If the video shows a Guitar Pro tab with a moving orange cursor, as "Simple Guitar
Tabs" videos do, `--video-check` reads it with `video-cursor.py`. The cursor is used only
to break ties (meter and tempo octave) and to validate the result, never to build it.

## Rules

- **Writing to the library:**
  - The scripts never write the library.
  - Write a result back only after review and when the user says so: MCP
    `update_composition_score` with the base64 of the chosen `.gp`, then
    `update_composition_meta` for the BPM.
- **Notes:** never change a fret or string.
  - `verify.ts --flat` checks that every beat keeps its notes.
  - `pitch-check` lines in the report are tab errors to listen to. Report them; don't fix them.
- **Downloads are untrusted.** Keep them in `<root>/work/<id>/` and run Python with `-I`.

## Run

```bash
PY=$CHARTMATE_RHYTHM_VENV/bin/python          # the rhythm venv (basic-pitch, demucs, librosa)
# whole list, 6 at a time; outputs under $ROOT/{work,out}/<id>/, summary in $ROOT/summary.md
$PY -I scripts/rhythm/batch-rhythm.py candidates.json gp-dir/ $ROOT --jobs 6 --video-check [--skip 8,10] [--ids 874,909]
# one song (GP from the library, or from an ASCII file via ascii-to-gp.ts)
node scripts/rhythm/ascii-to-gp.ts tab.txt orig.gp
$PY -I scripts/rhythm/auto-rhythm.py --gp orig.gp --url <youtube|file> --work W --out O [--video-check] [--demucs auto|always|never]
```

- **Inputs:**
  - `candidates.json` is `[{id, title, yt}]`.
  - The GP for id N is `gp-dir/N.gp`; export it with `db-score.py get`.
- **Reruns** reuse the download, `notes.csv`, `beats.json` and `video.json`. Delete
  `out/<id>/report.json`, or pass `--force`, to redo a song.
- **Demucs** is off unless under 75% of the tab aligns (`--demucs auto`).
  - On solo guitar it changed nothing and cost ~35 s.
  - On a studio track with voice it raised coverage only from 88% to 89%.
- **Time per song (pilot, M-series Mac):**
  - Download ~3 s, basic-pitch ~13 s, analysis ~5–25 s CPU, cursor read ~10–15 s.
  - Batch at `--jobs 6` with `--video-check`: 120 songs in 20 min on a 10-core Mac
    (~53 s CPU per song).

## Outputs per song (`out/<id>/`)

| file | what |
| --- | --- |
| `out.gp` | the tab with the recovered rhythm (bar lines rebuilt, ties across them) |
| `alt1-…gp`, `alt2-…gp`, `alt3-…gp` | the best other meter, and the same reading at half and double tempo |
| `spec.json`, `alt*.spec.json` | apply-rhythm specs (`"rebar"` format, see apply-rhythm.ts) |
| `report.md` / `report.json` | verdict, metrics, candidates, flagged bars, pitch-check |
| `audio-only/` | the audio's own first choice, when the cursor tie-break replaced it |
| `timeline.json` | per tab note: output bar, tick, duration, heard time |

`node scripts/rhythm/beat-grid.ts <score.gp> <out.json>` dumps any reading's beats (index in the
flat note sequence, tick, duration, bar, bpm, seconds). Beat *j* is the same tab beat in every
reading of the same notes, so it is how you score candidates against each other, or against a
cursor, without re-running the analysis.

## Verdicts

- **auto-ok**
  - Coverage ≥95%, residual p90 ≤12%, steady tempo, no held notes that fit no value,
    nothing unheard, no repeats, few triplets, no suspect notes.
  - The meter and tempo octave are confirmed independently: by real ASCII bar lines, or by
    the on-screen bars.
  - With the cursor, at least 85% of durations and downbeats agree with it.
- **review:** anything else. The reason lists what to look at.
- **fail:**
  - Under 50% of the tab heard (another arrangement, or a full band without Demucs).
  - Or apply/verify failed. Multi-voice and multi-track files are not supported by `rebar`.

**Why so strict:** in the full 120-song run (2026-10-26) the audio alone picked the
on-screen bar length for only 38 of 115 songs.
- 47 had half the bar (twice the tempo: the authors write 16ths at 60–80).
- 27 had the wrong meter (bar ×2/3 or ×4/3).

Its cost margin did not separate the right ones from the wrong ones, so the meter is never
trusted on audio alone. A wrong auto-ok is worse than a review.

Once the bar length is right, about 76% of note durations match the cursor (median), and the
median downbeat match is 59%: bar lines are often a beat early or late.

## Choosing between candidates

With a cursor, rank them, don't eyeball them. In order:

1. **Bar length.** Keep only candidates whose bar is within ~8% of `video_check.cursor_bar_s`.
   This is the one thing the cursor measures exactly, and it kills the tempo-octave error.
   Beware `downbeat_agreement`: a reading with half the right bar scores *higher* on it (every
   cursor downbeat still lands on a bar line), so it only means something once the bar is right.
2. **`duration_agreement`** among those. 0.65–0.86 is what a good reading looks like here.
3. **Overall pace.** Regress the reading's own clock (`beat-grid.ts` `sec`) on the cursor's over
   the matched beats. Slope 1.0 means the score lasts as long as the recording; these readings
   still come out 4–47% long, worst where `capped` is high.

## Reviewing a flagged song (3–5 min)

1. Read the verdict line in `report.md`.
2. If it says "meter/tempo unconfirmed":
   - Open `out.gp` and the `alt*.gp` files in the app and play them against the recording.
   - Pick the one whose bar lines fall where the music's strong beats are.
   - The commonest mistake is the tempo octave: 8ths at 160 where the author wrote 16ths
     at 80. The half-tempo alternate fixes that.
3. Check the flagged bars in the chosen file:
   - "held … no note value fits": a fermata or rubato. Set the value by ear.
   - "recording jumps": a repeat the tab writes once (or the reverse).
   - "rolled chord or grace note": two tab beats sounding together.
   - "triplet": triplets are rare and often a swung pair.
   - "not heard": the duration is guessed.
4. A "flourish" chord can't be fixed in a batch output: the tab writes notes as one chord
   that the player plays one after another. Redo those songs with tab-rhythm-from-recording,
   whose `splitBeats` separates them.
5. Write back only what the user approves.

## Changes (2026-10-26, review of 872/888/889/901/902/920/924/931/950/953)

- **The cursor's bar length is now searched directly.** Each meter was only tried in three coarse
  tempo octaves (bars of 0.9–1.8, 1.6–3.2, 2.8–5.6 s), so the tie-break could only pick among
  whatever those happened to land on. With `--video-check` a narrow band around the on-screen bar
  is added, letting every meter compete at the right bar length. Enemy (953) went from 14% to 77%
  duration agreement; the other nine were unchanged, and 4/4 at the cursor's bar was now fairly
  tested, and lost, on 889/920/931 — which is the evidence for their 3/4.
- **`AR_CAP_SLOPE` (default 0.25).** The observation cost was clipped flat past 9, so for a note
  the alignment got wrong (a rolled chord, a fermata, a missed onset) every duration was equally
  bad and the duration prior wrote an 8th for a 0.07 s gap. It is now a Huber: past the cap the
  cost still grows, slowly. Scores shortened toward the recording — pace 1.59→1.47 (Last of Us),
  1.42→1.34 (Spirited Away), 1.42→1.37 (Requiem) — with duration agreement flat or slightly up.
  `AR_CAP_SLOPE=0` restores the old behaviour; 0.6 helps the pace more but cost 872 its meter.
- **apply-rhythm sets a tempo on bar 1** when the first tempo section starts later, instead of
  leaving the pickup bar at the imported file's 120.
- **Not adopted: a slower bar-length prior.** Re-scoring the 104 pilot songs that have a cursor
  bar suggested `AR_BAR_C=3.6 AR_BAR_W=1.5` would lift the audio-only bar match from 35% to 62%.
  A real re-run moved it 1/9 → 2/9: with a heavier prior the Viterbi just finds a different fast
  reading. The knobs are still there; the defaults are unchanged.

## Changes (2026-10-26, review of 956/968/975/977/984/987/991/995/1004)

- **The plausible written tempo is now a band on the quarter**, `AR_TP_LO`/`AR_TP_HI`, and the
  top of it dropped from 170 to **90** bpm. Outside the band the tempo costs 3 per octave per
  note, as before. Re-measured on the 115 batch songs that have a readable cursor, audio only,
  no cursor and no tie-break:

  | | bar length right | doubled bar | median duration agreement |
  | --- | --- | --- | --- |
  | `AR_TP_HI=170` (before) | 34/115 | 47 | 0.18 |
  | `AR_TP_HI=90` (now) | 66/115 | 9 | 0.71 |

  33 of the 34 already-right songs stayed right (886 moved 4/4@71 → 3/4@69). Downbeat agreement
  is unchanged on the songs whose bar length is right (median 0.58 both ways); the all-songs
  median *falls* from 0.59 to 0.48 only because a half-length bar matches downbeats for free.
  What is left is mostly the wrong meter, not the wrong octave. Raise `AR_TP_HI` for genuinely
  fast material: the band is on the quarter, not on the pulse. Seen in this review: 956
  Concerning Hobbits went 4/4@159 → 4/4@80, which is how the piece is written; but 987 Star
  Wars, a march at ♩≈108–120 with no cursor to check, went 4/4@121 → 4/4@80 and was written
  back at 121 by hand. When a song is really fast, the band has to be told.
- **`video_check` now also reports `duration_agreement_free` and `cursor_bpm`**: the same
  comparison with the bar length divided out (each cursor interval over the written value in
  quarters, against their median). Low `duration_agreement` with high `duration_agreement_free`
  means the note values are right and only the bar length is in doubt — and often it is
  `cursor_bar_s` that is wrong, not the reading. 984 Mulan was exactly that: 6% of durations
  agreed, 74% once the bar was divided out, at the 83 bpm the audio had already chosen, and its
  cursor gap histogram was scattered (3.0 s ×4, 5.0 ×3, 4.8 ×3, 1.2 ×3) rather than peaked.
  Check the histogram before believing a bar-length mismatch — and note that searching a band
  around a misread `cursor_bar_s` makes things worse, not better: with the band search 984 came
  out as 3/4 at ♩=39, matching the bogus 4.88 s bar.

## Known gaps

- **Meter** on melody-only audio (see Verdicts). The tempo band took the octave error down to
  9 songs in 115; what is left is mostly a bar ×2/3 or ×4/3. A beat tracker on the full mix, or
  drums when present, would help. Nothing cheap worked for the meter: a metric-level test
  (do downbeats carry more accent than chance?) and a note-density prior were both tried on
  the review set and neither separated the right level from its double.
- **Scores run long.** Even with the right bar length and 70–86% duration agreement, the
  readings last 4–47% longer than the recording, worst where many notes are `capped`. The Huber
  cut this by a few points; the rest is still open, and it is the next thing to fix.
- **Flourishes:** chords played as consecutive notes. Automatic `splitBeats` is not done yet.
- **Meter:**
  - One meter per song; mixed meters (Australian Winter: 4/4, 6/8, 12/8, 9/8) get flagged,
    not solved.
  - Tempo changes become tempo sections.
- **Rests** aren't written: a note sounds until the next one.
- **Cursor coverage:** `video-cursor.py` reads the 480p "Simple Guitar Tabs" layout (tab
  band, orange highlight). A video without it simply gets no cursor check.
