import {useState, useEffect, useCallback} from 'react';
import {cn} from '@/lib/utils';
import type {FretboardDrillActivity as FretboardDrillActivityType} from '@/lib/curriculum/types';

const OPEN_NOTES = ['E', 'A', 'D', 'G', 'B', 'E'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FRET_COUNT = 12;
const STRING_COUNT = 6;

function noteNameAt(stringIdx: number, fret: number): string {
  const openNoteIdx = NOTE_NAMES.indexOf(OPEN_NOTES[stringIdx]);
  return NOTE_NAMES[(openNoteIdx + fret) % 12];
}

function parseNoteLabel(label: string): {note: string; octave: number} | null {
  const match = label.match(/^([A-G]#?)(\d)$/);
  if (!match) return null;
  return {note: match[1], octave: parseInt(match[2])};
}

function getCorrectPositions(noteName: string): Array<{string: number; fret: number}> {
  const positions: Array<{string: number; fret: number}> = [];
  for (let s = 0; s < STRING_COUNT; s++) {
    for (let f = 0; f <= FRET_COUNT; f++) {
      if (noteNameAt(s, f) === noteName) {
        positions.push({string: s, fret: f});
      }
    }
  }
  return positions;
}

type CellState = 'idle' | 'correct' | 'wrong';

interface Props {
  activity: FretboardDrillActivityType;
  onPass: () => void;
}

export default function FretboardDrillActivity({activity, onPass}: Props) {
  const required = activity.requiredCorrect ?? activity.notes.length;
  const [noteIndex, setNoteIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [cellState, setCellState] = useState<CellState>('idle');
  const [lastTapped, setLastTapped] = useState<{string: number; fret: number} | null>(null);

  const currentNoteLabel = activity.notes[noteIndex % activity.notes.length];
  const parsed = parseNoteLabel(currentNoteLabel);
  const correctPositions = parsed ? getCorrectPositions(parsed.note) : [];

  const handleTap = useCallback((s: number, f: number) => {
    if (cellState !== 'idle') return;
    setLastTapped({string: s, fret: f});
    const isCorrect = correctPositions.some(p => p.string === s && p.fret === f);
    if (isCorrect) {
      setCellState('correct');
      const next = correctCount + 1;
      setCorrectCount(next);
      if (next >= required) {
        setTimeout(() => onPass(), 600);
      } else {
        setTimeout(() => {
          setCellState('idle');
          setLastTapped(null);
          setNoteIndex(i => i + 1);
        }, 700);
      }
    } else {
      setCellState('wrong');
      setTimeout(() => {
        setCellState('idle');
        setLastTapped(null);
      }, 600);
    }
  }, [cellState, correctPositions, correctCount, required, onPass]);

  useEffect(() => {
    setNoteIndex(0);
    setCorrectCount(0);
    setCellState('idle');
    setLastTapped(null);
  }, [activity]);

  const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">
      {/* Target note */}
      <div className="text-center">
        <p className="text-sm text-on-surface-variant mb-1">Find this note on the fretboard</p>
        <div className="text-5xl font-bold font-headline text-primary">{parsed?.note ?? currentNoteLabel}</div>
        <div className="mt-2 text-sm text-on-surface-variant">
          {correctCount} / {required} correct
        </div>
      </div>

      {/* Fretboard */}
      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          {/* Fret numbers */}
          <div className="flex ml-10 mb-1">
            {Array.from({length: FRET_COUNT + 1}).map((_, f) => (
              <div key={f} className="flex-1 text-center text-xs text-on-surface-variant">
                {f === 0 ? '' : f}
              </div>
            ))}
          </div>

          {/* Strings (low E at bottom = index 0, render reversed) */}
          {[...STRING_LABELS].reverse().map((label, visualIdx) => {
            const stringIdx = STRING_COUNT - 1 - visualIdx;
            return (
              <div key={stringIdx} className="flex items-center mb-1 gap-1">
                <div className="w-8 shrink-0 text-xs text-on-surface-variant text-right pr-1">
                  {label}
                </div>
                {Array.from({length: FRET_COUNT + 1}).map((_, fret) => {
                  const isTapped = lastTapped?.string === stringIdx && lastTapped?.fret === fret;
                  return (
                    <button
                      key={fret}
                      onClick={() => handleTap(stringIdx, fret)}
                      className={cn(
                        'flex-1 h-8 rounded border transition-all text-xs font-bold',
                        isTapped && cellState === 'correct' && 'bg-emerald-500 border-emerald-500 text-white',
                        isTapped && cellState === 'wrong' && 'bg-red-500 border-red-500 text-white',
                        !isTapped && 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:bg-primary/20 hover:border-primary/40',
                      )}
                    >
                      {isTapped && cellState === 'correct' ? '✓' : ''}
                      {isTapped && cellState === 'wrong' ? '✕' : ''}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-center text-on-surface-variant">
        Tap any string/fret position where you see <strong>{parsed?.note}</strong>
      </p>
    </div>
  );
}
