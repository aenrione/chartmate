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
  PlayerOutputMode,
  NotationElement,
  model,
} from '@coderline/alphatab';
import {loadActiveSoundfont, soundfontToUrl} from '@/lib/soundfont-store';
import {applyAlphaTabTheme} from '@/lib/alphaTabTheme';

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
  print: () => void;
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
  /** Called when rendering is finished (boundsLookup may still be stale — use onPostRenderFinished to read it) */
  onRenderFinished?: () => void;
  /** Called after boundsLookup is updated — safe to read api.boundsLookup here */
  onPostRenderFinished?: () => void;
  /** Called when player is ready */
  onPlayerReady?: () => void;
  /** Called when playback reaches the end of the score */
  onPlayerFinished?: () => void;
  /** Called when the AlphaTab API has been initialized (before any score is loaded) */
  onApiReady?: (api: AlphaTabApi) => void;
  /** Called when user clicks on a beat */
  onBeatMouseDown?: (beat: Beat) => void;
  /** Called when user releases mouse on a beat */
  onBeatMouseUp?: (beat: Beat | null) => void;
  /** Called when user clicks on a note */
  onNoteMouseDown?: (note: Note) => void;
  /** Called when user releases mouse on a note */
  onNoteMouseUp?: (note: Note | null) => void;
  /** Called when the set of actively-playing beats changes during playback */
  onActiveBeatsChanged?: (beats: Beat[]) => void;
  /** Additional CSS class for the container */
  className?: string;
  /** Disable AlphaTab's internal scroll/resize tracking */
  disableAutoResize?: boolean;
  /**
   * Replace AlphaTab's built-in section marker effect band with HTML overlays.
   * Pass true in the tab editor so section labels don't collide with chord names.
   */
  hideBuiltInSectionLabels?: boolean;
  /**
   * Use AlphaTab's legacy ScriptProcessor output instead of AudioWorklet output.
   * Tauri/WebKit can race AudioWorklet startup and throw `this.source.connect`
   * when tab-editor playback is restarted by sync/seek behavior.
   */
  useScriptProcessorOutput?: boolean;
  /**
   * Show AlphaTab's built-in playback cursor. The tab editor supplies its own
   * cursor overlay and disables this to avoid AlphaTab's deferred cursor update
   * racing against re-render/stop state.
   */
  enablePlaybackCursor?: boolean;
}

// Theme constants and applyThemeColors live in @/lib/alphaTabTheme so TabSnippet can reuse them.
const applyThemeColors = applyAlphaTabTheme;

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
      onPostRenderFinished,
      onPlayerReady,
      onPlayerFinished,
      onApiReady,
      onBeatMouseDown,
      onBeatMouseUp,
      onNoteMouseDown,
      onNoteMouseUp,
      onActiveBeatsChanged,
      className,
      disableAutoResize = false,
      hideBuiltInSectionLabels = false,
      useScriptProcessorOutput = false,
      enablePlaybackCursor = true,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const apiRef = useRef<AlphaTabApi | null>(null);
    // Track latest fileData/trackIndexes so init() can load them if they arrived
    // before the async init completes (race condition).
    const fileDataRef = useRef(fileData);
    const trackIndexesRef = useRef(trackIndexes);
    fileDataRef.current = fileData;
    trackIndexesRef.current = trackIndexes;
    const callbacksRef = useRef({
      onScoreLoaded,
      onPositionChanged,
      onPlayerStateChanged,
      onRenderFinished,
      onPostRenderFinished,
      onPlayerReady,
      onPlayerFinished,
      onApiReady,
      onBeatMouseDown,
      onBeatMouseUp,
      onNoteMouseDown,
      onNoteMouseUp,
      onActiveBeatsChanged,
    });

    // Keep callbacks ref up to date
    callbacksRef.current = {
      onScoreLoaded,
      onPositionChanged,
      onPlayerStateChanged,
      onRenderFinished,
      onPostRenderFinished,
      onPlayerReady,
      onPlayerFinished,
      onApiReady,
      onBeatMouseDown,
      onBeatMouseUp,
      onNoteMouseDown,
      onNoteMouseUp,
      onActiveBeatsChanged,
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
            enableCursor: enablePlayer && enablePlaybackCursor,
            enableAnimatedBeatCursor: enablePlayer && enablePlaybackCursor,
            enableUserInteraction: true,
            scrollElement: disableAutoResize ? null : el,
            scrollMode: disableAutoResize ? 0 : 2,
            scrollOffsetY: -50,
            soundFont: soundFontSetting,
            outputMode: useScriptProcessorOutput
              ? PlayerOutputMode.WebAudioScriptProcessor
              : PlayerOutputMode.WebAudioAudioWorklets,
          },
        };

        api = new AlphaTabApi(el, settings);
        apiRef.current = api;

        // Suppress AlphaTab's built-in section labels so our HTML overlays
        // can replace them without the band-sharing overlap bug.
        if (hideBuiltInSectionLabels) {
          api.settings.notation.elements.set(NotationElement.EffectMarker, false);
        }

        // Apply theme colors on init (without re-render since first render hasn't happened).
        applyAlphaTabTheme(api, false);

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

        // postRenderFinished fires AFTER boundsLookup is updated (worker sends bounds JSON back)
        api.postRenderFinished.on(() => {
          callbacksRef.current.onPostRenderFinished?.();
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

          api.playerFinished.on(() => {
            callbacksRef.current.onPlayerFinished?.();
          });

          api.activeBeatsChanged.on((e) => {
            callbacksRef.current.onActiveBeatsChanged?.(e.activeBeats);
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
          callbacksRef.current.onApiReady?.(api);
          // Load any fileData that was set before init() completed. The
          // fileData effect won't re-run because the ref change doesn't
          // trigger React effects, so we must load it here.
          const pending = fileDataRef.current;
          if (pending) {
            api.load(pending, trackIndexesRef.current);
          }
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
      print: () => apiRef.current?.print(),
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
