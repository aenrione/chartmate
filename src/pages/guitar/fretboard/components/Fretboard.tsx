import {type FretPosition} from '../lib/musicTheory';
import {FRET_MARKERS, DOUBLE_MARKERS, STRING_COUNT, MAX_FRET} from '../lib/musicTheory';

// Visual order: top = high E (thinnest), bottom = low E (thickest)
// Data order: index 0 = low E, index 5 = high E (STANDARD_TUNING)
// Conversion: visual row i = data string (STRING_COUNT - 1 - i)
const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E']; // visual top-to-bottom
const STRING_WIDTHS = [1.2, 1.6, 2.0, 2.5, 3.2, 4.0]; // visual top-to-bottom (thin→thick)
const STRING_OPACITIES = [0.6, 0.6, 0.6, 0.7, 0.8, 0.9];

const FRET_COUNT = MAX_FRET;
const LABEL_WIDTH = 30; // space for string labels on the left
const SVG_WIDTH = 1400 + LABEL_WIDTH;
const SVG_HEIGHT = 240;
const NUT_X = LABEL_WIDTH; // nut starts after label area
const NUT_WIDTH = 8;
const FRET_AREA_WIDTH = SVG_WIDTH - LABEL_WIDTH;
const FRET_SPACING = FRET_AREA_WIDTH / (FRET_COUNT + 1);
const STRING_SPACING = SVG_HEIGHT / (STRING_COUNT + 1);

/** Convert a data string index (0=lowE) to visual row index (0=highE at top) */
function dataToVisual(dataStringIdx: number): number {
  return STRING_COUNT - 1 - dataStringIdx;
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
}

function fretX(fret: number): number {
  return NUT_X + NUT_WIDTH + fret * FRET_SPACING - FRET_SPACING / 2;
}

/** Y position for a visual row index (0 = top of SVG) */
function stringY(visualIdx: number): number {
  return (visualIdx + 1) * STRING_SPACING;
}

export default function Fretboard({
  highlightedPositions = [],
  onPositionClick,
  clickablePositions,
  interactive = false,
  className = '',
}: FretboardProps) {
  const isClickable = (dataStringIdx: number, fret: number) => {
    if (!interactive) return false;
    if (!clickablePositions) return true;
    return clickablePositions.some(p => p.string === dataStringIdx && p.fret === fret);
  };

  return (
    <div className={`relative bg-surface-container-low rounded-2xl p-8 overflow-x-auto border border-outline-variant/10 ${className}`}>
      <div className="min-w-[1400px] h-[320px] relative flex items-center">
        <svg
          className="w-full h-[240px]"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* String Labels (inside SVG, perfectly aligned) */}
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
          {Array.from({length: FRET_COUNT}, (_, i) => (
            <rect
              key={`fret-${i}`}
              x={NUT_X + NUT_WIDTH + (i + 1) * FRET_SPACING}
              y={0}
              width={2}
              height={SVG_HEIGHT}
              fill="#474554"
              opacity={0.4}
            />
          ))}

          {/* Fret Markers */}
          {FRET_MARKERS.map(fret => {
            const x = fretX(fret);
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

          {/* Strings (visual order: 0=top=highE thin, 5=bottom=lowE thick) */}
          {Array.from({length: STRING_COUNT}, (_, visualIdx) => (
            <line
              key={`string-${visualIdx}`}
              x1={NUT_X}
              x2={SVG_WIDTH}
              y1={stringY(visualIdx)}
              y2={stringY(visualIdx)}
              stroke="#928EA0"
              strokeWidth={STRING_WIDTHS[visualIdx]}
              opacity={STRING_OPACITIES[visualIdx]}
            />
          ))}

          {/* Highlighted Positions (data coords → visual coords) */}
          {highlightedPositions.map((pos, i) => {
            const cx = fretX(pos.fret);
            const cy = stringY(dataToVisual(pos.string));
            const color = pos.color ?? '#00CEC9';

            return (
              <g key={`highlight-${i}`}>
                {pos.glow && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={22}
                    fill={color}
                    fillOpacity={0.1}
                    className={pos.pulse ? 'animate-pulse' : ''}
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={10}
                  fill={color}
                  style={pos.glow ? {filter: `drop-shadow(0 0 10px ${color}80)`} : undefined}
                />
                {pos.label && (
                  <text
                    x={cx}
                    y={cy + 4}
                    textAnchor="middle"
                    fill="white"
                    fontSize={9}
                    fontWeight={700}
                    fontFamily="JetBrains Mono"
                  >
                    {pos.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Clickable areas (data coords → visual coords) */}
          {interactive &&
            Array.from({length: STRING_COUNT}, (_, dataStr) =>
              Array.from({length: FRET_COUNT + 1}, (_, f) => {
                if (!isClickable(dataStr, f)) return null;
                const cx = fretX(f);
                const cy = stringY(dataToVisual(dataStr));
                return (
                  <circle
                    key={`click-${dataStr}-${f}`}
                    cx={cx}
                    cy={cy}
                    r={14}
                    fill="transparent"
                    className="cursor-pointer hover:fill-primary/10 transition-colors"
                    onClick={() => onPositionClick?.({string: dataStr, fret: f})}
                  />
                );
              }),
            )}
        </svg>

        {/* Fret Numbers */}
        <div className="absolute bottom-2 w-full flex justify-between px-[30px] pr-[80px] text-[10px] font-mono text-outline/40">
          {Array.from({length: FRET_COUNT}, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
