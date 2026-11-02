// Dump a Guitar Pro file's beats (first track) with each note's tab line and MIDI pitch.
// usage: node scripts/rhythm/export-beats.ts <score.gp> <beats.json>
// Line 1 = highest string, matching how ASCII tabs are written.
import {readFileSync, writeFileSync} from 'node:fs';
import {importer, Settings} from '@coderline/alphatab';

const [inp, out] = process.argv.slice(2);
const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(inp)), new Settings());
const staff = score.tracks[0].staves[0];
const tuning = [...staff.stringTuning.tunings]; // high → low
const strings = tuning.length;

const beats: {bar: number; beat: number; notes: {line: number; fret: number; midi: number}[]}[] = [];
staff.bars.forEach((bar, i) => bar.voices[0].beats.forEach((beat, j) => {
  beats.push({
    bar: i + 1,
    beat: j,
    notes: beat.notes.map(n => {
      const line = strings + 1 - n.string;
      return {line, fret: n.fret, midi: tuning[line - 1] + n.fret};
    }),
  });
}));
writeFileSync(out, JSON.stringify(beats));
console.log(`${beats.length} beats, ${beats.reduce((a, b) => a + b.notes.length, 0)} notes -> ${out}`);
