import {useEffect} from 'react';
import {cn} from '@/lib/utils';
import type {DrumPatternActivity as DrumPatternActivityType, DrumTrack} from '@/lib/curriculum/types';

// ── Color palette ─────────────────────────────────────────────────────────────

const COLOR_CLASSES = {
  yellow: {hit: 'bg-amber-400',   ghost: 'bg-amber-400/40',  accent: 'bg-amber-300',  label: 'text-amber-400',  glow: 'shadow-amber-400/50'},
  red:    {hit: 'bg-rose-400',    ghost: 'bg-rose-400/40',   accent: 'bg-rose-300',   label: 'text-rose-400',   glow: 'shadow-rose-400/50'},
  blue:   {hit: 'bg-indigo-400',  ghost: 'bg-indigo-400/40', accent: 'bg-indigo-300', label: 'text-indigo-400', glow: 'shadow-indigo-400/50'},
  green:  {hit: 'bg-emerald-400', ghost: 'bg-emerald-400/40',accent: 'bg-emerald-300',label: 'text-emerald-400',glow: 'shadow-emerald-400/50'},
  purple: {hit: 'bg-purple-400',  ghost: 'bg-purple-400/40', accent: 'bg-purple-300', label: 'text-purple-400', glow: 'shadow-purple-400/50'},
  orange: {hit: 'bg-orange-400',  ghost: 'bg-orange-400/40', accent: 'bg-orange-300', label: 'text-orange-400', glow: 'shadow-orange-400/50'},
} as const;

type ColorKey = keyof typeof COLOR_CLASSES;

function autoColor(name: string): ColorKey {
  const n = name.toLowerCase();
  if (n.includes('hi') || n.includes('hat') || n.includes('cymbal') || n.includes('crash') || n.includes('ride')) return 'yellow';
  if (n.includes('snare') || n.includes('rim')) return 'red';
  if (n.includes('kick') || n.includes('bass')) return 'blue';
  if (n.includes('tom') || n.includes('floor')) return 'green';
  if (n.includes('cowbell') || n.includes('clave') || n.includes('shaker')) return 'purple';
  return 'orange';
}

// ── Beat labels ───────────────────────────────────────────────────────────────

function getBeatLabels(subdivisions: number, timeSignature: string): string[] {
  const beats = parseInt(timeSignature.split('/')[0] ?? '4', 10);
  if (subdivisions === 16) {
    const subs = ['1', 'e', '+', 'a'];
    return Array.from({length: beats * 4}, (_, i) =>
      i % 4 === 0 ? String(Math.floor(i / 4) + 1) : subs[i % 4],
    );
  }
  // 8th notes
  return Array.from({length: beats * 2}, (_, i) =>
    i % 2 === 0 ? String(Math.floor(i / 2) + 1) : '+',
  );
}

function isDownbeat(idx: number, subdivisions: number): boolean {
  return idx % subdivisions === 0;
}

function isBeat(idx: number, subdivisions: number): boolean {
  const subDiv = subdivisions === 16 ? 4 : 2;
  return idx % subDiv === 0;
}

// ── Cell ─────────────────────────────────────────────────────────────────────

function Cell({char, colorKey, idx, subdivisions}: {
  char: string;
  colorKey: ColorKey;
  idx: number;
  subdivisions: number;
}) {
  const c = COLOR_CLASSES[colorKey];
  const isDown = isDownbeat(idx, subdivisions);
  const isBt = isBeat(idx, subdivisions);

  if (char === 'x') {
    return (
      <div className={cn(
        'rounded-full shadow-sm',
        c.hit,
        isDown ? 'shadow-md ' + c.glow : '',
      )} />
    );
  }
  if (char === 'X') {
    return (
      <div className={cn('rounded-full ring-2 ring-white/60', c.accent)} />
    );
  }
  if (char === 'o') {
    return (
      <div className={cn('rounded-full opacity-60', c.ghost)} />
    );
  }
  // rest '-'
  return (
    <div className={cn(
      'rounded-full border',
      isBt ? 'border-outline-variant/30' : 'border-outline-variant/15',
    )} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  activity: DrumPatternActivityType;
  onPass: () => void;
}

export default function DrumPatternActivity({activity, onPass}: Props) {
  useEffect(() => { onPass(); }, [activity]);

  const subdivisions = activity.subdivisions ?? 8;
  const timeSignature = activity.timeSignature ?? '4/4';
  const beatLabels = getBeatLabels(subdivisions, timeSignature);
  const totalCells = beatLabels.length;

  // Normalise tracks: pad/trim pattern to totalCells
  const tracks: (DrumTrack & {colorKey: ColorKey})[] = activity.tracks.map(t => ({
    ...t,
    colorKey: (t.color ?? autoColor(t.name)) as ColorKey,
    pattern: t.pattern.replace(/\s/g, '').slice(0, totalCells).padEnd(totalCells, '-'),
  }));

  const cellSize = subdivisions === 16 ? 18 : 28;
  const labelWidth = 56;
  const gap = 4;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-4">
      {(activity.title || activity.description) && (
        <div>
          {activity.title && (
            <h3 className="text-base font-bold text-on-surface mb-1">{activity.title}</h3>
          )}
          {activity.description && (
            <p className="text-sm text-on-surface-variant leading-relaxed">{activity.description}</p>
          )}
        </div>
      )}

      {/* Info row */}
      <div className="flex items-center gap-3 text-xs text-on-surface-variant">
        <span className="px-2 py-0.5 rounded bg-surface-container font-mono">{timeSignature}</span>
        <span>{subdivisions === 16 ? '16th' : '8th'} note grid</span>
        {activity.bpm && <span>{activity.bpm} BPM</span>}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl bg-surface-container/60 p-3 border border-outline-variant/15">
        <div style={{minWidth: labelWidth + totalCells * (cellSize + gap)}}>

          {/* Beat labels row */}
          <div className="flex items-center mb-2" style={{gap}}>
            <div style={{width: labelWidth, minWidth: labelWidth}} />
            {beatLabels.map((label, i) => (
              <div
                key={i}
                className={cn(
                  'text-center font-mono shrink-0',
                  isBeat(i, subdivisions)
                    ? 'text-on-surface text-xs font-bold'
                    : 'text-on-surface-variant/50 text-[10px]',
                )}
                style={{width: cellSize}}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Beat separator lines */}
          <div className="flex items-center mb-2" style={{gap}}>
            <div style={{width: labelWidth, minWidth: labelWidth}} />
            {beatLabels.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'shrink-0',
                  isDownbeat(i, subdivisions)
                    ? 'h-2 bg-outline-variant/40 rounded-full'
                    : isBeat(i, subdivisions)
                    ? 'h-1.5 bg-outline-variant/25 rounded-full'
                    : 'h-1 bg-outline-variant/10 rounded-full',
                )}
                style={{width: cellSize}}
              />
            ))}
          </div>

          {/* Track rows */}
          {tracks.map(track => (
            <div key={track.name} className="flex items-center mb-1.5" style={{gap}}>
              {/* Track label */}
              <div
                className={cn('text-xs font-semibold truncate shrink-0 text-right pr-2', COLOR_CLASSES[track.colorKey].label)}
                style={{width: labelWidth, minWidth: labelWidth}}
              >
                {track.name}
              </div>

              {/* Pattern cells */}
              {Array.from(track.pattern).map((char, i) => (
                <div
                  key={i}
                  className="shrink-0 flex items-center justify-center"
                  style={{width: cellSize, height: cellSize}}
                >
                  <div style={{width: cellSize - 6, height: cellSize - 6}}>
                    <Cell
                      char={char}
                      colorKey={track.colorKey}
                      idx={i}
                      subdivisions={subdivisions}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {[
          {char: 'x', label: 'Hit'},
          {char: 'X', label: 'Accent'},
          {char: 'o', label: 'Ghost'},
          {char: '-', label: 'Rest'},
        ].map(({char, label}) => (
          <div key={char} className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            <div className="w-3.5 h-3.5 flex items-center justify-center">
              {char === 'x' && <div className="w-3 h-3 rounded-full bg-on-surface-variant/60" />}
              {char === 'X' && <div className="w-3 h-3 rounded-full bg-on-surface ring-1 ring-white/60" />}
              {char === 'o' && <div className="w-3 h-3 rounded-full bg-on-surface-variant/30" />}
              {char === '-' && <div className="w-3 h-3 rounded-full border border-outline-variant/30" />}
            </div>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
