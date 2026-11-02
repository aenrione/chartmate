import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {snapToYouTubeRate} from '@/lib/youtube-utils';

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

export interface YouTubePlayerHandle {
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  isPlaying(): boolean;
  requestFullscreen(): void;
  destroy(): void;
  setMuted?(muted: boolean): void;
}

interface YouTubePlayerProps {
  videoId: string;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  className?: string;
  muted?: boolean;
}

let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();

  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      'script[src*="youtube.com/iframe_api"]',
    );
    if (existing) {
      // Script tag exists but API not ready yet
      window.onYouTubeIframeAPIReady = () => resolve();
      existing.addEventListener('error', () => {
        apiLoadPromise = null;
        reject(new Error('Failed to load YouTube API'));
      }, {once: true});
      return;
    }

    window.onYouTubeIframeAPIReady = () => resolve();

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      apiLoadPromise = null;
      script.remove();
      reject(new Error('Failed to load YouTube API'));
    };
    document.head.appendChild(script);
  });

  return apiLoadPromise;
}

const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  ({videoId, onReady, onStateChange, className, muted = false}, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YT.Player | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const callbacksRef = useRef({onReady, onStateChange});
    callbacksRef.current = {onReady, onStateChange};
    const mutedRef = useRef(muted);
    mutedRef.current = muted;

    useEffect(() => {
      let cancelled = false;
      let instance: YT.Player | null = null;
      setIsLoading(true);
      setError(null);

      async function createPlayer() {
        try {
          await loadYouTubeAPI();
          if (cancelled || !containerRef.current) return;
          const playerDiv = document.createElement('div');
          containerRef.current.replaceChildren(playerDiv);
          const origin = window.location.origin.startsWith('http') ? window.location.origin : undefined;

          instance = new window.YT.Player(playerDiv, {
            videoId,
            host: 'https://www.youtube-nocookie.com',
            playerVars: {
              autoplay: 0, controls: 1, rel: 0, enablejsapi: 1, fs: 1,
              ...(origin && {origin}),
            },
            events: {
              onReady: (event: YT.PlayerEvent) => {
                if (cancelled) return;
                mutedRef.current ? event.target.mute() : event.target.unMute();
                setIsLoading(false);
                callbacksRef.current.onReady?.();
              },
              onStateChange: (event: YT.OnStateChangeEvent) => {
                if (!cancelled) callbacksRef.current.onStateChange?.(event.data);
              },
              onError: (event: YT.OnErrorEvent) => {
                if (cancelled) return;
                setIsLoading(false);
                setError(`YouTube player error ${event.data}`);
              },
            },
          });
          playerRef.current = instance;
        } catch (err) {
          if (cancelled) return;
          setIsLoading(false);
          setError(err instanceof Error ? err.message : 'Failed to load YouTube player');
        }
      }
      void createPlayer();
      return () => {
        cancelled = true;
        if (playerRef.current === instance) playerRef.current = null;
        try { instance?.destroy(); } catch { /* iframe may already be detached */ }
      };
    }, [videoId]);

    useEffect(() => {
      const player = playerRef.current;
      if (!player) return;
      if (muted) player.mute?.(); else player.unMute?.();
    }, [muted]);

    useImperativeHandle(ref, () => ({
      setMuted(value: boolean) {
        mutedRef.current = value;
        const player = playerRef.current;
        if (value) player?.mute?.(); else player?.unMute?.();
      },
      play() {
        playerRef.current?.playVideo?.();
      },
      pause() {
        playerRef.current?.pauseVideo?.();
      },
      seekTo(seconds: number) {
        playerRef.current?.seekTo?.(seconds, true);
      },
      setPlaybackRate(rate: number) {
        const snapped = snapToYouTubeRate(rate);
        playerRef.current?.setPlaybackRate?.(snapped);
      },
      getCurrentTime(): number {
        return playerRef.current?.getCurrentTime?.() ?? 0;
      },
      isPlaying(): boolean {
        return playerRef.current?.getPlayerState?.() === 1;
      },
      requestFullscreen() {
        // getIframe() is not in the @types/youtube types but exists at runtime
        const iframe = (playerRef.current as unknown as {getIframe?(): HTMLIFrameElement})?.getIframe?.();
        iframe?.requestFullscreen?.();
      },
      destroy() {
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {
            // ignore
          }
          playerRef.current = null;
        }
      },
    }));

    return (
      <div className={className}>
        {error ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {error}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading YouTube player...
          </div>
        ) : null}
        <div
          ref={containerRef}
          className="w-full h-full [&>div]:w-full [&>div]:h-full [&_iframe]:w-full [&_iframe]:h-full"
        />
      </div>
    );
  },
);

YouTubePlayer.displayName = 'YouTubePlayer';
export default YouTubePlayer;
