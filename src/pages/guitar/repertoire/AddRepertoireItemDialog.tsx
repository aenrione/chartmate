import {useState} from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {createItem, ItemType} from '@/lib/local-db/repertoire';
import {todayISO} from '@/lib/repertoire/sm2';

interface AddRepertoireItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  // Optionally pre-fill from existing data
  prefill?: {
    itemType?: ItemType;
    title?: string;
    artist?: string;
    referenceType?: 'saved_chart' | 'song_section' | 'composition';
    referenceId?: string;
  };
}

const ITEM_TYPES: {value: ItemType; label: string; description: string}[] = [
  {value: 'song', label: 'Song', description: 'A full song from your library'},
  {value: 'song_section', label: 'Song Section', description: 'A specific part of a song'},
  {value: 'composition', label: 'Composition', description: 'One of your tab compositions'},
  {value: 'exercise', label: 'Exercise', description: 'A lick, pattern, or technique'},
];

export default function AddRepertoireItemDialog({
  open,
  onOpenChange,
  onSaved,
  prefill,
}: AddRepertoireItemDialogProps) {
  const [itemType, setItemType] = useState<ItemType>(prefill?.itemType ?? 'song');
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [artist, setArtist] = useState(prefill?.artist ?? '');
  const [notes, setNotes] = useState('');
  const [targetBpm, setTargetBpm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await createItem({
        itemType,
        title: title.trim(),
        artist: artist.trim() || undefined,
        notes: notes.trim() || undefined,
        targetBpm: targetBpm ? parseInt(targetBpm, 10) : undefined,
        referenceType: prefill?.referenceType,
        referenceId: prefill?.referenceId,
      });
      onSaved();
      onOpenChange(false);
      // Reset form
      setTitle(prefill?.title ?? '');
      setArtist(prefill?.artist ?? '');
      setNotes('');
      setTargetBpm('');
      setItemType(prefill?.itemType ?? 'song');
    } catch (e) {
      setError('Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Repertoire</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          {/* Item type selector */}
          <div>
            <label className="text-sm font-medium text-on-surface block mb-2">
              Item Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ITEM_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setItemType(t.value)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    itemType === t.value
                      ? 'border-primary bg-primary/10 text-on-surface'
                      : 'border-outline-variant/30 bg-surface-container text-on-surface-variant hover:border-outline-variant'
                  }`}
                >
                  <p className="text-sm font-semibold">{t.label}</p>
                  <p className="text-xs mt-0.5 opacity-70">{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-sm font-medium text-on-surface block mb-1.5">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={
                itemType === 'exercise' ? 'e.g. Pentatonic box pattern' : 'Song or item title'
              }
              className="w-full px-3 py-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Artist (not for exercises) */}
          {itemType !== 'exercise' && (
            <div>
              <label className="text-sm font-medium text-on-surface block mb-1.5">
                Artist
              </label>
              <input
                type="text"
                value={artist}
                onChange={e => setArtist(e.target.value)}
                placeholder="Artist name"
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-on-surface block mb-1.5">
              Notes <span className="text-xs text-on-surface-variant font-normal">(what to focus on)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Pay attention to the fingerpicking in the intro"
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition-colors resize-none"
            />
          </div>

          {/* Target BPM */}
          <div>
            <label className="text-sm font-medium text-on-surface block mb-1.5">
              Target BPM <span className="text-xs text-on-surface-variant font-normal">(optional)</span>
            </label>
            <input
              type="number"
              value={targetBpm}
              onChange={e => setTargetBpm(e.target.value)}
              placeholder="e.g. 120"
              min="20"
              max="300"
              className="w-full px-3 py-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-on-surface text-sm font-medium hover:bg-surface-container-high transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 active:scale-95 transition-all"
            >
              {saving ? 'Saving…' : 'Add to Repertoire'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
