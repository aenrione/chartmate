import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Constants
const RESOLUTION = 192;
const BPM_TEMPO = 120000; // 120 BPM in millibeats per minute (mBPM)
const QUARTER = 192;
const EIGHTH = 96;
const SIXTEENTH = 48;
const TRIPLET_EIGHTH = 64;
const MEASURE = 768; // one measure of 4/4
const TOTAL_TICKS = MEASURE * 2; // 2 measures

// Note type 1 = Snare (Red pad in Clone Hero)
const SNARE = 1;

interface RudimentDef {
  filename: string;
  subdivision: number;
}

const rudiments: RudimentDef[] = [
  // 1-15: Roll Rudiments
  { filename: "01-single-stroke-roll", subdivision: SIXTEENTH },
  { filename: "02-single-stroke-four", subdivision: SIXTEENTH },
  { filename: "03-single-stroke-seven", subdivision: SIXTEENTH },
  { filename: "04-multiple-bounce-roll", subdivision: SIXTEENTH },
  { filename: "05-triple-stroke-roll", subdivision: SIXTEENTH },
  { filename: "06-double-stroke-open-roll", subdivision: SIXTEENTH },
  { filename: "07-five-stroke-roll", subdivision: SIXTEENTH },
  { filename: "08-six-stroke-roll", subdivision: SIXTEENTH },
  { filename: "09-seven-stroke-roll", subdivision: SIXTEENTH },
  { filename: "10-nine-stroke-roll", subdivision: SIXTEENTH },
  { filename: "11-ten-stroke-roll", subdivision: SIXTEENTH },
  { filename: "12-eleven-stroke-roll", subdivision: SIXTEENTH },
  { filename: "13-thirteen-stroke-roll", subdivision: SIXTEENTH },
  { filename: "14-fifteen-stroke-roll", subdivision: SIXTEENTH },
  { filename: "15-seventeen-stroke-roll", subdivision: SIXTEENTH },

  // 16-20: Diddle Rudiments
  { filename: "16-single-paradiddle", subdivision: SIXTEENTH },
  { filename: "17-double-paradiddle", subdivision: SIXTEENTH },
  { filename: "18-triple-paradiddle", subdivision: SIXTEENTH },
  { filename: "19-paradiddle-diddle", subdivision: SIXTEENTH },
  { filename: "20-double-paradiddle-diddle", subdivision: SIXTEENTH },

  // 21-30: Flam Rudiments
  { filename: "21-flam", subdivision: QUARTER },
  { filename: "22-flam-accent", subdivision: TRIPLET_EIGHTH },
  { filename: "23-flam-tap", subdivision: EIGHTH },
  { filename: "24-flamacue", subdivision: EIGHTH },
  { filename: "25-flam-paradiddle", subdivision: EIGHTH },
  { filename: "26-single-flammed-mill", subdivision: EIGHTH },
  { filename: "27-flam-paradiddle-diddle", subdivision: EIGHTH },
  { filename: "28-pataflafla", subdivision: EIGHTH },
  { filename: "29-swiss-army-triplet", subdivision: TRIPLET_EIGHTH },
  { filename: "30-inverted-flam-tap", subdivision: EIGHTH },

  // 31-40: Drag Rudiments
  { filename: "31-drag", subdivision: QUARTER },
  { filename: "32-single-drag-tap", subdivision: EIGHTH },
  { filename: "33-double-drag-tap", subdivision: EIGHTH },
  { filename: "34-lesson-25", subdivision: EIGHTH },
  { filename: "35-single-dragadiddle", subdivision: EIGHTH },
  { filename: "36-drag-paradiddle-1", subdivision: EIGHTH },
  { filename: "37-drag-paradiddle-2", subdivision: EIGHTH },
  { filename: "38-single-ratamacue", subdivision: TRIPLET_EIGHTH },
  { filename: "39-double-ratamacue", subdivision: TRIPLET_EIGHTH },
  { filename: "40-triple-ratamacue", subdivision: TRIPLET_EIGHTH },
];

function generateNotes(subdivision: number): string {
  const lines: string[] = [];
  let tick = 0;
  while (tick < TOTAL_TICKS) {
    lines.push(`  ${tick} = N ${SNARE} 0`);
    tick += subdivision;
  }
  return lines.join("\n");
}

function generateChart(rudiment: RudimentDef): string {
  const notes = generateNotes(rudiment.subdivision);
  return `[Song]
{
  Resolution = ${RESOLUTION}
}
[SyncTrack]
{
  0 = TS 4 2
  0 = B ${BPM_TEMPO}
}
[ExpertDrums]
{
${notes}
}
`;
}

// Main
const outDir = join(import.meta.dirname!, "..", "public", "rudiments", "charts");
mkdirSync(outDir, { recursive: true });

for (const rudiment of rudiments) {
  const chart = generateChart(rudiment);
  const filepath = join(outDir, `${rudiment.filename}.chart`);
  writeFileSync(filepath, chart, "utf-8");
  console.log(`Generated: ${rudiment.filename}.chart`);
}

console.log(`\nDone! Generated ${rudiments.length} chart files in ${outDir}`);
