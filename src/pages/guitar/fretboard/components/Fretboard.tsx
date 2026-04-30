import {useRef, useEffect} from 'react';
import {cn} from '@/lib/utils';
import {type FretPosition} from '../lib/musicTheory';
import {FRET_MARKERS, DOUBLE_MARKERS, STRING_COUNT, MAX_FRET} from '../lib/musicTheory';

// Visual order: top = high E (thinnest), bottom = low E (thickest)
// Data order: index 0 = low E, index 5 = high E (STANDARD_TUNING)
// Conversion: visual row i = data string (STRING_COUNT - 1 - i)
const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E']; // visual top-to-bottom
const STRING_WIDTHS = [1.2, 1.6, 2.0, 2.5, 3.2, 4.0]; // visual top-to-bottom (thin→thick)
const STRING_OPACITIES = [0.6, 0.6, 0.6, 0.7, 0.8, 0.9];

const LABEL_WIDTH = 30;
const NUT_X = LABEL_WIDTH;
const NUT_WIDTH = 8;
const SVG_HEIGHT = 240;
const STRING_SPACING = SVG_HEIGHT / (STRING_COUNT + 1);

// Per-fret spacing kept constant regardless of maxFret (same visual density)
const BASE_FRET_SPACING = 1400 / (MAX_FRET + 1); // ≈ 60.87

/** Convert a data string index (0=lowE) to visual row index (0=highE at top) */
function dataToVisual(dataStringIdx: number): number {
  return STRING_COUNT - 1 - dataStringIdx;
}

/** Y position for a visual row index (0 = top of SVG) */
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
  /** Auto-scroll to center this fret in the viewport on mount. */
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
  const svgWidth = fretAreaWidth + LABEL_WIDTH;
  const fretSpacing = fretAreaWidth / (fretCount + 1);
  // Inner div min-width: same as original for full layout (1400), proportional otherwise
  const minW = fretCount === MAX_FRET ? 1400 : fretAreaWidth;

  function calcFretX(fret: number): number {
    return NUT_X + NUT_WIDTH + fret * fretSpacing - fretSpacing / 2;
  }

  useEffect(() => {
    if (scrollToFret === undefined || !scrollRef.current) return;
    const el = scrollRef.current;
    // Wait one frame so scrollWidth is computed after layout
    requestAnimationFrame(() => {
      const fretPxInSvg = NUT_X + NUT_WIDTH + scrollToFret * fretSpacing - fretSpacing / 2;
      const scale = el.scrollWidth / svgWidth;
      const centerX = fretPxInSvg * scale;
      // Place the fret at ~1/3 from the left edge so context is visible
      const scrollTarget = Math.max(0, centerX - el.clientWidth / 3);
      el.scrollTo({left: scrollTarget, behavior: 'auto'});
    });
  }, [scrollToFret, fretSpacing, svgWidth]);

  const isClickable = (dataStringIdx: number, fret: number) => {
    if (!interactive) return false;
    if (!clickablePositions) return true;
    return clickablePositions.some(p => p.string === dataStringIdx && p.fret === fret);
  };

  const innerH = compact ? 'h-[260px]' : 'h-[320px]';

  return (
    <div
      ref={scrollRef}
      className={cn(
        'relative bg-surface-container-low rounded-2xl overflow-x-auto border border-outline-variant/10',
        compact ? 'p-2 lg:p-3' : 'p-8',
        className,
      )}
    >
      <div style={{minWidth: `${minW}px`}} className={cn(innerH, 'relative flex items-center')}>
        <svg
          className="w-full h-[240px]"
          viewBox={`0 0 ${svgWidth} ${SVG_HEIGHT}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* String Labels */}
          {STRING_LABELS.map((label, visualIdx) => (
            <text
              key={`label-${visualIdx}`}
              x={LABEL_WIDTH - 8}
              y={stringY(visualIdx) + 4}
              textAnchor="end"
              fill="var(--outline, #928EA0)"
              fontSize={12}
              fontWeight={700}
              fontFamily="JetBrains Mono, monospace"
            >
              {label}
            </text>
          ))}

          {/* Nut */}
          <rect x={NUT_X} y={0} width={NUT_WIDTH} height={SVG_HEIGHT} rx={2} fill="#353534" />

          {/* Frets */}
          {Array.from({length: fretCount}, (_, i) => (
            <rect
              key={`fret-${i}`}
              x={NUT_X + NUT_WIDTH + (i + 1) * fretSpacing}
              y={0}
              width={2}
              height={SVG_HEIGHT}
              fill="#474554"
              opacity={0.4}
            />
          ))}

          {/* Fret Markers */}
          {FRET_MARKERS.filter(f => f <= fretCount).map(fret => {
            const x = calcFretX(fret);
            if (DOUBLE_MARKERS.includes(fret)) {
              return (
                <g key={`marker-${fret}`}>
                  <circle cx={x} cy={SVG_HEIGHT * 0.33} r={6} fill="#353534" opacity={0.3} />
                  <circle cx={x} cy={SVG_HEIGHT * 0.67} r={6} fill="#353534" opacity={0.3} />
                </g>
              );
            }
            return (
              <circle
                key={`marker-${fret}`}
                cx={x}
                cy={SVG_HEIGHT / 2}
                r={6}
                fill="#353534"
                opacity={0.3}
              />
            );
          })}

          {/* Base Strings */}
          {Array.from({length: STRING_COUNT}, (_, visualIdx) => (
            <line
              key={`string-${visualIdx}`}
              x1={NUT_X}
              x2={svgWidth}
              y1={stringY(visualIdx)}
              y2={stringY(visualIdx)}
              stroke="#928EA0"
              strokeWidth={STRING_WIDTHS[visualIdx]}
              opacity={STRING_OPACITIES[visualIdx]}
            />
          ))}

          {/* Highlighted String overlays (rendered on top of base strings) */}
          {highlightedStrings?.map(({string: dataStr, color}) => {
            const visualIdx = dataToVisual(dataStr);
            const y = stringY(visualIdx);
            return (
              <g key={`hstring-${dataStr}`}>
                {/* Soft glow aura */}
                <line
                  x1={NUT_X} x2={svgWidth} y1={y} y2={y}
                  stroke={color} strokeWidth={16} opacity={0.12}
                />
                {/* Bright string */}
                <line
                  x1={NUT_X} x2={svgWidth} y1={y} y2={y}
                  stroke={color} strokeWidth={STRING_WIDTHS[visualIdx] + 1.5} opacity={0.9}
                />
              </g>
            );
          })}

          {/* Highlighted Positions */}
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
                  <text
                    x={cx} y={cy + 4}
                    textAnchor="middle" fill="white"
                    fontSize={9} fontWeight={700} fontFamily="JetBrains Mono"
                  >
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

        {/* Fret Numbers */}
        <div className="absolute bottom-2 w-full flex justify-between px-[30px] pr-[80px] text-[10px] font-mono text-outline/40">
          {Array.from({length: fretCount}, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
