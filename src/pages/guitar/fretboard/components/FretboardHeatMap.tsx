import {STRING_COUNT, MAX_FRET} from '../lib/musicTheory';
import type {PositionStats} from '@/lib/local-db/fretboard';

const STRING_LABELS = ['E', 'B', 'G', 'D', 'A', 'E'];

interface FretboardHeatMapProps {
  stats: PositionStats[];
  fretRange?: [number, number];
  stringRange?: [number, number];
  compact?: boolean;
  className?: string;
}

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 0.75) return 'bg-secondary-container';
  if (accuracy >= 0.4) return 'bg-tertiary-container';
  return 'bg-error-container';
}

function getAccuracyTextColor(accuracy: number): string {
  if (accuracy >= 0.75) return 'text-on-secondary-container';
  if (accuracy >= 0.4) return 'text-on-tertiary-container';
  return 'text-on-error-container';
}

export default function FretboardHeatMap({
  stats,
  fretRange = [0, MAX_FRET],
  stringRange = [0, STRING_COUNT - 1],
  compact = false,
  className = '',
}: FretboardHeatMapProps) {
  const statsMap = new Map<string, PositionStats>();
  for (const s of stats) {
    statsMap.set(`${s.stringIndex},${s.fret}`, s);
  }

  const fretCount = fretRange[1] - fretRange[0] + 1;

  if (compact) {
    return (
      <div className={`space-y-1 ${className}`}>
        {Array.from({length: stringRange[1] - stringRange[0] + 1}, (_, sIdx) => {
          const s = sIdx + stringRange[0];
          return (
            <div key={s} className="grid gap-[2px] h-6 w-full bg-surface-container-highest/50 rounded-sm overflow-hidden p-0.5"
              style={{gridTemplateColumns: `repeat(${Math.min(12, fretCount)}, 1fr)`}}
            >
              {Array.from({length: Math.min(12, fretCount)}, (_, fIdx) => {
                const f = fIdx + fretRange[0];
                const stat = statsMap.get(`${s},${f}`);
                const accuracy = stat ? stat.accuracy : 0;
                const color = stat
                  ? accuracy >= 0.75 ? `bg-green-500/${Math.round(accuracy * 100)}`
                  : accuracy >= 0.4 ? `bg-amber-500/${Math.round(accuracy * 100)}`
                  : `bg-red-500/${Math.round(Math.max(20, accuracy * 100))}`
                  : 'bg-surface-container';
                return <div key={fIdx} className={`${color} rounded-sm`} />;
              })}
            </div>
          );
        })}
        <div className="flex justify-between mt-1 px-1">
          <span className="text-[8px] text-on-surface-variant font-mono">Nut</span>
          <span className="text-[8px] text-on-surface-variant font-mono">12th Fret</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-surface-container-low rounded-3xl p-8 border border-outline-variant/5 overflow-hidden ${className}`}>
      <div className="overflow-x-auto pb-4">
        <div
          className="inline-grid gap-y-0 min-w-max"
          style={{gridTemplateColumns: `auto repeat(${fretCount}, minmax(48px, 1fr))`}}
        >
          {/* Fret numbers header */}
          <div />
          {Array.from({length: fretCount}, (_, i) => {
            const fret = i + fretRange[0];
            return (
              <div key={fret} className="text-center pb-3">
                <span className="font-mono text-[10px] text-on-surface-variant/40 font-bold">
                  {fret === 0 ? 'NUT' : fret}
                </span>
              </div>
            );
          })}

          {/* Strings */}
          {Array.from({length: stringRange[1] - stringRange[0] + 1}, (_, sIdx) => {
            const s = sIdx + stringRange[0];
            return [
              <div key={`label-${s}`} className="flex items-center justify-end pr-4 h-12">
                <span className="font-mono text-xs font-bold text-secondary-fixed/50">
                  {STRING_LABELS[s]}
                </span>
              </div>,
              ...Array.from({length: fretCount}, (_, fIdx) => {
                const f = fIdx + fretRange[0];
                const stat = statsMap.get(`${s},${f}`);
                const accuracy = stat ? stat.accuracy : 0;
                const hasData = stat && stat.totalAttempts > 0;

                return (
                  <div key={`cell-${s}-${f}`} className="h-12 border-l border-outline-variant/10 relative flex items-center justify-center">
                    <div className="absolute w-full h-[2px] bg-outline-variant/20 top-1/2 -translate-y-1/2 z-0" />
                    <div
                      className={`group/cell relative z-10 w-8 h-8 rounded-lg flex items-center justify-center cursor-help transition-all duration-200 hover:scale-110 hover:z-10 hover:shadow-[0_0_15px_rgba(198,191,255,0.3)] ${
                        hasData ? `${getAccuracyColor(accuracy)} ${getAccuracyTextColor(accuracy)}` : 'bg-surface-container text-on-surface-variant/30'
                      }`}
                    >
                      <span className="font-mono text-[10px] font-bold">
                        {hasData ? `${Math.round(accuracy * 100)}%` : '—'}
                      </span>

                      {/* Tooltip */}
                      {hasData && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover/cell:block w-48 z-50">
                          <div className="bg-surface-container-highest/95 backdrop-blur-xl p-3 rounded-xl border border-outline-variant/20 shadow-2xl">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-mono text-[10px] text-secondary uppercase font-bold tracking-tighter">
                                {STRING_LABELS[s]}{f}
                              </span>
                              <span className="font-mono text-[10px] text-on-surface/50">
                                {Math.round(accuracy * 100)}% ACC
                              </span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <span className="text-[10px] text-on-surface-variant/60">Attempts</span>
                                <span className="font-mono text-[10px] text-on-surface">{stat.totalAttempts}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] text-on-surface-variant/60">Avg Speed</span>
                                <span className="font-mono text-[10px] text-on-surface">{stat.avgResponseMs}ms</span>
                              </div>
                              {stat.lastPracticedAt && (
                                <div className="flex justify-between">
                                  <span className="text-[10px] text-on-surface-variant/60">Last Practiced</span>
                                  <span className="font-mono text-[10px] text-on-surface">
                                    {new Date(stat.lastPracticedAt).toLocaleDateString()}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="w-3 h-3 bg-surface-container-highest/95 rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-r border-b border-outline-variant/20" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              }),
            ];
          })}
        </div>
      </div>
    </div>
  );
}
