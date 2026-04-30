import {useRef, useEffect} from 'react';
import {cn} from '@/lib/utils';
import {type FretPosition} from '../lib/musicTheory';
import {FRET_MARKERS, DOUBLE_MARKERS, STRING_COUNT, MAX_FRET} from '../lib/musicTheory';

// Visual order: top = high E (thinnest), bottom = low E (thickest)
const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E']; // visual top-to-bottom
const STRING_WIDTHS = [1.2, 1.6, 2.0, 2.5, 3.2, 4.0]; // visual top-to-bottom (thin→thick)
const STRING_OPACITIES = [0.6, 0.6, 0.6, 0.7, 0.8, 0.9];

const LABEL_WIDTH = 30;   // width of the pinned label column
const FRET_NUT_X = 4;     // small left margin inside the fret-only SVG
const NUT_WIDTH = 8;
const SVG_HEIGHT = 240;
const STRING_SPACING = SVG_HEIGHT / (STRING_COUNT + 1);

// Per-fret spacing kept constant regardless of maxFret (same visual density as the 22-fret layout)
const BASE_FRET_SPACING = 1400 / (MAX_FRET + 1); // ≈ 60.87

function dataToVisual(dataStringIdx: number): number {
  return STRING_COUNT - 1 - dataStringIdx;
}

function stringY(visualIdx: number): number {
  return (visualIdx + 1) * STRING_SPACING;
}

export interface HighlightedPosition extends FretPosition {
  color?: string;
  label?: string;
  glow?: boolean;
  pulse?: boolean;
}

interface FretboardProps {
  highlightedPositions?: HighlightedPosition[];
  onPositionClick?: (position: FretPosition) => void;
  clickablePositions?: FretPosition[];
  interactive?: boolean;
  className?: string;
  /** Limit visible frets (default MAX_FRET=22). Anki uses 12. */
  maxFret?: number;
  /** Highlight entire strings in a given color (data string indices). */
  highlightedStrings?: Array<{string: number; color: string}>;
  /** Auto-scroll to center this fret in the viewport whenever the value changes. */
  scrollToFret?: number;
  /** Reduce padding for space-constrained layouts. */
  compact?: boolean;
}

export default function Fretboard({
  highlightedPositions = [],
  onPositionClick,
  clickablePositions,
  interactive = false,
  className = '',
  maxFret = MAX_FRET,
  highlightedStrings,
  scrollToFret,
  compact = false,
}: FretboardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const fretCount = Math.min(maxFret, MAX_FRET);
  const fretAreaWidth = Math.round(BASE_FRET_SPACING * (fretCount + 1));
  // SVG width = fret area + small left margin (no label area — labels are in a separate column)
  const svgWidth = fretAreaWidth + FRET_NUT_X;
  const fretSpacing = fretAreaWidth / (fretCount + 1);

  function calcFretX(fret: number): number {
    return FRET_NUT_X + NUT_WIDTH + fret * fretSpacing - fretSpacing / 2;
  }

  useEffect(() => {
    if (scrollToFret === undefined || !scrollRef.current) return;
    const el = scrollRef.current;
    requestAnimationFrame(() => {
      const fretPx = FRET_NUT_X + NUT_WIDTH + scrollToFret * fretSpacing - fretSpacing / 2;
      const scale = el.scrollWidth / svgWidth;
      el.scrollTo({left: Math.max(0, fretPx * scale - el.clientWidth / 3), behavior: 'smooth'});
    });
  }, [scrollToFret, fretSpacing, svgWidth]);

  const isClickable = (dataStringIdx: number, fret: number) => {
    if (!interactive) return false;
    if (!clickablePositions) return true;
    return clickablePositions.some(p => p.string === dataStringIdx && p.fret === fret);
  };

  const innerH = compact ? 'h-[250px]' : 'h-[260px]';

  return (
    <div
      className={cn(
        'bg-surface-container-low rounded-2xl border border-outline-variant/10 flex',
        compact ? 'p-2 lg:p-3' : 'p-8',
        className,
      )}
    >
      {/* ── Pinned label column (never scrolls) ───────────────────────── */}
      <div
        className="relative shrink-0 self-center"
        style={{width: LABEL_WIDTH, height: SVG_HEIGHT}}
      >
        {STRING_LABELS.map((label, visualIdx) => (
          <span
            key={visualIdx}
            className="absolute text-[11px] font-bold font-mono text-outline/70"
            style={{
              top: stringY(visualIdx),
              right: 8,
              transform: 'translateY(-50%)',
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* ── Scrollable fret area ───────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto">
        <div
          style={{minWidth: `${svgWidth}px`}}
          className={cn(innerH, 'relative flex items-center')}
        >
          <svg
            className="w-full h-[240px]"
            viewBox={`0 0 ${svgWidth} ${SVG_HEIGHT}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Marker fret labels at the top (3, 5, 7, 9, 12…) */}
            {FRET_MARKERS.filter(f => f <= fretCount).map(fret => (
              <text
                key={`fret-label-${fret}`}
                x={calcFretX(fret)}
                y={11}
                textAnchor="middle"
                fill="var(--outline, #928EA0)"
                fontSize={10}
                fontWeight={600}
                fontFamily="JetBrains Mono, monospace"
                opacity={0.45}
              >
                {fret}
              </text>
            ))}

            {/* Nut */}
            <rect
              x={FRET_NUT_X} y={14}
              width={NUT_WIDTH} height={SVG_HEIGHT - 14}
              rx={2} fill="#353534"
            />

            {/* Frets */}
            {Array.from({length: fretCount}, (_, i) => (
              <rect
                key={`fret-${i}`}
                x={FRET_NUT_X + NUT_WIDTH + (i + 1) * fretSpacing}
                y={14}
                width={2}
                height={SVG_HEIGHT - 14}
                fill="#474554"
                opacity={0.4}
              />
            ))}

            {/* Fret marker dots */}
            {FRET_MARKERS.filter(f => f <= fretCount).map(fret => {
              const x = calcFretX(fret);
              if (DOUBLE_MARKERS.includes(fret)) {
                return (
                  <g key={`marker-${fret}`}>
                    <circle cx={x} cy={SVG_HEIGHT * 0.4} r={6} fill="#353534" opacity={0.3} />
                    <circle cx={x} cy={SVG_HEIGHT * 0.7} r={6} fill="#353534" opacity={0.3} />
                  </g>
                );
              }
              return (
                <circle
                  key={`marker-${fret}`}
                  cx={x} cy={SVG_HEIGHT / 2 + 10}
                  r={6} fill="#353534" opacity={0.3}
                />
              );
            })}

            {/* Base strings */}
            {Array.from({length: STRING_COUNT}, (_, visualIdx) => (
              <line
                key={`string-${visualIdx}`}
                x1={FRET_NUT_X} x2={svgWidth}
                y1={stringY(visualIdx)} y2={stringY(visualIdx)}
                stroke="#928EA0"
                strokeWidth={STRING_WIDTHS[visualIdx]}
                opacity={STRING_OPACITIES[visualIdx]}
              />
            ))}

            {/* Highlighted string overlays */}
            {highlightedStrings?.map(({string: dataStr, color}) => {
              const visualIdx = dataToVisual(dataStr);
              const y = stringY(visualIdx);
              return (
                <g key={`hstring-${dataStr}`}>
                  <line x1={FRET_NUT_X} x2={svgWidth} y1={y} y2={y} stroke={color} strokeWidth={16} opacity={0.12} />
                  <line x1={FRET_NUT_X} x2={svgWidth} y1={y} y2={y} stroke={color} strokeWidth={STRING_WIDTHS[visualIdx] + 1.5} opacity={0.9} />
                </g>
              );
            })}

            {/* Highlighted positions */}
            {highlightedPositions.map((pos, i) => {
              const cx = calcFretX(pos.fret);
              const cy = stringY(dataToVisual(pos.string));
              const color = pos.color ?? '#00CEC9';
              return (
                <g key={`highlight-${i}`}>
                  {pos.glow && (
                    <circle
                      cx={cx} cy={cy} r={22}
                      fill={color} fillOpacity={0.1}
                      className={pos.pulse ? 'animate-pulse' : ''}
                    />
                  )}
                  <circle
                    cx={cx} cy={cy} r={10}
                    fill={color}
                    style={pos.glow ? {filter: `drop-shadow(0 0 10px ${color}80)`} : undefined}
                  />
                  {pos.label && (
                    <text x={cx} y={cy + 4} textAnchor="middle" fill="white" fontSize={9} fontWeight={700} fontFamily="JetBrains Mono">
                      {pos.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Clickable hit areas */}
            {interactive &&
              Array.from({length: STRING_COUNT}, (_, dataStr) =>
                Array.from({length: fretCount + 1}, (_, f) => {
                  if (!isClickable(dataStr, f)) return null;
                  const cx = calcFretX(f);
                  const cy = stringY(dataToVisual(dataStr));
                  return (
                    <circle
                      key={`click-${dataStr}-${f}`}
                      cx={cx} cy={cy} r={18}
                      fill="rgba(0,0,0,0.001)"
                      style={{pointerEvents: 'all', touchAction: 'manipulation', cursor: 'pointer'}}
                      className="hover:fill-primary/10 transition-colors"
                      onClick={() => onPositionClick?.({string: dataStr, fret: f})}
                      onTouchEnd={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        onPositionClick?.({string: dataStr, fret: f});
                      }}
                    />
                  );
                }),
              )}
          </svg>
        </div>
      </div>
    </div>
  );
}
