import type {YouTubePlayerHandle} from '@/components/YouTubePlayer';

/**
 * Minimal interface any playback engine must satisfy for YouTube sync.
 * Implemented by AudioManager, AlphaTab adapters, or any future player.
 */
export interface PlaybackClock {
  /** Current playback position in seconds */
  readonly currentTime: number;
  /** Whether playback is actively running */
  readonly isPlaying: boolean;
}

const DRIFT_THRESHOLD_S = 0.3;
const SYNC_INTERVAL_MS = 200;

export class YouTubeSync {
  #clock: PlaybackClock | null = null;
  #youtubePlayer: YouTubePlayerHandle | null = null;
  #offsetSeconds: number = 0;
  #animFrameId: number | null = null;
  #lastSyncTime: number = 0;
  #enabled: boolean = false;

  setClock(clock: PlaybackClock | null) {
    this.#clock = clock;
  }

  setYouTubePlayer(player: YouTubePlayerHandle | null) {
    this.#youtubePlayer = player;
  }

  setOffset(offsetMs: number) {
    this.#offsetSeconds = offsetMs / 1000;
  }

  getOffsetMs(): number {
    return Math.round(this.#offsetSeconds * 1000);
  }

  enable() {
    if (this.#enabled) return;
    this.#enabled = true;
    this.#startSyncLoop();
  }

  disable() {
    this.#enabled = false;
    this.#stopSyncLoop();
  }

  onPlay(timeSeconds: number) {
    if (!this.#youtubePlayer || !this.#enabled) return;
    const ytTime = timeSeconds - this.#offsetSeconds;
    if (ytTime >= 0) {
      this.#youtubePlayer.seekTo(ytTime);
      this.#youtubePlayer.play();
    } else {
      this.#youtubePlayer.seekTo(0);
      this.#youtubePlayer.pause();
    }
  }

  onPause() {
    if (!this.#youtubePlayer || !this.#enabled) return;
    this.#youtubePlayer.pause();
  }

  onResume() {
    if (!this.#youtubePlayer || !this.#enabled) return;
    this.#youtubePlayer.play();
  }

  onTempoChange(tempo: number) {
    if (!this.#youtubePlayer || !this.#enabled) return;
    this.#youtubePlayer.setPlaybackRate(tempo);
  }

  destroy() {
    this.#stopSyncLoop();
    this.#clock = null;
    this.#youtubePlayer = null;
  }

  #startSyncLoop() {
    if (this.#animFrameId != null) return;

    const loop = () => {
      this.#animFrameId = requestAnimationFrame(loop);
      const now = performance.now();
      if (now - this.#lastSyncTime < SYNC_INTERVAL_MS) return;
      this.#lastSyncTime = now;
      this.#syncCheck();
    };

    this.#animFrameId = requestAnimationFrame(loop);
  }

  #stopSyncLoop() {
    if (this.#animFrameId != null) {
      cancelAnimationFrame(this.#animFrameId);
      this.#animFrameId = null;
    }
  }

  #syncCheck() {
    if (!this.#clock || !this.#youtubePlayer || !this.#enabled) return;
    if (!this.#clock.isPlaying) return;

    const audioTime = this.#clock.currentTime;
    const ytTime = this.#youtubePlayer.getCurrentTime();
    const expectedYtTime = audioTime - this.#offsetSeconds;

    if (expectedYtTime < 0) return;

    if (!this.#youtubePlayer.isPlaying()) {
      this.#youtubePlayer.seekTo(expectedYtTime);
      this.#youtubePlayer.play();
      return;
    }

    const drift = Math.abs(ytTime - expectedYtTime);
    if (drift > DRIFT_THRESHOLD_S) {
      this.#youtubePlayer.seekTo(expectedYtTime);
    }
  }
}
