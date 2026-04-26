import {useCallback, useEffect, useRef, useState} from 'react';
import {appDataDir, join} from '@tauri-apps/api/path';
import {readDir, readFile, writeFile, mkdir, remove, exists} from '@tauri-apps/plugin-fs';
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

async function getDestDir(songKey: string): Promise<string> {
  const base = await appDataDir();
  return join(base, 'stems', songKey);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStemPlayer(songKey: string) {
  // --- State ---
  const [isLinked, setIsLinked] = useState(false);
  const [stemsReady, setStemsReady] = useState(false);
  const [loadedStems, setLoadedStems] = useState<StemName[]>([]);
  const [isCopying, setIsCopying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volumes, setVolumes] = useState<Volumes>(DEFAULT_VOLUMES);

  // --- Refs ---
  const audioManagerRef = useRef<AudioManager | null>(null);
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
    stopInterval();
    audioManagerRef.current?.destroy();
    audioManagerRef.current = null;
    setStemsReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadedStems([]);
  }, [stopInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopInterval();
      audioManagerRef.current?.destroy();
      audioManagerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- loadStems: read files from a folder path and initialise AudioManager ---
  const loadStems = useCallback(
    async (folderPath: string) => {
      setIsLoading(true);
      try {
        const entries = await readDir(folderPath);

        // Find matching stem entries
        const stemEntries: {stem: StemName; name: string}[] = [];
        for (const entry of entries) {
          if (!entry.name) continue;
          const nameWithoutExt = entry.name.replace(AUDIO_EXTENSIONS, '');
          if (isStemName(nameWithoutExt) && AUDIO_EXTENSIONS.test(entry.name)) {
            stemEntries.push({stem: nameWithoutExt, name: entry.name});
          }
        }

        if (stemEntries.length === 0) {
          throw new Error(
            'No stem files found in stored folder. ' +
              'Expected files named drums/bass/vocals/guitar/other with a .wav/.mp3/.ogg/.flac extension.',
          );
        }

        // Read all files
        const files = await Promise.all(
          stemEntries.map(async ({stem, name}) => {
            const filePath = await join(folderPath, name);
            const data = await readFile(filePath);
            return {fileName: stem, data};
          }),
        );

        const foundStems = stemEntries.map(e => e.stem);

        const manager = new AudioManager(files, () => {
          setIsPlaying(false);
          stopInterval();
          setCurrentTime(0);
        });

        await manager.ready;

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
      } finally {
        setIsLoading(false);
      }
    },
    [stopInterval],
  );

  // --- On mount: load existing association ---
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const assoc = await getStemAssociation(songKey);
        if (cancelled) return;
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
    };
    // loadStems is stable (useCallback), songKey is the only real dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songKey]);

  // --- linkFolder ---
  const linkFolder = useCallback(
    async (sourceFolderPath: string) => {
      setIsCopying(true);
      setLinkError(null);
      destroyManager();

      try {
        // Scan source for stem files
        const entries = await readDir(sourceFolderPath);
        const stemEntries: {stem: StemName; name: string}[] = [];
        for (const entry of entries) {
          if (!entry.name) continue;
          const nameWithoutExt = entry.name.replace(AUDIO_EXTENSIONS, '');
          if (isStemName(nameWithoutExt) && AUDIO_EXTENSIONS.test(entry.name)) {
            stemEntries.push({stem: nameWithoutExt, name: entry.name});
          }
        }

        if (stemEntries.length === 0) {
          throw new Error(
            'No stem files found (drums/bass/vocals/guitar/other). ' +
              'Select the folder that Demucs created (e.g. separated/htdemucs/<song_name>/).',
          );
        }

        // Create destination directory
        const destDir = await getDestDir(songKey);
        await mkdir(destDir, {recursive: true});

        // Copy each file
        for (const {name} of stemEntries) {
          const srcPath = await join(sourceFolderPath, name);
          const destPath = await join(destDir, name);
          const data = await readFile(srcPath);
          await writeFile(destPath, data);
        }

        // Persist to DB
        await saveStemAssociation(songKey, destDir);
        setIsLinked(true);

        // Load AudioManager from copied files
        await loadStems(destDir);
      } catch (err) {
        setLinkError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsCopying(false);
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
        if (folderExists) {
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

  // --- togglePlayPause ---
  const togglePlayPause = useCallback(async () => {
    const mgr = audioManagerRef.current;
    if (!mgr) return;

    if (mgr.isPlaying) {
      await mgr.pause();
      stopInterval();
      setIsPlaying(false);
    } else {
      if (mgr.isInitialized) {
        await mgr.resume();
      } else {
        await mgr.play({percent: 0});
      }
      setIsPlaying(true);
      startInterval();
    }
  }, [startInterval, stopInterval]);

  // --- seek ---
  const seek = useCallback(
    async (timeSeconds: number) => {
      const mgr = audioManagerRef.current;
      if (!mgr) return;

      stopInterval();
      await mgr.stop();
      await mgr.play({time: timeSeconds});
      setIsPlaying(true);
      setCurrentTime(timeSeconds);
      startInterval();
    },
    [startInterval, stopInterval],
  );

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
    togglePlayPause,
    seek,
  };
}
