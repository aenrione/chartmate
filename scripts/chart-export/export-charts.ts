/**
 * Exports the drum curriculum and the 40 rudiments as Clone Hero / YARG chart
 * folders, from the command line.
 *
 * The same library the app's export button uses — this is the batch front end
 * to it, not a second implementation.
 *
 *   node --import ./scripts/chart-export/loader.mjs \
 *     scripts/chart-export/export-charts.ts --lessons --rudiments --out ./dist-charts
 *
 * Options:
 *   --out <dir>         where to write (default ./dist-charts)
 *   --zip [file]        one .zip instead of loose folders
 *   --lessons           every drum lesson that has a pattern (default when
 *                       neither --lessons nor --rudiments is given)
 *   --rudiments         all 40 rudiments
 *   --lesson <id>       one lesson by id, repeatable
 *   --rudiment <id>     one rudiment by numeric id, repeatable
 *   --bpm <n>           override the tempo
 *   --repeats <n>       how many times each pattern is played
 *   --subdivision <s>   32nd | 16th | triplet | 8th | quarter (rudiments)
 *   --quiet
 *
 * Charts come out with a silent stem: rendering audio needs a SoundFont and an
 * audio device, which the app has and a CLI does not. The folders load and
 * play; you just supply the sound.
 */

import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {rudiments} from '@/pages/rudiments/rudimentData';
import {lessonToChartDocument, isExportable} from '@/lib/chart-export/fromLesson';
import {type Subdivision} from '@/lib/chart-export/fromRudiment';
import {buildRudimentFolders} from '@/lib/chart-export/presets';
import {
  buildChartFolder,
  zipChartFolders,
  type ChartFolder,
} from '@/lib/chart-export/chartFolder';
import type {Lesson} from '@/lib/curriculum/types';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const DRUM_UNITS = join(ROOT, 'src/curriculum/drums/units');

interface Options {
  out: string;
  zip: string | null;
  lessons: boolean;
  rudiments: boolean;
  lessonIds: string[];
  rudimentIds: number[];
  bpm?: number;
  repeats?: number;
  subdivision?: Subdivision;
  quiet: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    out: './dist-charts',
    zip: null,
    lessons: false,
    rudiments: false,
    lessonIds: [],
    rudimentIds: [],
    quiet: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i];
    switch (arg) {
      case '--out': options.out = value(); break;
      case '--zip':
        options.zip = argv[i + 1]?.startsWith('--') || !argv[i + 1]
          ? 'charts.zip'
          : value();
        break;
      case '--lessons': options.lessons = true; break;
      case '--rudiments': options.rudiments = true; break;
      case '--lesson': options.lessonIds.push(value()); options.lessons = true; break;
      case '--rudiment': options.rudimentIds.push(Number(value())); options.rudiments = true; break;
      case '--bpm': options.bpm = Number(value()); break;
      case '--repeats': options.repeats = Number(value()); break;
      case '--subdivision': options.subdivision = value() as Subdivision; break;
      case '--quiet': options.quiet = true; break;
      default:
        throw new Error(`Unknown option "${arg}"`);
    }
  }

  if (!options.lessons && !options.rudiments) options.lessons = true;
  return options;
}

/**
 * Mirrors parseLesson from src/lib/curriculum/loader.ts. That module cannot be
 * imported here: it calls import.meta.glob at module scope, which only exists
 * under Vite.
 */
function parseLesson(raw: unknown): Lesson {
  const r = raw as {id: string; title: string; xp?: number; activities: Lesson['activities']};
  return {id: r.id, title: r.title, xp: r.xp ?? 10, activities: r.activities};
}

/**
 * Walks the curriculum tree directly.
 */
function loadDrumLessons(): {unitTitle: string; lesson: Lesson}[] {
  const result: {unitTitle: string; lesson: Lesson}[] = [];
  for (const unitDir of readdirSync(DRUM_UNITS).sort()) {
    const unitPath = join(DRUM_UNITS, unitDir);
    let unitTitle = unitDir;
    try {
      unitTitle = JSON.parse(readFileSync(join(unitPath, 'unit.json'), 'utf8')).title ?? unitDir;
    } catch {
      // A unit without metadata still has lessons worth exporting.
    }
    const lessonsDir = join(unitPath, 'lessons');
    for (const file of readdirSync(lessonsDir).sort()) {
      if (!file.endsWith('.json')) continue;
      const raw = JSON.parse(readFileSync(join(lessonsDir, file), 'utf8'));
      result.push({unitTitle, lesson: parseLesson(raw)});
    }
  }
  return result;
}

function writeFolder(root: string, folder: ChartFolder): void {
  const dir = join(root, folder.name);
  mkdirSync(dir, {recursive: true});
  for (const file of folder.files) {
    writeFileSync(join(dir, file.name), file.data);
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const log = (message: string) => {
    if (!options.quiet) console.log(message);
  };

  const folders: ChartFolder[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  if (options.lessons) {
    for (const {unitTitle, lesson} of loadDrumLessons()) {
      if (options.lessonIds.length && !options.lessonIds.includes(lesson.id)) continue;
      if (!isExportable(lesson)) {
        skipped.push(`${lesson.id} (no drum patterns)`);
        continue;
      }
      const {doc, lengthMs, unmappedTracks} = lessonToChartDocument(lesson, {
        unitTitle,
        repeats: options.repeats,
      });
      if (options.bpm) doc.tempos = [{tick: 0, bpm: options.bpm}];
      if (unmappedTracks.length) {
        warnings.push(`${lesson.id}: skipped unmappable tracks ${unmappedTracks.join(', ')}`);
      }
      folders.push(buildChartFolder(doc, {lengthMs}));
    }
  }

  if (options.rudiments) {
    const selected = options.rudimentIds.length
      ? rudiments.filter(r => options.rudimentIds.includes(r.id))
      : rudiments;
    folders.push(
      ...buildRudimentFolders(selected, {
        bpm: options.bpm,
        subdivision: options.subdivision,
        repeats: options.repeats,
      }),
    );
  }

  if (folders.length === 0) {
    console.error('Nothing matched. Check --lesson / --rudiment ids.');
    process.exit(1);
  }

  const out = resolve(options.out);
  if (options.zip) {
    const target = options.zip.endsWith('.zip')
      ? resolve(options.zip.includes('/') ? options.zip : join(out, options.zip))
      : resolve(`${options.zip}.zip`);
    mkdirSync(dirname(target), {recursive: true});
    writeFileSync(target, zipChartFolders(folders));
    log(`Wrote ${folders.length} charts to ${target}`);
  } else {
    mkdirSync(out, {recursive: true});
    for (const folder of folders) writeFolder(out, folder);
    log(`Wrote ${folders.length} chart folders to ${out}`);
  }

  for (const folder of folders) {
    for (const issue of folder.issues) {
      if (issue.severity === 'error') {
        console.error(`error  ${folder.name}: ${issue.message}`);
      }
    }
  }
  for (const warning of warnings) console.warn(`warn   ${warning}`);
  for (const folder of folders) {
    for (const note of folder.notes) console.warn(`warn   ${note}`);
  }

  // Chord and silence warnings repeat per tick; a count is the useful form.
  const warningCounts = new Map<string, number>();
  for (const folder of folders) {
    for (const issue of folder.issues) {
      if (issue.severity !== 'warning') continue;
      warningCounts.set(issue.type, (warningCounts.get(issue.type) ?? 0) + 1);
    }
  }
  for (const [type, count] of warningCounts) {
    log(`warn   ${type}: ${count} across all charts`);
  }

  if (skipped.length) log(`Skipped ${skipped.length} lessons with nothing to play`);
  if (folders.some(f => f.issues.some(i => i.severity === 'error'))) process.exitCode = 1;
}

main();
