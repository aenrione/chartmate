import {useMemo} from 'react';
import {FolderOpen, Play, Pause, Volume2} from 'lucide-react';
import {cn} from '@/lib/utils';
import {STEM_NAMES, type StemName} from '@/hooks/useStemPlayer';

type StemPlayerState = {
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
  setVolume: (name: StemName, value: number) => void;
  togglePlayPause: () => Promise<void>;
  seek: (timeSeconds: number) => Promise<void>;
};

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function StemMixerPanel({
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
  setVolume,
  togglePlayPause,
  seek,
}: StemPlayerState) {
  const folderLabel = useMemo(() => {
    if (isCopying) return 'Copying stems…';
    if (isLoading) return 'Loading…';
    if (isLinked) return 'Stems linked';
    return 'Link Stems';
  }, [isCopying, isLoading, isLinked]);

  return (
    <>
      {/* Folder link section */}
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
          Stem Folder
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={promptAndLink}
            disabled={isCopying || isLoading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-medium text-sm transition-opacity',
              (isCopying || isLoading) && 'opacity-50 cursor-not-allowed'
            )}
          >
            <FolderOpen className="h-4 w-4" />
            {folderLabel}
          </button>
          {isLinked && !isCopying && !isLoading && (
            <span className="text-on-surface-variant text-sm">Ready to play</span>
          )}
        </div>
        {linkError && (
          <p className="mt-2 text-sm text-red-400 bg-red-400/10 rounded px-3 py-2">
            {linkError}
          </p>
        )}
      </div>

      {/* Copy progress feedback */}
      {isCopying && (
        <div className="mb-6 p-4 rounded-lg bg-primary/10 text-primary text-sm font-medium">
          Copying stem files to local storage…
        </div>
      )}

      {/* Player UI — only show when ready */}
      {stemsReady && (
        <>
          {/* Transport controls */}
          <div className="mb-6 flex items-center gap-4">
            <button
              onClick={togglePlayPause}
              className="flex items-center justify-center h-10 w-10 rounded-full bg-primary text-on-primary shadow-md hover:shadow-lg transition-shadow"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 translate-x-0.5" />
              )}
            </button>
            <div className="flex-1 flex items-center gap-2 text-xs text-on-surface-variant font-mono">
              <span>{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={currentTime}
                onChange={e => seek(parseFloat(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Stem volume faders */}
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
              <Volume2 className="h-3.5 w-3.5" /> Mix
            </p>
            {loadedStems.map(name => (
              <div key={name} className="flex items-center gap-4">
                <span className="w-16 text-sm font-medium text-on-surface capitalize">
                  {name}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volumes[name] ?? 100}
                  onChange={e => setVolume(name, Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="w-8 text-right text-xs text-on-surface-variant font-mono">
                  {volumes[name] ?? 100}
                </span>
                <button
                  onClick={() => {
                    const current = volumes[name] ?? 100;
                    setVolume(name, current === 0 ? 100 : 0);
                  }}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded font-medium transition-colors',
                    (volumes[name] ?? 100) === 0
                      ? 'bg-primary/20 text-primary'
                      : 'text-on-surface-variant/50 hover:text-on-surface'
                  )}
                >
                  {(volumes[name] ?? 100) === 0 ? 'muted' : 'mute'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
