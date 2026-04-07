import type {ChordVoicing} from './chordVoicings';

const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'E'];
const NUM_STRINGS = 6;
const NUM_FRETS = 5;

// Layout constants
const PADDING_X = 30;
const PADDING_TOP = 28;
const PADDING_BOTTOM = 24;
const DIAGRAM_WIDTH = 160;
const DIAGRAM_HEIGHT = 180;
const GRID_LEFT = PADDING_X;
const GRID_TOP = PADDING_TOP;
const GRID_WIDTH = DIAGRAM_WIDTH - PADDING_X * 2;
const GRID_HEIGHT = DIAGRAM_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const STRING_GAP = GRID_WIDTH / (NUM_STRINGS - 1);
const FRET_GAP = GRID_HEIGHT / NUM_FRETS;
const DOT_RADIUS = 9;

const SVG_W = DIAGRAM_WIDTH;
const SVG_H = DIAGRAM_HEIGHT;

function stringX(stringIdx: number): number {
  return GRID_LEFT + stringIdx * STRING_GAP;
}

function fretY(fretIdx: number): number {
  // fretIdx 0 = nut line, 1 = between fret 0-1, etc.
  return GRID_TOP + fretIdx * FRET_GAP;
}

interface ChordDiagramProps {
  voicing: ChordVoicing;
  highlight?: boolean;
  className?: string;
}

export default function ChordDiagram({voicing, highlight = false, className = ''}: ChordDiagramProps) {
  const {frets, fingers, baseFret, barres = []} = voicing;

  const showNut = baseFret === 1;
  const baseFretLabel = baseFret > 1 ? `${baseFret}fr` : '';

  return (
    <div
      className={`
        relative rounded-xl border transition-all
        ${highlight
          ? 'bg-surface-container-high border-secondary/30 shadow-studio-sm'
          : 'bg-surface-container-low border-white/[0.04] hover:border-secondary/20'
        }
        ${className}
      `}
    >
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Muted / Open string markers above nut */}
        {frets.map((f, i) => {
          const x = stringX(i);
          const y = GRID_TOP - 12;
          if (f === -1) {
            // X marker
            return (
              <text
                key={`marker-${i}`}
                x={x}
                y={y}
                textAnchor="middle"
                fill="#8B8A99"
                fontSize={11}
                fontWeight={700}
                fontFamily="Inter, sans-serif"
              >
                X
              </text>
            );
          }
          if (f === 0) {
            // Open string circle
            return (
              <circle
                key={`marker-${i}`}
                cx={x}
                cy={y - 4}
                r={4}
                fill="none"
                stroke="#8B8A99"
                strokeWidth={1.5}
              />
            );
          }
          return null;
        })}

        {/* Nut or fret position label */}
        {showNut ? (
          <rect
            x={GRID_LEFT - 1}
            y={GRID_TOP - 2}
            width={GRID_WIDTH + 2}
            height={4}
            rx={2}
            fill="#A0A0B0"
          />
        ) : (
          <text
            x={GRID_LEFT - 14}
            y={fretY(0.5) + 4}
            textAnchor="middle"
            fill="#8B8A99"
            fontSize={9}
            fontWeight={600}
            fontFamily="Inter, sans-serif"
          >
            {baseFretLabel}
          </text>
        )}

        {/* Fret lines */}
        {Array.from({length: NUM_FRETS + 1}, (_, i) => (
          <line
            key={`fret-${i}`}
            x1={GRID_LEFT}
            x2={GRID_LEFT + GRID_WIDTH}
            y1={fretY(i)}
            y2={fretY(i)}
            stroke="#474554"
            strokeWidth={i === 0 ? 1.5 : 1}
            opacity={i === 0 ? 0.8 : 0.5}
          />
        ))}

        {/* String lines */}
        {Array.from({length: NUM_STRINGS}, (_, i) => (
          <line
            key={`string-${i}`}
            x1={stringX(i)}
            x2={stringX(i)}
            y1={GRID_TOP}
            y2={fretY(NUM_FRETS)}
            stroke="#6B6980"
            strokeWidth={1 + i * 0.15}
            opacity={0.6}
          />
        ))}

        {/* Barre indicators */}
        {barres.map((barre, i) => {
          const y = fretY(barre.fret - 0.5);
          const x1 = stringX(barre.fromString);
          const x2 = stringX(barre.toString);
          return (
            <rect
              key={`barre-${i}`}
              x={Math.min(x1, x2) - DOT_RADIUS}
              y={y - DOT_RADIUS}
              width={Math.abs(x2 - x1) + DOT_RADIUS * 2}
              height={DOT_RADIUS * 2}
              rx={DOT_RADIUS}
              fill="#6B8AFF"
              opacity={0.85}
            />
          );
        })}

        {/* Finger dots */}
        {frets.map((f, i) => {
          if (f <= 0) return null;

          // Check if this position is covered by a barre — if so, the barre rect handles it
          const coveredByBarre = barres.some(
            b => f === b.fret && i >= b.fromString && i <= b.toString,
          );

          const cx = stringX(i);
          const cy = fretY(f - 0.5);
          const finger = fingers[i];

          return (
            <g key={`dot-${i}`}>
              {!coveredByBarre && (
                <circle cx={cx} cy={cy} r={DOT_RADIUS} fill="#6B8AFF" />
              )}
              {finger > 0 && (
                <text
                  x={cx}
                  y={cy + 3.5}
                  textAnchor="middle"
                  fill="white"
                  fontSize={9}
                  fontWeight={700}
                  fontFamily="Inter, sans-serif"
                >
                  {finger}
                </text>
              )}
            </g>
          );
        })}

        {/* String labels at bottom */}
        {STRING_LABELS.map((label, i) => (
          <text
            key={`label-${i}`}
            x={stringX(i)}
            y={SVG_H - 4}
            textAnchor="middle"
            fill="#6B6980"
            fontSize={8}
            fontWeight={600}
            fontFamily="Inter, sans-serif"
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}
