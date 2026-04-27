import {useState, useMemo, useRef, useEffect} from 'react';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Search} from 'lucide-react';
import {searchChords, type ChordDefinition, type ChordVoicing} from '@/lib/tab-editor/chordDb';

interface ChordFinderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectChord: (voicing: ChordVoicing, chordName: string) => void;
}

const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
const FRET_COUNT = 5;

function ChordDiagram({voicing, chordName, onClick}: {voicing: ChordVoicing; chordName: string; onClick: () => void}) {
  const baseFret = voicing.baseFret ?? 1;
  const displayFrets = voicing.frets.slice().reverse(); // low E first for display
  const displayFingers = voicing.fingers?.slice().reverse();

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-primary/10 transition-colors group cursor-pointer"
      title={`Insert ${chordName}`}
    >
      <svg viewBox={`0 0 ${5 * 20 + 20} ${FRET_COUNT * 22 + 40}`} className="w-28 h-36">
        {/* Nut or fret position indicator */}
        {baseFret <= 1 ? (
          <rect x={10} y={18} width={5 * 20} height={3} rx={1} fill="currentColor" className="text-on-surface" />
        ) : (
          <text x={5} y={36} fontSize={10} fill="currentColor" className="text-on-surface-variant" textAnchor="end">
            {baseFret}fr
          </text>
        )}

        {/* Horizontal fret lines */}
        {Array.from({length: FRET_COUNT + 1}, (_, i) => (
          <line
            key={`fret-${i}`}
            x1={10}
            y1={20 + i * 22}
            x2={10 + 5 * 20}
            y2={20 + i * 22}
            stroke="currentColor"
            className="text-outline-variant/50"
            strokeWidth={1}
          />
        ))}

        {/* Vertical string lines */}
        {Array.from({length: 6}, (_, i) => (
          <line
            key={`string-${i}`}
            x1={10 + i * 20}
            y1={20}
            x2={10 + i * 20}
            y2={20 + FRET_COUNT * 22}
            stroke="currentColor"
            className="text-outline-variant/50"
            strokeWidth={1}
          />
        ))}

        {/* Muted / Open string markers */}
        {displayFrets.map((fret, i) => {
          const x = 10 + i * 20;
          if (fret === null) {
            return (
              <text key={`marker-${i}`} x={x} y={13} fontSize={12} fill="currentColor" className="text-on-surface-variant" textAnchor="middle">
                x
              </text>
            );
          }
          if (fret === 0 || (baseFret <= 1 && fret === 0)) {
            return (
              <circle key={`marker-${i}`} cx={x} cy={10} r={4} fill="none" stroke="currentColor" className="text-on-surface-variant" strokeWidth={1.5} />
            );
          }
          return null;
        })}

        {/* Finger dots */}
        {displayFrets.map((fret, i) => {
          if (fret === null || fret === 0) return null;
          const displayFret = baseFret > 1 ? fret - baseFret + 1 : fret;
          const x = 10 + i * 20;
          const y = 20 + (displayFret - 0.5) * 22;
          const finger = displayFingers?.[i];
          return (
            <g key={`dot-${i}`}>
              <circle cx={x} cy={y} r={8} className="fill-primary" />
              {finger && (
                <text x={x} y={y + 4} fontSize={10} fill="white" textAnchor="middle" fontWeight="bold">
                  {finger}
                </text>
              )}
            </g>
          );
        })}

        {/* Barre detection — if same fret appears on multiple strings, draw a bar */}
        {(() => {
          if (!voicing.fingers) return null;
          const reversedFingers = voicing.fingers.slice().reverse();
          // Find barre: finger 1 on multiple strings at same fret
          const barreStrings = reversedFingers.reduce<number[]>((acc, f, i) => {
            if (f === 1 && displayFrets[i] !== null && displayFrets[i] !== 0) acc.push(i);
            return acc;
          }, []);
          if (barreStrings.length >= 2) {
            const first = barreStrings[0];
            const last = barreStrings[barreStrings.length - 1];
            const fret = displayFrets[first]!;
            const displayFret = baseFret > 1 ? fret - baseFret + 1 : fret;
            const y = 20 + (displayFret - 0.5) * 22;
            return (
              <rect
                x={10 + first * 20 - 8}
                y={y - 6}
                width={(last - first) * 20 + 16}
                height={12}
                rx={6}
                className="fill-primary/70"
              />
            );
          }
          return null;
        })()}

        {/* String labels */}
        {STRING_LABELS.map((label, i) => (
          <text key={`label-${i}`} x={10 + i * 20} y={20 + FRET_COUNT * 22 + 15} fontSize={9} fill="currentColor" className="text-on-surface-variant" textAnchor="middle">
            {label}
          </text>
        ))}
      </svg>
    </button>
  );
}

export default function ChordFinderDialog({open, onOpenChange, onSelectChord}: ChordFinderDialogProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      // Focus search input when dialog opens
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = useMemo(() => searchChords(query), [query]);

  // Group results by name for display
  const grouped = useMemo(() => {
    const map = new Map<string, ChordDefinition>();
    for (const chord of results) {
      if (!map.has(chord.name)) map.set(chord.name, chord);
    }
    return Array.from(map.values());
  }, [results]);

  const handleSelect = (voicing: ChordVoicing, chordName: string) => {
    onSelectChord(voicing, chordName);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Chord Finder</DialogTitle>
          <DialogDescription className="sr-only">
            Search chord shapes and insert a selected voicing at the current cursor position.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search chords (e.g. Am, G7, F#m)..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-outline-variant/30 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto mt-3 -mx-2">
          {grouped.length === 0 ? (
            <div className="text-center py-8 text-on-surface-variant text-sm">
              No chords found for "{query}"
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(chord => (
                <div key={chord.name}>
                  <h3 className="text-sm font-semibold text-primary px-2 mb-1">{chord.name}</h3>
                  <div className="flex flex-wrap gap-1">
                    {chord.voicings.map((voicing, vi) => (
                      <ChordDiagram
                        key={vi}
                        voicing={voicing}
                        chordName={chord.name}
                        onClick={() => handleSelect(voicing, chord.name)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
