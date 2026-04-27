import {useState} from 'react';
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {createProgram} from '@/lib/local-db/programs';

interface NewProgramModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}

export default function NewProgramModal({open, onClose, onCreated}: NewProgramModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instrument, setInstrument] = useState<string>('none');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const id = await createProgram({
        title: title.trim(),
        description: description.trim() || undefined,
        instrument: instrument !== 'none' ? instrument : undefined,
      });
      onCreated(id);
      setTitle('');
      setDescription('');
      setInstrument('none');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Program</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <Input placeholder="Program title" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-xl bg-surface-container-high px-3 py-2 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container resize-none"
          />
          <Select value={instrument} onValueChange={setInstrument}>
            <SelectTrigger>
              <SelectValue placeholder="Instrument (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No specific instrument</SelectItem>
              <SelectItem value="guitar">Guitar</SelectItem>
              <SelectItem value="drums">Drums</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !title.trim()}>Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
