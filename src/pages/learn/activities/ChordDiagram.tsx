// src/pages/learn/activities/ChordDiagram.tsx
import {useEffect} from 'react';
import type {ChordDiagramActivity} from '@/lib/curriculum/types';

// Data arrays are high-e-first (index 0 = high e, index 5 = low E).
// Display left-to-right: low E → high e (index 5 → 0), matching chord finder convention.
const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
const NUM_STRINGS = 6;
const NUM_FRETS = 5;

const PADDING_X = 36;
const PADDING_TOP = 40;
const PADDING_BOTTOM = 34;
const SVG_W = 280;
const SVG_H = 290;
const GRID_LEFT = PADDING_X;
const GRID_TOP = PADDING_TOP;
const GRID_WIDTH = SVG_W - PADDING_X * 2;
const GRID_HEIGHT = SVG_H - PADDING_TOP - PADDING_BOTTOM;
const STRING_GAP = GRID_WIDTH / (NUM_STRINGS - 1);
const FRET_GAP = GRID_HEIGHT / NUM_FRETS;
const DOT_RADIUS = 13;

// Display string index 0 = low E = data index 5
function dataIdx(displayStringIdx: number): number {
  return NUM_STRINGS - 1 - displayStringIdx;
}

function stringX(displayStringIdx: number): number {
  return GRID_LEFT + displayStringIdx * STRING_GAP;
}

function fretY(fretOffset: number): number {
  return GRID_TOP + fretOffset * FRET_GAP;
}

interface Props {
  activity: ChordDiagramActivity;
  onPass: () => void;
}

function ChordDiagramSVG({
  frets,
  fingers,
}: {
  frets: ChordDiagramActivity['frets'];
  fingers?: ChordDiagramActivity['fingers'];
}) {
  const nonZeroFrets = frets.filter(f => f > 0);
  const startFret = nonZeroFrets.length > 0 ? Math.min(...nonZeroFrets) : 1;
  const showNut = startFret === 1;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      {/* Muted (×) and open (○) markers above nut */}
      {STRING_LABELS.map((_, displayIdx) => {
        const fret = frets[dataIdx(displayIdx)];
        const x = stringX(displayIdx);
        const y = GRID_TOP - 14;
        if (fret === -1) {
          return (
            <text
              key={displayIdx}
              x={x}
              y={y}
              textAnchor="middle"
              fill="#8B8A99"
              fontSize={15}
              fontWeight={700}
              fontFamily="Inter, sans-serif"
            >
              ×
            </text>
          );
        }
        if (fret === 0) {
          return (
            <circle
              key={displayIdx}
              cx={x}
              cy={y - 5}
              r={4.5}
              fill="none"
              stroke="#8B8A99"
              strokeWidth={1.5}
            />
          );
        }
        return null;
      })}

      {/* Nut (thick bar) or fret position label */}
      {showNut ? (
        <rect
          x={GRID_LEFT - 1}
          y={GRID_TOP - 3}
          width={GRID_WIDTH + 2}
          height={5}
          rx={2}
          fill="#A0A0B0"
        />
      ) : (
        <text
          x={GRID_LEFT - 16}
          y={fretY(0.5) + 4}
          textAnchor="middle"
          fill="#8B8A99"
          fontSize={9}
          fontWeight={600}
          fontFamily="Inter, sans-serif"
        >
          {startFret}fr
        </text>
      )}

      {/* Fret lines (horizontal) */}
      {Array.from({length: NUM_FRETS + 1}, (_, i) => (
        <line
          key={i}
          x1={GRID_LEFT}
          x2={GRID_LEFT + GRID_WIDTH}
          y1={fretY(i)}
          y2={fretY(i)}
          stroke="#474554"
          strokeWidth={i === 0 ? 1.5 : 1}
          opacity={i === 0 ? 0.8 : 0.5}
        />
      ))}

      {/* String lines (vertical) — thicker for lower strings (left = E) */}
      {STRING_LABELS.map((_, displayIdx) => (
        <line
          key={displayIdx}
          x1={stringX(displayIdx)}
          x2={stringX(displayIdx)}
          y1={GRID_TOP}
          y2={fretY(NUM_FRETS)}
          stroke="#6B6980"
          strokeWidth={1 + (NUM_STRINGS - 1 - displayIdx) * 0.15}
          opacity={0.6}
        />
      ))}

      {/* Finger dots */}
      {STRING_LABELS.map((_, displayIdx) => {
        const fret = frets[dataIdx(displayIdx)];
        if (fret <= 0) return null;
        const adjustedFret = fret - startFret + 1;
        const cx = stringX(displayIdx);
        const cy = fretY(adjustedFret - 0.5);
        const finger = fingers?.[dataIdx(displayIdx)];
        return (
          <g key={displayIdx}>
            <circle cx={cx} cy={cy} r={DOT_RADIUS} fill="#6B8AFF" />
            {finger && finger > 0 && (
              <text
                x={cx}
                y={cy + 3.5}
                textAnchor="middle"
                fill="white"
                fontSize={11}
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
      {STRING_LABELS.map((label, displayIdx) => (
        <text
          key={displayIdx}
          x={stringX(displayIdx)}
          y={SVG_H - 6}
          textAnchor="middle"
          fill="#6B6980"
          fontSize={10}
          fontWeight={600}
          fontFamily="Inter, sans-serif"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

export default function ChordDiagram({activity, onPass}: Props) {
  useEffect(() => {
    onPass();
  }, [activity]);

  return (
    <div className="max-w-lg mx-auto px-6 py-8 flex flex-col items-center gap-6">
      <h2 className="text-2xl font-bold font-headline text-on-surface">
        {activity.chord} Chord
      </h2>
      <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/20 w-72">
        <ChordDiagramSVG frets={activity.frets} fingers={activity.fingers} />
      </div>
      <p className="text-sm text-on-surface-variant text-center">
        Study the finger positions, then tap Continue when ready.
      </p>
    </div>
  );
}
