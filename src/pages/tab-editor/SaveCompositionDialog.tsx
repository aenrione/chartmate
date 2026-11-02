import {useState, useEffect, useRef} from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Search, Loader2, X} from 'lucide-react';
import {normalizeTags, tagKey} from '@/lib/composition-tags';
import {useSpotifyAuth} from '@/contexts/SpotifyAuthContext';
import {getSpotifySdk} from '@/lib/spotify-sdk/ClientInstance';

export type CompositionMeta = {
  title: string;
  artist: string;
  album: string;
  tempo: number;
  instrument: string;
  previewImage?: string | null;
  youtubeUrl?: string | null;
  /** When present, the dialog shows a tag editor and returns the edited set. */
  tags?: string[];
};

interface SaveCompositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMeta: CompositionMeta;
  onSave: (meta: CompositionMeta) => Promise<void>;
  /** Existing tags offered as autocomplete in the tag editor. */
  tagSuggestions?: string[];
}

const INSTRUMENTS = [
  {value: 'guitar', label: 'Guitar'},
  {value: 'bass', label: 'Bass'},
  {value: 'drums', label: 'Drums'},
  {value: 'keys', label: 'Keys'},
];

type SpotifyTrackResult = {
  id: string;
  name: string;
  artist: string;
  album: string;
  imageUrl: string | null;
};

async function searchSpotifyTracks(title: string, artist: string): Promise<SpotifyTrackResult[]> {
  const sdk = await getSpotifySdk();
  if (!sdk) return [];

  const q = [title && `track:${title}`, artist && `artist:${artist}`].filter(Boolean).join(' ');
  const results = await sdk.search(q, ['track'], undefined, 5);

  return results.tracks.items.map(track => ({
    id: track.id,
    name: track.name,
    artist: track.artists.map(a => a.name).join(', '),
    album: track.album.name,
    imageUrl: track.album.images[track.album.images.length - 1]?.url ?? null,
  }));
}

export default function SaveCompositionDialog({
  open,
  onOpenChange,
  initialMeta,
  onSave,
  tagSuggestions = [],
}: SaveCompositionDialogProps) {
  const [meta, setMeta] = useState<CompositionMeta>(initialMeta);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrackResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const resultsRef = useRef<HTMLDivElement>(null);
  const {isConnected} = useSpotifyAuth();

  useEffect(() => {
    if (open) {
      setMeta(initialMeta);
      setSpotifyResults([]);
      setShowResults(false);
      setImageError(false);
      setTagDraft('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setImageError(false);
  }, [meta.previewImage]);

  useEffect(() => {
    if (!showResults) return;
    function onPointerDown(e: PointerEvent) {
      if (resultsRef.current && !resultsRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showResults]);

  const handleSpotifySearch = async () => {
    if (!meta.title && !meta.artist) return;
    setSearching(true);
    setShowResults(false);
    try {
      const results = await searchSpotifyTracks(meta.title, meta.artist);
      setSpotifyResults(results);
      setShowResults(true);
    } catch {
      setSpotifyResults([]);
    } finally {
      setSearching(false);
    }
  };

  const applySpotifyResult = (result: SpotifyTrackResult) => {
    setMeta(m => ({
      ...m,
      artist: result.artist,
      album: result.album,
      previewImage: result.imageUrl ?? m.previewImage,
    }));
    setShowResults(false);
    setSpotifyResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meta.title.trim()) return;
    setSaving(true);
    try {
      // A tag still in the input when saving counts as added.
      await onSave(meta.tags === undefined ? meta : {...meta, tags: normalizeTags([...meta.tags, tagDraft])});
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const addTag = (raw: string) => {
    setMeta(m => ({...m, tags: normalizeTags([...(m.tags ?? []), raw])}));
    setTagDraft('');
  };

  const removeTag = (tag: string) => {
    setMeta(m => ({...m, tags: (m.tags ?? []).filter(t => t !== tag)}));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && tagDraft.trim()) {
      e.preventDefault();
      addTag(tagDraft);
    } else if (e.key === ',') {
      e.preventDefault();
    } else if (e.key === 'Backspace' && !tagDraft && meta.tags?.length) {
      removeTag(meta.tags[meta.tags.length - 1]);
    }
  };

  const currentTagKeys = new Set((meta.tags ?? []).map(tagKey));
  const availableSuggestions = tagSuggestions.filter(t => !currentTagKeys.has(tagKey(t)));

  const field = 'w-full rounded-lg bg-surface-container-high px-3 py-2 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save to Library</DialogTitle>
          <DialogDescription className="sr-only">
            Enter composition metadata before saving this tab to the local library.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">

          {/* Title + Artist with Spotify search */}
          <div className="space-y-3">
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

            {/* Spotify search button */}
            {isConnected && (
              <div className="relative" ref={resultsRef}>
                <button
                  type="button"
                  onClick={handleSpotifySearch}
                  disabled={searching || (!meta.title && !meta.artist)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1DB954]/10 text-[#1DB954] text-xs font-medium hover:bg-[#1DB954]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {searching
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Search className="h-3.5 w-3.5" />
                  }
                  {searching ? 'Searching Spotify…' : 'Search Spotify metadata'}
                </button>

                {showResults && spotifyResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-surface-container-high border border-outline-variant/30 rounded-xl shadow-xl overflow-hidden">
                    {spotifyResults.map(result => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => applySpotifyResult(result)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container transition-colors text-left"
                      >
                        {result.imageUrl ? (
                          <img
                            src={result.imageUrl}
                            alt={result.album}
                            className="h-9 w-9 rounded object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded bg-surface-container flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-on-surface truncate">{result.name}</p>
                          <p className="text-xs text-on-surface-variant truncate">{result.artist} · {result.album}</p>
                        </div>
                      </button>
                    ))}
                    {spotifyResults.length === 0 && (
                      <p className="px-3 py-3 text-xs text-on-surface-variant">No results found</p>
                    )}
                  </div>
                )}

                {showResults && spotifyResults.length === 0 && !searching && (
                  <p className="mt-1 text-xs text-on-surface-variant">No Spotify results found.</p>
                )}
              </div>
            )}
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

          {/* Preview Image with live preview */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Preview Image URL</label>
            <div className="flex gap-2">
              <input
                className={field}
                value={meta.previewImage ?? ''}
                onChange={e => setMeta(m => ({...m, previewImage: e.target.value || null}))}
                placeholder="https://... (optional)"
              />
              {meta.previewImage && (
                <button
                  type="button"
                  onClick={() => setMeta(m => ({...m, previewImage: null}))}
                  className="flex-shrink-0 h-9 w-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {meta.previewImage && !imageError && (
              <div className="mt-2 flex items-start gap-3">
                <img
                  src={meta.previewImage}
                  alt="Preview"
                  onError={() => setImageError(true)}
                  className="h-16 w-16 rounded-lg object-cover border border-outline-variant/20 flex-shrink-0"
                />
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  This image will be shown as the chart thumbnail in the library.
                </p>
              </div>
            )}
            {meta.previewImage && imageError && (
              <p className="text-xs text-error mt-1">Could not load image from this URL.</p>
            )}
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

          {meta.tags !== undefined && (
            <div className="space-y-1.5">
              <label htmlFor="composition-tag-input" className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Tags</label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface-container-high px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary/40">
                {meta.tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-medium text-secondary"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="rounded-full hover:text-error transition-colors"
                      title={`Remove tag "${tag}"`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  id="composition-tag-input"
                  className="min-w-24 flex-1 bg-transparent py-0.5 text-sm text-on-surface placeholder:text-outline focus:outline-none"
                  value={tagDraft}
                  onChange={e => setTagDraft(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder={meta.tags.length ? 'Add tag…' : 'e.g. fingerstyle, to learn'}
                  list="composition-tag-suggestions"
                />
                <datalist id="composition-tag-suggestions">
                  {availableSuggestions.map(tag => <option key={tag} value={tag} />)}
                </datalist>
              </div>
              <p className="text-[11px] text-outline">Press Enter or comma to add.</p>
            </div>
          )}

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
              {saving ? 'Saving…' : 'Save to Library'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
