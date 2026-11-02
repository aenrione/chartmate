/**
 * `song.ini` — the metadata file Clone Hero and YARG read alongside notes.chart.
 *
 * `pro_drums = True` is not cosmetic: without it, scan-chart (and the games)
 * only treat the chart as four-lane-pro if it happens to contain a cymbal
 * marker, so a chart whose drums are all toms would load with every lane read
 * as a tom. We always write it.
 */

export interface SongIniOptions {
  name: string;
  artist: string;
  charter: string;
  album?: string;
  genre?: string;
  year?: string;
  /** Milliseconds. Required by Encore. */
  songLength: number;
  /** 0-6 ish; -1 means "no drum chart". */
  diffDrums: number;
  /** Extra keys, written verbatim after the standard ones. */
  extra?: Record<string, string | number | boolean>;
}

function iniValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

export function writeSongIni(options: SongIniOptions): string {
  const entries: [string, string | number | boolean][] = [
    ['name', options.name],
    ['artist', options.artist],
    ['album', options.album ?? ''],
    ['genre', options.genre ?? 'Practice'],
    // scan-chart reports a missing year as a metadata issue, so there is
    // always one; for generated practice charts it is simply the year made.
    ['year', options.year ?? String(new Date().getFullYear())],
    ['charter', options.charter],
    ['song_length', Math.round(options.songLength)],
    ['pro_drums', true],
    ['five_lane_drums', false],
    ['diff_drums', options.diffDrums],
    ['diff_drums_real', options.diffDrums],
    ['diff_guitar', -1],
    ['diff_bass', -1],
    ['diff_rhythm', -1],
    ['diff_keys', -1],
    ['diff_vocals', -1],
    // Leading silence in song.ogg is the sync mechanism, so no delay here
    // and Offset = 0 in the chart's [Song] block.
    ['delay', 0],
    ['preview_start_time', 0],
  ];

  for (const [key, value] of Object.entries(options.extra ?? {})) {
    entries.push([key, value]);
  }

  return (
    ['[Song]', ...entries.map(([k, v]) => `${k} = ${iniValue(v)}`)].join('\r\n') +
    '\r\n'
  );
}

/**
 * A crude 0-6 difficulty rating from note density, so the games have something
 * to sort by. Not a claim about how hard the music actually is.
 */
export function estimateDiffDrums(noteCount: number, songLengthMs: number): number {
  if (noteCount === 0 || songLengthMs <= 0) return -1;
  const notesPerSecond = noteCount / (songLengthMs / 1000);
  if (notesPerSecond < 2) return 0;
  if (notesPerSecond < 3.5) return 1;
  if (notesPerSecond < 5) return 2;
  if (notesPerSecond < 7) return 3;
  if (notesPerSecond < 9) return 4;
  if (notesPerSecond < 12) return 5;
  return 6;
}
