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
import {getSavedCharts, type SavedChartEntry} from '@/lib/local-db/saved-charts';
import {listCompositions, type TabComposition} from '@/lib/local-db/tab-compositions';

// ── Types ─────────────────────────────────────────────────────────────────────

type LinkedItem =
  | { kind: 'saved_chart'; md5: string; name: string; artist: string; albumArtMd5: string }
  | { kind: 'composition'; id: number; title: string; artist: string; tempo: number; instrument: string };

interface AddRepertoireItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
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

// ── Inline chart search-select ────────────────────────────────────────────────

function ChartSearchSelect({
  selected,
  onSelect,
  onClear,
}: {
  selected: Extract<LinkedItem, {kind: 'saved_chart'}> | null;
  onSelect: (item: Extract<LinkedItem, {kind: 'saved_chart'}>) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SavedChartEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(!selected);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useCallback(
    debounce(async (q: string) => {
      setSearching(true);
      try {
        const r = await getSavedCharts(q || undefined);
        setResults(r.slice(0, 12));
      } finally {
        setSearching(false);
      }
    }, 250),
    [],
  );

  useEffect(() => {
    if (open) search(query);
  }, [query, open, search]);

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-surface-container border border-primary/30 overflow-hidden">
        {selected.albumArtMd5 ? (
          <img
            src={`https://files.enchor.us/${selected.albumArtMd5}.jpg`}
            alt=""
            className="h-14 w-14 object-cover shrink-0"
          />
        ) : (
          <div className="h-14 w-14 bg-surface-container-high flex items-center justify-center shrink-0">
            <Music2 className="h-6 w-6 text-on-surface-variant" />
          </div>
        )}
        <div className="flex-1 min-w-0 py-2">
          <p className="text-sm font-bold text-on-surface truncate">{selected.name}</p>
          <p className="text-xs text-on-surface-variant truncate">{selected.artist}</p>
        </div>
        <button
          type="button"
          onClick={() => { onClear(); setOpen(true); setQuery(''); }}
          className="mr-3 p-1.5 rounded-lg hover:bg-surface-container-high transition-colors"
          title="Change chart"
        >
          <X className="h-4 w-4 text-on-surface-variant" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
      <div className="relative bg-surface-container-low">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search saved charts…"
          autoFocus
          className="w-full pl-9 pr-3 py-2.5 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none"
        />
      </div>
      <div className="max-h-52 overflow-y-auto divide-y divide-outline-variant/10 bg-surface-container">
        {searching ? (
          <p className="py-4 text-center text-xs text-on-surface-variant">Searching…</p>
        ) : results.length === 0 ? (
          <p className="py-4 text-center text-xs text-on-surface-variant">No saved charts found</p>
        ) : results.map(chart => (
          <button
            key={chart.md5}
            type="button"
            onClick={() => {
              onSelect({kind: 'saved_chart', md5: chart.md5, name: chart.name, artist: chart.artist, albumArtMd5: chart.albumArtMd5});
              setOpen(false);
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container-high text-left transition-colors"
          >
            {chart.albumArtMd5 ? (
              <img
                src={`https://files.enchor.us/${chart.albumArtMd5}.jpg`}
                alt=""
                className="h-9 w-9 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-surface-container-high shrink-0 flex items-center justify-center">
                <Music2 className="h-4 w-4 text-on-surface-variant" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-on-surface truncate">{chart.name}</p>
              <p className="text-xs text-on-surface-variant truncate">{chart.artist}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Inline composition search-select ─────────────────────────────────────────

function CompositionSearchSelect({
  selected,
  onSelect,
  onClear,
}: {
  selected: Extract<LinkedItem, {kind: 'composition'}> | null;
  onSelect: (item: Extract<LinkedItem, {kind: 'composition'}>) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [compositions, setCompositions] = useState<TabComposition[]>([]);

  useEffect(() => {
    listCompositions().then(setCompositions);
  }, []);

  const filtered = compositions.filter(c =>
    !query ||
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.artist.toLowerCase().includes(query.toLowerCase()),
  );

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-surface-container border border-primary/30 p-3">
        <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
          <FileMusic className="h-5 w-5 text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-on-surface truncate">{selected.title}</p>
          <p className="text-xs text-on-surface-variant truncate">{selected.artist} · {selected.tempo} BPM · {selected.instrument}</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="p-1.5 rounded-lg hover:bg-surface-container-high transition-colors"
          title="Change composition"
        >
          <X className="h-4 w-4 text-on-surface-variant" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
      <div className="relative bg-surface-container-low">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search compositions…"
          autoFocus
          className="w-full pl-9 pr-3 py-2.5 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none"
        />
      </div>
      <div className="max-h-52 overflow-y-auto divide-y divide-outline-variant/10 bg-surface-container">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-xs text-on-surface-variant">No compositions found</p>
        ) : filtered.slice(0, 12).map(comp => (
          <button
            key={comp.id}
            type="button"
            onClick={() => onSelect({kind: 'composition', id: comp.id, title: comp.title, artist: comp.artist, tempo: comp.tempo, instrument: comp.instrument})}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container-high text-left transition-colors"
          >
            <div className="h-9 w-9 rounded-lg bg-secondary/10 shrink-0 flex items-center justify-center">
              <FileMusic className="h-4 w-4 text-secondary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-on-surface truncate">{comp.title}</p>
              <p className="text-xs text-on-surface-variant truncate">{comp.artist} · {comp.tempo} BPM · {comp.instrument}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Optional link panel (for song_section / exercise) ─────────────────────────

function OptionalLinkPanel({
  linked,
  onLink,
  onClear,
}: {
  linked: LinkedItem | null;
  onLink: (item: LinkedItem) => void;
  onClear: () => void;
}) {
  const [showPanel, setShowPanel] = useState(!!linked);
  const [tab, setTab] = useState<'chart' | 'composition'>('chart');
  const [query, setQuery] = useState('');
  const [chartResults, setChartResults] = useState<SavedChartEntry[]>([]);
  const [compositions, setCompositions] = useState<TabComposition[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => { listCompositions().then(setCompositions); }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const searchCharts = useCallback(
    debounce(async (q: string) => {
      setSearching(true);
      try { setChartResults((await getSavedCharts(q || undefined)).slice(0, 10)); }
      finally { setSearching(false); }
    }, 250),
    [],
  );

  useEffect(() => {
    if (showPanel && tab === 'chart' && !linked) searchCharts(query);
  }, [query, tab, showPanel, linked, searchCharts]);

  if (linked) {
    const label = linked.kind === 'saved_chart' ? `${linked.name} — ${linked.artist}` : `${linked.title} · ${linked.tempo} BPM`;
    const icon = linked.kind === 'saved_chart'
      ? <Music2 className="h-4 w-4 text-tertiary" />
      : <FileMusic className="h-4 w-4 text-secondary" />;
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/30">
        {icon}
        <span className="flex-1 text-sm text-on-surface truncate">{label}</span>
        <button type="button" onClick={() => { onClear(); setShowPanel(false); }} className="shrink-0 p-0.5 rounded hover:bg-surface-container-high">
          <X className="h-3.5 w-3.5 text-on-surface-variant" />
        </button>
      </div>
    );
  }

  if (!showPanel) {
    return (
      <button
        type="button"
        onClick={() => { setShowPanel(true); searchCharts(''); }}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
      >
        <Link2 className="h-3.5 w-3.5" />
        Link to chart or composition
      </button>
    );
  }

  const filteredCompositions = compositions.filter(c =>
    !query || c.title.toLowerCase().includes(query.toLowerCase()) || c.artist.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
      <div className="flex border-b border-outline-variant/20">
        {(['chart', 'composition'] as const).map(t => (
          <button key={t} type="button" onClick={() => { setTab(t); setQuery(''); }}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === t ? 'bg-surface-container text-on-surface border-b-2 border-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>
            {t === 'chart' ? 'Saved Charts' : 'Compositions'}
          </button>
        ))}
      </div>
      <div className="relative bg-surface-container-low">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant pointer-events-none" />
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={tab === 'chart' ? 'Search saved charts…' : 'Filter compositions…'}
          className="w-full pl-9 pr-3 py-2 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none" />
      </div>
      <div className="max-h-40 overflow-y-auto divide-y divide-outline-variant/10 bg-surface-container">
        {tab === 'chart' && (searching
          ? <p className="py-3 text-center text-xs text-on-surface-variant">Searching…</p>
          : chartResults.length === 0
            ? <p className="py-3 text-center text-xs text-on-surface-variant">No saved charts</p>
            : chartResults.map(chart => (
              <button key={chart.md5} type="button"
                onClick={() => onLink({kind: 'saved_chart', md5: chart.md5, name: chart.name, artist: chart.artist, albumArtMd5: chart.albumArtMd5})}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container-high text-left transition-colors">
                {chart.albumArtMd5
                  ? <img src={`https://files.enchor.us/${chart.albumArtMd5}.jpg`} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                  : <div className="h-8 w-8 rounded bg-surface-container-high shrink-0 flex items-center justify-center"><Music2 className="h-4 w-4 text-on-surface-variant" /></div>}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">{chart.name}</p>
                  <p className="text-xs text-on-surface-variant truncate">{chart.artist}</p>
                </div>
              </button>
            )))}
        {tab === 'composition' && (filteredCompositions.length === 0
          ? <p className="py-3 text-center text-xs text-on-surface-variant">No compositions</p>
          : filteredCompositions.slice(0, 10).map(comp => (
            <button key={comp.id} type="button"
              onClick={() => onLink({kind: 'composition', id: comp.id, title: comp.title, artist: comp.artist, tempo: comp.tempo, instrument: comp.instrument})}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container-high text-left transition-colors">
              <div className="h-8 w-8 rounded bg-secondary/10 shrink-0 flex items-center justify-center"><FileMusic className="h-4 w-4 text-secondary" /></div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">{comp.title}</p>
                <p className="text-xs text-on-surface-variant truncate">{comp.artist} · {comp.tempo} BPM</p>
              </div>
            </button>
          )))}
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // When type changes, clear any link that doesn't match the new type
  const handleTypeChange = (type: ItemType) => {
    if (type !== 'song' && linked?.kind === 'saved_chart') setLinked(null);
    if (type !== 'composition' && linked?.kind === 'composition') setLinked(null);
    setItemType(type);
  };

  const handleChartSelect = (item: Extract<LinkedItem, {kind: 'saved_chart'}>) => {
    setLinked(item);
    setTitle(item.name);
    setArtist(item.artist);
  };

  const handleCompositionSelect = (item: Extract<LinkedItem, {kind: 'composition'}>) => {
    setLinked(item);
    setTitle(item.title);
    setArtist(item.artist);
    if (!targetBpm) setTargetBpm(String(item.tempo));
  };

  // Derived: for song/composition types the title comes from the selection
  const titleDerivedFromLink = (itemType === 'song' || itemType === 'composition') && !!linked;
  const saveDisabled = saving || (titleDerivedFromLink ? !linked : !title.trim());

  const handleSave = async () => {
    const resolvedTitle = titleDerivedFromLink
      ? (linked!.kind === 'saved_chart' ? linked!.name : linked!.title)
      : title.trim();

    if (!resolvedTitle) {
      setError(itemType === 'song' ? 'Select a chart first' : itemType === 'composition' ? 'Select a composition first' : 'Title is required');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await createItem({
        itemType,
        title: resolvedTitle,
        artist: (titleDerivedFromLink ? (linked!.artist) : artist.trim()) || undefined,
        notes: notes.trim() || undefined,
        targetBpm: targetBpm ? parseInt(targetBpm, 10) : undefined,
        savedChartMd5: linked?.kind === 'saved_chart' ? linked.md5 : undefined,
        compositionId: linked?.kind === 'composition' ? linked.id : undefined,
      });
      onSaved();
      onOpenChange(false);
      // Reset
      setTitle(prefill?.title ?? '');
      setArtist(prefill?.artist ?? '');
      setNotes('');
      setTargetBpm('');
      setItemType(prefill?.itemType ?? 'song');
      setLinked(prefill?.linkedItem ?? null);
    } catch {
      setError('Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to Repertoire</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          {/* Item type selector */}
          <div>
            <label className="text-sm font-medium text-on-surface block mb-2">Item Type</label>
            <div className="grid grid-cols-2 gap-2">
              {ITEM_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handleTypeChange(t.value)}
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

          {/* Song type: integrated chart search-select */}
          {itemType === 'song' && (
            <div>
              <label className="text-sm font-medium text-on-surface block mb-1.5">
                Chart <span className="text-red-400">*</span>
              </label>
              <ChartSearchSelect
                selected={linked?.kind === 'saved_chart' ? linked : null}
                onSelect={handleChartSelect}
                onClear={() => setLinked(null)}
              />
            </div>
          )}

          {/* Composition type: integrated composition search-select */}
          {itemType === 'composition' && (
            <div>
              <label className="text-sm font-medium text-on-surface block mb-1.5">
                Composition <span className="text-red-400">*</span>
              </label>
              <CompositionSearchSelect
                selected={linked?.kind === 'composition' ? linked : null}
                onSelect={handleCompositionSelect}
                onClear={() => setLinked(null)}
              />
            </div>
          )}

          {/* Manual title — only for song_section and exercise */}
          {(itemType === 'song_section' || itemType === 'exercise') && (
            <div>
              <label className="text-sm font-medium text-on-surface block mb-1.5">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={itemType === 'exercise' ? 'e.g. Pentatonic box pattern' : 'Section name'}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          )}

          {/* Manual artist — only for song_section */}
          {itemType === 'song_section' && (
            <div>
              <label className="text-sm font-medium text-on-surface block mb-1.5">Artist</label>
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
              Notes{' '}
              <span className="text-xs text-on-surface-variant font-normal">(what to focus on)</span>
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
              Target BPM{' '}
              <span className="text-xs text-on-surface-variant font-normal">(optional)</span>
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

          {/* Optional link — for song_section and exercise */}
          {(itemType === 'song_section' || itemType === 'exercise') && (
            <div>
              <label className="text-sm font-medium text-on-surface block mb-1.5">
                Link{' '}
                <span className="text-xs text-on-surface-variant font-normal">(shows on review card)</span>
              </label>
              <OptionalLinkPanel
                linked={linked}
                onLink={setLinked}
                onClear={() => setLinked(null)}
              />
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

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
              disabled={saveDisabled}
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
