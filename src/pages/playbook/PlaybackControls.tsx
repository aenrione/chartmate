import {useState} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Repeat,
  Gauge,
} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {usePlaybook} from './PlaybookProvider';

export default function PlaybackControls() {
  const {
    sidebarExpanded,
    isPlaying,
    togglePlay,
    prevSong,
    nextSong,
    speed,
    loopSectionId,
    setLoopSectionId,
    activeIndex,
    items,
  } = usePlaybook();

  const [metronome, setMetronome] = useState(false);

  // Only visible when sidebar is collapsed
  if (sidebarExpanded) return null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 glass-panel ghost-border rounded-2xl px-4 py-2 flex items-center gap-3">
      {/* Transport */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={activeIndex === 0}
        onClick={prevSong}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant={isPlaying ? 'default' : 'outline'}
        size="icon"
        className="h-10 w-10 rounded-full"
        onClick={togglePlay}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={activeIndex === items.length - 1}
        onClick={nextSong}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-white/10" />

      {/* Loop toggle */}
      <Button
        variant={loopSectionId !== null ? 'default' : 'ghost'}
        size="icon"
        className="h-8 w-8"
        onClick={() => setLoopSectionId(loopSectionId !== null ? null : -1)}
        title="Toggle loop"
      >
        <Repeat className="h-3.5 w-3.5" />
      </Button>

      {/* Metronome toggle */}
      <Button
        variant={metronome ? 'default' : 'ghost'}
        size="icon"
        className="h-8 w-8"
        onClick={() => setMetronome(!metronome)}
        title="Toggle metronome"
      >
        <Gauge className="h-3.5 w-3.5" />
      </Button>

      <div className="w-px h-6 bg-white/10" />

      {/* Speed indicator */}
      <span className="text-xs font-mono text-on-surface-variant tabular-nums">
        {speed}%
      </span>
    </div>
  );
}
