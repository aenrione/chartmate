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
