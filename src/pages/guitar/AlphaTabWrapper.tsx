import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import {
  AlphaTabApi,
  LayoutMode,
  StaveProfile,
  PlayerMode,
  model,
} from '@coderline/alphatab';

type Score = InstanceType<typeof model.Score>;
type Track = InstanceType<typeof model.Track>;

export interface AlphaTabHandle {
  api: AlphaTabApi | null;
  playPause: () => void;
  stop: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setPlaybackRange: (startTick: number, endTick: number) => void;
  clearPlaybackRange: () => void;
  renderScore: (score: Score, trackIndexes?: number[]) => void;
  renderTracks: (tracks: Track[]) => void;
  setScale: (scale: number) => void;
}

export interface AlphaTabWrapperProps {
  /** ArrayBuffer or URL of a Guitar Pro file to load */
  fileData?: ArrayBuffer | Uint8Array | string | null;
  /** Track indexes to render (defaults to first track) */
  trackIndexes?: number[];
  /** Layout mode */
  layoutMode?: LayoutMode;
  /** Stave profile (tab, score, or both) */
  staveProfile?: StaveProfile;
  /** Initial scale */
  scale?: number;
  /** Enable playback */
  enablePlayer?: boolean;
  /** Called when a score has been loaded */
  onScoreLoaded?: (score: Score) => void;
  /** Called when player position changes */
  onPositionChanged?: (currentTime: number, endTime: number, currentTick: number, endTick: number) => void;
  /** Called when player state changes (playing/paused/stopped) */
  onPlayerStateChanged?: (state: number) => void;
  /** Called when rendering is finished */
  onRenderFinished?: () => void;
  /** Called when player is ready */
  onPlayerReady?: () => void;
  /** Additional CSS class for the container */
  className?: string;
}

const AlphaTabWrapper = forwardRef<AlphaTabHandle, AlphaTabWrapperProps>(
  (
    {
      fileData,
      trackIndexes,
      layoutMode = LayoutMode.Page,
      staveProfile = StaveProfile.Default,
      scale = 1.0,
      enablePlayer = true,
      onScoreLoaded,
      onPositionChanged,
      onPlayerStateChanged,
      onRenderFinished,
      onPlayerReady,
      className,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const apiRef = useRef<AlphaTabApi | null>(null);
    const callbacksRef = useRef({
      onScoreLoaded,
      onPositionChanged,
      onPlayerStateChanged,
      onRenderFinished,
      onPlayerReady,
    });

    // Keep callbacks ref up to date
    callbacksRef.current = {
      onScoreLoaded,
      onPositionChanged,
      onPlayerStateChanged,
      onRenderFinished,
      onPlayerReady,
    };

    // Initialize alphaTab API
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const settings: Record<string, unknown> = {
        core: {
          fontDirectory: '/font/',
          engine: 'svg',
          logLevel: 3, // Warning
        },
        display: {
          layoutMode,
          staveProfile,
          scale,
        },
        player: {
          enablePlayer,
          enableCursor: enablePlayer,
          enableAnimatedBeatCursor: enablePlayer,
          enableUserInteraction: true,
          scrollElement: el,
          scrollMode: 2, // ScrollMode.OffScreen — scrolls when cursor leaves viewport
          scrollOffsetY: -50,
          soundFont: enablePlayer ? '/soundfont/sonivox.sf2' : null,
        },
      };

      const api = new AlphaTabApi(el, settings);
      apiRef.current = api;

      api.scoreLoaded.on((loadedScore: Score) => {
        callbacksRef.current.onScoreLoaded?.(loadedScore);
      });

      api.renderFinished.on(() => {
        callbacksRef.current.onRenderFinished?.();
      });

      if (enablePlayer) {
        api.playerReady.on(() => {
          callbacksRef.current.onPlayerReady?.();
        });

        api.playerPositionChanged.on((e) => {
          callbacksRef.current.onPositionChanged?.(
            e.currentTime,
            e.endTime,
            e.currentTick,
            e.endTick,
          );
        });

        api.playerStateChanged.on((e) => {
          callbacksRef.current.onPlayerStateChanged?.(e.state);
        });
      }

      return () => {
        api.destroy();
        apiRef.current = null;
      };
      // Only re-create on mount/unmount
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load file data when it changes
    useEffect(() => {
      const api = apiRef.current;
      if (!api || !fileData) return;
      api.load(fileData, trackIndexes);
    }, [fileData, trackIndexes]);

    const playPause = useCallback(() => apiRef.current?.playPause(), []);
    const stop = useCallback(() => apiRef.current?.stop(), []);

    const setPlaybackSpeed = useCallback((speed: number) => {
      const api = apiRef.current;
      if (api) api.playbackSpeed = speed;
    }, []);

    const setPlaybackRange = useCallback(
      (startTick: number, endTick: number) => {
        const api = apiRef.current;
        if (!api) return;
        api.playbackRange = {startTick, endTick};
        api.isLooping = true;
      },
      [],
    );

    const clearPlaybackRange = useCallback(() => {
      const api = apiRef.current;
      if (!api) return;
      api.playbackRange = null;
      api.isLooping = false;
    }, []);

    const renderScoreFn = useCallback(
      (score: Score, idxs?: number[]) => {
        apiRef.current?.renderScore(score, idxs);
      },
      [],
    );

    const renderTracksFn = useCallback((tracks: Track[]) => {
      apiRef.current?.renderTracks(tracks);
    }, []);

    const setScaleFn = useCallback((s: number) => {
      const api = apiRef.current;
      if (!api) return;
      api.settings.display.scale = s;
      api.updateSettings();
      api.render();
    }, []);

    useImperativeHandle(ref, () => ({
      api: apiRef.current,
      playPause,
      stop,
      setPlaybackSpeed,
      setPlaybackRange,
      clearPlaybackRange,
      renderScore: renderScoreFn,
      renderTracks: renderTracksFn,
      setScale: setScaleFn,
    }));

    return (
      <>
        <style>{`
          .at-cursor-bar {
            background: rgba(59, 130, 246, 0.1);
          }
          .at-cursor-beat {
            background: rgba(59, 130, 246, 0.9);
            width: 8px !important;
            border-radius: 2px;
          }
          .at-selection div {
            background: rgba(59, 130, 246, 0.1);
          }
        `}</style>
        <div
          ref={containerRef}
          className={className}
          style={{overflow: 'auto', position: 'relative', width: '100%', height: '100%'}}
        />
      </>
    );
  },
);

AlphaTabWrapper.displayName = 'AlphaTabWrapper';
export default AlphaTabWrapper;
