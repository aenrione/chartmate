import {
  forwardRef,
  useCallback,
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
  destroy(): void;
}

interface YouTubePlayerProps {
  videoId: string;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  className?: string;
}

let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();

  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise<void>(resolve => {
    const existing = document.querySelector(
      'script[src*="youtube.com/iframe_api"]',
    );
    if (existing) {
      // Script tag exists but API not ready yet
      window.onYouTubeIframeAPIReady = () => resolve();
      return;
    }

    window.onYouTubeIframeAPIReady = () => resolve();

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });

  return apiLoadPromise;
}

const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  ({videoId, onReady, onStateChange, className}, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YT.Player | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const createPlayer = useCallback(async () => {
      if (!containerRef.current) return;

      try {
        await loadYouTubeAPI();

        // Clean up existing player
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }

        // Create a div for the player inside our container
        const playerDiv = document.createElement('div');
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(playerDiv);

        playerRef.current = new window.YT.Player(playerDiv, {
          videoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              setIsLoading(false);
              onReady?.();
            },
            onStateChange: (event: YT.OnStateChangeEvent) => {
              onStateChange?.(event.data);
            },
          },
        });
      } catch (err) {
        setIsLoading(false);
        setError(err instanceof Error ? err.message : 'Failed to load YouTube player');
      }
    }, [videoId, onReady, onStateChange]);

    useEffect(() => {
      createPlayer();

      return () => {
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {
            // Player may already be destroyed
          }
          playerRef.current = null;
        }
      };
    }, [createPlayer]);

    useImperativeHandle(ref, () => ({
      play() {
        playerRef.current?.playVideo();
      },
      pause() {
        playerRef.current?.pauseVideo();
      },
      seekTo(seconds: number) {
        playerRef.current?.seekTo(seconds, true);
      },
      setPlaybackRate(rate: number) {
        const snapped = snapToYouTubeRate(rate);
        playerRef.current?.setPlaybackRate(snapped);
      },
      getCurrentTime(): number {
        return playerRef.current?.getCurrentTime() ?? 0;
      },
      isPlaying(): boolean {
        // YT.PlayerState.PLAYING === 1
        return playerRef.current?.getPlayerState() === 1;
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
