import {useState, useEffect, useCallback} from 'react';
import {useNavigate, useSearchParams, useLocation, Link} from 'react-router-dom';
import {ArrowLeft, Music, ExternalLink, FileMusic, Bookmark, BookOpen} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {cn} from '@/lib/utils';
import {
  QUALITY_LABELS,
  REVIEW_QUALITIES,
  ReviewQuality,
  previewNextInterval,
  formatInterval,
} from '@/lib/repertoire/sm2';
import {getItemsDueToday, getItemsByIds, fetchLinkedResource, LinkedResource, parseSnippetRange, type RepertoireFilter} from '@/lib/local-db/repertoire';
import {loadSession, saveSession, clearSession} from '@/lib/repertoire/session-persistence';
import {seedTheorySRS, lessonLinkFromSource} from '@/lib/local-db/theory-srs';
import {useRepertoireSession} from './hooks/useRepertoireSession';
import type {RepertoireItem, ItemType} from '@/lib/local-db/repertoire';
import TabSnippet from '@/components/TabSnippet';
import ChartSectionSnippet from '@/components/ChartSectionSnippet';

const KEY_TO_QUALITY: Record<string, ReviewQuality> = {'1': 1, '2': 3, '3': 4, '4': 5};

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  song: 'Song',
  song_section: 'Section',
  composition: 'Composition',
  exercise: 'Exercise',
  theory: 'Theory',
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
 */
function LinkedResourcePreview({resource}: {resource: LinkedResource}) {
  if (resource.type === 'saved_chart') {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-surface-container border border-outline-variant/20 overflow-hidden">
        {resource.albumArtMd5 && (
          <img
            src={`https://files.enchor.us/${resource.albumArtMd5}.jpg`}
            alt=""
            className="h-16 w-16 object-cover shrink-0"
          />
        )}
        <div className="flex-1 min-w-0 py-2">
          <p className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant mb-0.5">
            Drum Chart
          </p>
          <p className="text-sm font-bold text-on-surface truncate">{resource.name}</p>
          <p className="text-xs text-on-surface-variant truncate">{resource.artist}</p>
        </div>
        <Link
          to={`/sheet-music/${resource.md5}`}
          className="shrink-0 mr-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tertiary/10 text-tertiary text-xs font-semibold hover:bg-tertiary/20 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open Chart
        </Link>
      </div>
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
          state={{from: '/guitar/repertoire/session'}}
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
  const isTheory = item.itemType === 'theory';
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
        {!isTheory && item.notes && (
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
        {isTheory ? 'Recall the answer, then reveal it.' : 'Play through this now, then rate yourself honestly.'}
      </p>

      <button
        onClick={onShowBack}
        className="w-full py-4 rounded-2xl bg-primary text-on-primary font-bold text-base hover:bg-primary/90 active:scale-95 transition-all"
      >
        {isTheory ? 'Reveal Answer' : 'Show Self-Assessment'}
      </button>
    </div>
  );
}

function TheoryAnswer({notes}: {notes: string}) {
  return (
    <div className="rounded-3xl bg-surface-container p-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({children}) => <p className="text-on-surface leading-relaxed mb-2 text-sm">{children}</p>,
          strong: ({children}) => <strong className="text-on-surface font-semibold">{children}</strong>,
          ul: ({children}) => <ul className="list-disc pl-5 mb-2 space-y-0.5 text-on-surface-variant text-sm">{children}</ul>,
          li: ({children}) => <li className="leading-relaxed">{children}</li>,
          code: ({children}) => <code className="bg-surface-container-high px-1.5 py-0.5 rounded text-xs font-mono text-on-surface">{children}</code>,
        }}
      >
        {notes}
      </ReactMarkdown>
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
  const location = useLocation();
  const isTheory = item.itemType === 'theory';
  const [resource, setResource] = useState<LinkedResource | null | 'loading'>('loading');

  useEffect(() => {
    if (isTheory) return;
    fetchLinkedResource(item).then(setResource);
  }, [item.id, isTheory]);

  const lessonHref = isTheory && item.theorySource
    ? lessonLinkFromSource(item.theorySource)
    : null;

  return (
    <div className="flex flex-col gap-5">
      {isTheory ? (
        <>
          {item.notes ? (
            <TheoryAnswer notes={item.notes} />
          ) : (
            <div className="rounded-3xl bg-surface-container p-6 text-center">
              <h2 className="text-2xl font-bold text-on-surface">{item.title}</h2>
            </div>
          )}
          {lessonHref && (
            <Link
              to={lessonHref}
              state={{from: location.pathname + location.search}}
              className="self-start flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors border border-outline-variant/30 px-3 py-1.5 rounded-lg hover:bg-surface-container"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Review lesson
            </Link>
          )}
        </>
      ) : (
        <div className="rounded-3xl bg-surface-container p-6 text-center">
          <h2 className="text-2xl font-bold text-on-surface">{item.title}</h2>
          {item.artist && (
            <p className="text-on-surface-variant mt-1">{item.artist}</p>
          )}
        </div>
      )}

      {!isTheory && resource !== 'loading' && resource && (
        <LinkedResourcePreview resource={resource} />
      )}

      {/* Inline preview — render the actual bars in-place so the user can see what they're
          rating without opening the full editor. Tab compositions and drum charts both use the
          shared `@bX+N` notes token. */}
      {!isTheory && (() => {
        const range = parseSnippetRange(item.notes);
        if (!range) return null;
        const label = (
          <p className="text-[10px] uppercase tracking-wider text-on-surface-variant px-1">
            Preview · bars {range.startBar}–{range.startBar + range.barCount - 1}
          </p>
        );
        if (item.compositionId != null) {
          return (
            <div className="flex flex-col gap-1.5">
              {label}
              <TabSnippet
                compositionId={item.compositionId}
                startBar={range.startBar}
                barCount={range.barCount}
              />
            </div>
          );
        }
        if (item.savedChartMd5) {
          return (
            <div className="flex flex-col gap-1.5">
              {label}
              <ChartSectionSnippet
                md5={item.savedChartMd5}
                startBar={range.startBar}
                barCount={range.barCount}
              />
            </div>
          );
        }
        return null;
      })()}

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
  const [searchParams] = useSearchParams();
  const urlFilter = (searchParams.get('filter') ?? 'all') as RepertoireFilter;
  // `?item=<id>` opens a single-item preview without touching session persistence.
  const singleItemId = (() => {
    const raw = searchParams.get('item');
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  })();

  const [items, setItems] = useState<RepertoireItem[] | null>(null);
  const [initialIndex, setInitialIndex] = useState(0);
  const [initialResults, setInitialResults] = useState<{item: RepertoireItem; quality: ReviewQuality}[]>([]);
  const [startedAt, setStartedAt] = useState<string | undefined>(undefined);
  const [initialShowingBack, setInitialShowingBack] = useState(false);

  useEffect(() => {
    async function init() {
      // Single-item preview mode: load just that item, skip session persistence entirely so
      // a regular due-today session resumes correctly afterwards.
      if (singleItemId != null) {
        const fetched = await getItemsByIds([singleItemId]);
        const now = new Date().toISOString();
        setItems(fetched);
        setStartedAt(now);
        return;
      }

      const saved = loadSession();

      // Restore a saved session only if it matches the requested filter
      if (saved && saved.currentIndex < saved.itemIds.length && (saved.filter ?? 'all') === urlFilter) {
        const allItems = await getItemsByIds(saved.itemIds);
        if (allItems.length > 0) {
          const doneResults = saved.resultPairs
            .map(p => {
              const item = allItems.find(i => i.id === p.itemId);
              const quality = REVIEW_QUALITIES.find(q => q === p.quality);
              return item && quality !== undefined ? {item, quality} : null;
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

          setItems(allItems);
          setInitialIndex(saved.currentIndex);
          setInitialResults(doneResults);
          setStartedAt(saved.startedAt);
          setInitialShowingBack(saved.showingBack ?? false);
          return;
        }
      }

      // Auto-seed theory cards from curriculum on first visit
      if (urlFilter === 'theory') {
        await seedTheorySRS();
      }

      // No matching saved session — start fresh with the requested filter
      const due = await getItemsDueToday(urlFilter);
      const shuffled = shuffleArray(due);
      const now = new Date().toISOString();
      setItems(shuffled);
      setStartedAt(now);

      if (shuffled.length > 0) {
        saveSession({itemIds: shuffled.map(i => i.id), currentIndex: 0, resultPairs: [], startedAt: now, filter: urlFilter});
      }
    }

    init();
  }, [urlFilter, singleItemId]);

  const session = useRepertoireSession(items ?? [], initialIndex, initialResults, startedAt, initialShowingBack, urlFilter);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (session.phase === 'showing_front' && e.key === ' ') {
        e.preventDefault();
        session.showAssessment();
        return;
      }
      if (session.phase === 'showing_back') {
        const q = KEY_TO_QUALITY[e.key];
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
      // Single-item preview: don't show the multi-item summary, just go back to the IQ page.
      if (singleItemId != null) {
        navigate('/guitar/repertoire');
        return;
      }
      clearSession();
      navigate('/guitar/repertoire/summary', {state: {results: session.results}});
    }
  }, [session.phase, session.results, navigate, singleItemId]);

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
