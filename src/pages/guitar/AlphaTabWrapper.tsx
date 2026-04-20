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
import {loadActiveSoundfont, soundfontToUrl} from '@/lib/soundfont-store';

type Score = InstanceType<typeof model.Score>;
type Track = InstanceType<typeof model.Track>;
type Beat = InstanceType<typeof model.Beat>;
type Note = InstanceType<typeof model.Note>;

export interface AlphaTabHandle {
  getApi: () => AlphaTabApi | null;
  /** @deprecated Use getApi() instead — this may be stale */
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
  /** Enable note-level bounds for click detection */
  includeNoteBounds?: boolean;
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
  /** Called when the AlphaTab API has been initialized (before any score is loaded) */
  onApiReady?: () => void;
  /** Called when user clicks on a beat */
  onBeatMouseDown?: (beat: Beat) => void;
  /** Called when user releases mouse on a beat */
  onBeatMouseUp?: (beat: Beat | null) => void;
  /** Called when user clicks on a note */
  onNoteMouseDown?: (note: Note) => void;
  /** Called when user releases mouse on a note */
  onNoteMouseUp?: (note: Note | null) => void;
  /** Additional CSS class for the container */
  className?: string;
  /** Disable AlphaTab's internal scroll/resize tracking */
  disableAutoResize?: boolean;
}

const DARK_RESOURCES = {
  mainGlyphColor: '#e4e4e7ff',
  secondaryGlyphColor: '#a1a1aa66',
  staffLineColor: '#52525bff',
  barSeparatorColor: '#71717aff',
  scoreInfoColor: '#e4e4e7ff',
  barNumberColor: '#a1a1aaff',
};

const LIGHT_RESOURCES = {
  mainGlyphColor: '#000000ff',
  secondaryGlyphColor: '#00000066',
  staffLineColor: '#a5a5a5ff',
  barSeparatorColor: '#222211ff',
  scoreInfoColor: '#000000ff',
  barNumberColor: '#c80000ff',
};

function applyThemeColors(api: AlphaTabApi) {
  const isDark = document.documentElement.classList.contains('dark');
  const colors = isDark ? DARK_RESOURCES : LIGHT_RESOURCES;
  api.settings.fillFromJson({
    display: { resources: colors },
  });
  api.updateSettings();
  api.render();
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
      includeNoteBounds = false,
      onScoreLoaded,
      onPositionChanged,
      onPlayerStateChanged,
      onRenderFinished,
      onPlayerReady,
      onApiReady,
      onBeatMouseDown,
      onBeatMouseUp,
      onNoteMouseDown,
      onNoteMouseUp,
      className,
      disableAutoResize = false,
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
      onApiReady,
      onBeatMouseDown,
      onBeatMouseUp,
      onNoteMouseDown,
      onNoteMouseUp,
    });

    // Keep callbacks ref up to date
    callbacksRef.current = {
      onScoreLoaded,
      onPositionChanged,
      onPlayerStateChanged,
      onRenderFinished,
      onPlayerReady,
      onApiReady,
      onBeatMouseDown,
      onBeatMouseUp,
      onNoteMouseDown,
      onNoteMouseUp,
    };

    // Initialize alphaTab API
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      let destroyed = false;
      let api: AlphaTabApi | null = null;
      let observer: MutationObserver | null = null;
      let watermarkObserver: MutationObserver | null = null;
      let activeBlobUrl: string | null = null;

      const makeSoundfontUrl = (sf: string | Uint8Array): string => {
        if (typeof sf === 'string') return sf;
        // Blob URL lets AlphaTab load binary data during init — avoids post-init
        // loadSoundFont() which throws InvalidStateError on unstarted Web Audio nodes.
        if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
        activeBlobUrl = soundfontToUrl(sf);
        return activeBlobUrl;
      };

      const init = async () => {
        const soundFont = enablePlayer ? await loadActiveSoundfont() : null;
        if (destroyed) return;

        const soundFontSetting = soundFont ? makeSoundfontUrl(soundFont) : '/soundfont/sonivox.sf2';

        const settings: Record<string, unknown> = {
          core: {
            fontDirectory: '/font/',
            engine: 'svg',
            logLevel: 3, // Warning
            includeNoteBounds,
          },
          display: {
            layoutMode,
            staveProfile,
            scale,
          },
          notation: {
            notationMode: 0, // default
          },
          player: {
            enablePlayer,
            enableCursor: enablePlayer,
            enableAnimatedBeatCursor: enablePlayer,
            enableUserInteraction: true,
            scrollElement: disableAutoResize ? null : el,
            scrollMode: disableAutoResize ? 0 : 2,
            scrollOffsetY: -50,
            soundFont: soundFontSetting,
          },
        };

        api = new AlphaTabApi(el, settings);
        apiRef.current = api;

        // Apply theme colors on init (without re-render since first render hasn't happened)
        const isDark = document.documentElement.classList.contains('dark');
        const initColors = isDark ? DARK_RESOURCES : LIGHT_RESOURCES;
        api.settings.fillFromJson({
          display: { resources: initColors },
        });
        api.updateSettings();

        // Watch for dark mode toggle and re-apply colors
        observer = new MutationObserver(() => {
          if (apiRef.current) applyThemeColors(apiRef.current);
        });
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class'],
        });

        api.scoreLoaded.on((loadedScore: Score) => {
          callbacksRef.current.onScoreLoaded?.(loadedScore);
        });

        const removeWatermark = () => {
          el.querySelectorAll<HTMLElement>('.at-surface-svg text').forEach((txt) => {
            if (txt.textContent?.includes('rendered by alphaTab')) {
              const parent = txt.closest('div') ?? txt.closest('svg');
              parent?.remove();
            }
          });
        };

        // Observe DOM to remove watermark whenever AlphaTab injects it
        watermarkObserver = new MutationObserver(() => removeWatermark());
        watermarkObserver.observe(el, { childList: true, subtree: true });

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

        // Beat/note mouse events (for editor interaction)
        api.beatMouseDown.on((beat) => {
          callbacksRef.current.onBeatMouseDown?.(beat);
        });
        api.beatMouseUp.on((beat) => {
          callbacksRef.current.onBeatMouseUp?.(beat);
        });
        if (includeNoteBounds) {
          api.noteMouseDown.on((note) => {
            callbacksRef.current.onNoteMouseDown?.(note);
          });
          api.noteMouseUp.on((note) => {
            callbacksRef.current.onNoteMouseUp?.(note);
          });
        }

        if (!destroyed) {
          callbacksRef.current.onApiReady?.();
        }
      };

      init();

      const onSoundfontChanged = async () => {
        const currentApi = apiRef.current;
        if (!currentApi || !enablePlayer) return;
        const newSoundFont = await loadActiveSoundfont();
        const url = makeSoundfontUrl(newSoundFont);
        try {
          currentApi.loadSoundFont(url, false);
        } catch {
          // InvalidStateError if audio nodes haven't been started yet — safe to ignore,
          // the blob URL approach for init handles the startup case correctly.
        }
      };
      window.addEventListener('soundfont-changed', onSoundfontChanged);

      return () => {
        destroyed = true;
        if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
        window.removeEventListener('soundfont-changed', onSoundfontChanged);
        watermarkObserver?.disconnect();
        observer?.disconnect();
        api?.destroy();
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
      getApi: () => apiRef.current,
      api: apiRef.current, // kept for backwards compat, prefer getApi()
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
            background: rgba(59, 130, 246, 0.15);
          }
          .at-cursor-beat {
            background: rgba(59, 130, 246, 0.85);
            width: 3px;
          }
          .at-selection div {
            background: rgba(59, 130, 246, 0.1);
          }
          .at-highlight * {
            fill: #3b82f6;
            stroke: #3b82f6;
          }
        `}</style>
        <div
          ref={containerRef}
          className={className}
          style={{
            overflow: disableAutoResize ? 'hidden' : 'auto',
            position: 'relative',
            width: '100%',
            height: disableAutoResize ? 'auto' : '100%',
          }}
        />
      </>
    );
  },
);

AlphaTabWrapper.displayName = 'AlphaTabWrapper';
export default AlphaTabWrapper;
