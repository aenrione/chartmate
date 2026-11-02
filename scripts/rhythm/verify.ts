// Check a rhythm-edited Guitar Pro file against the original: identical notes per bar (fret,
// string, hammer/slide), same tuning, and every bar filling its time signature.
// usage: node scripts/rhythm/verify.ts <original.gp> <edited.gp> [--flat]
// Exits non-zero on any note mismatch, tuning change or bar that doesn't add up.
// --flat (for apply-rhythm's "rebar"): compare the whole note sequence beat by beat instead of
// bar by bar, skipping rests and tied continuations, since the bar lines moved on purpose.
import {readFileSync} from 'node:fs';
import {importer, Settings} from '@coderline/alphatab';

const load = (p: string) => importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(p)), new Settings());
const args = process.argv.slice(2);
const flat = args.includes('--flat');
const [orig, edited] = args.filter(a => a !== '--flat').map(load);

const notesPerBar = (s: ReturnType<typeof load>) => {
  const staff = s.tracks[0].staves[0];
  const strings = staff.stringTuning.tunings.length;
  return staff.bars.map(bar => bar.voices[0].beats
    .flatMap(b => b.notes.map(n => `${strings + 1 - n.string}:${n.fret}${n.isHammerPullOrigin ? 'h' : ''}${n.slideOutType ? '/' : ''}`))
    .sort().join(' '));
};

// one entry per sounding beat (rests and tie continuations left out), in order
const notesPerBeat = (s: ReturnType<typeof load>) => {
  const staff = s.tracks[0].staves[0];
  const strings = staff.stringTuning.tunings.length;
  return staff.bars.flatMap((bar, i) => bar.voices[0].beats
    .map(b => b.notes.filter(n => !n.isTieDestination))
    .filter(ns => ns.length)
    .map(ns => ({bar: i + 1, key: ns.map(n => `${strings + 1 - n.string}:${n.fret}${n.isHammerPullOrigin ? 'h' : ''}${n.slideOutType ? '/' : ''}`).sort().join(' ')})));
};

let problems = 0;
const count = (bars: string[]) => bars.reduce((t, x) => t + (x ? x.split(' ').length : 0), 0);
if (flat) {
  const a = notesPerBeat(orig), b = notesPerBeat(edited);
  console.log(`beats with notes: original ${a.length}, edited ${b.length} | bars ${orig.masterBars.length} → ${edited.masterBars.length}`);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]?.key !== b[i]?.key) {
      problems++;
      console.log(`NOTE MISMATCH beat ${i} (original bar ${a[i]?.bar}, edited bar ${b[i]?.bar})\n  ${a[i]?.key}\n  ${b[i]?.key}`);
      if (problems > 10) break;
    }
  }
} else {
  const a = notesPerBar(orig), b = notesPerBar(edited);
  console.log(`notes: original ${count(a)}, edited ${count(b)} | bars ${a.length} → ${b.length}`);
  a.forEach((x, i) => {
    if (x !== b[i]) { problems++; console.log(`NOTE MISMATCH bar ${i + 1}\n  ${x}\n  ${b[i]}`); }
  });
}

const ta = orig.tracks[0].staves[0].stringTuning.tunings.join();
const tb = edited.tracks[0].staves[0].stringTuning.tunings.join();
if (ta !== tb) { problems++; console.log(`TUNING CHANGED ${ta} → ${tb}`); }

const staff = edited.tracks[0].staves[0];
staff.bars.forEach((bar, i) => {
  const mb = edited.masterBars[i];
  const beats = bar.voices[0].beats;
  const sum = beats.reduce((t, be) => t + be.playbackDuration, 0);
  const full = sum === mb.calculateDuration();
  if (!full) problems++;
  const tempo = mb.tempoAutomations.map(x => x.value).join(',');
  const rpt = (mb.isRepeatStart ? '|:' : '') + (mb.repeatCount > 0 ? `:|x${mb.repeatCount}` : '');
  const durs = beats.map(be => `${be.duration}${'.'.repeat(be.dots)}${be.tupletNumerator > 0 ? 't' : ''}`).join(' ');
  console.log(String(i + 1).padStart(3), `${mb.timeSignatureNumerator}/${mb.timeSignatureDenominator}`.padEnd(5),
    full ? 'FULL' : `!! ${sum}/${mb.calculateDuration()}`, tempo ? `q=${tempo}` : '', mb.fermata ? 'fermata' : '',
    rpt, mb.section ? `[${mb.section.text}]` : '', '|', durs);
});
console.log(problems ? `${problems} problem(s)` : 'OK');
process.exit(problems ? 1 : 0);
