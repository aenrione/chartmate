import {useState, useEffect, useCallback} from 'react';
import debounce from 'debounce';
import {Search, X, FileMusic, Music2, Link2} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {createItem, ItemType} from '@/lib/local-db/repertoire';
import {todayISO} from '@/lib/repertoire/sm2';
import {getSavedCharts, type SavedChartEntry} from '@/lib/local-db/saved-charts';
import {listCompositions, type TabComposition} from '@/lib/local-db/tab-compositions';

// ── Types ─────────────────────────────────────────────────────────────────────

type LinkedItem =
  | { kind: 'saved_chart'; md5: string; name: string; artist: string }
  | { kind: 'composition'; id: number; title: string; artist: string; tempo: number };

interface AddRepertoireItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Pre-link an existing item and optionally pre-fill form fields */
  prefill?: {
    itemType?: ItemType;
    title?: string;
    artist?: string;
    linkedItem?: LinkedItem;
  };
}

const ITEM_TYPES: {value: ItemType; label: string; description: string}[] = [
  {value: 'song', label: 'Song', description: 'A full song from your library'},
  {value: 'song_section', label: 'Song Section', description: 'A specific part of a song'},
  {value: 'composition', label: 'Composition', description: 'One of your tab compositions'},
  {value: 'exercise', label: 'Exercise', description: 'A lick, pattern, or technique'},
];

// ── Link search panel ─────────────────────────────────────────────────────────

function LinkSearchPanel({
  linked,
  onLink,
  onClear,
}: {
  linked: LinkedItem | null;
  onLink: (item: LinkedItem) => void;
  onClear: () => void;
}) {
  const [tab, setTab] = useState<'chart' | 'composition'>('chart');
  const [query, setQuery] = useState('');
  const [chartResults, setChartResults] = useState<SavedChartEntry[]>([]);
  const [compositions, setCompositions] = useState<TabComposition[]>([]);
  const [searching, setSearching] = useState(false);

  // Load compositions once (small dataset)
  useEffect(() => {
    listCompositions().then(setCompositions);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const searchCharts = useCallback(
    debounce(async (q: string) => {
      setSearching(true);
      try {
        const results = await getSavedCharts(q || undefined);
        setChartResults(results.slice(0, 10));
      } finally {
        setSearching(false);
      }
    }, 250),
    [],
  );

  useEffect(() => {
    if (tab === 'chart') searchCharts(query);
  }, [query, tab, searchCharts]);

  useEffect(() => {
    if (tab === 'chart' && chartResults.length === 0 && query === '') {
      searchCharts('');
    }
  }, [tab]);

  const filteredCompositions = compositions.filter(c =>
    !query ||
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.artist.toLowerCase().includes(query.toLowerCase()),
  );

  if (linked) {
    const label = linked.kind === 'saved_chart'
      ? `${linked.name} — ${linked.artist}`
      : `${linked.title} · ${linked.tempo} BPM`;
    const icon = linked.kind === 'saved_chart'
      ? <Music2 className="h-4 w-4 text-tertiary" />
      : <FileMusic className="h-4 w-4 text-secondary" />;

    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/30">
        {icon}
        <span className="flex-1 text-sm text-on-surface truncate">{label}</span>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 p-0.5 rounded hover:bg-surface-container-high transition-colors"
          title="Remove link"
        >
          <X className="h-3.5 w-3.5 text-on-surface-variant" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
      {/* Tab switcher */}
      <div className="flex border-b border-outline-variant/20">
        {(['chart', 'composition'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setQuery(''); }}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? 'bg-surface-container text-on-surface border-b-2 border-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            {t === 'chart' ? 'Saved Charts' : 'Compositions'}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="relative bg-surface-container-low">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={tab === 'chart' ? 'Search saved charts…' : 'Filter compositions…'}
          className="w-full pl-9 pr-3 py-2 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none"
        />
      </div>

      {/* Results */}
      <div className="max-h-44 overflow-y-auto divide-y divide-outline-variant/10 bg-surface-container">
        {tab === 'chart' && (
          searching ? (
            <p className="py-3 text-center text-xs text-on-surface-variant">Searching…</p>
          ) : chartResults.length === 0 ? (
            <p className="py-3 text-center text-xs text-on-surface-variant">No saved charts found</p>
          ) : chartResults.map(chart => (
            <button
              key={chart.md5}
              type="button"
              onClick={() => onLink({kind: 'saved_chart', md5: chart.md5, name: chart.name, artist: chart.artist})}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container-high text-left transition-colors"
            >
              {chart.albumArtMd5 ? (
                <img
                  src={`https://files.enchor.us/${chart.albumArtMd5}.jpg`}
                  alt=""
                  className="h-8 w-8 rounded object-cover shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded bg-surface-container-high shrink-0 flex items-center justify-center">
                  <Music2 className="h-4 w-4 text-on-surface-variant" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">{chart.name}</p>
                <p className="text-xs text-on-surface-variant truncate">{chart.artist}</p>
              </div>
            </button>
          ))
        )}

        {tab === 'composition' && (
          filteredCompositions.length === 0 ? (
            <p className="py-3 text-center text-xs text-on-surface-variant">No compositions found</p>
          ) : filteredCompositions.slice(0, 10).map(comp => (
            <button
              key={comp.id}
              type="button"
              onClick={() => onLink({kind: 'composition', id: comp.id, title: comp.title, artist: comp.artist, tempo: comp.tempo})}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container-high text-left transition-colors"
            >
              <div className="h-8 w-8 rounded bg-secondary/10 shrink-0 flex items-center justify-center">
                <FileMusic className="h-4 w-4 text-secondary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">{comp.title}</p>
                <p className="text-xs text-on-surface-variant truncate">{comp.artist} · {comp.tempo} BPM · {comp.instrument}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

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
  const [linked, setLinked] = useState<LinkedItem | null>(prefill?.linkedItem ?? null);
  const [showLinkPanel, setShowLinkPanel] = useState(!!prefill?.linkedItem);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Auto-fill title/artist when a link is chosen (if fields are empty)
  const handleLink = (item: LinkedItem) => {
    setLinked(item);
    if (!title) setTitle(item.kind === 'saved_chart' ? item.name : item.title);
    if (!artist) setArtist(item.artist);
    if (!targetBpm && item.kind === 'composition') setTargetBpm(String(item.tempo));
    setShowLinkPanel(false);
  };

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
        savedChartMd5: linked?.kind === 'saved_chart' ? linked.md5 : undefined,
        compositionId: linked?.kind === 'composition' ? linked.id : undefined,
      });
      onSaved();
      onOpenChange(false);
      // Reset form
      setTitle(prefill?.title ?? '');
      setArtist(prefill?.artist ?? '');
      setNotes('');
      setTargetBpm('');
      setItemType(prefill?.itemType ?? 'song');
      setLinked(prefill?.linkedItem ?? null);
      setShowLinkPanel(!!prefill?.linkedItem);
    } catch {
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

          {/* Link to existing item */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-on-surface">
                Link to existing item{' '}
                <span className="text-xs text-on-surface-variant font-normal">(shows on review card)</span>
              </label>
              {!showLinkPanel && !linked && (
                <button
                  type="button"
                  onClick={() => setShowLinkPanel(true)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Add link
                </button>
              )}
            </div>

            {showLinkPanel && !linked && (
              <LinkSearchPanel
                linked={linked}
                onLink={handleLink}
                onClear={() => { setLinked(null); setShowLinkPanel(false); }}
              />
            )}

            {linked && (
              <LinkSearchPanel
                linked={linked}
                onLink={handleLink}
                onClear={() => { setLinked(null); setShowLinkPanel(false); }}
              />
            )}
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
