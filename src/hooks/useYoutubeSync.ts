import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {toast} from 'sonner';
import debounce from 'debounce';
import type {YouTubePlayerHandle} from '@/components/YouTubePlayer';
import {YouTubeSync, type PlaybackClock} from '@/lib/youtube-sync';
import {extractYoutubeVideoId} from '@/lib/youtube-utils';
import {
  getYoutubeAssociation,
  saveYoutubeAssociation,
  updateYoutubeOffset,
  deleteYoutubeAssociation,
} from '@/lib/local-db/youtube';

interface UseYoutubeSyncOptions {
  /** Unique key for this song/chart (md5, file path hash, etc.) */
  songKey: string;
  /** Ref to the playback clock — any engine that satisfies PlaybackClock */
  clockRef: React.RefObject<PlaybackClock | null>;
  /** Current playback speed (1.0 = normal) */
  tempo: number;
}

export function useYoutubeSync({songKey, clockRef, tempo}: UseYoutubeSyncOptions) {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [youtubeOffsetMs, setYoutubeOffsetMs] = useState(0);
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('');
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const syncRef = useRef<YouTubeSync>(new YouTubeSync());

  // Load YouTube association from DB
  useEffect(() => {
    setYoutubeUrl('');
    setYoutubeUrlInput('');
    setYoutubeVideoId(null);
    setYoutubeOffsetMs(0);

    getYoutubeAssociation(songKey).then(assoc => {
      if (assoc) {
        setYoutubeUrl(assoc.youtube_url);
        setYoutubeUrlInput(assoc.youtube_url);
        setYoutubeOffsetMs(assoc.offset_ms);
        const videoId = extractYoutubeVideoId(assoc.youtube_url);
        if (videoId) {
          setYoutubeVideoId(videoId);
        }
      }
    });
  }, [songKey]);

  // Update sync engine offset
  useEffect(() => {
    syncRef.current.setOffset(youtubeOffsetMs);
  }, [youtubeOffsetMs]);

  // Cleanup YouTube sync on unmount
  useEffect(() => {
    return () => {
      syncRef.current.destroy();
    };
  }, []);

  // Debounced DB write for offset changes
  // Include songKey so the debounce instance is flushed/cancelled when the song changes,
  // preventing a pending write from a previous song from firing under the new key.
  const debouncedSaveOffset = useMemo(
    () => debounce((key: string, ms: number) => updateYoutubeOffset(key, ms), 500),
    [songKey],
  );

  const handleUrlSubmit = useCallback(async (overrideUrl?: string | React.MouseEvent | React.KeyboardEvent) => {
    const url = typeof overrideUrl === 'string' ? overrideUrl : youtubeUrlInput;
    const videoId = extractYoutubeVideoId(url);
    if (!videoId) {
      toast.error('Invalid YouTube URL');
      return;
    }
    setYoutubeUrl(url);
    if (url !== youtubeUrlInput) setYoutubeUrlInput(url);
    setYoutubeVideoId(videoId);
    await saveYoutubeAssociation(songKey, url, youtubeOffsetMs);
    toast.success('YouTube video linked');
  }, [youtubeUrlInput, songKey, youtubeOffsetMs]);

  const handleRemove = useCallback(async () => {
    setYoutubeUrl('');
    setYoutubeUrlInput('');
    setYoutubeVideoId(null);
    setYoutubeOffsetMs(0);
    playerRef.current?.destroy();
    playerRef.current = null;
    syncRef.current.disable();
    await deleteYoutubeAssociation(songKey);
    toast.success('YouTube video unlinked');
  }, [songKey]);

  const handleOffsetChange = useCallback(
    (newOffsetMs: number) => {
      setYoutubeOffsetMs(newOffsetMs);
      syncRef.current.setOffset(newOffsetMs);
      if (youtubeUrl) {
        debouncedSaveOffset(songKey, newOffsetMs);
      }
    },
    [songKey, youtubeUrl, debouncedSaveOffset],
  );

  const handleReady = useCallback(() => {
    syncRef.current.setYouTubePlayer(playerRef.current);
    syncRef.current.setOffset(youtubeOffsetMs);
    if (clockRef.current) {
      syncRef.current.setClock(clockRef.current);
    }
    syncRef.current.enable();
    playerRef.current?.setPlaybackRate(tempo);
  }, [youtubeOffsetMs, tempo, clockRef]);

  /**
   * Call when the user scrubs the playback position. Seeks YouTube without
   * changing its play state — unlike onPlayFrom which also starts playback.
   */
  const handleSeek = useCallback((timeSeconds: number) => {
    if (clockRef.current?.isPlaying) {
      syncRef.current.onPlayFrom(timeSeconds);
    } else {
      syncRef.current.onSeekTo(timeSeconds);
    }
  }, [clockRef]);

  /** Call when the clock source changes (e.g. AudioManager re-created) */
  const updateClock = useCallback((clock: PlaybackClock | null) => {
    syncRef.current.setClock(clock);
  }, []);

  /** Migrate the YouTube association to a new song key (e.g. after saving a new composition). */
  const migrateKey = useCallback(async (newKey: string) => {
    if (!youtubeUrl || songKey === newKey) return;
    await saveYoutubeAssociation(newKey, youtubeUrl, youtubeOffsetMs);
    await deleteYoutubeAssociation(songKey);
  }, [songKey, youtubeUrl, youtubeOffsetMs]);

  /**
   * Seed a YouTube URL from an external source (e.g. DB composition metadata)
   * without showing a toast. No-ops if an association already exists.
   */
  const seedFromDb = useCallback(async (url: string) => {
    const videoId = extractYoutubeVideoId(url);
    if (!videoId) return;
    const existing = await getYoutubeAssociation(songKey);
    if (existing) return;
    await saveYoutubeAssociation(songKey, url, 0);
    setYoutubeUrl(url);
    setYoutubeUrlInput(url);
    setYoutubeVideoId(videoId);
  }, [songKey]);

  return {
    youtubeUrl,
    youtubeVideoId,
    youtubeOffsetMs,
    youtubeUrlInput,
    setYoutubeUrlInput,
    playerRef,
    syncRef,
    handleUrlSubmit,
    handleRemove,
    handleOffsetChange,
    handleReady,
    handleSeek,
    updateClock,
    migrateKey,
    seedFromDb,
  };
}
