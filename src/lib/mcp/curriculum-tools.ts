import {loadSkillTree, loadLesson} from '@/lib/curriculum/loader';
import {
  assertInstrument,
  deleteUserLesson,
  listUserLessonKeys,
  readUserUnits,
  upsertUserUnit,
  userCurriculumRoot,
  writeUserLesson,
} from '@/lib/curriculum/user-layer';

import {text, type McpTool} from './types';

/** Authoring reference handed to agents verbatim. Mirrors curriculum/types.ts. */
export const CURRICULUM_GUIDE = `
# Authoring Chartmate curriculum

Chartmate ships a built-in curriculum for three instruments: guitar, drums, theory.
Those bundled lessons are compiled into the app and you cannot edit them.

What you CAN do is write a **user layer** that sits on top:
- A lesson you write with the same (instrument, unitId, lessonId) as a bundled
  lesson **overrides** it.
- A lesson with a new id is **additive**.
- delete_custom_lesson removes your version and the bundled one comes back.
- Your files live as plain JSON on disk, same shape as the bundled ones, so you
  can read a bundled lesson with get_lesson and use it as a template.

## Lesson shape

{ "id": "<lessonId>", "title": "...", "xp": 10, "activities": [ ... ] }

Ids must be letters/digits/hyphens only — they become directory and file names.

## Activity types

theory-card     { type, markdown, image?, srs? }
                Markdown explainer. srs:true enrolls it in spaced repetition.

chord-diagram   { type, chord, frets, fingers?, srs? }
                frets: exactly 6 numbers, high e to low E. -1 = muted, 0 = open.
                fingers: 6 numbers, 1-4, 0 = none.

quiz            { type, question, choices, answer, explanation?, srs? }
                answer is a 0-based index into choices. Needs >= 2 choices.

fretboard-drill { type, notes, requiredCorrect? }
                notes: note names with octave, e.g. ["G2","B2","D3"].

tab-exercise    { type, compositionId, instruction, unlockAfterSeconds? }
                compositionId is "db:<id>" — get one from list_compositions, or
                create one by downloading a tab with save_tab_to_library.

drum-pattern    { type, tracks, title?, description?, timeSignature?,
                  subdivisions?, bpm?, srs? }
                tracks: [{ name, pattern, color? }]
                pattern is one character per subdivision, ONLY these four:
                  x = hit   X = accent   o = ghost note   - = rest
                subdivisions: 8 = eighth-note grid, 16 = sixteenth. Default 8.

## Units

A unit groups ordered lessons and gates them behind prerequisites:

{ "id": "...", "title": "...", "description": "...", "icon": "?",
  "prerequisites": ["<other unit id>"], "lessons": ["<lessonId>", ...] }

A lesson only appears in the app once its id is listed in a unit's "lessons"
array. So the normal flow is:

  1. list_curriculum            see what exists and what ids are taken
  2. get_lesson                 read a bundled lesson as a worked example
  3. upsert_lesson              write each lesson
  4. upsert_unit                create/extend the unit listing those lesson ids

Everything is validated on write — a bad activity is rejected with a specific
message rather than silently breaking the Learn page.
`.trim();

export const CURRICULUM_TOOLS: McpTool[] = [
  {
    name: 'curriculum_guide',
    description:
      'Read this before authoring curriculum. Explains the bundled-vs-user override model, ' +
      'the lesson/unit JSON shapes, and every activity type with its required fields.',
    inputSchema: {type: 'object', properties: {}},
    async run() {
      return text(CURRICULUM_GUIDE);
    },
  },

  {
    name: 'list_curriculum',
    description:
      'List units and lesson ids for an instrument, after merging bundled and user content. ' +
      'Shows which lessons you have overridden or added, so you can pick a free id.',
    inputSchema: {
      type: 'object',
      properties: {
        instrument: {type: 'string', description: 'guitar, drums, or theory'},
      },
      required: ['instrument'],
    },
    async run({instrument}) {
      const inst = assertInstrument(instrument);
      const tree = await loadSkillTree(inst);
      const customKeys = new Set(await listUserLessonKeys(inst));
      const customUnitIds = new Set(((await readUserUnits(inst)) ?? []).map(u => u.id));

      return text({
        instrument: inst,
        storageRoot: await userCurriculumRoot(),
        units: tree.units.map(u => ({
          id: u.id,
          title: u.title,
          prerequisites: u.prerequisites,
          source: customUnitIds.has(u.id) ? 'user' : 'bundled',
          lessons: u.lessons.map(id => ({
            id,
            source: customKeys.has(`${u.id}/${id}`) ? 'user' : 'bundled',
          })),
        })),
      });
    },
  },

  {
    name: 'get_lesson',
    description:
      'Read a single lesson as JSON (user version if one exists, else bundled). Use this to ' +
      'copy the structure of an existing lesson before writing your own.',
    inputSchema: {
      type: 'object',
      properties: {
        instrument: {type: 'string', description: 'guitar, drums, or theory'},
        unitId: {type: 'string'},
        lessonId: {type: 'string'},
      },
      required: ['instrument', 'unitId', 'lessonId'],
    },
    async run({instrument, unitId, lessonId}) {
      const inst = assertInstrument(instrument);
      return text(await loadLesson(inst, unitId, lessonId));
    },
  },

  {
    name: 'upsert_lesson',
    description:
      'Create or replace a user lesson. Overrides the bundled lesson when ids collide. ' +
      'Activities are validated — read curriculum_guide first. Remember the lesson only ' +
      'shows up in the app once upsert_unit lists its id.',
    inputSchema: {
      type: 'object',
      properties: {
        instrument: {type: 'string', description: 'guitar, drums, or theory'},
        unitId: {type: 'string', description: 'Unit this lesson belongs to'},
        lessonId: {type: 'string', description: 'Letters, digits, hyphens only'},
        lesson: {
          type: 'object',
          description: 'Lesson body: {title, xp?, activities[]}. See curriculum_guide.',
        },
      },
      required: ['instrument', 'unitId', 'lessonId', 'lesson'],
    },
    async run({instrument, unitId, lessonId, lesson}) {
      const inst = assertInstrument(instrument);
      const {path, lesson: saved} = await writeUserLesson(inst, unitId, lessonId, lesson);
      return text({
        saved: true,
        path,
        lessonId: saved.id,
        activities: saved.activities.length,
        note: `Add "${saved.id}" to unit "${unitId}" with upsert_unit for it to appear.`,
      });
    },
  },

  {
    name: 'upsert_unit',
    description:
      'Create or replace a unit in the user skill tree. The "lessons" array is the ordered ' +
      'list of lesson ids shown to the learner; "prerequisites" are unit ids that must be ' +
      'completed first. Overriding a bundled unit id replaces that unit.',
    inputSchema: {
      type: 'object',
      properties: {
        instrument: {type: 'string', description: 'guitar, drums, or theory'},
        unit: {
          type: 'object',
          description:
            '{id, title, description?, icon?, prerequisites?: string[], lessons: string[]}',
        },
      },
      required: ['instrument', 'unit'],
    },
    async run({instrument, unit}) {
      const inst = assertInstrument(instrument);
      const saved = await upsertUserUnit(inst, unit);
      return text({saved: true, unit: saved});
    },
  },

  {
    name: 'delete_custom_lesson',
    description:
      'Delete a user lesson file. If it was overriding a bundled lesson, the bundled version ' +
      'becomes active again. Bundled lessons themselves can never be deleted.',
    inputSchema: {
      type: 'object',
      properties: {
        instrument: {type: 'string', description: 'guitar, drums, or theory'},
        unitId: {type: 'string'},
        lessonId: {type: 'string'},
      },
      required: ['instrument', 'unitId', 'lessonId'],
    },
    async run({instrument, unitId, lessonId}) {
      const inst = assertInstrument(instrument);
      const deleted = await deleteUserLesson(inst, unitId, lessonId);
      return text(
        deleted
          ? {deleted: true, note: 'Any bundled lesson with this id is active again.'}
          : {deleted: false, note: 'No user lesson existed at that id.'},
      );
    },
  },
];
