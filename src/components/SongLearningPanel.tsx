// src/components/SongLearningPanel.tsx
//
// "Am I learning this song?" toggle + inline SRS quality buttons. Drops into any song surface
// (sheet-music SongView, tab-editor preview, drum/Clone-Hero view). All state lives in
// repertoire_items — adding to learning means creating a row, removing means deleting it.
//
// Records reviews with SM-2 qualities (mapped from 4 Anki-style buttons: Again/Hard/Good/Easy)
// so users can log practice quality directly from the song page without going to /guitar/repertoire.

import {useCallback, useEffect, useState} from 'react';
import {BookMarked, Trash2, ChevronRight} from 'lucide-react';
import {Link} from 'react-router-dom';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {
  createItem,
  deleteItem,
  findItemBySavedChart,
  findItemByComposition,
  findItemBySection,
  recordReview,
  type RepertoireItem,
  type ItemType,
} from '@/lib/local-db/repertoire';
import type {ReviewQuality} from '@/lib/repertoire/sm2';

type Target =
  | {kind: 'saved_chart'; md5: string; title: string; artist?: string}
  | {kind: 'composition'; compositionId: number; title: string; artist?: string}
  | {kind: 'section'; songSectionId: number; title: string};

interface Props {
  target: Target;
  /** Compact 1-line variant for tight headers — the pill remains, full controls move into a popover-on-click. */
  compact?: boolean;
  className?: string;
}

const QUALITY_BUTTONS: {label: string; sub: string; quality: ReviewQuality; tone: string}[] = [
  {label: 'Again', sub: 'Failed it',     quality: 1, tone: 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 border-rose-500/30'},
  {label: 'Hard',  sub: 'Got through',   quality: 3, tone: 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/30'},
  {label: 'Good',  sub: 'Solid',         quality: 4, tone: 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/30'},
  {label: 'Easy',  sub: 'Nailed it',     quality: 5, tone: 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/30'},
];

export default function SongLearningPanel({target, compact, className}: Props) {
  const [item, setItem] = useState<RepertoireItem | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    let found: RepertoireItem | null = null;
    if (target.kind === 'saved_chart') found = await findItemBySavedChart(target.md5);
    else if (target.kind === 'composition') found = await findItemByComposition(target.compositionId);
    else if (target.kind === 'section') found = await findItemBySection(target.songSectionId);
    setItem(found);
  }, [target]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const itemType: ItemType =
        target.kind === 'composition' ? 'composition'
        : target.kind === 'section' ? 'song_section'
        : 'song';
      await createItem({
        itemType,
        title: target.title,
        artist: target.kind === 'section' ? undefined : target.artist,
        savedChartMd5: target.kind === 'saved_chart' ? target.md5 : undefined,
        compositionId: target.kind === 'composition' ? target.compositionId : undefined,
        songSectionId: target.kind === 'section' ? target.songSectionId : undefined,
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (busy || !item) return;
    setBusy(true);
    try {
      await deleteItem(item.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleReview = async (quality: ReviewQuality) => {
    if (busy || !item) return;
    setBusy(true);
    try {
      await recordReview(item.id, quality, undefined);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!item) {
    // Not in learning — single CTA.
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleAdd}
        disabled={busy}
        className={cn('gap-2', className)}
      >
        <BookMarked className="h-4 w-4" />
        <span>Start learning</span>
      </Button>
    );
  }

  if (compact) {
    return (
      <Link
        to={`/guitar/repertoire?item=${item.id}`}
        className={cn(
          'flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/15 transition-colors',
          className,
        )}
      >
        <div className="text-xs">
          <div className="font-semibold text-emerald-700 dark:text-emerald-400">Learning this</div>
          <div className="text-on-surface-variant">{relative(item.nextReviewDate)}</div>
        </div>
        <ChevronRight className="h-4 w-4 text-emerald-600" />
      </Link>
    );
  }

  // Full panel — pill state + quality buttons + remove.
  return (
    <div className={cn('rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex flex-col gap-3', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs flex-1 min-w-0">
          <div className="font-semibold text-emerald-700 dark:text-emerald-400">Learning this song</div>
          <div className="text-on-surface-variant leading-relaxed">
            Next: {relative(item.nextReviewDate)}
            {item.lastReviewedAt && (
              <>
                <span className="text-on-surface-variant/40"> · </span>
                {item.repetitions} {item.repetitions === 1 ? 'review' : 'reviews'}
              </>
            )}
          </div>
        </div>
        <button
          onClick={handleRemove}
          disabled={busy}
          className="text-on-surface-variant/60 hover:text-rose-500 transition-colors p-1 -m-1 disabled:opacity-50"
          title="Remove from learning"
          aria-label="Remove from learning"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-2 font-medium">
          How did this run go?
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {QUALITY_BUTTONS.map(b => (
            <button
              key={b.quality}
              onClick={() => handleReview(b.quality)}
              disabled={busy}
              className={cn(
                'px-2.5 py-2 rounded-lg border transition-all disabled:opacity-50 active:scale-95',
                'flex flex-col items-start gap-0.5 leading-tight',
                b.tone,
              )}
            >
              <span className="text-xs font-bold">{b.label}</span>
              <span className="text-[10px] opacity-70 font-normal">{b.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <Link
        to={`/guitar/repertoire?item=${item.id}`}
        className="text-[11px] text-on-surface-variant hover:text-on-surface flex items-center gap-0.5 self-end -mr-1"
      >
        <span>Open in RepertoireIQ</span>
        <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function relative(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday (overdue)';
  if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
  if (diffDays < 7) return `in ${diffDays} days`;
  return d.toLocaleDateString();
}

function relativePast(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString();
}
