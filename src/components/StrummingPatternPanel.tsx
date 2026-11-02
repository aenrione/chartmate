import {useMemo} from 'react';
import {ArrowDown, ArrowUp, Guitar} from 'lucide-react';
import {cn} from '@/lib/utils';
import {
  analyzeStrumming,
  describeRunRange,
  formatStrummingRun,
  type StrumSlot,
  type StrummingRun,
} from '@/lib/tab-editor/strummingPattern';

/** Shared with the tab editor, the playbook viewer and the guitar song view. */
export const SHOW_STRUMMING_KEY = 'chartmate.showStrumming.v1';

interface StrummingPatternPanelProps {
  /** AlphaTab score, or null while one is loading. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  score: any;
  /** Which track to summarise. */
  trackIndex?: number;
  /**
   * Bump this whenever the score is mutated in place. The editor holds the
   * score in a ref, so its identity never changes and the memo needs a
   * separate signal.
   */
  version?: number;
  /** Highlight the run that contains this 0-based bar, when known. */
  currentBarIndex?: number | null;
  /** Lay the runs out side by side instead of stacked. */
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

/** One stroke cell: the count syllable over the arrow. */
function SlotCell({slot}: {slot: StrumSlot}) {
  const Arrow = slot.direction === 'up' ? ArrowUp : ArrowDown;
  const partial = slot.width === 'partial';

  return (
    <div className="flex flex-col items-center gap-0.5 w-6 shrink-0">
      <span
        className={cn(
          'text-[10px] leading-none font-mono tabular-nums',
          slot.label === '&' || slot.label.length > 1
            ? 'text-on-surface-variant/60'
            : 'text-on-surface-variant',
        )}
      >
        {slot.label || ' '}
      </span>
      <span
        className={cn(
          'h-5 flex items-center justify-center',
          slot.accented && 'rounded-sm bg-primary/15 w-5',
        )}
      >
        {!slot.sounds ? (
          <span className="text-on-surface-variant/25 text-sm leading-none">·</span>
        ) : slot.muted ? (
          <span
            className={cn(
              'text-sm leading-none font-bold',
              slot.accented ? 'text-primary' : 'text-on-surface',
            )}
          >
            ✕
          </span>
        ) : slot.direction === null ? (
          <span className="text-on-surface-variant text-sm leading-none">•</span>
        ) : (
          <Arrow
            className={cn(
              partial ? 'h-3 w-3' : 'h-4 w-4',
              slot.accented
                ? 'text-primary'
                : partial
                  ? 'text-on-surface-variant/60'
                  : 'text-on-surface',
            )}
            strokeWidth={slot.accented ? 3 : partial ? 1.5 : 2.5}
          />
        )}
      </span>
    </div>
  );
}

function RunRow({run, active}: {run: StrummingRun; active: boolean}) {
  const changed = run.differsFromPrevious;
  return (
    <div
      className={cn(
        'rounded-md border px-2 py-1.5 transition-colors',
        active
          ? 'border-primary/50 bg-primary/5'
          : 'border-outline-variant/25 bg-surface-container-low',
      )}
      title={formatStrummingRun(run)}
    >
      <div className="flex items-baseline gap-2 mb-0.5">
        <span
          className={cn(
            'text-[10px] font-semibold uppercase tracking-wider',
            active ? 'text-primary' : 'text-on-surface-variant',
          )}
        >
          {describeRunRange(run)}
        </span>
        <span className="text-[10px] text-on-surface-variant/60 font-mono">
          {run.timeSignature}
        </span>
        {changed !== null && changed.length > 0 && changed.length <= 2 && (
          <span className="text-[10px] text-tertiary">
            differs on {changed.map(i => run.counts[i] || '·').join(', ')}
          </span>
        )}
      </div>
      <div className="flex items-start gap-0.5 overflow-x-auto">
        {run.slots.map((slot, i) => (
          <SlotCell key={i} slot={slot} />
        ))}
      </div>
    </div>
  );
}

/**
 * The strumming pattern of a score, as one line per run of bars that share it.
 *
 * Renders nothing when the score has no brush strokes, so a fingerpicked piece
 * is unaffected. The derivation lives in `@/lib/tab-editor/strummingPattern`;
 * this component only draws it.
 */
export default function StrummingPatternPanel({
  score,
  trackIndex = 0,
  version = 0,
  currentBarIndex = null,
  orientation = 'vertical',
  className,
}: StrummingPatternPanelProps) {
  const analysis = useMemo(
    () => analyzeStrumming(score, trackIndex),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [score, trackIndex, version],
  );

  if (analysis.runs.length === 0) return null;

  const activeRun =
    currentBarIndex === null
      ? -1
      : analysis.runs.findIndex(
          r => currentBarIndex + 1 >= r.startBar && currentBarIndex + 1 <= r.endBar,
        );

  return (
    <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      <div className="flex items-center gap-1.5">
        <Guitar className="h-3 w-3 text-on-surface-variant" />
        <span className="text-[10px] uppercase tracking-widest font-bold font-mono text-on-surface-variant">
          Strumming
        </span>
        <span className="text-[10px] text-on-surface-variant/60">
          {analysis.runs.length === 1
            ? 'one pattern throughout'
            : `${analysis.runs.length} patterns`}
        </span>
      </div>

      <div
        className={cn(
          'gap-1.5 min-w-0',
          orientation === 'horizontal' ? 'flex overflow-x-auto' : 'flex flex-col',
        )}
      >
        {analysis.runs.map((run, i) => (
          <RunRow key={`${run.startBar}-${run.signature}`} run={run} active={i === activeRun} />
        ))}
      </div>

      <p className="text-[10px] text-on-surface-variant/60 leading-snug">
        Arrow = brush direction · small arrow = partial stroke · ✕ = muted ·
        highlighted = accented
        {analysis.skippedBars.length > 0 &&
          ` · ${analysis.skippedBars.length} bar(s) too subdivided to summarise`}
      </p>
    </div>
  );
}
