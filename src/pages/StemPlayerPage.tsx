import {useRef, useState, useEffect, useCallback} from 'react';
import {open} from '@tauri-apps/plugin-dialog';
import {readDir, readFile} from '@tauri-apps/plugin-fs';
import {Music2, FolderOpen, Play, Pause, Volume2} from 'lucide-react';
import {cn} from '@/lib/utils';
import {AudioManager} from '@/lib/preview/audioManager';
import {useMobilePageTitle} from '@/contexts/LayoutContext';

type StemName = 'drums' | 'bass' | 'vocals' | 'guitar' | 'other';
const STEM_NAMES: StemName[] = ['drums', 'bass', 'vocals', 'guitar', 'other'];

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function StemPlayerPage() {
  useMobilePageTitle('Stem Player');

  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stemsReady, setStemsReady] = useState(false);
  const [loadedStems, setLoadedStems] = useState<StemName[]>([]);
  const [volumes, setVolumes] = useState<Record<StemName, number>>({
    drums: 100, bass: 100, vocals: 100, guitar: 100, other: 100,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioManagerRef = useRef<AudioManager | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const volumesRef = useRef(volumes);
  useEffect(() => { volumesRef.current = volumes; }, [volumes]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const destroyManager = useCallback(() => {
    stopInterval();
    audioManagerRef.current?.destroy();
    audioManagerRef.current = null;
    setStemsReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadedStems([]);
  }, [stopInterval]);

  useEffect(() => () => destroyManager(), [destroyManager]);

  const handlePickFolder = useCallback(async () => {
    const selected = await open({directory: true, title: 'Select Demucs stem folder'});
    if (!selected || typeof selected !== 'string') return;

    destroyManager();
    setFolderPath(selected);
    setLoadError(null);
    setIsLoading(true);

    try {
      // Scan folder for known stem WAV files
      const entries = await readDir(selected);
      const foundNames = entries
        .map(e => e.name?.replace(/\.(wav|mp3|ogg|flac)$/i, '') as StemName)
        .filter((n): n is StemName => STEM_NAMES.includes(n));

      if (foundNames.length === 0) {
        throw new Error(
          'No stem files found (drums/bass/vocals/guitar/other). ' +
          'Select the folder that Demucs created inside separated/htdemucs/'
        );
      }

      // Read each stem file and build Files array for AudioManager
      const files = await Promise.all(
        foundNames.map(async name => {
          const entry = entries.find(
            e => e.name && new RegExp(`^${name}\\.(wav|mp3|ogg|flac)$`, 'i').test(e.name)
          )!;
          const data = await readFile(`${selected}/${entry.name}`);
          return {fileName: name, data};
        })
      );

      const manager = new AudioManager(files, () => {
        setIsPlaying(false);
        stopInterval();
        setCurrentTime(0);
      });

      await manager.ready;

      // Apply initial volume state
      for (const name of foundNames) {
        manager.setVolume(name, volumesRef.current[name] / 100);
      }

      audioManagerRef.current = manager;
      setLoadedStems(foundNames);
      setDuration(manager.duration);
      setStemsReady(true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [destroyManager, stopInterval]);

  const handlePlayPause = useCallback(async () => {
    const m = audioManagerRef.current;
    if (!m) return;

    if (m.isPlaying) {
      await m.pause();
      stopInterval();
      setIsPlaying(false);
    } else {
      if (m.isInitialized) {
        await m.resume();
      } else {
        await m.play({percent: 0});
      }
      setIsPlaying(true);
      intervalRef.current = setInterval(() => {
        const mgr = audioManagerRef.current;
        if (mgr) setCurrentTime(mgr.currentTime);
      }, 250);
    }
  }, [stopInterval]);

  const handleVolumeChange = useCallback((name: StemName, value: number) => {
    setVolumes(prev => ({...prev, [name]: value}));
    try {
      audioManagerRef.current?.setVolume(name, value / 100);
    } catch {}
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const m = audioManagerRef.current;
    if (!m || duration === 0) return;
    const time = parseFloat(e.target.value);
    stopInterval();
    m.stop();
    m.play({time}).then(() => {
      setIsPlaying(true);
      setCurrentTime(time);
      intervalRef.current = setInterval(() => {
        const mgr = audioManagerRef.current;
        if (mgr) setCurrentTime(mgr.currentTime);
      }, 250);
    });
  }, [duration, stopInterval]);

  const folderName = folderPath?.split('/').pop();

  return (
    <div className="flex-1 overflow-y-auto bg-surface p-6 lg:p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold text-on-surface mb-1 flex items-center gap-3">
          <Music2 className="h-7 w-7 text-primary" />
          Stem Player
        </h1>
        <p className="text-on-surface-variant text-sm">
          Load a folder of stems created by Demucs and mix tracks independently.
        </p>
      </div>

      {/* How-to hint */}
      {!stemsReady && !isLoading && (
        <div className="mb-6 rounded-xl border border-outline-variant/30 bg-surface-container p-4 text-sm text-on-surface-variant space-y-1">
          <p className="font-medium text-on-surface">How to create stems</p>
          <p>Run in your terminal:</p>
          <code className="block bg-surface-container-high rounded px-3 py-2 font-mono text-xs text-on-surface mt-1">
            demucs /path/to/song.mp3
          </code>
          <p className="text-xs pt-1">
            Then pick the output folder:{' '}
            <span className="font-mono text-xs">separated/htdemucs/song_name/</span>
          </p>
        </div>
      )}

      {/* Folder picker */}
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
          Stem Folder
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePickFolder}
            disabled={isLoading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-medium text-sm transition-opacity',
              isLoading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <FolderOpen className="h-4 w-4" />
            {isLoading ? 'Loading…' : 'Open Folder'}
          </button>
          {folderName && (
            <span className="text-on-surface-variant text-sm truncate max-w-xs">
              {folderName}
            </span>
          )}
        </div>
        {loadError && (
          <p className="mt-2 text-sm text-red-400 bg-red-400/10 rounded px-3 py-2">
            {loadError}
          </p>
        )}
      </div>

      {/* Player */}
      {stemsReady && (
        <>
          {/* Transport */}
          <div className="mb-6 flex items-center gap-4">
            <button
              onClick={handlePlayPause}
              className="flex items-center justify-center h-10 w-10 rounded-full bg-primary text-on-primary shadow-md"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
            </button>
            <div className="flex-1 flex items-center gap-2 text-xs text-on-surface-variant font-mono">
              <span>{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 accent-primary"
              />
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Stem faders */}
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
                  value={volumes[name]}
                  onChange={e => handleVolumeChange(name, Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="w-8 text-right text-xs text-on-surface-variant font-mono">
                  {volumes[name]}
                </span>
                <button
                  onClick={() => handleVolumeChange(name, volumes[name] === 0 ? 100 : 0)}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded font-medium transition-colors',
                    volumes[name] === 0
                      ? 'bg-primary/20 text-primary'
                      : 'text-on-surface-variant/50 hover:text-on-surface'
                  )}
                >
                  {volumes[name] === 0 ? 'muted' : 'mute'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
