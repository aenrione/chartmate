import {useState} from 'react';
import {Play, Pause, Volume2, FolderOpen, Unlink, Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {useStemPlayer, StemName} from '@/hooks/useStemPlayer';

type StemPlayerResult = ReturnType<typeof useStemPlayer>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface StemMixerPanelProps extends StemPlayerResult {}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export default function StemMixerPanel(props: StemMixerPanelProps) {
  const {
    isLinked,
    stemsReady,
    loadedStems,
    isCopying,
    isLoading,
    linkError,
    isPlaying,
    currentTime,
    duration,
    volumes,
    promptAndLink,
    unlink,
    setVolume,
    togglePlayPause,
  } = props;

  // Track per-stem "was muted" previous volume for toggle
  const [premuteVolumes, setPremuteVolumes] = useState<Partial<Record<StemName, number>>>({});

  function handleMuteToggle(name: StemName) {
    const current = volumes[name];
    if (current === 0) {
      // Unmute: restore previous volume or default to 100
      const restored = premuteVolumes[name] ?? 100;
      setVolume(name, restored);
      setPremuteVolumes(prev => {
        const next = {...prev};
        delete next[name];
        return next;
      });
    } else {
      // Mute: save current volume then set to 0
      setPremuteVolumes(prev => ({...prev, [name]: current}));
      setVolume(name, 0);
    }
  }

  // State 2: Copying / Loading
  if (isCopying || isLoading) {
    return (
      <div className="flex items-center gap-2 text-on-surface-variant text-sm py-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{isCopying ? 'Copying stems…' : 'Loading stems…'}</span>
      </div>
    );
  }

  // State 1: Not linked
  if (!isLinked) {
    return (
      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs gap-1.5"
          onClick={() => void promptAndLink()}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Link Stems
        </Button>
        <p className="text-xs text-on-surface-variant">
          Pick the folder Demucs created (e.g. separated/htdemucs/song_name/)
        </p>
        {linkError && (
          <p className="text-xs text-red-500">{linkError}</p>
        )}
      </div>
    );
  }

  // State 3b: Linked but not yet ready
  if (!stemsReady) {
    return (
      <div className="flex items-center gap-2 text-on-surface-variant text-sm py-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>Loading audio…</span>
      </div>
    );
  }

  // State 3: Linked + ready
  return (
    <div className="space-y-3">
      {/* Transport bar */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => void togglePlayPause()}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <span className="text-xs font-mono text-on-surface-variant tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Per-track faders */}
      <div className="space-y-2">
        {loadedStems.map(name => {
          const vol = volumes[name];
          const isMuted = vol === 0;
          return (
            <div key={name} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-on-surface capitalize">{name}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-on-surface-variant tabular-nums w-7 text-right">
                    {vol}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-5 w-5 shrink-0 ${isMuted ? 'opacity-40' : ''}`}
                    onClick={() => handleMuteToggle(name)}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    <Volume2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={vol}
                onChange={e => setVolume(name, Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-primary bg-surface-container"
                style={{accentColor: 'var(--color-accent-primary, hsl(var(--primary)))'}}
              />
            </div>
          );
        })}
      </div>

      {/* Unlink button */}
      <div className="pt-1 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
          onClick={() => void unlink()}
        >
          <Unlink className="h-3 w-3" />
          Unlink stems
        </Button>
      </div>
    </div>
  );
}
