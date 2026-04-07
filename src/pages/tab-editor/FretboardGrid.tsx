import {useMemo, useCallback, useRef, useEffect} from 'react';
import {cn} from '@/lib/utils';
import {buildFretboard, type FretNote} from '@/lib/tab-editor/fretboard';
import {X} from 'lucide-react';

interface FretboardGridProps {
  tuning: number[];
  activeString: number;
  maxFret?: number;
  onFretClick: (stringNumber: number, fret: number) => void;
  onClose: () => void;
}

const SINGLE_DOT_FRETS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_DOT_FRETS = new Set([12, 24]);
const CELL_W = 'w-[42px]';
const LABEL_W = 'w-[36px]';

export default function FretboardGrid({
  tuning,
  activeString,
  maxFret = 24,
  onFretClick,
  onClose,
}: FretboardGridProps) {
  const fretboard = useMemo(() => buildFretboard(tuning, maxFret), [tuning, maxFret]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to keep low frets visible on mount
  useEffect(() => {
    scrollRef.current?.scrollTo({left: 0});
  }, [tuning]);

  const handleClick = useCallback((stringIndex: number, fret: number) => {
    onFretClick(stringIndex + 1, fret);
  }, [onFretClick]);

  return (
    <div className="bg-zinc-900 border-t border-zinc-700 shrink-0">
      {/* Header */}
      <div className="px-3 py-1 flex items-center justify-between border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Fretboard</span>
          <span className="text-[9px] text-zinc-600">Click to place note · <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">↓</kbd> strings · <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">J</kbd> <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">L</kbd> beats · <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">←</kbd> <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">→</kbd> navigate</span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden">
        <div className="inline-flex flex-col min-w-max px-1 py-1">
          {/* Fret numbers */}
          <div className="flex items-center">
            <div className={cn(LABEL_W, 'shrink-0')} />
            {Array.from({length: maxFret + 1}, (_, fret) => (
              <div
                key={fret}
                className={cn(
                  CELL_W, 'shrink-0 text-center text-[9px] font-mono',
                  fret === 0 ? 'text-zinc-400' : 'text-zinc-600',
                )}
              >
                {fret}
              </div>
            ))}
          </div>

          {/* String rows */}
          {fretboard.map((stringNotes, sIdx) => {
            const isActive = sIdx + 1 === activeString;
            return (
              <div key={sIdx} className="flex items-center">
                {/* Open string label */}
                <div
                  className={cn(
                    LABEL_W, 'shrink-0 text-right pr-1.5 text-[10px] font-mono font-bold',
                    isActive ? 'text-blue-400' : 'text-zinc-500',
                  )}
                >
                  {stringNotes[0].name}{stringNotes[0].octave}
                </div>

                {/* Fret cells */}
                {stringNotes.map((note: FretNote) => {
                  const isOpenString = note.fret === 0;
                  return (
                    <button
                      key={note.fret}
                      onClick={() => handleClick(sIdx, note.fret)}
                      className={cn(
                        CELL_W, 'h-[28px] shrink-0 flex items-center justify-center',
                        'text-[10px] font-mono rounded-[3px] transition-colors',
                        // Base style — dark fretboard look
                        isActive
                          ? 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/30'
                          : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
                        // Nut marker
                        isOpenString && 'border-r-2 border-r-zinc-500',
                        // Fret wire effect
                        !isOpenString && 'border-l border-zinc-700/50',
                      )}
                    >
                      {note.name}
                      <span className="text-[8px] opacity-60">{note.octave}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Dot markers */}
          <div className="flex items-center h-3 mt-0.5">
            <div className={cn(LABEL_W, 'shrink-0')} />
            {Array.from({length: maxFret + 1}, (_, fret) => (
              <div key={fret} className={cn(CELL_W, 'shrink-0 flex justify-center items-center')}>
                {SINGLE_DOT_FRETS.has(fret) && (
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                )}
                {DOUBLE_DOT_FRETS.has(fret) && (
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
