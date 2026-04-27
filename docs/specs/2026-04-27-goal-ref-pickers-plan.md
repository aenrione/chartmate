# Goal Ref Pickers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw ID/path inputs in AddGoalForm with user-friendly searchable combobox pickers for tab compositions, curriculum lessons, and saved songs.

**Architecture:** A generic `SearchCombobox` component built on `@radix-ui/react-popover` (no cmdk) powers three thin data-fetching picker components (`TabPicker`, `LessonPicker`, `SongPicker`). Each picker loads its data source on mount, converts rows to `{value, label, sublabel}` options, and calls back with `(value, label)` so `AddGoalForm` can auto-fill the goal title when the field is empty. `GoalItem` gets a song link added to `resolveLink`.

**Tech Stack:** React, TypeScript, `@radix-ui/react-popover` (new dep — consistent with existing Radix suite), Tailwind CSS (Material You tokens), existing DB/curriculum access layers.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/ui/search-combobox.tsx` | Create | Generic searchable dropdown |
| `src/components/programs/ref-pickers/TabPicker.tsx` | Create | Tab composition picker |
| `src/components/programs/ref-pickers/LessonPicker.tsx` | Create | Curriculum lesson picker |
| `src/components/programs/ref-pickers/SongPicker.tsx` | Create | Saved chart picker |
| `src/components/programs/AddGoalForm.tsx` | Modify | Wire pickers, add `instrument` prop, add `song` type |
| `src/components/programs/GoalItem.tsx` | Modify | Add song→`/library/saved-charts` link |
| `src/pages/programs/UnitDetailPage.tsx` | Modify | Pass `instrument` to `AddGoalForm` |

---

## Task 1: Install dep + SearchCombobox component

**Files:**
- Modify: `package.json` (via npm install)
- Create: `src/components/ui/search-combobox.tsx`

- [ ] **Step 1: Install @radix-ui/react-popover**

```bash
cd /Users/alfredoenrione/my-github/mine/chartmate && npm install @radix-ui/react-popover --legacy-peer-deps
```

Expected: package added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Create `src/components/ui/search-combobox.tsx`**

```typescript
import {useState, useRef, useEffect} from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import {ChevronDown, X, Search} from 'lucide-react';
import {cn} from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchComboboxProps {
  options: ComboboxOption[];
  value: string;
  /** Called with (value, label) when an option is selected, or ('', '') when cleared */
  onSelect: (value: string, label: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  className?: string;
}

export default function SearchCombobox({
  options,
  value,
  onSelect,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No results',
  loading = false,
  className,
}: SearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  const filtered = query.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  useEffect(() => {
    if (open) {
      setQuery('');
      // Give the popover a tick to mount before focusing
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [open]);

  function handleSelect(opt: ComboboxOption) {
    onSelect(opt.value, opt.label);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect('', '');
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            'w-full flex items-center justify-between gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-high px-3 py-2 text-sm text-left transition-colors hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container',
            !selected && 'text-on-surface-variant',
            className,
          )}
        >
          <div className="flex-1 min-w-0">
            {selected ? (
              <>
                <div className="truncate text-on-surface">{selected.label}</div>
                {selected.sublabel && (
                  <div className="truncate text-xs text-on-surface-variant">{selected.sublabel}</div>
                )}
              </>
            ) : (
              <span>{placeholder}</span>
            )}
          </div>
          {selected ? (
            <X
              className="h-3.5 w-3.5 text-on-surface-variant shrink-0 hover:text-on-surface"
              onClick={handleClear}
            />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-on-surface-variant shrink-0" />
          )}
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-xl border border-outline-variant/20 bg-surface-container shadow-xl overflow-hidden"
          sideOffset={4}
          align="start"
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-outline-variant/10">
            <Search className="h-3.5 w-3.5 text-on-surface-variant shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant outline-none"
            />
          </div>

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-2 text-xs text-on-surface-variant">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-on-surface-variant">{emptyText}</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm transition-colors hover:bg-surface-container-high',
                    opt.value === value && 'bg-primary/10',
                  )}
                >
                  <div className={cn('font-medium truncate', opt.value === value ? 'text-primary' : 'text-on-surface')}>
                    {opt.label}
                  </div>
                  {opt.sublabel && (
                    <div className="text-xs text-on-surface-variant truncate">{opt.sublabel}</div>
                  )}
                </button>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/alfredoenrione/my-github/mine/chartmate && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/ui/search-combobox.tsx
git commit -m "feat(ui): SearchCombobox — searchable popover dropdown"
```

---

## Task 2: TabPicker

**Files:**
- Create: `src/components/programs/ref-pickers/TabPicker.tsx`

`listCompositions()` is in `src/lib/local-db/tab-compositions.ts`. It returns `TabComposition[]` with `id: number`, `title: string`, `artist: string`. The `refId` stored in the goal is `String(composition.id)`.

- [ ] **Step 1: Create `src/components/programs/ref-pickers/TabPicker.tsx`**

```typescript
import {useEffect, useState} from 'react';
import SearchCombobox from '@/components/ui/search-combobox';
import type {ComboboxOption} from '@/components/ui/search-combobox';
import {listCompositions} from '@/lib/local-db/tab-compositions';

interface TabPickerProps {
  value: string;
  onSelect: (value: string, label: string) => void;
}

export default function TabPicker({value, onSelect}: TabPickerProps) {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCompositions()
      .then(comps =>
        setOptions(
          comps.map(c => ({
            value: String(c.id),
            label: c.title,
            sublabel: c.artist || undefined,
          })),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <SearchCombobox
      options={options}
      value={value}
      onSelect={onSelect}
      placeholder="Search tab compositions…"
      searchPlaceholder="Type title or artist…"
      emptyText={loading ? 'Loading…' : 'No tab compositions found'}
      loading={loading}
    />
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/alfredoenrione/my-github/mine/chartmate && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/programs/ref-pickers/TabPicker.tsx
git commit -m "feat(ui): TabPicker — searchable tab composition selector"
```

---

## Task 3: LessonPicker

**Files:**
- Create: `src/components/programs/ref-pickers/LessonPicker.tsx`

`loadAllUnits(instrument)` is in `src/lib/curriculum/loader.ts`. It returns `LoadedUnit[]`. Each `LoadedUnit` has `id: string`, `title: string`, and `loadedLessons: Lesson[]`. Each `Lesson` has `id: string` and `title: string`.

All lesson JSON files are **eagerly bundled** via Vite glob — calling `loadAllUnits` is synchronous-fast (no network).

The `refId` format is `instrument/unitId/lessonId` (e.g. `guitar/01-open-chords/02-g-chord`). This matches the existing `resolveLink` parser in `GoalItem`.

When `instrument` prop is a known value (`'guitar'` or `'drums'`), load only that instrument. When it is `undefined`, load both and prefix the sublabel with the instrument name.

- [ ] **Step 1: Create `src/components/programs/ref-pickers/LessonPicker.tsx`**

```typescript
import {useEffect, useState} from 'react';
import SearchCombobox from '@/components/ui/search-combobox';
import type {ComboboxOption} from '@/components/ui/search-combobox';
import {loadAllUnits} from '@/lib/curriculum/loader';
import type {Instrument} from '@/lib/curriculum/types';

interface LessonPickerProps {
  value: string;
  onSelect: (value: string, label: string) => void;
  /** When provided, only shows lessons for this instrument */
  instrument?: string;
}

const KNOWN_INSTRUMENTS: Instrument[] = ['guitar', 'drums'];

export default function LessonPicker({value, onSelect, instrument}: LessonPickerProps) {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const instruments: Instrument[] =
        instrument === 'guitar' || instrument === 'drums'
          ? [instrument]
          : KNOWN_INSTRUMENTS;

      const perInstrument = await Promise.all(
        instruments.map(async instr => {
          const units = await loadAllUnits(instr);
          const opts: ComboboxOption[] = [];
          for (const unit of units) {
            for (const lesson of unit.loadedLessons) {
              const sublabel =
                instruments.length > 1
                  ? `${instr.charAt(0).toUpperCase() + instr.slice(1)} — ${unit.title}`
                  : unit.title;
              opts.push({
                value: `${instr}/${unit.id}/${lesson.id}`,
                label: lesson.title,
                sublabel,
              });
            }
          }
          return opts;
        }),
      );

      setOptions(perInstrument.flat());
    }

    load().finally(() => setLoading(false));
  }, [instrument]);

  return (
    <SearchCombobox
      options={options}
      value={value}
      onSelect={onSelect}
      placeholder="Search curriculum lessons…"
      searchPlaceholder="Type lesson or unit name…"
      emptyText={loading ? 'Loading…' : 'No lessons found'}
      loading={loading}
    />
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/alfredoenrione/my-github/mine/chartmate && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/programs/ref-pickers/LessonPicker.tsx
git commit -m "feat(ui): LessonPicker — searchable curriculum lesson selector"
```

---

## Task 4: SongPicker

**Files:**
- Create: `src/components/programs/ref-pickers/SongPicker.tsx`

`getSavedCharts()` is in `src/lib/local-db/saved-charts.ts`. It returns `SavedChartEntry[]`. Each entry has `md5: string`, `name: string`, `artist: string`. The `refId` stored in the goal is the chart `md5`.

- [ ] **Step 1: Create `src/components/programs/ref-pickers/SongPicker.tsx`**

```typescript
import {useEffect, useState} from 'react';
import SearchCombobox from '@/components/ui/search-combobox';
import type {ComboboxOption} from '@/components/ui/search-combobox';
import {getSavedCharts} from '@/lib/local-db/saved-charts';

interface SongPickerProps {
  value: string;
  onSelect: (value: string, label: string) => void;
}

export default function SongPicker({value, onSelect}: SongPickerProps) {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSavedCharts()
      .then(charts =>
        setOptions(
          charts.map(c => ({
            value: c.md5,
            label: c.name,
            sublabel: c.artist || undefined,
          })),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <SearchCombobox
      options={options}
      value={value}
      onSelect={onSelect}
      placeholder="Search saved songs…"
      searchPlaceholder="Type song or artist name…"
      emptyText={loading ? 'Loading…' : 'No saved songs found'}
      loading={loading}
    />
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/alfredoenrione/my-github/mine/chartmate && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/programs/ref-pickers/SongPicker.tsx
git commit -m "feat(ui): SongPicker — searchable saved song selector"
```

---

## Task 5: Wire AddGoalForm + GoalItem + UnitDetailPage

**Files:**
- Modify: `src/components/programs/AddGoalForm.tsx`
- Modify: `src/components/programs/GoalItem.tsx`
- Modify: `src/pages/programs/UnitDetailPage.tsx`

### AddGoalForm changes

Current `AddGoalFormProps`:
```typescript
interface AddGoalFormProps {
  unitId: number;
  onAdded: () => void;
}
```

New:
```typescript
interface AddGoalFormProps {
  unitId: number;
  instrument?: string;   // from parent program, used to filter LessonPicker
  onAdded: () => void;
}
```

New `GOAL_TYPES` (add `song`):
```typescript
const GOAL_TYPES: {value: Goal['type']; label: string}[] = [
  {value: 'custom', label: 'Custom'},
  {value: 'song', label: 'Song / Chart'},
  {value: 'tab', label: 'Tab composition'},
  {value: 'learn_lesson', label: 'Curriculum lesson'},
  {value: 'exercise', label: 'Built-in exercise'},
];
```

New `handleRefSelect` replaces individual `setRefId` calls:
```typescript
function handleRefSelect(value: string, label: string) {
  setRefId(value);
  if (!title.trim() && label) setTitle(label);
}
```

The disabled condition on the Add button must also gate on song having a ref:
```typescript
disabled={
  saving ||
  !title.trim() ||
  (type === 'exercise' && !refId) ||
  (type === 'song' && !refId) ||
  (type === 'tab' && !refId) ||
  (type === 'learn_lesson' && !refId)
}
```

- [ ] **Step 1: Rewrite `src/components/programs/AddGoalForm.tsx`**

```typescript
import {useState} from 'react';
import {Plus, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {createGoal} from '@/lib/local-db/programs';
import type {Goal} from '@/lib/local-db/programs';
import TabPicker from './ref-pickers/TabPicker';
import LessonPicker from './ref-pickers/LessonPicker';
import SongPicker from './ref-pickers/SongPicker';

const GOAL_TYPES: {value: Goal['type']; label: string}[] = [
  {value: 'custom', label: 'Custom'},
  {value: 'song', label: 'Song / Chart'},
  {value: 'tab', label: 'Tab composition'},
  {value: 'learn_lesson', label: 'Curriculum lesson'},
  {value: 'exercise', label: 'Built-in exercise'},
];

const EXERCISE_ROUTES: {value: string; label: string}[] = [
  {value: '/guitar/fretboard', label: 'Fretboard IQ'},
  {value: '/guitar/ear', label: 'Ear IQ'},
  {value: '/guitar/repertoire', label: 'Repertoire IQ'},
  {value: '/guitar/chords', label: 'Chord Finder'},
  {value: '/rudiments', label: 'Rudiments'},
  {value: '/fills', label: 'Fills'},
];

interface AddGoalFormProps {
  unitId: number;
  instrument?: string;
  onAdded: () => void;
}

export default function AddGoalForm({unitId, instrument, onAdded}: AddGoalFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Goal['type']>('custom');
  const [refId, setRefId] = useState('');
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setTitle('');
    setType('custom');
    setRefId('');
    setTarget('');
    setNotes('');
    setOpen(false);
  }

  function handleRefSelect(value: string, label: string) {
    setRefId(value);
    if (!title.trim() && label) setTitle(label);
  }

  async function handleAdd() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createGoal({
        unitId,
        title: title.trim(),
        type,
        refId: refId.trim() || undefined,
        target: target.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onAdded();
      reset();
    } finally {
      setSaving(false);
    }
  }

  const refRequired = type === 'song' || type === 'tab' || type === 'learn_lesson' || type === 'exercise';
  const canSubmit = !saving && title.trim().length > 0 && (!refRequired || refId.length > 0);

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="w-full border border-dashed border-outline-variant/40">
        <Plus className="h-4 w-4 mr-1" /> Add goal
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-on-surface">New goal</span>
        <button type="button" onClick={reset} className="text-on-surface-variant hover:text-on-surface">
          <X className="h-4 w-4" />
        </button>
      </div>

      <Input
        placeholder="Goal title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus
      />

      <Select value={type} onValueChange={v => { setType(v as Goal['type']); setRefId(''); }}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GOAL_TYPES.map(t => (
            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {type === 'tab' && (
        <TabPicker value={refId} onSelect={handleRefSelect} />
      )}

      {type === 'learn_lesson' && (
        <LessonPicker value={refId} onSelect={handleRefSelect} instrument={instrument} />
      )}

      {type === 'song' && (
        <SongPicker value={refId} onSelect={handleRefSelect} />
      )}

      {type === 'exercise' && (
        <Select value={refId} onValueChange={v => setRefId(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Choose exercise" />
          </SelectTrigger>
          <SelectContent>
            {EXERCISE_ROUTES.map(r => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Input
        placeholder="Target (e.g. 120 bpm, first 16 bars)"
        value={target}
        onChange={e => setTarget(e.target.value)}
      />

      <Input
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={reset}>Cancel</Button>
        <Button size="sm" onClick={handleAdd} disabled={!canSubmit}>
          Add goal
        </Button>
      </div>
    </div>
  );
}
```

### GoalItem changes

In `resolveLink`, add the song case before the final `return null`:

```typescript
if (goal.type === 'song' && goal.refId) return '/library/saved-charts';
```

The full updated `resolveLink`:
```typescript
function resolveLink(goal: Goal): string | null {
  if (goal.type === 'tab' && goal.refId) return `/tab-editor/${goal.refId}`;
  if (goal.type === 'learn_lesson' && goal.refId) {
    const [instrument, unitId, lessonId] = goal.refId.split('/');
    if (instrument && unitId && lessonId)
      return `/learn/lesson/${instrument}/${unitId}/${lessonId}`;
  }
  if (goal.type === 'exercise' && goal.refId) return goal.refId;
  if (goal.type === 'song' && goal.refId) return '/library/saved-charts';
  // 'custom' type has no navigable route
  return null;
}
```

### UnitDetailPage changes

Find the `<AddGoalForm>` usage (currently `<AddGoalForm unitId={unit.id} onAdded={load} />`) and add the `instrument` prop:

```tsx
<AddGoalForm unitId={unit.id} instrument={program?.instrument ?? undefined} onAdded={load} />
```

`program` is already in component state (`const [program, setProgram] = useState<Program | null>(null)`), so this is a one-word change.

- [ ] **Step 2: Apply all three changes**

Apply the full AddGoalForm rewrite above to `src/components/programs/AddGoalForm.tsx`.

In `src/components/programs/GoalItem.tsx`, find the `resolveLink` function and replace with the updated version shown above.

In `src/pages/programs/UnitDetailPage.tsx`, find `<AddGoalForm unitId={unit.id} onAdded={load} />` and change to `<AddGoalForm unitId={unit.id} instrument={program?.instrument ?? undefined} onAdded={load} />`.

- [ ] **Step 3: Run tsc**

```bash
cd /Users/alfredoenrione/my-github/mine/chartmate && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
npx vitest run
```

Expected: 601 passed (no regressions — no new tests needed since all new code is pure UI).

- [ ] **Step 5: Commit**

```bash
git add src/components/programs/AddGoalForm.tsx src/components/programs/GoalItem.tsx src/pages/programs/UnitDetailPage.tsx
git commit -m "feat(ui): wire TabPicker/LessonPicker/SongPicker into AddGoalForm, add song link"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `song` type added to form — Task 5
- ✅ Tab raw ID input → TabPicker — Task 2 + 5
- ✅ Learn lesson raw path input → LessonPicker — Task 3 + 5
- ✅ Song picker added — Task 4 + 5
- ✅ Auto-fill title on ref select — Task 5 (`handleRefSelect`)
- ✅ Filter lessons by program instrument — Task 3 (`instrument` prop)
- ✅ Song link → `/library/saved-charts` — Task 5 (GoalItem)
- ✅ `instrument` passed from UnitDetailPage → AddGoalForm — Task 5

**Placeholder scan:** None found.

**Type consistency:**
- `onSelect: (value: string, label: string) => void` — consistent across all three pickers and SearchCombobox
- `ComboboxOption` exported from `search-combobox.tsx` and imported in each picker — consistent
- `instrument?: string` — consistent AddGoalFormProps → LessonPickerProps
