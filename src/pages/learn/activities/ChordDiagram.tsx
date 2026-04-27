// src/pages/learn/activities/ChordDiagram.tsx
import {useEffect} from 'react';
import type {ChordDiagramActivity} from '@/lib/curriculum/types';

// Data arrays are high-e-first (index 0 = high e). Standard chord diagrams
// display low-E on the left, so we render strings in reversed order.
const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];
const FRET_COUNT = 5;

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

  // Reverse to display low-E on the left (standard chord diagram orientation)
  const displayFrets = [...frets].reverse();
  const displayFingers = fingers ? [...fingers].reverse() : undefined;
  const displayLabels = [...STRING_LABELS].reverse();

  const W = 220;
  const H = 200;
  const TOP = 36;
  const LEFT = 32;
  const STRING_GAP = (W - LEFT - 16) / 5;
  const FRET_GAP = (H - TOP - 20) / FRET_COUNT;
  const R = 11;

  return (
    <svg width={W} height={H} className="mx-auto">
      {/* Nut */}
      <line x1={LEFT} y1={TOP} x2={W - 16} y2={TOP} stroke="currentColor" strokeWidth={3} className="text-on-surface" />

      {/* Strings */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <line
          key={i}
          x1={LEFT + i * STRING_GAP}
          y1={TOP}
          x2={LEFT + i * STRING_GAP}
          y2={H - 20}
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-outline-variant"
        />
      ))}

      {/* Frets */}
      {[1, 2, 3, 4, 5].map(f => (
        <line
          key={f}
          x1={LEFT}
          y1={TOP + f * FRET_GAP}
          x2={W - 16}
          y2={TOP + f * FRET_GAP}
          stroke="currentColor"
          strokeWidth={1}
          className="text-outline-variant"
        />
      ))}

      {/* Start fret label */}
      {startFret > 1 && (
        <text x={4} y={TOP + FRET_GAP * 0.7} fontSize={11} className="fill-on-surface-variant">
          {startFret}fr
        </text>
      )}

      {/* String labels — E A D G B e (low to high, left to right) */}
      {displayLabels.map((label, col) => (
        <text
          key={col}
          x={LEFT + col * STRING_GAP}
          y={14}
          textAnchor="middle"
          fontSize={10}
          className="fill-on-surface-variant"
        >
          {label}
        </text>
      ))}

      {/* Finger dots */}
      {displayFrets.map((fret, col) => {
        const x = LEFT + col * STRING_GAP;
        if (fret === -1) {
          return (
            <text key={col} x={x} y={TOP - 6} textAnchor="middle" fontSize={13} className="fill-on-surface-variant">
              ✕
            </text>
          );
        }
        if (fret === 0) {
          return (
            <circle key={col} cx={x} cy={TOP - 8} r={5} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-on-surface" />
          );
        }
        const adjustedFret = fret - startFret + 1;
        const y = TOP + (adjustedFret - 0.5) * FRET_GAP;
        const finger = displayFingers?.[col];
        return (
          <g key={col}>
            <circle cx={x} cy={y} r={R} className="fill-primary" />
            {finger && finger > 0 && (
              <text x={x} y={y + 4} textAnchor="middle" fontSize={11} className="fill-on-primary font-bold">
                {finger}
              </text>
            )}
          </g>
        );
      })}
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
      <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/20">
        <ChordDiagramSVG frets={activity.frets} fingers={activity.fingers} />
      </div>
      <p className="text-sm text-on-surface-variant text-center">
        Study the finger positions, then tap Continue when ready.
      </p>
    </div>
  );
}
