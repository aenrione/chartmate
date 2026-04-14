import {useLocation, useNavigate, Link} from 'react-router-dom';
import {Flame, CheckCircle2, PlusCircle} from 'lucide-react';
import {cn} from '@/lib/utils';
import {QUALITY_LABELS, ReviewQuality} from '@/lib/repertoire/sm2';
import type {RepertoireItem} from '@/lib/local-db/repertoire';

interface SessionResult {
  item: RepertoireItem;
  quality: ReviewQuality;
}

const QUALITY_DOTS: Record<ReviewQuality, string> = {
  1: 'bg-red-400',
  3: 'bg-orange-400',
  4: 'bg-emerald-400',
  5: 'bg-blue-400',
};

export default function RepertoireSummaryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const results: SessionResult[] = location.state?.results ?? [];

  const counts = results.reduce(
    (acc, r) => {
      acc[r.quality] = (acc[r.quality] ?? 0) + 1;
      return acc;
    },
    {} as Record<number, number>,
  );

  const successRate = results.length > 0
    ? Math.round((results.filter(r => r.quality >= 4).length / results.length) * 100)
    : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md text-center flex flex-col gap-6">
          {/* Header */}
          <div>
            <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-on-surface">Session Complete!</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              You reviewed {results.length} {results.length === 1 ? 'item' : 'items'}
            </p>
          </div>

          {/* Stats */}
          <div className="rounded-3xl bg-surface-container p-6 text-left">
            <div className="flex justify-between mb-4">
              <span className="text-sm text-on-surface-variant font-medium">Success rate</span>
              <span className={cn(
                'text-sm font-bold',
                successRate >= 80 ? 'text-emerald-400' : successRate >= 50 ? 'text-amber-400' : 'text-red-400',
              )}>
                {successRate}%
              </span>
            </div>
            <div className="space-y-2">
              {([5, 4, 3, 1] as ReviewQuality[]).map(q => {
                const count = counts[q] ?? 0;
                if (count === 0) return null;
                return (
                  <div key={q} className="flex items-center gap-3">
                    <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', QUALITY_DOTS[q])} />
                    <span className="text-sm text-on-surface flex-1">{QUALITY_LABELS[q]}</span>
                    <span className="text-sm font-semibold text-on-surface">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Items list */}
          {results.length > 0 && (
            <div className="rounded-3xl bg-surface-container p-4 text-left">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
                Reviewed
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={cn('h-2 w-2 rounded-full shrink-0', QUALITY_DOTS[r.quality])} />
                    <span className="text-sm text-on-surface flex-1 truncate">{r.item.title}</span>
                    <span className="text-xs text-on-surface-variant shrink-0">
                      {QUALITY_LABELS[r.quality]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Link
              to="/guitar/repertoire"
              className="flex-1 py-3 rounded-2xl bg-surface-container text-on-surface font-semibold text-sm text-center hover:bg-surface-container-high transition-all"
            >
              Back to Repertoire
            </Link>
            <Link
              to="/guitar/repertoire/manage"
              className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-outline-variant/30 bg-surface-container text-on-surface text-sm font-medium hover:bg-surface-container-high transition-all"
            >
              <PlusCircle className="h-4 w-4" />
              Add Items
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
