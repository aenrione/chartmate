import {model, exporter, Settings} from '@coderline/alphatab';

type Score = InstanceType<typeof model.Score>;

/**
 * Export a Score to Guitar Pro 7 binary format.
 * Returns a Uint8Array that can be saved as .gp or stored as BLOB.
 */
export function exportToGp7(score: Score): Uint8Array {
  const gp7 = new exporter.Gp7Exporter();
  return gp7.export(score, new Settings());
}

/**
 * Export a Score to AlphaTex string format.
 * Useful for lightweight serialization and undo/redo snapshots.
 */
export function exportToAlphaTex(score: Score): string {
  const tex = new exporter.AlphaTexExporter();
  return tex.exportToString(score, new Settings());
}

/**
 * Export a Score as a downloadable GP7 file.
 */
export function downloadAsGp7(score: Score, filename: string = 'tab.gp') {
  const data = exportToGp7(score);
  const blob = new Blob([data], {type: 'application/octet-stream'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Generate ASCII tablature from a Score.
 */
export function exportToAsciiTab(score: Score): string {
  const lines: string[] = [];

  for (const track of score.tracks) {
    const staff = track.staves[0];
    if (!staff || staff.isPercussion) continue;

    lines.push(`=== ${track.name} ===`);
    lines.push('');

    const stringCount = staff.stringTuning?.tunings?.length ?? 6;
    const tuningNames = staff.stringTuning?.tunings?.map(
      (t: number) => model.Tuning.getTextForTuning(t, false)
    ) ?? ['E', 'B', 'G', 'D', 'A', 'E'];

    // Process bars in groups that fit on one line
    const barsPerLine = 4;
    for (let barStart = 0; barStart < staff.bars.length; barStart += barsPerLine) {
      const barEnd = Math.min(barStart + barsPerLine, staff.bars.length);

      // Build string lines for this group
      const stringLines: string[][] = [];
      for (let s = 0; s < stringCount; s++) {
        stringLines.push([tuningNames[s] + '|']);
      }

      for (let b = barStart; b < barEnd; b++) {
        const bar = staff.bars[b];
        const voice = bar.voices[0];
        if (!voice) continue;

        for (const beat of voice.beats) {
          if (beat.isEmpty) {
            for (let s = 0; s < stringCount; s++) {
              stringLines[s].push('---');
            }
          } else {
            for (let s = 0; s < stringCount; s++) {
              const alphaString = s + 1; // 1-based, 1 = highest
              const note = beat.notes.find((n: InstanceType<typeof model.Note>) => n.string === alphaString);
              if (note) {
                const fretStr = note.fret.toString();
                stringLines[s].push(fretStr.length === 1 ? `-${fretStr}-` : `${fretStr}-`);
              } else {
                stringLines[s].push('---');
              }
            }
          }
        }

        // Bar line
        for (let s = 0; s < stringCount; s++) {
          stringLines[s].push('|');
        }
      }

      for (const sl of stringLines) {
        lines.push(sl.join(''));
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
