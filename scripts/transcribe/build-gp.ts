// Build a Guitar Pro 7 file from a score JSON (bars -> beats -> notes with string/fret), then
// reload the written file and check it: every bar must add up to its time signature.
// usage (from the repo root): node scripts/transcribe/build-gp.ts <score.json> <out.gp> [--pickstroke]
//   --pickstroke   also print a pick-stroke mark (down-bow/up-bow) on every beat with "stroke"
//
// score.json (fingering.py writes it; hand edits are fine):
// {
//   "title": "...", "artist": "...", "tempo": 103,          // quarter-note BPM
//   "tuning": [64, 59, 55, 50, 45, 40],                      // MIDI, string 1 (high) first
//   "capo": 0, "program": 24,                                // GM program, 24 = nylon guitar
//   "chords": {"G": "320033", "Bm7": "x24232"},              // optional: diagrams for "chord"
//                                                            //   names; frets string 6 -> 1,
//                                                            //   x = muted (comma-separate if a
//                                                            //   fret is >= 10: "x,10,12,12,11,x")
//   "bars": [{
//     "timeSignature": [6, 8],                               // optional after the first bar
//     "tempo": 90, "section": "Verse", "fermata": true,      // all optional
//     "beats": [{"duration": "8" | "4." | "16" | "8t" ...,   // 1|2|4|8|16|32 + dots + t
//                "chord": "G",                               // optional: name (+ diagram) above
//                "stroke": "down" | "up",                    // optional: strum arrow, 60-tick sweep
//                "brush": "down" | "up",                     // optional: strum arrow, default sweep
//                "pickStroke": "down" | "up",                // optional: pick-direction mark
//                "accent": "normal" | "heavy",               // optional: accent on every note
//                "notes": [{"string": 1, "fret": 0,          // string 1 = highest
//                           "tie": true, "harmonic": true, "letRing": false,
//                           "dead": true, "palmMute": true,
//                           "hammer": true}]}]                           // [] = rest
//   }]
// }
// "hammer": true marks the note as the origin of a slur (ligado): a hammer-on when the next
// note on that string is higher, a pull-off when it is lower. AlphaTab works out which from
// the pitches and draws the tie-like curve.
// "dead": true prints the note as an x (a muted/ghosted strum stroke); "palmMute": true adds
// the P.M. bracket. Both are what a strummed chart needs for strokes the hand damps.
// "accent" is the other half of that: the strokes the hand hits *harder*. GP7 has two levels,
// so a continuous loudness contrast has to be quantised into none / normal (>) / heavy (^).
// AlphaTab draws the glyph only on the standard-notation staff, never on the tab staff — the
// app's strumming-pattern panel is where a tab reader sees it, as a ">" over the count row.
// Notes ring by default (fingerpicked arpeggios); set "letRing": false to stop that
// (fingering.py does it for strums). "stroke" is what fingering.py writes for strum slots;
// "brush"/"pickStroke" are what annotate-score.py writes. All of them are optional.
import {readFileSync, writeFileSync} from 'node:fs';
import {exporter, importer, model, Settings} from '@coderline/alphatab';

type Dir = 'down' | 'up';
type JNote = {string: number; fret: number; tie?: boolean; harmonic?: boolean; letRing?: boolean;
  dead?: boolean; palmMute?: boolean; hammer?: boolean};
type Accent = 'normal' | 'heavy';
type JBeat = {duration: string; notes: JNote[]; chord?: string; stroke?: Dir; brush?: Dir;
  pickStroke?: Dir; accent?: Accent};
type JBar = {timeSignature?: [number, number]; tempo?: number; section?: string; fermata?: boolean; beats: JBeat[]};
type JScore = {title?: string; artist?: string; tempo: number; tuning: number[]; capo?: number; program?: number;
  chords?: Record<string, string>; bars: JBar[]};

const [inp, out] = process.argv.slice(2).filter(x => !x.startsWith('--'));
const PICKSTROKE = process.argv.includes('--pickstroke');
if (!inp || !out) throw new Error('usage: build-gp.ts <score.json> <out.gp> [--pickstroke]');
const src: JScore = JSON.parse(readFileSync(inp, 'utf8'));
const settings = new Settings();
const S = src.tuning.length;

const score = new model.Score();
score.title = src.title ?? '';
score.artist = src.artist ?? '';
const track = new model.Track();
track.name = 'Guitar';
track.shortName = 'Gtr';
track.playbackInfo.program = src.program ?? 24;
track.playbackInfo.primaryChannel = 0;
track.playbackInfo.secondaryChannel = 1;
const staff = new model.Staff();
staff.showTablature = true;
staff.showStandardNotation = true;
staff.stringTuning.tunings = src.tuning.slice();
staff.capo = src.capo ?? 0;
track.addStaff(staff);
score.addTrack(track);

const chordIds = new Set<string>();
function ensureChord(name: string) {
  if (chordIds.has(name)) return;
  const c = new model.Chord();
  c.name = name;
  const shape = src.chords?.[name];
  if (shape) {
    const frets = shape.includes(',') ? shape.split(',') : shape.split('');
    c.strings = frets.reverse().map(ch => (ch.trim().toLowerCase() === 'x' ? -1 : Number(ch))); // highest string first
    const fretted = c.strings.filter(f => f > 0);
    c.firstFret = fretted.length && Math.max(...fretted) > 5 ? Math.min(...fretted) : 1;
    c.showDiagram = true;
  } else {
    c.strings = [];
    c.showDiagram = false;
  }
  c.showName = true;
  staff.addChord(name, c);
  chordIds.add(name);
}
const brushType = (d: Dir) => (d === 'down' ? model.BrushType.BrushDown : model.BrushType.BrushUp);
const pickStroke = (d: Dir) => (d === 'down' ? model.PickStroke.Down : model.PickStroke.Up);

let sig: [number, number] = src.bars[0].timeSignature ?? [4, 4];
src.bars.forEach((jb, i) => {
  const mb = new model.MasterBar();
  sig = jb.timeSignature ?? sig;
  [mb.timeSignatureNumerator, mb.timeSignatureDenominator] = sig;
  if (i === 0 || jb.tempo) {
    mb.tempoAutomations.push(model.Automation.buildTempoAutomation(false, 0, jb.tempo ?? src.tempo, 2));
  }
  if (jb.section) {
    const s = new model.Section();
    s.marker = '';
    s.text = jb.section;
    mb.section = s;
  }
  score.addMasterBar(mb);
  const bar = new model.Bar();
  staff.addBar(bar);
  const voice = new model.Voice();
  bar.addVoice(voice);
  for (const jbeat of jb.beats) {
    const m = jbeat.duration.match(/^(1|2|4|8|16|32|64)(\.{0,2})(t?)$/);
    if (!m) throw new Error(`bar ${i + 1}: bad duration "${jbeat.duration}"`);
    const beat = new model.Beat();
    beat.duration = Number(m[1]);
    beat.dots = m[2].length;
    if (m[3]) { beat.tupletNumerator = 3; beat.tupletDenominator = 2; }
    for (const jn of jbeat.notes) {
      if (jn.string < 1 || jn.string > S) throw new Error(`bar ${i + 1}: string ${jn.string}`);
      const n = new model.Note();
      n.string = S + 1 - jn.string; // alphaTab counts strings from the lowest
      n.fret = jn.fret;
      n.isLetRing = jn.letRing ?? true;
      if (jn.tie) n.isTieDestination = true;
      if (jn.harmonic) { n.harmonicType = model.HarmonicType.Natural; n.harmonicValue = jn.fret; }
      if (jn.dead) n.isDead = true;
      if (jn.palmMute) n.isPalmMute = true;
      if (jn.hammer) n.isHammerPullOrigin = true;
      if (jbeat.accent) {
        n.accentuated = jbeat.accent === 'heavy'
          ? model.AccentuationType.Heavy : model.AccentuationType.Normal;
      }
      beat.addNote(n);
    }
    if (jbeat.stroke) {
      beat.brushType = brushType(jbeat.stroke);
      beat.brushDuration = 60;
      if (PICKSTROKE) beat.pickStroke = pickStroke(jbeat.stroke);
    }
    if (jbeat.brush) beat.brushType = brushType(jbeat.brush);
    if (jbeat.pickStroke) beat.pickStroke = pickStroke(jbeat.pickStroke);
    if (jbeat.chord) {
      ensureChord(jbeat.chord);
      beat.chordId = jbeat.chord;
    }
    voice.addBeat(beat);
  }
});
score.finish(settings);
src.bars.forEach((jb, i) => {
  if (!jb.fermata) return;
  const beats = staff.bars[i].voices[0].beats;
  const f = new model.Fermata();
  f.type = model.FermataType.Medium;
  f.length = 0;
  score.masterBars[i].addFermata(beats[beats.length - 1].playbackStart, f);
});
score.finish(settings);

const bytes = new exporter.Gp7Exporter().export(score, settings);
writeFileSync(out, bytes);

// Reload what was written and check it.
const back = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(out)), new Settings());
const bst = back.tracks[0].staves[0];
let bad = 0, notes = 0, brushes = 0, picks = 0, named = 0, acc = 0, heavy = 0, slurs = 0;
bst.bars.forEach((bar, i) => {
  const beats = bar.voices[0].beats;
  const sum = beats.reduce((t, b) => t + b.playbackDuration, 0);
  notes += beats.reduce((t, b) => t + b.notes.filter(n => !n.isTieDestination).length, 0);
  brushes += beats.filter(b => b.brushType !== model.BrushType.None).length;
  slurs += beats.reduce((t, b) => t + b.notes.filter(n => n.isHammerPullOrigin).length, 0);
  picks += beats.filter(b => b.pickStroke !== model.PickStroke.None).length;
  named += beats.filter(b => b.chordId).length;
  acc += beats.filter(b => b.notes.some(n => n.accentuated === model.AccentuationType.Normal)).length;
  heavy += beats.filter(b => b.notes.some(n => n.accentuated === model.AccentuationType.Heavy)).length;
  if (sum !== back.masterBars[i].calculateDuration()) {
    bad++;
    console.log(`bar ${i + 1}: ${sum} ticks, expected ${back.masterBars[i].calculateDuration()}`);
  }
});
const sections = back.masterBars.filter(mb => mb.section).map(mb => `${mb.index + 1}:${mb.section!.text}`);
console.log(`wrote ${out} (${bytes.length} bytes): ${bst.bars.length} bars, ${notes} notes, tempo ${back.tempo}, ` +
  `tuning ${bst.stringTuning.tunings.join(',')}, capo ${bst.capo}`);
console.log(`sections: ${sections.join(' | ')}`);
const tempos = back.masterBars.flatMap(mb => mb.tempoAutomations.map(a => `${mb.index + 1}:${a.value}`));
if (tempos.length > 1) console.log(`tempo marks: ${tempos.join(' ')}`);
if (brushes || picks || named) {
  console.log(`brushed beats: ${brushes}, pick strokes: ${picks}, beats with a chord name: ${named}, ` +
    `chords defined: ${bst.chords ? bst.chords.size : 0}`);
}
if (slurs) console.log(`slurred (hammer-on/pull-off) notes: ${slurs}`);
if (acc || heavy) console.log(`accents: ${acc} normal, ${heavy} heavy (of ${brushes || notes} beats)`);
console.log(bad ? `${bad} bar(s) do not add up` : 'OK: every bar adds up to its time signature');
process.exit(bad ? 1 : 0);
