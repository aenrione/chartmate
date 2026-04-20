import {useState, useEffect} from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type CompositionMeta = {
  title: string;
  artist: string;
  album: string;
  tempo: number;
  instrument: string;
  previewImage?: string | null;
  youtubeUrl?: string | null;
};

interface SaveCompositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMeta: CompositionMeta;
  onSave: (meta: CompositionMeta) => Promise<void>;
}

const INSTRUMENTS = [
  {value: 'guitar', label: 'Guitar'},
  {value: 'bass', label: 'Bass'},
  {value: 'drums', label: 'Drums'},
  {value: 'keys', label: 'Keys'},
];

export default function SaveCompositionDialog({
  open,
  onOpenChange,
  initialMeta,
  onSave,
}: SaveCompositionDialogProps) {
  const [meta, setMeta] = useState<CompositionMeta>(initialMeta);
  const [saving, setSaving] = useState(false);

  // Sync form state whenever the dialog opens (handles both controlled and triggered open)
  useEffect(() => {
    if (open) setMeta(initialMeta);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meta.title.trim()) return;
    setSaving(true);
    try {
      await onSave(meta);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full rounded-lg bg-surface-container-high px-3 py-2 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save to Library</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
              Title <span className="text-error">*</span>
            </label>
            <input
              className={field}
              value={meta.title}
              onChange={e => setMeta(m => ({...m, title: e.target.value}))}
              placeholder="Song title"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Artist</label>
            <input
              className={field}
              value={meta.artist}
              onChange={e => setMeta(m => ({...m, artist: e.target.value}))}
              placeholder="Artist name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Album</label>
            <input
              className={field}
              value={meta.album}
              onChange={e => setMeta(m => ({...m, album: e.target.value}))}
              placeholder="Album name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Tempo (BPM)</label>
              <input
                type="number"
                className={field}
                value={meta.tempo}
                min={20}
                max={300}
                onChange={e => setMeta(m => ({...m, tempo: Number(e.target.value)}))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Instrument</label>
              <select
                className={field}
                value={meta.instrument}
                onChange={e => setMeta(m => ({...m, instrument: e.target.value}))}
              >
                {INSTRUMENTS.map(i => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Preview Image URL</label>
            <input
              className={field}
              value={meta.previewImage ?? ''}
              onChange={e => setMeta(m => ({...m, previewImage: e.target.value || null}))}
              placeholder="https://... (optional)"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">YouTube URL</label>
            <input
              className={field}
              value={meta.youtubeUrl ?? ''}
              onChange={e => setMeta(m => ({...m, youtubeUrl: e.target.value || null}))}
              placeholder="https://youtube.com/watch?v=... (optional)"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !meta.title.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving\u2026' : 'Save to Library'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
