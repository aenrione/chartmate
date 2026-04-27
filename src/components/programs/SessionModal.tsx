import {useState, useEffect} from 'react';
import {Trash2} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {Session, Unit} from '@/lib/local-db/programs';
import {createSession, updateSession, completeSession, deleteSession} from '@/lib/local-db/programs';

interface SessionModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultDate?: string;
  session?: Session;
  units?: Unit[];
}

export default function SessionModal({
  open,
  onClose,
  onSaved,
  defaultDate,
  session,
  units = [],
}: SessionModalProps) {
  const isEditing = !!session;
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('');
  const [unitId, setUnitId] = useState<string>('none');
  const [notes, setNotes] = useState('');
  const [completing, setCompleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(session?.title ?? '');
      setDate(session?.scheduledDate ?? defaultDate ?? '');
      setTime(session?.scheduledTime ?? '');
      setDuration(session?.durationMinutes?.toString() ?? '');
      setUnitId(session?.unitId?.toString() ?? 'none');
      setNotes(session?.notes ?? '');
      setCompleting(false);
      setConfirmDelete(false);
    }
  }, [open, session, defaultDate]);

  async function handleSave() {
    if (!date) return;
    setSaving(true);
    try {
      const data = {
        title: title || undefined,
        unitId: unitId !== 'none' ? Number(unitId) : undefined,
        scheduledDate: date,
        scheduledTime: time || undefined,
        durationMinutes: duration ? Number(duration) : undefined,
      };
      if (isEditing) {
        await updateSession(session.id, {
          title: data.title ?? null,
          unitId: data.unitId ?? null,
          scheduledDate: data.scheduledDate,
          scheduledTime: data.scheduledTime ?? null,
          durationMinutes: data.durationMinutes ?? null,
        });
      } else {
        await createSession(data);
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    if (!session) return;
    setSaving(true);
    try {
      await completeSession(session.id, notes || undefined);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!session) return;
    setSaving(true);
    try {
      await deleteSession(session.id);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const alreadyDone = !!session?.completedAt;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? (alreadyDone ? 'Session' : 'Edit Session') : 'New Session'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <Input
            placeholder="Title (optional)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={alreadyDone}
          />

          <div className="flex gap-2">
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              disabled={alreadyDone}
              className="flex-1"
            />
            <Input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              disabled={alreadyDone}
              className="w-32"
            />
          </div>

          <Input
            type="number"
            placeholder="Duration (minutes)"
            value={duration}
            onChange={e => setDuration(e.target.value)}
            disabled={alreadyDone}
          />

          {units.length > 0 && (
            <Select value={unitId} onValueChange={setUnitId} disabled={alreadyDone}>
              <SelectTrigger>
                <SelectValue placeholder="Link to unit (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No unit</SelectItem>
                {units.map(u => (
                  <SelectItem key={u.id} value={u.id.toString()}>
                    {u.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(isEditing && !alreadyDone) || completing ? (
            <textarea
              placeholder="Post-session notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-xl bg-surface-container-high px-3 py-2 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container resize-none"
            />
          ) : alreadyDone && session.notes ? (
            <p className="text-sm text-on-surface-variant bg-surface-container rounded-lg p-3">
              {session.notes}
            </p>
          ) : null}
        </div>

        <div className="flex justify-between items-center mt-4">
          <div>
            {isEditing && (
              confirmDelete ? (
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving}>Confirm delete</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </div>
              ) : (
                <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4 text-error" />
                </Button>
              )
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            {!alreadyDone && isEditing && (
              <Button variant="outline" onClick={() => setCompleting(true)} disabled={completing}>
                Mark done
              </Button>
            )}
            {completing ? (
              <Button onClick={handleComplete} disabled={saving}>Save & Complete</Button>
            ) : !alreadyDone ? (
              <Button onClick={handleSave} disabled={saving || !date}>
                {isEditing ? 'Save' : 'Create'}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
