// Apply a rhythm spec (durations, meter, tempo, repeats, sections, fermatas) to a Guitar Pro
// file without touching any fret or string.
// usage: node scripts/rhythm/apply-rhythm.ts <in.gp> <spec.json> <out.gp>
//
// spec.json (bars are 1-based; every key except "durations" is optional):
// {
//   "splitBeats": [{"bar": 6, "beat": 2, "lines": [2]}],
//       // move the notes on these tab lines (1 = highest string) out of beat `beat` (0-based)
//       // into a new beat right before it — for "flourish" chords that are really played
//       // as consecutive notes. Applied first, so durations count the new beats.
//   "durations": {"1": ["8", "16", "16", "8."], ...},
//       // one token per beat: 1|2|4|8|16|32|64, then "." or ".." for dots, then "t" for a
//       // triplet (3:2). Bars left out keep their current durations.
//   "timeSignature": {"default": [4, 4], "7": [6, 8]},
//   "tempo": {"1": 80, "18": 266},        // quarter-note BPM, set at the start of the bar
//   "repeats": [[1, 2, 2], [6, 6, 4]],    // [startBar, endBar, playCount]
//   "sections": [[1, "Intro"], [6, "Verse"]],
//   "fermatas": [8, 11]                   // fermata on the last beat of these bars
// }
//
// "rebar" (instead of "durations"/"splitBeats") rebuilds the bar structure, for imports whose bar
// lines are arbitrary (the ASCII importer cut bars at 16 columns). It lists every new bar and its
// beats; `src` is the 0-based index of an original beat, counting every beat of track 1 voice 1
// across all bars (the order export-beats.ts writes). Every original beat with notes must appear
// exactly once without "tie"; original rests may be dropped. Bar numbers in timeSignature,
// tempo, repeats, sections and fermatas then refer to the new bars.
//   "rebar": {"bars": [{"ts": [3, 4], "beats": [
//       {"src": 12, "d": "2"},                 // original beat 12, now a half note
//       {"src": 12, "d": "8", "tie": true},    // its tied continuation (same notes, tied)
//       {"rest": true, "d": "8"}]}, ...]}      // a new rest
// Only single-track files with one voice are supported.
import {readFileSync, writeFileSync} from 'node:fs';
import {exporter, importer, model, Settings} from '@coderline/alphatab';

type RebarBeat = {src?: number; d: string; tie?: boolean; rest?: boolean};
type Spec = {
  splitBeats?: {bar: number; beat: number; lines: number[]}[];
  durations?: Record<string, string[]>;
  rebar?: {bars: {ts: [number, number]; beats: RebarBeat[]}[]};
  timeSignature?: Record<string, [number, number]>;
  tempo?: Record<string, number>;
  repeats?: [number, number, number][];
  sections?: [number, string][];
  fermatas?: number[];
};

const [inp, specPath, out] = process.argv.slice(2);
const spec: Spec = JSON.parse(readFileSync(specPath, 'utf8'));
const settings = new Settings();
const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(inp)), settings);
const staff = score.tracks[0].staves[0];
const strings = staff.stringTuning.tunings.length;
const lineOf = (n: InstanceType<typeof model.Note>) => strings + 1 - n.string;

const setDuration = (b: InstanceType<typeof model.Beat>, token: string, where: string) => {
  const m = token.match(/^(1|2|4|8|16|32|64)(\.{0,2})(t?)$/);
  if (!m) throw new Error(`bad duration token "${token}" in ${where}`);
  b.duration = Number(m[1]);
  b.dots = m[2].length;
  b.tupletNumerator = m[3] ? 3 : -1;
  b.tupletDenominator = m[3] ? 2 : -1;
};

if (spec.rebar) {
  if (spec.durations || spec.splitBeats) throw new Error('rebar replaces durations and splitBeats; give one or the other');
  if (score.tracks.length !== 1 || score.tracks[0].staves.length !== 1) throw new Error('rebar: only single-track, single-staff files');
  if (staff.bars.some(b => b.voices.slice(1).some(v => v.beats.some(be => !be.isEmpty && be.notes.length)))) {
    throw new Error('rebar: the file uses more than one voice');
  }
  const orig = staff.bars.flatMap(b => b.voices[0].beats);
  const template = staff.bars[0];
  const {keySignature, keySignatureType, clef, clefOttava} = template;
  const seen = new Set<number>();
  score.masterBars = [];
  staff.bars = [];
  spec.rebar.bars.forEach(({ts, beats}, i) => {
    const mb = new model.MasterBar();
    [mb.timeSignatureNumerator, mb.timeSignatureDenominator] = ts;
    score.addMasterBar(mb);
    const bar = new model.Bar();
    Object.assign(bar, {clef, clefOttava, keySignature, keySignatureType});
    staff.addBar(bar);
    const voice = new model.Voice();
    bar.addVoice(voice);
    if (!beats.length) throw new Error(`rebar: bar ${i + 1} is empty`);
    for (const rb of beats) {
      let beat: InstanceType<typeof model.Beat>;
      if (rb.rest) {
        beat = new model.Beat();
      } else {
        const o = orig[rb.src ?? -1];
        if (!o || !o.notes.length) throw new Error(`rebar: bar ${i + 1}: src ${rb.src} is not an original beat with notes`);
        if (rb.tie) {
          beat = new model.Beat();
          for (const n of o.notes) {
            const c = new model.Note();
            c.string = n.string;
            c.fret = n.fret;
            c.isTieDestination = true;
            beat.addNote(c);
          }
        } else {
          if (seen.has(rb.src!)) throw new Error(`rebar: src ${rb.src} used twice`);
          seen.add(rb.src!);
          beat = o;
        }
      }
      setDuration(beat, rb.d, `rebar bar ${i + 1}`);
      voice.addBeat(beat);
    }
  });
  const missing = orig.map((b, k) => (b.notes.length && !seen.has(k) ? k : -1)).filter(k => k >= 0);
  if (missing.length) throw new Error(`rebar: original beats missing: ${missing.join(', ')}`);
}

const barCount = score.masterBars.length;

for (const {bar, beat, lines} of spec.splitBeats ?? []) {
  const voice = staff.bars[bar - 1].voices[0];
  const original = voice.beats[beat];
  if (!original || beat === 0) throw new Error(`splitBeats: bar ${bar} beat ${beat} must exist and not be the first beat`);
  const moved = original.notes.filter(n => lines.includes(lineOf(n)));
  if (!moved.length || moved.length === original.notes.length) {
    throw new Error(`splitBeats: bar ${bar} beat ${beat} has no notes to split on lines ${lines}`);
  }
  const nb = new model.Beat();
  for (const n of moved) {
    original.removeNote(n);
    nb.addNote(n);
  }
  voice.insertBeat(voice.beats[beat - 1], nb);
}

for (const [bar, tokens] of Object.entries(spec.durations ?? {})) {
  const beats = staff.bars[Number(bar) - 1]?.voices[0].beats;
  if (!beats) throw new Error(`durations: no bar ${bar}`);
  if (tokens.length !== beats.length) throw new Error(`durations: bar ${bar} has ${beats.length} beats, spec gives ${tokens.length}`);
  beats.forEach((b, i) => setDuration(b, tokens[i], `durations bar ${bar}`));
}

const ts = spec.timeSignature ?? {};
for (let i = 0; i < barCount; i++) {
  const mb = score.masterBars[i];
  const sig = ts[String(i + 1)] ?? ts.default;
  if (sig) {
    [mb.timeSignatureNumerator, mb.timeSignatureDenominator] = sig;
    mb.timeSignatureCommon = false;
  }
  if (spec.tempo) mb.tempoAutomations = [];
  if (spec.repeats) { mb.isRepeatStart = false; mb.repeatCount = 0; }
  if (spec.sections) mb.section = null;
  if (spec.fermatas) mb.fermata = null;
}

for (const [bar, bpm] of Object.entries(spec.tempo ?? {})) {
  score.masterBars[Number(bar) - 1].tempoAutomations.push(model.Automation.buildTempoAutomation(false, 0, bpm, 2));
}
// The score's own tempo still applies to every bar before the first automation. When the first
// tempo section starts after bar 1 (a pickup or an intro the recording plays rubato), leaving it
// at the file's imported default (120 for an ASCII import) made those bars play at 120.
const tempoMap = spec.tempo ?? {};
const tempoBars = Object.keys(tempoMap).map(Number).sort((a, b) => a - b);
if (tempoBars.length && tempoBars[0] > 1) {
  score.masterBars[0].tempoAutomations.push(
    model.Automation.buildTempoAutomation(false, 0, tempoMap[String(tempoBars[0])], 2));
}
for (const [start, end, count] of spec.repeats ?? []) {
  score.masterBars[start - 1].isRepeatStart = true;
  score.masterBars[end - 1].repeatCount = count;
}
for (const [bar, text] of spec.sections ?? []) {
  const s = new model.Section();
  s.marker = '';
  s.text = text;
  score.masterBars[bar - 1].section = s;
}
score.finish(settings);

// Fermatas are keyed by the beat's playback start, which only exists after finish().
for (const bar of spec.fermatas ?? []) {
  const beats = staff.bars[bar - 1].voices[0].beats;
  const f = new model.Fermata();
  f.type = model.FermataType.Medium;
  f.length = 0;
  score.masterBars[bar - 1].addFermata(beats[beats.length - 1].playbackStart, f);
}
score.finish(settings);

const bytes = new exporter.Gp7Exporter().export(score, settings);
writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes) — check it with verify.ts`);
