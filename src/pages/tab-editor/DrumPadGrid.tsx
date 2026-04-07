import {useCallback, useMemo} from 'react';
import {cn} from '@/lib/utils';
import {DRUM_KIT, DRUM_SHORTCUTS, type DrumPiece} from '@/lib/tab-editor/drumMap';
import {X, ChevronRight} from 'lucide-react';

interface DrumPadGridProps {
  onDrumHit: (midiNote: number) => void;
  onAdvance: () => void;
  onClose: () => void;
}

const CATEGORIES: {key: DrumPiece['category']; label: string; color: string}[] = [
  {key: 'kick', label: 'Kick', color: 'bg-red-500/20 text-red-300 hover:bg-red-500/40 border-red-500/30'},
  {key: 'snare', label: 'Snare', color: 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/40 border-orange-500/30'},
  {key: 'hihat', label: 'Hi-Hat', color: 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/40 border-yellow-500/30'},
  {key: 'tom', label: 'Toms', color: 'bg-green-500/20 text-green-300 hover:bg-green-500/40 border-green-500/30'},
  {key: 'cymbal', label: 'Cymbals', color: 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/40 border-blue-500/30'},
];

// Reverse map: MIDI note → keyboard shortcut key
const MIDI_TO_KEY: Record<number, string> = {};
for (const [key, midi] of Object.entries(DRUM_SHORTCUTS)) {
  MIDI_TO_KEY[midi] = key.toUpperCase();
}

export default function DrumPadGrid({onDrumHit, onAdvance, onClose}: DrumPadGridProps) {
  const handleClick = useCallback((piece: DrumPiece) => {
    onDrumHit(piece.midiNote);
  }, [onDrumHit]);

  return (
    <div className="bg-zinc-900 border-t border-zinc-700 shrink-0">
      <div className="px-3 py-1 flex items-center justify-between border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Drum Pad</span>
          <span className="text-[9px] text-zinc-600">
            Keys or click to toggle ·
            <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">J</kbd> prev ·
            <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">L</kbd> next beat
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onAdvance}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/40 text-[10px] font-medium transition-colors"
            title="Advance to next beat (L)"
          >
            Next Beat <ChevronRight className="h-3 w-3" />
          </button>
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-3 p-2 overflow-x-auto">
        {CATEGORIES.map(cat => {
          const pieces = DRUM_KIT.filter(d => d.category === cat.key);
          return (
            <div key={cat.key} className="shrink-0">
              <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider mb-1 px-1">
                {cat.label}
              </div>
              <div className="flex gap-1">
                {pieces.map(piece => {
                  const shortcutKey = MIDI_TO_KEY[piece.midiNote];
                  return (
                    <button
                      key={piece.midiNote}
                      onClick={() => handleClick(piece)}
                      title={`${piece.name}${shortcutKey ? ` (${shortcutKey})` : ''}`}
                      className={cn(
                        'relative px-2.5 py-2 rounded border text-xs font-medium transition-all',
                        'active:scale-95',
                        cat.color,
                      )}
                    >
                      <div className="text-[11px] font-bold">{piece.shortName}</div>
                      <div className="text-[8px] opacity-60 mt-0.5">{piece.name}</div>
                      {shortcutKey && (
                        <kbd className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded bg-zinc-700 text-zinc-300 text-[8px] font-mono font-bold border border-zinc-600 shadow-sm">
                          {shortcutKey}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
