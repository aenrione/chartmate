import {useEffect, useRef, useState, useCallback} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {open} from '@tauri-apps/plugin-dialog';
import {readFile} from '@tauri-apps/plugin-fs';
import {appCacheDir, join} from '@tauri-apps/api/path';
import {
  FolderOpen,
  Play,
  Pause,
  Loader2,
  AlertTriangle,
  Music2,
} from 'lucide-react';
import {cn} from '@/lib/utils';
import {useMobilePageTitle} from '@/contexts/LayoutContext';
import {Slider} from '@/components/ui/slider';
import {AudioManager} from '@/lib/preview/audioManager';
import type {Files} from '@/lib/preview/chorus-chart-processing';

// ── Types ──────────────────────────────────────────────────────────────────

type StemFile = {name: string; path: string};

// ── Constants ──────────────────────────────────────────────────────────────

const STEM_NAMES = ['drums', 'bass', 'vocals', 'guitar', 'other'] as const;
type StemName = (typeof STEM_NAMES)[number];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function StemPlayerPage() {
  useMobilePageTitle('Stem Player');

  // File picker state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');

  // Demucs check
  const [demucsAvailable, setDemucsAvailable] = useState<boolean | null>(null);

  // Separation state
  const [isSeparating, setIsSeparating] = useState(false);
  const [progressLines, setProgressLines] = useState<string[]>([]);
  const progressEndRef = useRef<HTMLDivElement>(null);

  // Stems / AudioManager
  const [stems, setStems] = useState<StemFile[] | null>(null);
  const [stemsReady, setStemsReady] = useState(false);
  const audioManagerRef = useRef<AudioManager | null>(null);

  // Fader volumes (0–100)
  const [volumes, setVolumes] = useState<Record<StemName, number>>({
    drums: 100,
    bass: 100,
    vocals: 100,
    guitar: 100,
    other: 100,
  });
  const volumesRef = useRef(volumes);
  useEffect(() => { volumesRef.current = volumes; }, [volumes]);

  // Separation error
  const [separationError, setSeparationError] = useState<string | null>(null);

  // Transport
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Check Demucs on mount ────────────────────────────────────────────────
  useEffect(() => {
    invoke<string>('check_demucs')
      .then(() => setDemucsAvailable(true))
      .catch(() => setDemucsAvailable(false));
  }, []);

  // ── Auto-scroll progress log ─────────────────────────────────────────────
  useEffect(() => {
    progressEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [progressLines]);

  // ── Destroy audio manager on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      audioManagerRef.current?.destroy();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ── File picker ──────────────────────────────────────────────────────────
  const handlePickFile = useCallback(async () => {
    const result = await open({
      multiple: false,
      filters: [
        {name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a']},
      ],
    });
    if (typeof result === 'string') {
      setSelectedFile(result);
      const parts = result.split(/[\\/]/);
      setSelectedFileName(parts[parts.length - 1] ?? result);
      // Reset previous session
      audioManagerRef.current?.destroy();
      audioManagerRef.current = null;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setStems(null);
      setStemsReady(false);
      setProgressLines([]);
      setSeparationError(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, []);

  // ── Separate stems ───────────────────────────────────────────────────────
  const handleSeparate = useCallback(async () => {
    if (!selectedFile || !demucsAvailable || isSeparating) return;

    setSeparationError(null);
    setIsSeparating(true);
    setProgressLines([]);
    setStems(null);
    setStemsReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    audioManagerRef.current?.destroy();
    audioManagerRef.current = null;

    const outputDir = await join(await appCacheDir(), 'stems');

    // Start listening for progress events BEFORE invoking
    const unlisten = await listen<string>('stems:progress', event => {
      setProgressLines(prev => [...prev, event.payload]);
    });

    try {
      const result = await invoke<StemFile[]>('separate_stems', {
        inputPath: selectedFile,
        outputDir,
      });
      setStems(result);

      // Load into AudioManager
      const files: Files = await Promise.all(
        result.map(async s => {
          const data = await readFile(s.path);
          return {fileName: s.name, data};
        }),
      );

      const manager = new AudioManager(files, () => {
        setIsPlaying(false);
        setCurrentTime(0);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      });
      await manager.ready;

      audioManagerRef.current = manager;
      setDuration(manager.duration);

      setStemsReady(true);

      // Apply current volume state
      for (const name of STEM_NAMES) {
        try {
          manager.setVolume(name, volumesRef.current[name] / 100);
        } catch {
          // stem may not exist in the output — ignore
        }
      }
    } catch (err) {
      setSeparationError(err instanceof Error ? err.message : String(err));
    } finally {
      unlisten();
      setIsSeparating(false);
    }
  }, [selectedFile, demucsAvailable, isSeparating]);

  // ── Transport ────────────────────────────────────────────────────────────
  const startTimeInterval = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      const m = audioManagerRef.current;
      if (m) setCurrentTime(m.currentTime);
    }, 500);
  }, []);

  const stopTimeInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handlePlayPause = useCallback(async () => {
    const m = audioManagerRef.current;
    if (!m) return;

    if (isPlaying) {
      await m.pause();
      setIsPlaying(false);
      stopTimeInterval();
    } else {
      if (m.isInitialized) {
        await m.resume();
      } else {
        await m.play({percent: 0});
      }
      setIsPlaying(true);
      startTimeInterval();
    }
  }, [isPlaying, startTimeInterval, stopTimeInterval]);

  // ── Fader change ─────────────────────────────────────────────────────────
  const handleVolumeChange = useCallback(
    (name: StemName, value: number) => {
      setVolumes(prev => ({...prev, [name]: value}));
      try {
        audioManagerRef.current?.setVolume(name, value / 100);
      } catch {
        // track might not exist
      }
    },
    [],
  );

  // ── Derived ──────────────────────────────────────────────────────────────
  const canSeparate =
    demucsAvailable === true && !!selectedFile && !isSeparating;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <header className="hidden lg:block space-y-1">
          <h1 className="font-headline font-extrabold text-3xl text-on-surface tracking-tight">
            Stem Player
          </h1>
          <p className="text-on-surface-variant text-sm">
            Separate and mix audio stems with Demucs.
          </p>
        </header>

        {/* Demucs not available banner */}
        {demucsAvailable === false && (
          <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
            <div className="text-sm text-yellow-300 space-y-1">
              <p className="font-semibold">Demucs not found</p>
              <p className="text-yellow-400">
                Install it with:{' '}
                <code className="rounded bg-yellow-500/20 px-1 py-0.5 font-mono text-xs text-yellow-200">
                  pip install demucs
                </code>
              </p>
              <p className="text-yellow-400 text-xs">
                Requires Python 3.9+ and PyTorch. After installing, restart the
                app.
              </p>
            </div>
          </div>
        )}

        {/* File picker */}
        <section className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-outline">
            Audio File
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePickFile}
              disabled={isSeparating}
              className={cn(
                'flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity',
                isSeparating && 'opacity-50 cursor-not-allowed',
              )}
            >
              <FolderOpen className="h-4 w-4" />
              Choose File
            </button>
            {selectedFileName ? (
              <span className="truncate text-sm text-on-surface-variant max-w-xs">
                {selectedFileName}
              </span>
            ) : (
              <span className="text-sm text-outline">No file selected</span>
            )}
          </div>
        </section>

        {/* Separate button */}
        <section>
          <button
            onClick={handleSeparate}
            disabled={!canSeparate}
            className={cn(
              'flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-lg font-medium text-sm transition-opacity',
              !canSeparate && 'opacity-50 cursor-not-allowed',
            )}
          >
            {isSeparating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Separating…
              </>
            ) : (
              <>
                <Music2 className="h-4 w-4" />
                Separate Stems
              </>
            )}
          </button>
          {separationError && (
            <div className="text-red-400 text-sm mt-2 p-2 bg-red-400/10 rounded">
              {separationError}
            </div>
          )}
        </section>

        {/* Progress log */}
        {(isSeparating || progressLines.length > 0) && (
          <section className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-outline">
              Progress
            </p>
            <div className="relative rounded-xl bg-surface-container border border-outline-variant/20 overflow-hidden">
              {isSeparating && (
                <div className="flex items-center gap-2 px-4 py-2 border-b border-outline-variant/20 bg-surface-container-low">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-xs text-on-surface-variant">
                    Running Demucs…
                  </span>
                </div>
              )}
              <div className="h-48 overflow-y-auto px-4 py-3 font-mono text-xs text-on-surface-variant space-y-0.5">
                {progressLines.map((line, i) => (
                  <p key={i} className="leading-relaxed whitespace-pre-wrap break-all">
                    {line}
                  </p>
                ))}
                <div ref={progressEndRef} />
              </div>
            </div>
          </section>
        )}

        {/* Stem faders */}
        {stemsReady && stems && (
          <section className="space-y-4">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-outline">
              Stem Faders
            </p>
            <div className="rounded-xl bg-surface-container border border-outline-variant/20 divide-y divide-outline-variant/10">
              {stems.map(stem => {
                if (!STEM_NAMES.includes(stem.name as StemName)) return null;
                const name = stem.name as StemName;
                const vol = volumes[name] ?? 100;
                return (
                  <div
                    key={stem.name}
                    className="flex items-center gap-4 px-5 py-4"
                  >
                    <span className="w-16 text-sm font-medium text-on-surface capitalize shrink-0">
                      {stem.name}
                    </span>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[vol]}
                      onValueChange={([v]) => handleVolumeChange(name, v)}
                      className="flex-1"
                    />
                    <span className="w-8 text-right text-xs text-on-surface-variant tabular-nums shrink-0">
                      {vol}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Transport controls */}
        {stemsReady && (
          <section className="space-y-3">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-outline">
              Transport
            </p>
            <div className="flex items-center gap-4 rounded-xl bg-surface-container border border-outline-variant/20 px-5 py-4">
              <button
                onClick={handlePlayPause}
                className="flex items-center justify-center h-10 w-10 rounded-full bg-primary text-on-primary hover:opacity-90 transition-opacity shrink-0"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 translate-x-px" />
                )}
              </button>
              <span className="text-sm tabular-nums text-on-surface-variant">
                {formatTime(currentTime)}
                <span className="mx-1 text-outline">/</span>
                {formatTime(duration)}
              </span>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
