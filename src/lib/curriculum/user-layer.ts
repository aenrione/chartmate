/**
 * User curriculum layer.
 *
 * Bundled curriculum stays build-time (`src/curriculum/**`, baked by the Vite
 * glob in loader.ts) — that is the shipped default. This module adds a writable
 * layer on top, stored on disk in the *same JSON shape* as the bundled files so
 * a bundled lesson can be read and used verbatim as a template:
 *
 *   <appData>/curriculum/<instrument>/skill-tree.json
 *   <appData>/curriculum/<instrument>/units/<unitId>/lessons/<lessonId>.json
 *
 * Merge rule: a user file with the same id *overrides* the bundled one; new ids
 * are additive. Deleting a user file restores the bundled version.
 */
import {appDataDir, join} from '@tauri-apps/api/path';
import {exists, mkdir, readDir, readTextFile, remove, writeTextFile} from '@tauri-apps/plugin-fs';

import type {Instrument, Lesson, UnitMeta} from './types';

const INSTRUMENTS: Instrument[] = ['guitar', 'drums', 'theory'];

/** Ids become path segments — keep them boring. */
const ID_RE = /^[a-z0-9][a-z0-9-]*$/i;

function assertId(label: string, value: unknown): string {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new Error(
      `${label} must match ${ID_RE} (letters, digits, hyphens; no slashes or dots) — got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

export function assertInstrument(value: unknown): Instrument {
  if (!INSTRUMENTS.includes(value as Instrument)) {
    throw new Error(`instrument must be one of ${INSTRUMENTS.join(', ')} — got ${JSON.stringify(value)}`);
  }
  return value as Instrument;
}

// ── Validation ───────────────────────────────────────────────────────────────

function assertArray(label: string, value: unknown): any[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function assertString(label: string, value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

/**
 * Reject malformed activities up front. Without this an agent can write JSON
 * that type-checks as `Activity` only at the cast in parseLesson and then
 * throws inside the renderer, which is a much worse place to find out.
 */
function validateActivity(a: any, where: string): void {
  if (!a || typeof a !== 'object') throw new Error(`${where} must be an object`);

  switch (a.type) {
    case 'theory-card':
      assertString(`${where}.markdown`, a.markdown);
      break;

    case 'chord-diagram': {
      assertString(`${where}.chord`, a.chord);
      const frets = assertArray(`${where}.frets`, a.frets);
      if (frets.length !== 6 || frets.some(f => typeof f !== 'number')) {
        throw new Error(`${where}.frets must be 6 numbers (high e to low E, -1 = muted, 0 = open)`);
      }
      break;
    }

    case 'quiz': {
      assertString(`${where}.question`, a.question);
      const choices = assertArray(`${where}.choices`, a.choices);
      if (choices.length < 2) throw new Error(`${where}.choices needs at least 2 options`);
      if (typeof a.answer !== 'number' || a.answer < 0 || a.answer >= choices.length) {
        throw new Error(`${where}.answer must be a 0-based index into choices (0..${choices.length - 1})`);
      }
      break;
    }

    case 'fretboard-drill': {
      const notes = assertArray(`${where}.notes`, a.notes);
      if (!notes.length) throw new Error(`${where}.notes must not be empty`);
      break;
    }

    case 'tab-exercise':
      assertString(`${where}.compositionId`, a.compositionId);
      assertString(`${where}.instruction`, a.instruction);
      if (!/^(db|bundled):/.test(a.compositionId)) {
        throw new Error(
          `${where}.compositionId must look like "db:<id>" (see save_tab_to_library / list_compositions)`,
        );
      }
      break;

    case 'drum-pattern': {
      const tracks = assertArray(`${where}.tracks`, a.tracks);
      if (!tracks.length) throw new Error(`${where}.tracks must not be empty`);
      tracks.forEach((t: any, i: number) => {
        assertString(`${where}.tracks[${i}].name`, t?.name);
        assertString(`${where}.tracks[${i}].pattern`, t?.pattern);
        if (/[^xXo-]/.test(t.pattern)) {
          throw new Error(
            `${where}.tracks[${i}].pattern may only contain x (hit), X (accent), o (ghost), - (rest)`,
          );
        }
      });
      break;
    }

    default:
      throw new Error(
        `${where}.type is "${a?.type}" — must be one of theory-card, chord-diagram, quiz, ` +
          `fretboard-drill, tab-exercise, drum-pattern`,
      );
  }
}

export function validateLesson(raw: unknown): Lesson {
  const r = raw as any;
  if (!r || typeof r !== 'object') throw new Error('lesson must be an object');
  assertId('lesson.id', r.id);
  assertString('lesson.title', r.title);
  if (r.xp !== undefined && typeof r.xp !== 'number') throw new Error('lesson.xp must be a number');

  const activities = assertArray('lesson.activities', r.activities);
  if (!activities.length) throw new Error('lesson.activities must not be empty');
  activities.forEach((a, i) => validateActivity(a, `lesson.activities[${i}]`));

  return {id: r.id, title: r.title, xp: r.xp ?? 10, activities: activities as Lesson['activities']};
}

export function validateUnit(raw: unknown): UnitMeta {
  const r = raw as any;
  if (!r || typeof r !== 'object') throw new Error('unit must be an object');
  assertId('unit.id', r.id);
  assertString('unit.title', r.title);
  const lessons = assertArray('unit.lessons', r.lessons ?? []);
  lessons.forEach((l, i) => assertId(`unit.lessons[${i}]`, l));
  const prerequisites = assertArray('unit.prerequisites', r.prerequisites ?? []);
  prerequisites.forEach((p, i) => assertId(`unit.prerequisites[${i}]`, p));

  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    icon: r.icon,
    prerequisites,
    lessons,
  };
}

// ── Paths ────────────────────────────────────────────────────────────────────

async function instrumentDir(instrument: Instrument): Promise<string> {
  return join(await appDataDir(), 'curriculum', instrument);
}

async function lessonPath(instrument: Instrument, unitId: string, lessonId: string): Promise<string> {
  return join(await instrumentDir(instrument), 'units', unitId, 'lessons', `${lessonId}.json`);
}

async function skillTreePath(instrument: Instrument): Promise<string> {
  return join(await instrumentDir(instrument), 'skill-tree.json');
}

// ── Cache ────────────────────────────────────────────────────────────────────

type InstrumentCache = {tree: UnitMeta[] | null; lessons: Map<string, Lesson>};
const cache = new Map<Instrument, InstrumentCache>();

/** Call after any write so the next load sees fresh files. */
export function invalidateUserCurriculum(instrument?: Instrument): void {
  if (instrument) cache.delete(instrument);
  else cache.clear();
}

async function readJson(path: string): Promise<unknown | null> {
  if (!(await exists(path))) return null;
  try {
    return JSON.parse(await readTextFile(path));
  } catch (err) {
    // A corrupt user file must never take down the bundled tree — but it must
    // also not vanish without a word, or "my lesson didn't show up" is unbuggable.
    console.warn(`[curriculum] ignoring unreadable user file ${path}:`, err);
    return null;
  }
}

// ── Reads (consumed by loader.ts) ────────────────────────────────────────────

/** User-defined units, or null when the user has no skill-tree override. */
export async function readUserUnits(instrument: Instrument): Promise<UnitMeta[] | null> {
  const cached = cache.get(instrument);
  if (cached && cached.tree !== undefined) return cached.tree;

  const raw = (await readJson(await skillTreePath(instrument))) as any;
  const units = Array.isArray(raw?.units)
    ? (raw.units
        .map((u: unknown) => {
          try {
            return validateUnit(u);
          } catch (err) {
            console.warn(`[curriculum] skipping invalid user unit in ${instrument}:`, err);
            return null;
          }
        })
        .filter(Boolean) as UnitMeta[])
    : null;

  cache.set(instrument, {tree: units, lessons: cached?.lessons ?? new Map()});
  return units;
}

/** A user lesson override, or null to fall through to the bundled one. */
export async function readUserLesson(
  instrument: Instrument,
  unitId: string,
  lessonId: string,
): Promise<Lesson | null> {
  const key = `${unitId}/${lessonId}`;
  const entry = cache.get(instrument);
  if (entry?.lessons.has(key)) return entry.lessons.get(key)!;

  const raw = await readJson(await lessonPath(instrument, unitId, lessonId));
  if (raw === null) return null;

  let lesson: Lesson;
  try {
    lesson = validateLesson(raw);
  } catch (err) {
    console.warn(`[curriculum] ignoring invalid user lesson ${unitId}/${lessonId}:`, err);
    return null;
  }

  const lessons = entry?.lessons ?? new Map<string, Lesson>();
  lessons.set(key, lesson);
  cache.set(instrument, {tree: entry?.tree ?? null, lessons});
  return lesson;
}

// ── Writes (consumed by the MCP tools) ───────────────────────────────────────

export async function writeUserLesson(
  instrument: Instrument,
  unitId: string,
  lessonId: string,
  raw: unknown,
): Promise<{path: string; lesson: Lesson}> {
  assertId('unitId', unitId);
  assertId('lessonId', lessonId);
  const lesson = validateLesson({...(raw as object), id: lessonId});

  const path = await lessonPath(instrument, unitId, lessonId);
  await mkdir(await join(await instrumentDir(instrument), 'units', unitId, 'lessons'), {
    recursive: true,
  });
  await writeTextFile(path, JSON.stringify(lesson, null, 2));
  invalidateUserCurriculum(instrument);
  return {path, lesson};
}

export async function deleteUserLesson(
  instrument: Instrument,
  unitId: string,
  lessonId: string,
): Promise<boolean> {
  const path = await lessonPath(instrument, unitId, lessonId);
  if (!(await exists(path))) return false;
  await remove(path);
  invalidateUserCurriculum(instrument);
  return true;
}

/** Add or replace a unit in the user skill-tree override, preserving the rest. */
export async function upsertUserUnit(instrument: Instrument, raw: unknown): Promise<UnitMeta> {
  const unit = validateUnit(raw);
  const existing = (await readUserUnits(instrument)) ?? [];
  // Replace in place: units render in file order, so a re-upsert must not move to the end.
  const next = existing.some(u => u.id === unit.id)
    ? existing.map(u => (u.id === unit.id ? unit : u))
    : existing.concat(unit);

  const path = await skillTreePath(instrument);
  await mkdir(await instrumentDir(instrument), {recursive: true});
  await writeTextFile(
    path,
    JSON.stringify({instrument, version: 'user', units: next}, null, 2),
  );
  invalidateUserCurriculum(instrument);
  return unit;
}

/** Every user-authored lesson on disk, as "<unitId>/<lessonId>" keys. */
export async function listUserLessonKeys(instrument: Instrument): Promise<string[]> {
  const unitsRoot = await join(await instrumentDir(instrument), 'units');
  if (!(await exists(unitsRoot))) return [];

  const keys: string[] = [];
  for (const unitEntry of await readDir(unitsRoot)) {
    if (!unitEntry.isDirectory) continue;
    const lessonsDir = await join(unitsRoot, unitEntry.name, 'lessons');
    if (!(await exists(lessonsDir))) continue;
    for (const file of await readDir(lessonsDir)) {
      if (file.isFile && file.name.endsWith('.json')) {
        keys.push(`${unitEntry.name}/${file.name.replace(/\.json$/, '')}`);
      }
    }
  }
  return keys;
}

export async function userCurriculumRoot(): Promise<string> {
  return join(await appDataDir(), 'curriculum');
}
