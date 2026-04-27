import type {Instrument, SkillTree, Lesson, LoadedUnit, UnitMeta, Activity} from './types';

// Vite glob imports — resolved at build time
const skillTreeModules = import.meta.glob<{default: unknown}>(
  '/src/curriculum/*/skill-tree.json',
  {eager: true},
);

const lessonModules = import.meta.glob<{default: unknown}>(
  '/src/curriculum/*/units/*/lessons/*.json',
  {eager: true},
);

// ── Parsers (pure, testable) ──────────────────────────────────────────────────

export function parseSkillTree(raw: unknown): SkillTree {
  const r = raw as any;
  return {
    instrument: r.instrument as Instrument,
    version: r.version as string,
    units: (r.units as any[]).map(u => ({
      id: u.id,
      title: u.title,
      description: u.description ?? '',
      icon: u.icon,
      prerequisites: u.prerequisites ?? [],
      lessons: u.lessons ?? [],
    })),
  };
}

export function parseLesson(raw: unknown): Lesson {
  const r = raw as any;
  return {
    id: r.id,
    title: r.title,
    xp: r.xp ?? 10,
    activities: (r.activities as any[]).map(a => a as Activity),
  };
}

export function resolveLessonId(fileName: string): string {
  return fileName.replace(/\.json$/, '');
}

// ── Loaders ──────────────────────────────────────────────────────────────────

export async function loadSkillTree(instrument: Instrument): Promise<SkillTree> {
  const key = `/src/curriculum/${instrument}/skill-tree.json`;
  const mod = skillTreeModules[key];
  if (!mod) throw new Error(`No skill tree found for instrument: ${instrument}`);
  return parseSkillTree(mod.default);
}

export async function loadLesson(
  instrument: Instrument,
  unitId: string,
  lessonId: string,
): Promise<Lesson> {
  const key = `/src/curriculum/${instrument}/units/${unitId}/lessons/${lessonId}.json`;
  const mod = lessonModules[key];
  if (!mod) throw new Error(`Lesson not found: ${instrument}/${unitId}/${lessonId}`);
  return parseLesson(mod.default);
}

export async function loadUnit(instrument: Instrument, unitMeta: UnitMeta): Promise<LoadedUnit> {
  const lessons = await Promise.all(
    unitMeta.lessons.map(lessonId => loadLesson(instrument, unitMeta.id, lessonId)),
  );
  return {...unitMeta, loadedLessons: lessons};
}

export async function loadAllUnits(instrument: Instrument): Promise<LoadedUnit[]> {
  const tree = await loadSkillTree(instrument);
  return Promise.all(tree.units.map(u => loadUnit(instrument, u)));
}
