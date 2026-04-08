// src/pages/guitar/ear/components/AudioPlayer.tsx
import {useState} from 'react';
import {Play, RotateCcw} from 'lucide-react';

interface Props {
  onPlay: () => Promise<void>;
  disabled?: boolean;
}

export function AudioPlayer({onPlay, disabled}: Props) {
  const [playing, setPlaying] = useState(false);

  async function handlePlay() {
    if (playing || disabled) return;
    setPlaying(true);
    try {
      await onPlay();
    } finally {
      setPlaying(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={handlePlay}
        disabled={playing || disabled}
        className="flex items-center gap-3 rounded-full bg-primary px-8 py-4 text-on-primary font-semibold transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
      >
        <Play className="h-5 w-5" />
        {playing ? 'Playing…' : 'Play Audio'}
        <span className="text-xs opacity-70">[Space]</span>
      </button>

      {/* Waveform animation */}
      {playing && (
        <div className="flex items-end gap-0.5 h-8">
          {Array.from({length: 12}).map((_, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-primary animate-bounce"
              style={{
                height: `${Math.random() * 24 + 8}px`,
                animationDelay: `${i * 0.07}s`,
                animationDuration: '0.6s',
              }}
            />
          ))}
        </div>
      )}

      <button
        onClick={handlePlay}
        disabled={playing || disabled}
        className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface disabled:opacity-40"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Play Again <span className="text-xs opacity-60">[A]</span>
      </button>
    </div>
  );
}
