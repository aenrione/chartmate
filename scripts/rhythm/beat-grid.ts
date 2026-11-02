// Per sounding beat of a Guitar Pro file (track 1, voice 0): its index in the flat note
// sequence, absolute tick, written duration in ticks (tied continuations folded in), and the
// tick length of the bar it starts in. Tie destinations and rests are skipped, so beat j is the
// same tab beat in every rhythm reading of the same notes (what verify.ts --flat checks).
// Used by the candidate chooser to score a reading against a video cursor without re-running
// the whole analysis.
// usage: node scripts/rhythm/beat-grid.ts <score.gp> <out.json>
import {readFileSync, writeFileSync} from 'node:fs';
import {importer, Settings} from '@coderline/alphatab';

const [inp, out] = process.argv.slice(2);
const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(inp)), new Settings());
const staff = score.tracks[0].staves[0];

type Row = {j: number; tick: number; dur: number; barTicks: number; bar: number; bpm: number; sec: number};
const rows: Row[] = [];
let abs = 0;
let bpm = score.tempo;
let j = 0;
const bpms: number[] = [];
staff.bars.forEach((bar, i) => {
  const mb = score.masterBars[i];
  if (mb.tempoAutomations.length) bpm = mb.tempoAutomations[0].value;
  const barTicks = mb.calculateDuration();
  for (const b of bar.voices[0].beats) {
    const sounding = b.notes.filter(n => !n.isTieDestination);
    if (sounding.length) {
      rows.push({j: j++, tick: 0, sec: 0, dur: b.playbackDuration, barTicks, bar: i + 1, bpm});
    } else if (rows.length && b.notes.length) {
      rows[rows.length - 1].dur += b.playbackDuration; // tied continuation
    }
    // rests add to the running tick but carry no note
  }
  abs += barTicks;
  bpms.push(bpm);
});
// recompute absolute ticks cleanly: walk bars, accumulating beat durations within each bar
let a = 0, k = 0, secs = 0;
staff.bars.forEach((bar, i) => {
  const mb = score.masterBars[i];
  let t = a;
  for (const b of bar.voices[0].beats) {
    const sounding = b.notes.filter(n => !n.isTieDestination);
    if (sounding.length) {
      rows[k].tick = t;
      rows[k].sec = secs + ((t - a) / 960) * 60 / bpms[i];
      k++;
    }
    t += b.playbackDuration;
  }
  a += mb.calculateDuration();
  secs += (mb.calculateDuration() / 960) * 60 / bpms[i];
});
const ts = score.masterBars.map(m => `${m.timeSignatureNumerator}/${m.timeSignatureDenominator}`);
writeFileSync(out, JSON.stringify({
  bars: staff.bars.length,
  ts: ts[0],
  mixedMeter: ts.some(x => x !== ts[0]),
  tempos: [...new Set(bpms)],
  totalTicks: a,
  seconds: score.masterBars.reduce((s, m, i) => s + (m.calculateDuration() / 960) * 60 / bpms[i], 0),
  rows,
}));
