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
 * Generate ASCII tablature from a Score, including metadata and section markers.
 */
export function exportToAsciiTab(score: Score): string {
  const lines: string[] = [];

  // Song metadata header
  if (score.title)  lines.push(`Title: ${score.title}`);
  if (score.artist) lines.push(`Artist: ${score.artist}`);
  if (score.album)  lines.push(`Album: ${score.album}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tempo = (score.masterBars?.[0] as any)?.tempo?.value ?? score.tempo;
  if (tempo)        lines.push(`Tempo: ${tempo}`);
  if (lines.length) lines.push('');

  // Section map: bar index → section name (read from masterBars)
  const sectionAtBar = new Map<number, string>();
  if (score.masterBars) {
    for (let i = 0; i < score.masterBars.length; i++) {
      const mb = score.masterBars[i];
      if (mb?.section?.text) sectionAtBar.set(i, mb.section.text);
    }
  }

  for (const track of score.tracks) {
    const staff = track.staves[0];
    if (!staff || staff.isPercussion) continue;

    lines.push(`=== ${track.name} ===`);
    lines.push('');

    const stringCount = staff.stringTuning?.tunings?.length ?? 6;
    const tuningNames = staff.stringTuning?.tunings?.map(
      (t: number) => model.Tuning.getTextForTuning(t, false)
    ) ?? ['E', 'B', 'G', 'D', 'A', 'E'];

    const barsPerLine = 4;
    for (let barStart = 0; barStart < staff.bars.length; barStart += barsPerLine) {
      const barEnd = Math.min(barStart + barsPerLine, staff.bars.length);

      // Emit section marker if any bar in this group starts a section
      for (let b = barStart; b < barEnd; b++) {
        if (sectionAtBar.has(b)) {
          lines.push(`[${sectionAtBar.get(b)}]  (bar ${b + 1})`);
          break;
        }
      }

      // Bar number annotation above each group
      const barNums = Array.from({length: barEnd - barStart}, (_, i) =>
        `  ${barStart + i + 1}`.padEnd(13),
      );
      lines.push('  ' + barNums.join(''));

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
          // Chord annotation above this beat
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chordName: string | null = beat.chordId != null
            ? ((track as any).chords?.find((c: {uniqueId: string; name: string}) => c.uniqueId === beat.chordId)?.name ?? null)
            : null;
          if (chordName) {
            // Store for later — chord line gets appended after string lines
            // For simplicity we skip inline chord lines here (would misalign widths)
          }

          if (beat.isEmpty) {
            for (let s = 0; s < stringCount; s++) stringLines[s].push('---');
          } else {
            for (let s = 0; s < stringCount; s++) {
              const alphaString = s + 1;
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

        for (let s = 0; s < stringCount; s++) stringLines[s].push('|');
      }

      for (const sl of stringLines) lines.push(sl.join(''));
      lines.push('');
    }
  }

  return lines.join('\n');
}
