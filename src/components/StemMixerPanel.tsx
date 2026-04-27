import {useState} from 'react';
import {Play, Pause, Volume2, VolumeX, FolderOpen, Unlink, Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import type {StemName} from '@/hooks/useStemPlayer';

export interface StemMixerPanelProps {
  compact?: boolean;
  isLinked: boolean;
  stemsReady: boolean;
  loadedStems: StemName[];
  isCopying: boolean;
  isLoading: boolean;
  linkError: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volumes: Record<StemName, number>;
  promptAndLink: () => Promise<void>;
  unlink: () => Promise<void>;
  setVolume: (stem: StemName, volume: number) => void;
  togglePlayPause: () => Promise<void>;
}

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
    compact = false,
  } = props;

  const [premuteVolumes, setPremuteVolumes] = useState<Partial<Record<StemName, number>>>({});

  function handleMuteToggle(name: StemName) {
    const current = volumes[name];
    if (current === 0) {
      const restored = premuteVolumes[name] ?? 100;
      setVolume(name, restored);
      setPremuteVolumes(prev => {
        const next = {...prev};
        delete next[name];
        return next;
      });
    } else {
      setPremuteVolumes(prev => ({...prev, [name]: current}));
      setVolume(name, 0);
    }
  }

  const allMuted = loadedStems.length > 0 && loadedStems.every(s => volumes[s] === 0);

  function handleMuteAll() {
    if (allMuted) {
      // Restore all
      for (const name of loadedStems) {
        const restored = premuteVolumes[name] ?? 100;
        setVolume(name, restored);
      }
      setPremuteVolumes({});
    } else {
      // Mute all — save current volumes
      const snapshot: Partial<Record<StemName, number>> = {};
      for (const name of loadedStems) {
        if (volumes[name] > 0) snapshot[name] = volumes[name];
        setVolume(name, 0);
      }
      setPremuteVolumes(snapshot);
    }
  }

  // ---- Compact mode: compact header row always shown ----
  if (compact) {
    return (
      <TooltipProvider>
        <div>
          {/* Section header */}
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Stems</span>
            <div className="flex items-center gap-0.5">
              {stemsReady && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleMuteAll}
                      className={`p-1 rounded transition-colors ${allMuted ? 'text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
                    >
                      {allMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{allMuted ? 'Unmute all' : 'Mute all'}</TooltipContent>
                </Tooltip>
              )}
              {!isLinked && !isCopying && !isLoading && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => void promptAndLink()}
                      className="p-1 rounded text-on-surface-variant hover:bg-surface-container-high transition-colors"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Link stems folder (Demucs output)</TooltipContent>
                </Tooltip>
              )}
              {isLinked && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => void unlink()}
                      className="p-1 rounded text-on-surface-variant/50 hover:text-destructive hover:bg-surface-container-high transition-colors"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Unlink stems</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Body */}
          {(isCopying || isLoading) && (
            <div className="px-4 pb-3 flex items-center gap-2 text-on-surface-variant text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>{isCopying ? 'Copying…' : 'Loading…'}</span>
            </div>
          )}

          {linkError && (
            <p className="px-4 pb-2 text-xs text-red-500">{linkError}</p>
          )}

          {stemsReady && (
            <div className="px-4 pb-3 space-y-2">
              {/* Playback note */}
              <p className="text-[10px] text-on-surface-variant/60">Synced with score playback</p>

              {/* Per-track faders */}
              {loadedStems.map(name => {
                const vol = volumes[name];
                const isMuted = vol === 0;
                return (
                  <div key={name} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-on-surface capitalize">{name}</span>
                      <button
                        onClick={() => handleMuteToggle(name)}
                        className={`p-0.5 rounded transition-colors ${isMuted ? 'text-on-surface-variant/40' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
                        title={isMuted ? 'Unmute' : 'Mute'}
                      >
                        {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={vol}
                      onChange={e => setVolume(name, Number(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-surface-container"
                      style={{accentColor: 'var(--color-accent-primary, hsl(var(--primary)))'}}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </TooltipProvider>
    );
  }

  // ---- Full (standalone) mode ----

  if (isCopying || isLoading) {
    return (
      <div className="flex items-center gap-2 text-on-surface-variant text-sm py-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{isCopying ? 'Copying stems…' : 'Loading stems…'}</span>
      </div>
    );
  }

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

  if (!stemsReady) {
    return (
      <div className="flex items-center gap-2 text-on-surface-variant text-sm py-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>Loading audio…</span>
      </div>
    );
  }

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
        <div className="flex-1" />
        {/* Mute all */}
        <Button
          variant="ghost"
          size="icon"
          className={`h-6 w-6 ${allMuted ? 'text-primary' : 'text-on-surface-variant'}`}
          onClick={handleMuteAll}
          title={allMuted ? 'Unmute all' : 'Mute all'}
        >
          {allMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </Button>
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
                    className={`h-5 w-5 shrink-0 ${isMuted ? 'text-on-surface-variant/40' : ''}`}
                    onClick={() => handleMuteToggle(name)}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={vol}
                onChange={e => setVolume(name, Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-surface-container"
                style={{accentColor: 'var(--color-accent-primary, hsl(var(--primary)))'}}
              />
            </div>
          );
        })}
      </div>

      {/* Unlink */}
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
