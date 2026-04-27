# Lessons & Curriculum System Design

**Date:** 2026-04-27
**Status:** Draft — pending user approval

---

## 1. Overview

A self-directed practice program system for ChartMate. Users build structured learning programs (like a mini Berklee semester they design themselves), work through ordered units, track goal completion per unit, and schedule practice sessions on a calendar. In-app reminders show upcoming sessions on the dashboard.

**Not in scope (this phase):**
- OS/push notifications (designed for future ntfy-style agent)
- CLI interface
- AI-generated programs
- Teacher → student assignment flow

---

## 2. Core Concepts

### Program
Top-level curriculum container. A program has ordered units and a status (`draft` → `active` → `archived`). You can have multiple programs but only one active at a time. Optional instrument tag. Flexible pacing: units have a suggested duration but you advance manually.

### Unit
A block of study within a program — think "Week 1: Open Chords" or "Module 3: Barre Chords." Has an ordered list of goals, a suggested duration in days, and tracks when you started and completed it. You mark a unit complete yourself when you feel ready.

### Goal
A single actionable item within a unit. Types:
- `song` — links to a repertoire item by id
- `tab` — links to a tab composition by id
- `learn_lesson` — links to an existing curriculum lesson by `instrument/unitId/lessonId`
- `exercise` — links to a built-in tool by route path (e.g. `/guitar/fretboard`, `/guitar/ear`)
- `custom` — free text, no link

Each goal has an optional `target` field (e.g. "120 bpm clean", "hands separate, first 16 bars") and optional `notes`. Goals are checked off individually; completing all goals does not auto-complete the unit.

### Session
A scheduled practice block on a specific date. Optionally linked to a program unit (so you can tag it "this session is for Unit 2"). Has an optional time, planned duration, completion timestamp, and post-session notes field. Sessions populate the calendar.

---

## 3. Data Model

### Migration 036 — `practice_programs`

```sql
CREATE TABLE practice_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  instrument TEXT,                          -- 'guitar' | 'drums' | NULL (agnostic)
  status TEXT NOT NULL DEFAULT 'draft',    -- 'draft' | 'active' | 'archived'
  started_at TEXT,                          -- ISO date, set when user activates
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE program_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES practice_programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL,
  suggested_days INTEGER,                   -- guidance only, not enforced
  started_at TEXT,                          -- ISO date, set when user starts this unit
  completed_at TEXT,                        -- ISO date, set when user marks done
  created_at TEXT NOT NULL
);

CREATE TABLE unit_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES program_units(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom',     -- 'song' | 'tab' | 'learn_lesson' | 'exercise' | 'custom'
  ref_id TEXT,                              -- see Ref ID format below
  target TEXT,                              -- e.g. "120 bpm", "first 16 bars"
  notes TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,                        -- NULL = incomplete
  created_at TEXT NOT NULL
);

CREATE TABLE practice_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  unit_id INTEGER REFERENCES program_units(id) ON DELETE SET NULL,
  scheduled_date TEXT NOT NULL,            -- YYYY-MM-DD
  scheduled_time TEXT,                     -- HH:MM, optional
  duration_minutes INTEGER,                -- planned duration
  completed_at TEXT,                       -- NULL = not done
  notes TEXT,                              -- post-session notes
  created_at TEXT NOT NULL
);

CREATE INDEX idx_practice_sessions_date ON practice_sessions(scheduled_date);
CREATE INDEX idx_program_units_program ON program_units(program_id, order_index);
CREATE INDEX idx_unit_goals_unit ON unit_goals(unit_id, order_index);
```

### TypeScript Types (Kysely)

```typescript
interface PracticeProgram {
  id: Generated<number>;
  title: string;
  description: string | null;
  instrument: string | null;
  status: string;           // 'draft' | 'active' | 'archived'
  started_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ProgramUnit {
  id: Generated<number>;
  program_id: number;
  title: string;
  description: string | null;
  order_index: number;
  suggested_days: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface UnitGoal {
  id: Generated<number>;
  unit_id: number;
  title: string;
  type: string;             // 'song' | 'tab' | 'learn_lesson' | 'exercise' | 'custom'
  ref_id: string | null;
  target: string | null;
  notes: string | null;
  order_index: number;
  completed_at: string | null;
  created_at: string;
}

interface PracticeSession {
  id: Generated<number>;
  title: string | null;
  unit_id: number | null;
  scheduled_date: string;   // YYYY-MM-DD
  scheduled_time: string | null;
  duration_minutes: number | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}
```

### Goal Ref ID Format

| `type`         | `ref_id` format                         | Example                         |
|----------------|-----------------------------------------|---------------------------------|
| `song`         | stringified repertoire item id          | `"42"`                          |
| `tab`          | stringified tab_compositions id         | `"7"`                           |
| `learn_lesson` | `"<instrument>/<unitId>/<lessonId>"`    | `"guitar/01-open-chords/02-g-chord"` |
| `exercise`     | route path                              | `"/guitar/fretboard"`           |
| `custom`       | `null`                                  | —                               |

---

## 4. DB Access Layer

New file: `src/lib/local-db/programs.ts`

Functions:

```typescript
// Programs
getPrograms(): Promise<PracticeProgram[]>
getActiveProgram(): Promise<PracticeProgram | null>
getProgram(id: number): Promise<PracticeProgram | null>
createProgram(data): Promise<number>
updateProgram(id, data): Promise<void>
activateProgram(id): Promise<void>        // sets status='active', started_at=now; sets any other active program to 'draft' (one active at a time, enforced at app layer)
archiveProgram(id): Promise<void>

// Units
getUnitsForProgram(programId): Promise<ProgramUnit[]>
getUnit(id): Promise<ProgramUnit | null>
createUnit(data): Promise<number>
updateUnit(id, data): Promise<void>
reorderUnits(programId, orderedIds): Promise<void>
startUnit(id): Promise<void>              // sets started_at=now
completeUnit(id): Promise<void>           // sets completed_at=now
deleteUnit(id): Promise<void>

// Goals
getGoalsForUnit(unitId): Promise<UnitGoal[]>
createGoal(data): Promise<number>
updateGoal(id, data): Promise<void>
completeGoal(id): Promise<void>           // sets completed_at=now
uncompleteGoal(id): Promise<void>         // sets completed_at=null
reorderGoals(unitId, orderedIds): Promise<void>
deleteGoal(id): Promise<void>

// Sessions
getSessionsForDateRange(from: string, to: string): Promise<PracticeSession[]>
getSessionsForDate(date: string): Promise<PracticeSession[]>
getUpcomingSessions(limit?: number): Promise<PracticeSession[]>   // from today forward
createSession(data): Promise<number>
updateSession(id, data): Promise<void>
completeSession(id, notes?: string): Promise<void>
deleteSession(id): Promise<void>
```

---

## 5. UI Architecture

### Routes (new, added to App.tsx)

```
/programs                                  → ProgramsPage
/programs/:id                              → ProgramDetailPage
/programs/:id/units/:unitId               → UnitDetailPage
/calendar                                  → CalendarPage
```

### Pages

#### `ProgramsPage` (`src/pages/programs/ProgramsPage.tsx`)
- Lists all programs grouped by status (Active → Draft → Archived)
- Each card: title, instrument badge, unit count, goal completion ratio, status badge
- Active program has a highlighted card with current unit name
- "New Program" button → modal (title, description, instrument, create as draft)
- Clicking a program card → `ProgramDetailPage`

#### `ProgramDetailPage` (`src/pages/programs/ProgramDetailPage.tsx`)
- Header: title, description, instrument, status, activate/archive actions
- Progress bar: completed units / total units
- Ordered list of `UnitCard` components (drag-to-reorder deferred to later)
- Each `UnitCard`: title, suggested duration badge, goal count (X/Y complete), status (not started / in progress / complete), chevron → `UnitDetailPage`
- "Add Unit" button at bottom of list
- "Activate Program" button if status is draft; "Archive" if active

#### `UnitDetailPage` (`src/pages/programs/UnitDetailPage.tsx`)
- Header: unit title, description, suggested duration, "Mark Complete" button
- Goals list: ordered `GoalItem` components with checkboxes
- Each `GoalItem`: type icon badge, title, target (if set), notes (if set), "Go" link button (for linked goals)
- "Add Goal" inline form: title, type selector, ref picker (contextual by type), target, notes
- Sessions section: list of sessions linked to this unit + "Schedule Session" shortcut

#### `CalendarPage` (`src/pages/calendar/CalendarPage.tsx`)
- Month view by default, week view toggle
- Header: month/year nav with prev/next arrows
- Grid: days of month. Each day with sessions renders session chips (title or "Practice session")
- Click on empty day → `SessionModal` (create)
- Click on session chip → `SessionModal` (view/edit/complete)
- Sidebar (or bottom sheet on mobile): "Today" section showing today's sessions + "This Week" upcoming list

#### `SessionModal` (component, not a page)
- Fields: title (optional), date, time (optional), duration (optional), link to unit (optional dropdown of active program's units)
- "Mark Complete" + notes textarea when completing
- "Delete" with confirm

### Reusable Components

```
src/components/programs/
  ProgramCard.tsx         -- card for ProgramsPage list
  UnitCard.tsx            -- expandable unit row in ProgramDetailPage
  GoalItem.tsx            -- single goal row with checkbox and type icon
  GoalTypeIcon.tsx        -- icon/badge per goal type
  AddGoalForm.tsx         -- inline form for creating goals
  SessionModal.tsx        -- create/view/edit/complete session

src/components/calendar/
  CalendarGrid.tsx        -- month/week grid rendering
  SessionChip.tsx         -- session pill on a calendar day
```

### In-App Reminder Widget

New component: `src/components/programs/UpcomingSessionsWidget.tsx`

Placed on `LearnPage` (existing `/learn` hub) as a collapsible section at the top:
- "Today" row: sessions scheduled for today with status (done/pending)
- "This week" row: next 5 upcoming sessions
- "Current unit" row: active program name + current unit title + goal completion ratio (X/Y goals done)
- Clicking any session → `CalendarPage` scrolled to that date
- Hidden if no active program and no upcoming sessions

---

## 6. Navigation

Add two entries to the main nav alongside existing items:

| Label     | Route       |
|-----------|-------------|
| Programs  | `/programs` |
| Calendar  | `/calendar` |

The existing `/learn` route keeps its place. No restructuring of current nav — these are additive entries.

---

## 7. Integration Points with Existing Systems

| Goal Type      | Integration                                                       |
|----------------|-------------------------------------------------------------------|
| `learn_lesson` | `ref_id` = `guitar/01-open-chords/02-g-chord`. "Go" button navigates to `/learn/lesson/:instrument/:unitId/:lessonId` |
| `tab`          | `ref_id` = tab_compositions.id. "Go" navigates to `/tab-editor/:id` |
| `song`         | Deferred from v1 AddGoalForm — no repertoire ref picker yet. DB and types support it; UI for creating song goals ships in a follow-up. |
| `exercise`     | `ref_id` = route path. "Go" navigates directly to that route (`/guitar/fretboard`, `/guitar/ear`, etc.) |
| `custom`       | No link. Checkbox only.                                           |

The `learn_progress` table is read-only from this system — goals of type `learn_lesson` can check completion status via `isLessonCompleted()` from the existing `learn.ts` module to auto-show a completion indicator on the goal.

---

## 8. File Structure

```
src/
  pages/
    programs/
      ProgramsPage.tsx
      ProgramDetailPage.tsx
      UnitDetailPage.tsx
    calendar/
      CalendarPage.tsx
  components/
    programs/
      ProgramCard.tsx
      UnitCard.tsx
      GoalItem.tsx
      GoalTypeIcon.tsx
      AddGoalForm.tsx
      SessionModal.tsx
      UpcomingSessionsWidget.tsx
    calendar/
      CalendarGrid.tsx
      SessionChip.tsx
  lib/
    local-db/
      programs.ts
      migrations/
        036_practice_programs.ts
```

---

## 9. Out of Scope (Future)

- **CLI / agent interface** — query sessions, log practice from terminal. Design: a thin JSON-output CLI reading the same SQLite DB.
- **OS notifications** — ntfy agent or system daemon reading `practice_sessions` and pushing alerts at `scheduled_time`.
- **AI program suggestions** — agent analyzes `learn_progress`, XP ledger, and practice history to suggest next program/unit.
- **Drag-to-reorder** — units and goals support `order_index` in the DB; UI reordering deferred.
- **Deep link to repertoire item** — `/guitar/repertoire/:id` doesn't exist yet; `song` goals navigate to the list for now.
- **Song goal type in AddGoalForm** — `song` type is in the DB schema but the AddGoalForm will not expose it in v1 (no repertoire ref picker). Use `custom` for songs in v1. Add in a follow-up once `/guitar/repertoire/:id` deep link exists.
