import {useState, useEffect, useCallback} from 'react';
import {useNavigate, Link} from 'react-router-dom';
import {
  ArrowLeft, Music, ExternalLink, FileMusic, Bookmark,
  HardDrive, Wifi, Clock,
} from 'lucide-react';
import {cn} from '@/lib/utils';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {DifficultyDots} from '@/components/shared/DifficultyDots';
import {formatDuration} from '@/lib/ui-utils';
import {
  QUALITY_LABELS,
  REVIEW_QUALITIES,
  ReviewQuality,
  previewNextInterval,
  formatInterval,
} from '@/lib/repertoire/sm2';
import {getItemsDueToday, fetchLinkedResource, LinkedResource} from '@/lib/local-db/repertoire';
import {useRepertoireSession} from './hooks/useRepertoireSession';
import type {RepertoireItem, ItemType} from '@/lib/local-db/repertoire';

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  song: 'Song',
  song_section: 'Section',
  composition: 'Composition',
  exercise: 'Exercise',
};

const QUALITY_COLORS: Record<ReviewQuality, string> = {
  1: 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20',
  3: 'border-orange-500/40 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20',
  4: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
  5: 'border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20',
};

/** Fisher-Yates shuffle */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Quick-look dialog for saved charts ───────────────────────────────────────

type SavedChartResource = Extract<LinkedResource, {type: 'saved_chart'}>;

function SavedChartQuickLookDialog({
  chart,
  open,
  onClose,
}: {
  chart: SavedChartResource;
  open: boolean;
  onClose: () => void;
}) {
  const instruments: {label: string; diff: number | null}[] = [
    {label: 'Drums', diff: chart.diffDrums},
    {label: 'Guitar', diff: chart.diffGuitar},
    {label: 'Bass', diff: chart.diffBass},
    {label: 'Keys', diff: chart.diffKeys},
  ].filter(i => i.diff != null);

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden gap-0">
        {/* Album art banner */}
        <div className="relative h-48 bg-surface-container overflow-hidden">
          {chart.albumArtMd5 ? (
            <img
              src={`https://files.enchor.us/${chart.albumArtMd5}.jpg`}
              alt={chart.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <Music className="h-16 w-16 text-on-surface-variant/20" />
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          {/* Title over art */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
            <h2 className="text-lg font-bold text-white leading-tight">{chart.name}</h2>
            <p className="text-sm text-white/80">{chart.artist}</p>
          </div>
          {/* Download badge */}
          <div className={cn(
            'absolute top-3 right-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold backdrop-blur-sm',
            chart.isDownloaded
              ? 'bg-tertiary-container/80 text-on-tertiary-container'
              : 'bg-surface/70 text-outline',
          )}>
            {chart.isDownloaded
              ? <><HardDrive className="h-3 w-3" /> Offline</>
              : <><Wifi className="h-3 w-3" /> Online only</>
            }
          </div>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {/* Meta row */}
          <div className="flex items-center gap-4 text-xs text-on-surface-variant">
            {chart.charter && (
              <span>Charted by <span className="text-on-surface font-medium">{chart.charter}</span></span>
            )}
            {chart.songLength != null && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(chart.songLength)}
              </span>
            )}
          </div>

          {/* Difficulty per instrument */}
          {instruments.length > 0 && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {instruments.map(inst => (
                <div key={inst.label} className="flex items-center gap-2">
                  <span className="text-xs text-on-surface-variant w-10 shrink-0">{inst.label}</span>
                  <DifficultyDots level={inst.diff} />
                </div>
              ))}
            </div>
          )}

          {/* Tab URL */}
          {chart.tabUrl && (
            <a
              href={chart.tabUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-sm font-medium text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              View Tab
            </a>
          )}

          {/* Open full chart — warns about leaving session */}
          <Link
            to={`/sheet-music/${chart.md5}`}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
            onClick={onClose}
          >
            <ExternalLink className="h-4 w-4" />
            Open Full Chart
          </Link>
          <p className="text-center text-[10px] text-on-surface-variant -mt-2">
            Opens chart view — your review session will pause
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-on-surface-variant text-sm">Loading session…</p>
    </div>
  );
}

function EmptyState({onBack}: {onBack: () => void}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center px-6">
      <Music className="h-12 w-12 text-on-surface-variant/30" />
      <p className="text-on-surface font-medium">Nothing to review</p>
      <p className="text-sm text-on-surface-variant">No items are due today. Come back later!</p>
      <button
        onClick={onBack}
        className="px-6 py-2.5 rounded-full bg-surface-container text-on-surface text-sm font-medium hover:bg-surface-container-high"
      >
        Back to RepertoireIQ
      </button>
    </div>
  );
}

/**
 * Renders a preview card for the linked resource shown on the back of the card.
 * For saved_chart, clicking opens the quick-look dialog instead of navigating.
 */
function LinkedResourcePreview({resource}: {resource: LinkedResource}) {
  const [quickLookOpen, setQuickLookOpen] = useState(false);

  if (resource.type === 'saved_chart') {
    return (
      <>
        <button
          type="button"
          onClick={() => setQuickLookOpen(true)}
          className="w-full flex items-center gap-3 rounded-xl bg-surface-container border border-outline-variant/20 overflow-hidden hover:bg-surface-container-high transition-colors text-left"
        >
          {resource.albumArtMd5 && (
            <img
              src={`https://files.enchor.us/${resource.albumArtMd5}.jpg`}
              alt=""
              className="h-16 w-16 object-cover shrink-0"
            />
          )}
          <div className="flex-1 min-w-0 py-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant mb-0.5">
              Drum Chart · tap to preview
            </p>
            <p className="text-sm font-bold text-on-surface truncate">{resource.name}</p>
            <p className="text-xs text-on-surface-variant truncate">{resource.artist}</p>
          </div>
          <ExternalLink className="h-4 w-4 text-on-surface-variant mr-3 shrink-0" />
        </button>

        <SavedChartQuickLookDialog
          chart={resource}
          open={quickLookOpen}
          onClose={() => setQuickLookOpen(false)}
        />
      </>
    );
  }

  if (resource.type === 'composition') {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-surface-container border border-outline-variant/20 p-3">
        <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
          <FileMusic className="h-5 w-5 text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant mb-0.5">
            Composition · {resource.tempo} BPM · {resource.instrument}
          </p>
          <p className="text-sm font-bold text-on-surface truncate">{resource.title}</p>
          {resource.artist && (
            <p className="text-xs text-on-surface-variant truncate">{resource.artist}</p>
          )}
        </div>
        <Link
          to={`/tab-editor/${resource.id}`}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary text-xs font-semibold hover:bg-secondary/20 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </Link>
      </div>
    );
  }

  if (resource.type === 'song_section') {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-surface-container border border-outline-variant/20 p-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Bookmark className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant mb-0.5">
            Song Section
          </p>
          <p className="text-sm font-bold text-on-surface truncate">{resource.name}</p>
        </div>
        <Link
          to={`/sheet-music/${resource.chartMd5}`}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open Chart
        </Link>
      </div>
    );
  }

  return null;
}

function CardFront({item, onShowBack}: {item: RepertoireItem; onShowBack: () => void}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-3xl bg-surface-container p-8 text-center flex flex-col gap-4 min-h-[280px] items-center justify-center">
        <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant bg-surface-container-high px-3 py-1 rounded-full">
          {ITEM_TYPE_LABELS[item.itemType]}
        </span>
        <h2 className="text-3xl font-bold text-on-surface">{item.title}</h2>
        {item.artist && (
          <p className="text-on-surface-variant text-lg">{item.artist}</p>
        )}
        {item.notes && (
          <p className="text-sm text-on-surface-variant/80 italic max-w-md">
            "{item.notes}"
          </p>
        )}
        {item.targetBpm && (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <span className="text-base">🎵</span>
            <span>Target: {item.targetBpm} BPM</span>
          </div>
        )}
      </div>

      <p className="text-center text-sm text-on-surface-variant">
        Play through this now, then rate yourself honestly.
      </p>

      <button
        onClick={onShowBack}
        className="w-full py-4 rounded-2xl bg-primary text-on-primary font-bold text-base hover:bg-primary/90 active:scale-95 transition-all"
      >
        Show Self-Assessment
      </button>
    </div>
  );
}

function CardBack({
  item,
  onRate,
}: {
  item: RepertoireItem;
  onRate: (quality: ReviewQuality) => void;
}) {
  const [resource, setResource] = useState<LinkedResource | null | 'loading'>('loading');

  useEffect(() => {
    fetchLinkedResource(item).then(setResource);
  }, [item.id]);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-3xl bg-surface-container p-6 text-center">
        <h2 className="text-2xl font-bold text-on-surface">{item.title}</h2>
        {item.artist && (
          <p className="text-on-surface-variant mt-1">{item.artist}</p>
        )}
      </div>

      {resource !== 'loading' && resource && (
        <LinkedResourcePreview resource={resource} />
      )}

      <div>
        <p className="text-center text-sm font-semibold text-on-surface-variant mb-4">
          How did you do?
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {REVIEW_QUALITIES.map(q => {
            const nextInterval = previewNextInterval(
              q,
              item.repetitions,
              item.easeFactor,
              item.interval,
            );
            return (
              <button
                key={q}
                onClick={() => onRate(q)}
                className={cn(
                  'flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl border font-semibold transition-all active:scale-95',
                  QUALITY_COLORS[q],
                )}
              >
                <span className="text-base">{QUALITY_LABELS[q]}</span>
                <span className="text-xs opacity-70">{formatInterval(nextInterval)}</span>
              </button>
            );
          })}
        </div>
        <p className="text-center text-xs text-on-surface-variant mt-3">
          Tip: <kbd className="bg-surface-container px-1.5 py-0.5 rounded text-[10px]">1</kbd> Again &nbsp;
          <kbd className="bg-surface-container px-1.5 py-0.5 rounded text-[10px]">2</kbd> Hard &nbsp;
          <kbd className="bg-surface-container px-1.5 py-0.5 rounded text-[10px]">3</kbd> Good &nbsp;
          <kbd className="bg-surface-container px-1.5 py-0.5 rounded text-[10px]">4</kbd> Easy
        </p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RepertoireSessionPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<RepertoireItem[] | null>(null);

  useEffect(() => {
    getItemsDueToday().then(due => setItems(shuffleArray(due)));
  }, []);

  const session = useRepertoireSession(items ?? []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (session.phase === 'showing_front' && e.key === ' ') {
        e.preventDefault();
        session.showAssessment();
        return;
      }
      if (session.phase === 'showing_back') {
        const map: Record<string, ReviewQuality> = {'1': 1, '2': 3, '3': 4, '4': 5};
        const q = map[e.key];
        if (q !== undefined) {
          session.rateItem(q);
        }
      }
    },
    [session],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (session.phase === 'completed') {
      navigate('/guitar/repertoire/summary', {state: {results: session.results}});
    }
  }, [session.phase, session.results, navigate]);

  if (items === null) return <LoadingState />;
  if (items.length === 0) return <EmptyState onBack={() => navigate('/guitar/repertoire')} />;

  const {currentItem, currentIndex, totalItems, phase} = session;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 shrink-0">
        <button
          onClick={() => navigate('/guitar/repertoire')}
          className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Exit
        </button>
        <div className="flex items-center gap-3">
          <div className="w-32 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{width: `${(currentIndex / totalItems) * 100}%`}}
            />
          </div>
          <span className="text-sm text-on-surface-variant tabular-nums">
            {currentIndex + 1} / {totalItems}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex items-start justify-center px-6 py-8">
        <div className="w-full max-w-xl">
          {currentItem && phase === 'showing_front' && (
            <CardFront item={currentItem} onShowBack={session.showAssessment} />
          )}
          {currentItem && phase === 'showing_back' && (
            <CardBack item={currentItem} onRate={session.rateItem} />
          )}
        </div>
      </div>
    </div>
  );
}
