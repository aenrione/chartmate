// Every sounding note of a Guitar Pro file (track 1) with its bar, tab line, fret, and onset in
// beats and in seconds of score time (tempo automations applied, repeats not expanded). For
// comparing two rhythm readings of the same notes, e.g. auto-rhythm against a hand-made one.
// usage: node scripts/rhythm/note-times.ts <score.gp> <out.json>
import {readFileSync, writeFileSync} from 'node:fs';
import {importer, Settings} from '@coderline/alphatab';

const [inp, out] = process.argv.slice(2);
const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(inp)), new Settings());
const staff = score.tracks[0].staves[0];
const strings = staff.stringTuning.tunings.length;
let bpm = score.tempo;
let sec = 0;
const notes: {bar: number; line: number; fret: number; beats: number; sec: number; barStartSec: number; barBeats: number}[] = [];
let beatsAbs = 0;
staff.bars.forEach((bar, i) => {
  const mb = score.masterBars[i];
  if (mb.tempoAutomations.length) bpm = mb.tempoAutomations[0].value;
  const barStart = sec;
  const barQuarters = mb.calculateDuration() / 960;
  for (const b of bar.voices[0].beats) {
    const q = b.playbackStart / 960;
    for (const n of b.notes) {
      if (n.isTieDestination) continue;
      notes.push({bar: i + 1, line: strings + 1 - n.string, fret: n.fret, beats: beatsAbs + q, sec: barStart + (q * 60) / bpm,
        barStartSec: barStart, barBeats: barQuarters});
    }
  }
  sec += (barQuarters * 60) / bpm;
  beatsAbs += barQuarters;
});
writeFileSync(out, JSON.stringify(notes));
console.log(`${notes.length} notes -> ${out}`);
