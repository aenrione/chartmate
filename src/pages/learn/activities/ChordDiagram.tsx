// src/pages/learn/activities/ChordDiagram.tsx
import {useEffect} from 'react';
import type {ChordDiagramActivity} from '@/lib/curriculum/types';

// Data arrays are high-e-first (index 0 = high e, index 5 = low E).
// Display top-to-bottom: high e at top, low E at bottom — matches standard TAB.
const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];
const STRING_COUNT = 6;
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

  // Layout
  const W = 240;
  const H = 210;
  const PAD_TOP = 24;
  const PAD_BOTTOM = 24;
  const NUT_X = 56;        // x of the nut (thick vertical bar)
  const PAD_RIGHT = 16;

  const STRING_GAP = (H - PAD_TOP - PAD_BOTTOM) / (STRING_COUNT - 1);
  const FRET_GAP = (W - NUT_X - PAD_RIGHT) / FRET_COUNT;
  const R = 10;

  return (
    <svg width={W} height={H} className="mx-auto">
      {/* Horizontal string lines + labels */}
      {STRING_LABELS.map((label, stringIdx) => {
        const y = PAD_TOP + stringIdx * STRING_GAP;
        return (
          <g key={stringIdx}>
            <text
              x={14}
              y={y + 4}
              textAnchor="middle"
              fontSize={11}
              className="fill-on-surface-variant"
            >
              {label}
            </text>
            <line
              x1={NUT_X}
              y1={y}
              x2={W - PAD_RIGHT}
              y2={y}
              stroke="currentColor"
              strokeWidth={1.5}
              className="text-outline-variant"
            />
          </g>
        );
      })}

      {/* Nut — thick vertical line on the left */}
      <line
        x1={NUT_X}
        y1={PAD_TOP}
        x2={NUT_X}
        y2={H - PAD_BOTTOM}
        stroke="currentColor"
        strokeWidth={4}
        className="text-on-surface"
      />

      {/* Fret lines — thin vertical lines */}
      {Array.from({length: FRET_COUNT}, (_, i) => i + 1).map(f => (
        <line
          key={f}
          x1={NUT_X + f * FRET_GAP}
          y1={PAD_TOP}
          x2={NUT_X + f * FRET_GAP}
          y2={H - PAD_BOTTOM}
          stroke="currentColor"
          strokeWidth={1}
          className="text-outline-variant"
        />
      ))}

      {/* Start fret label (shown when chord is not at nut) */}
      {startFret > 1 && (
        <text
          x={NUT_X + FRET_GAP * 0.5}
          y={PAD_TOP - 8}
          textAnchor="middle"
          fontSize={10}
          className="fill-on-surface-variant"
        >
          {startFret}fr
        </text>
      )}

      {/* Open (○) and muted (×) markers — just left of the nut */}
      {frets.map((fret, stringIdx) => {
        const y = PAD_TOP + stringIdx * STRING_GAP;
        if (fret === -1) {
          return (
            <text
              key={stringIdx}
              x={NUT_X - 10}
              y={y + 4}
              textAnchor="middle"
              fontSize={12}
              className="fill-on-surface-variant"
            >
              ×
            </text>
          );
        }
        if (fret === 0) {
          return (
            <circle
              key={stringIdx}
              cx={NUT_X - 10}
              cy={y}
              r={5}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="text-on-surface"
            />
          );
        }
        return null;
      })}

      {/* Finger dots */}
      {frets.map((fret, stringIdx) => {
        if (fret <= 0) return null;
        const y = PAD_TOP + stringIdx * STRING_GAP;
        const adjustedFret = fret - startFret + 1;
        const x = NUT_X + (adjustedFret - 0.5) * FRET_GAP;
        const finger = fingers?.[stringIdx];
        return (
          <g key={stringIdx}>
            <circle cx={x} cy={y} r={R} className="fill-primary" />
            {finger && finger > 0 && (
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize={11}
                className="fill-on-primary font-bold"
              >
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
