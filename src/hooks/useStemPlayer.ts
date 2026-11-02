import {useCallback, useEffect, useRef, useState} from 'react';
import {appDataDir, join} from '@tauri-apps/api/path';
import {readDir, readFile, remove, exists} from '@tauri-apps/plugin-fs';
import {open} from '@tauri-apps/plugin-dialog';
import {AudioManager} from '@/lib/preview/audioManager';
import {
  getStemAssociation,
  saveStemAssociation,
  deleteStemAssociation,
} from '@/lib/local-db/stems';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const STEM_NAMES = ['drums', 'bass', 'vocals', 'guitar', 'other'] as const;
export type StemName = (typeof STEM_NAMES)[number];

type Volumes = Record<StemName, number>;

const DEFAULT_VOLUMES: Volumes = {
  drums: 100,
  bass: 100,
  vocals: 100,
  guitar: 100,
  other: 100,
};

const AUDIO_EXTENSIONS = /\.(wav|mp3|ogg|flac)$/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isStemName(name: string): name is StemName {
  return (STEM_NAMES as readonly string[]).includes(name);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

async function getManagedStemRoot(): Promise<string> {
  return join(await appDataDir(), 'stems');
}

async function isManagedStemDir(path: string): Promise<boolean> {
  const root = normalizePath(await getManagedStemRoot());
  const target = normalizePath(path);
  return target === root || target.startsWith(`${root}/`);
}

function scanStemEntries(
  entries: Awaited<ReturnType<typeof readDir>>,
): Array<{stem: StemName; name: string}> {
  const found = entries
    .filter(e => !e.isDirectory)
    .flatMap(e => {
      const nameWithoutExt = e.name.replace(AUDIO_EXTENSIONS, '');
      return isStemName(nameWithoutExt) && AUDIO_EXTENSIONS.test(e.name)
        ? [{stem: nameWithoutExt as StemName, name: e.name}]
        : [];
    });
  if (found.length === 0)
    throw new Error('No stem files found (drums/bass/guitar/other/vocals)');
  return found;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStemPlayer(songKey: string) {
  // --- State ---
  const [isLinked, setIsLinked] = useState(false);
  const [stemsReady, setStemsReady] = useState(false);
  const [loadedStems, setLoadedStems] = useState<StemName[]>([]);
  const isCopying = false;
  const [isLoading, setIsLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volumes, setVolumes] = useState<Volumes>(DEFAULT_VOLUMES);

  // --- Refs ---
  const audioManagerRef = useRef<AudioManager | null>(null);
  const loadVersionRef = useRef(0);
  const transportVersionRef = useRef(0);
  const pendingCommandRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const volumesRef = useRef<Volumes>(volumes);
  useEffect(() => {
    volumesRef.current = volumes;
  }, [volumes]);

  // --- Interval helpers ---
  const stopInterval = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startInterval = useCallback(() => {
    stopInterval();
    intervalRef.current = setInterval(() => {
      const mgr = audioManagerRef.current;
      if (mgr) setCurrentTime(mgr.currentTime);
    }, 250);
  }, [stopInterval]);

  // --- Destroy manager ---
  const destroyManager = useCallback(() => {
    ++loadVersionRef.current;
    ++transportVersionRef.current;
    pendingCommandRef.current = null;
    stopInterval();
    audioManagerRef.current?.destroy();
    audioManagerRef.current = null;
    setStemsReady(false);
    setIsLoading(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadedStems([]);
  }, [stopInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ++loadVersionRef.current;
      ++transportVersionRef.current;
      stopInterval();
      audioManagerRef.current?.destroy();
      audioManagerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- loadStems: read files from a folder path and initialise AudioManager ---
  const loadStems = useCallback(
    async (folderPath: string) => {
      const version = ++loadVersionRef.current;
      let manager: AudioManager | null = null;
      setIsLoading(true);
      try {
        const entries = await readDir(folderPath);
        const stemEntries = scanStemEntries(entries);

        // Read all files
        const files = await Promise.all(
          stemEntries.map(async ({stem, name}) => {
            const filePath = await join(folderPath, name);
            const data = await readFile(filePath);
            return {fileName: stem, data};
          }),
        );

        if (version !== loadVersionRef.current) return false;
        const foundStems = stemEntries.map(e => e.stem);

        manager = new AudioManager(files, () => {
          if (audioManagerRef.current !== manager) return;
          setIsPlaying(false);
          stopInterval();
          setCurrentTime(0);
        });

        await manager.ready;
        if (version !== loadVersionRef.current) {
          manager.destroy();
          return false;
        }

        // Apply current volumes
        for (const stem of foundStems) {
          try {
            manager.setVolume(stem, volumesRef.current[stem] / 100);
          } catch {
            // Track may not exist if file was missing — ignore
          }
        }

        audioManagerRef.current = manager;
        setLoadedStems(foundStems);
        setDuration(manager.duration);
        setStemsReady(true);
        return true;
      } catch (err) {
        manager?.destroy();
        if (version === loadVersionRef.current) throw err;
        return false;
      } finally {
        if (version === loadVersionRef.current) setIsLoading(false);
      }
    },
    [stopInterval],
  );

  // --- On mount: load existing association ---
  useEffect(() => {
    let cancelled = false;
    destroyManager();
    setIsLinked(false);
    setLinkError(null);
    const version = loadVersionRef.current;

    async function init() {
      try {
        const assoc = await getStemAssociation(songKey);
        if (cancelled || version !== loadVersionRef.current) return;
        if (assoc) {
          setIsLinked(true);
          await loadStems(assoc.stem_folder_path);
        }
      } catch (err) {
        if (!cancelled) {
          setLinkError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      ++loadVersionRef.current;
      ++transportVersionRef.current;
      stopInterval();
      audioManagerRef.current?.destroy();
      audioManagerRef.current = null;
    };
    // loadStems is stable (useCallback), songKey is the only real dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songKey]);

  // --- linkFolder ---
  const linkFolder = useCallback(
    async (sourceFolderPath: string) => {
      setIsLoading(true);
      setLinkError(null);
      destroyManager();
      const version = loadVersionRef.current + 1;

      try {
        // Persist the selected folder directly. Copying multi-stem audio into
        // app data makes linking feel blocked for large Demucs outputs.
        if (!await loadStems(sourceFolderPath)) return;
        await saveStemAssociation(songKey, sourceFolderPath);
        if (version === loadVersionRef.current) setIsLinked(true);
      } catch (err) {
        if (version === loadVersionRef.current) setLinkError(err instanceof Error ? err.message : String(err));
      } finally {
        if (version === loadVersionRef.current) setIsLoading(false);
      }
    },
    [destroyManager, loadStems, songKey],
  );

  // --- promptAndLink ---
  const promptAndLink = useCallback(async () => {
    const selected = await open({directory: true, title: 'Select Demucs stem folder'});
    if (!selected || typeof selected !== 'string') return;
    await linkFolder(selected);
  }, [linkFolder]);

  // --- unlink ---
  const unlink = useCallback(async () => {
    destroyManager();

    try {
      const assoc = await getStemAssociation(songKey);
      await deleteStemAssociation(songKey);
      setIsLinked(false);
      setLinkError(null);

      if (assoc) {
        const folderExists = await exists(assoc.stem_folder_path);
        if (folderExists && await isManagedStemDir(assoc.stem_folder_path)) {
          await remove(assoc.stem_folder_path, {recursive: true});
        }
      }
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
    }
  }, [destroyManager, songKey]);

  // --- setVolume ---
  const setVolume = useCallback((name: StemName, value: number) => {
    setVolumes(prev => ({...prev, [name]: value}));
    try {
      audioManagerRef.current?.setVolume(name, value / 100);
    } catch {
      // Ignore if track doesn't exist
    }
  }, []);

  // Commands invalidate pending continuations immediately, including play waiting
  // for an AudioContext resume. A stale completion must not restart UI timers.
  const stopAndReset = useCallback(async () => {
    const version = ++transportVersionRef.current;
    pendingCommandRef.current = version;
    stopInterval();
    setIsPlaying(false);
    setCurrentTime(0);
    const mgr = audioManagerRef.current;
    try { await mgr?.stop(); }
    finally { if (version === transportVersionRef.current) pendingCommandRef.current = null; }
  }, [stopInterval]);

  const play = useCallback(async () => {
    const mgr = audioManagerRef.current;
    if (!mgr || (mgr.isPlaying && pendingCommandRef.current === null)) return;
    const version = ++transportVersionRef.current;
    pendingCommandRef.current = version;
    try {
      if (mgr.isInitialized) await mgr.resume();
      else await mgr.play({percent: 0});
      if (version !== transportVersionRef.current || mgr !== audioManagerRef.current) return;
      setIsPlaying(true);
      startInterval();
    } finally {
      if (version === transportVersionRef.current) pendingCommandRef.current = null;
    }
  }, [startInterval]);

  const pause = useCallback(async () => {
    const version = ++transportVersionRef.current;
    pendingCommandRef.current = version;
    stopInterval();
    setIsPlaying(false);
    // Also suspend when resume is still pending and isPlaying has not flipped.
    try { await audioManagerRef.current?.pause(); }
    finally { if (version === transportVersionRef.current) pendingCommandRef.current = null; }
  }, [stopInterval]);

  const togglePlayPause = useCallback(async () => {
    if (audioManagerRef.current?.isPlaying) await pause();
    else await play();
  }, [play, pause]);

  const seek = useCallback(async (timeSeconds: number) => {
    const mgr = audioManagerRef.current;
    if (!mgr) return;
    const version = ++transportVersionRef.current;
    pendingCommandRef.current = version;
    stopInterval();
    try {
      await mgr.play({time: timeSeconds});
      if (version !== transportVersionRef.current || mgr !== audioManagerRef.current) return;
      setIsPlaying(true);
      setCurrentTime(timeSeconds);
      startInterval();
    } finally {
      if (version === transportVersionRef.current) pendingCommandRef.current = null;
    }
  }, [startInterval, stopInterval]);

  return {
    // State
    isLinked,
    stemsReady,
    loadedStems,
    isCopying,
    isLoading,
    linkError,

    // Playback
    isPlaying,
    currentTime,
    duration,
    volumes,

    // Actions
    linkFolder,
    promptAndLink,
    unlink,
    setVolume,
    play,
    pause,
    stopAndReset,
    togglePlayPause,
    seek,
  };
}
