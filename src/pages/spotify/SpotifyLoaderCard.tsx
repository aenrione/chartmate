import {useCallback, useEffect, useMemo, useRef, useState, memo} from 'react';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {User, Users, Clock, Check, Info, Disc3} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  MAX_PLAYLIST_TRACKS_TO_FETCH,
  SpotifyLibraryUpdateProgress,
} from '@/lib/spotify-sdk/SpotifyFetching';
import useInterval from 'use-interval';

export type LoaderPlaylist = {
  id: string;
  name: string;
  totalSongs: number;
  scannedSongs: number;
  isScanning: boolean;
  creator?: string;
  coverUrl?: string;
  isCollaborative?: boolean;
  isAlbum?: boolean;
};

type Props = {
  progress: SpotifyLibraryUpdateProgress;
  autoScroll?: boolean;
};

const CircularProgress = ({
  value,
  size = 20,
}: {
  value: number;
  size?: number;
}) => {
  const radius = (size - 4) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (value / 100) * circumference;
  const isComplete = value >= 100;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{width: size, height: size}}>
      <svg
        width={size}
        height={size}
        className={`transform -rotate-90 transition-opacity duration-500 ${isComplete ? 'opacity-0' : 'opacity-100'}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="2"
          fill="transparent"
          className="text-muted-foreground/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="2"
          fill="transparent"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className="text-primary transition-all duration-300 ease-in-out"
          strokeLinecap="round"
        />
      </svg>

      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
          isComplete ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
        }`}>
        <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
      </div>
    </div>
  );
};

export default function SpotifyLoaderCard({
  progress,
  autoScroll = true,
}: Props) {
  const rateLimitCountdown =
    progress.rateLimitCountdown?.retryAfterSeconds ?? 0;
  const isRateLimited = rateLimitCountdown > 0;

  const [countdown, setCountdown] = useState(rateLimitCountdown);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<{[id: string]: HTMLDivElement | null}>({});
  const prevScrolledId = useRef<string | null>(null);
  const [etaTick, setEtaTick] = useState(0);
  const scanStartTimeRef = useRef<number | null>(null);
  const initialCachedCountsRef = useRef<{[id: string]: number}>({});

  const handleRowRef = useCallback((id: string, el: HTMLDivElement | null) => {
    itemRefs.current[id] = el;
  }, []);


  useInterval(
    () => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    },
    countdown > 0 ? 1000 : null,
  );

  const allItems: LoaderPlaylist[] = useMemo(() => {
    return Object.values(progress.playlists)
      .map(p => {
        return {
          id: p.id,
          name: p.name,
          totalSongs: p.total,
          scannedSongs: p.fetched,
          isScanning: p.status === 'fetching',
          creator: p.owner.displayName,
          isCollaborative: p.collaborative,
          isAlbum: false,
        };
      })
      .concat(
        Object.values(progress.albums).map(a => {
          return {
            id: a.id,
            name: a.name,
            totalSongs: a.totalTracks ?? 0,
            scannedSongs: a.fetched ?? 0,
            isScanning: a.status === 'fetching',
            creator: a.artistName ?? '',
            isAlbum: true,
            isCollaborative: false,
          };
        }),
      );
  }, [progress.playlists, progress.albums]);

  const fullyFetchedPlaylists = useMemo(
    () =>
      allItems.filter(
        p =>
          p.totalSongs === 0 ||
          p.scannedSongs >= p.totalSongs ||
          p.totalSongs > MAX_PLAYLIST_TRACKS_TO_FETCH,
      ).length,
    [allItems],
  );
  const totalPlaylists = allItems.length;
  const scanningPlaylists = useMemo(
    () => allItems.filter(p => p.isScanning),
    [allItems],
  );

  const {totalSongsToScan, totalSongsScannedFresh} = useMemo(() => {
    return allItems.reduce(
      (acc, playlist) => {
        if (playlist.totalSongs > MAX_PLAYLIST_TRACKS_TO_FETCH) return acc;

        const initialCached = initialCachedCountsRef.current[playlist.id] || 0;
        const songsToScan = Math.max(0, playlist.totalSongs - initialCached);
        const songsScannedFresh = Math.max(
          0,
          (playlist.scannedSongs || 0) - initialCached,
        );

        acc.totalSongsToScan += songsToScan;
        acc.totalSongsScannedFresh += songsScannedFresh;
        return acc;
      },
      {totalSongsToScan: 0, totalSongsScannedFresh: 0},
    );
  }, [allItems]);

  const totalRemainingSongs = scanningPlaylists.reduce(
    (acc, p) => acc + Math.max(0, p.totalSongs - p.scannedSongs),
    0,
  );
  const estimatedSecondsRemainingHeuristic = Math.ceil(
    (totalRemainingSongs / 10) * 60,
  );
  const hasStarted = useMemo(
    () => allItems.some(p => p.isScanning || p.scannedSongs > 0),
    [allItems],
  );

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  };

  useEffect(() => {
    if (
      (progress.updateStatus === 'fetching' || hasStarted) &&
      !scanStartTimeRef.current
    ) {
      scanStartTimeRef.current = Date.now();

      allItems.forEach(item => {
        if (!initialCachedCountsRef.current[item.id]) {
          initialCachedCountsRef.current[item.id] = item.scannedSongs || 0;
        }
      });
    }
  }, [progress.updateStatus, hasStarted, allItems]);

  useEffect(() => {
    if (progress.updateStatus !== 'fetching') return;
    const interval = setInterval(() => setEtaTick(t => t + 1), 5000);
    return () => clearInterval(interval);
  }, [progress.updateStatus]);

  const observedEtaSeconds = useMemo(() => {
    if (!scanStartTimeRef.current) return null;
    const elapsedMs = Date.now() - scanStartTimeRef.current;
    const elapsedSeconds = elapsedMs / 1000;
    const songsScannedFresh = totalSongsScannedFresh;
    const totalSongsToScanCount = totalSongsToScan;
    const remaining = Math.max(0, totalSongsToScanCount - songsScannedFresh);
    if (elapsedSeconds <= 0 || songsScannedFresh <= 0) return null;
    const ratePerSecond = songsScannedFresh / elapsedSeconds;
    if (ratePerSecond <= 0) return null;
    return Math.ceil(remaining / ratePerSecond);
  }, [totalSongsScannedFresh, totalSongsToScan, etaTick]);

  const timeRemainingText = (() => {
    if (progress.updateStatus === 'idle') return 'Ready to scan';
    if (progress.updateStatus === 'complete') return 'Finished!';
    if (progress.updateStatus === 'fetching') {
      const etaSeconds =
        observedEtaSeconds ?? estimatedSecondsRemainingHeuristic;
      if (scanningPlaylists.length > 0 && etaSeconds > 0) {
        return `~${formatTimeRemaining(etaSeconds)} remaining`;
      }
      if (scanningPlaylists.length > 0) return 'Almost done!';
      return 'Scanning...';
    }

    return 'Ready to scan';
  })();

  useEffect(() => {
    if (!autoScroll) return;

    // Find the last scanning item (closest to the scanning frontier)
    const lastScanning =
      [...allItems].reverse().find(p => p.isScanning) || null;
    const currentId = lastScanning?.id ?? null;
    if (!currentId) return;

    // Only scroll when a different item becomes the active one
    if (currentId === prevScrolledId.current) return;
    prevScrolledId.current = currentId;

    const target = itemRefs.current[currentId];
    if (!target) return;

    target.scrollIntoView({behavior: 'smooth', block: 'center'});
  }, [allItems, autoScroll]);

  return (
    <div className="bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl font-bold text-center flex items-center justify-center gap-2">
            Inspecting Spotify Library
          </CardTitle>
          <p className="text-muted-foreground text-center text-sm">
            Scanning your playlists for songs...
          </p>

          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-lg font-semibold text-foreground">
                {fullyFetchedPlaylists} / {totalPlaylists}
              </div>
              <div className="text-xs text-muted-foreground">
                Playlists Complete
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-foreground">
                {timeRemainingText}
              </div>
              <div className="text-xs text-muted-foreground">
                Estimated Time
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isRateLimited && (
            <div className="mx-6 mb-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Rate limited - continuing in {countdown} seconds
                </span>
              </div>
            </div>
          )}

          <div ref={containerRef} className="h-[60vh] overflow-y-auto px-6 pb-6">
            <div className="border rounded-lg bg-card overflow-hidden">
              {allItems.map(playlist => (
                <PlaylistRow
                  key={playlist.id}
                  playlist={playlist}
                  onRef={handleRowRef}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const PlaylistRow = memo(function PlaylistRow({
  playlist,
  onRef,
}: {
  playlist: LoaderPlaylist;
  onRef: (id: string, el: HTMLDivElement | null) => void;
}) {
  const getProgressPercentage = useCallback(
    (scanned: number, total: number) => {
      if (total === 0) return 100;
      return Math.round((scanned / total) * 100);
    },
    [],
  );

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      onRef(playlist.id, el);
    },
    [onRef, playlist.id],
  );

  return (
    <div
      ref={setRef}
      className={`flex items-center gap-3 p-3 transition-colors border-b ${playlist.isScanning ? 'bg-primary/5' : 'hover:bg-accent/5'}`}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <h3 className="font-medium text-sm truncate text-foreground">
          {playlist.name}
        </h3>
        {playlist.creator && (
          <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
            {playlist.isAlbum ? (
              <Disc3 className="h-3 w-3" />
            ) : playlist.isCollaborative ? (
              <Users className="h-3 w-3" />
            ) : (
              <User className="h-3 w-3" />
            )}
            {playlist.creator}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {playlist.totalSongs > MAX_PLAYLIST_TRACKS_TO_FETCH ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground underline decoration-dotted cursor-default">
                  Skipping Playlist. Too long.
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Skipping playlists with over {MAX_PLAYLIST_TRACKS_TO_FETCH}{' '}
                songs. Has {playlist.totalSongs} songs
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-xs text-muted-foreground">
            {playlist.scannedSongs} / {playlist.totalSongs}
          </span>
        )}
        <div className="flex items-center gap-1">
          {playlist.totalSongs > MAX_PLAYLIST_TRACKS_TO_FETCH ? (
            <Info className="h-3 w-3 text-muted-foreground" />
          ) : (
            <>
              <CircularProgress
                value={getProgressPercentage(
                  Math.min(playlist.scannedSongs, playlist.totalSongs),
                  playlist.totalSongs,
                )}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
});

PlaylistRow.displayName = 'PlaylistRow';
