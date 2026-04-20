import type {YouTubePlayerHandle} from '@/components/YouTubePlayer';

export interface PlaybackClock {
  readonly currentTime: number;
  readonly isPlaying: boolean;
}

const DRIFT_THRESHOLD_S = 0.3;
const SYNC_INTERVAL_MS = 250;
// After any direct command (play/seek/pause), suppress sync-loop corrections
// so the command has time to settle before we check drift again.
const COMMAND_COOLDOWN_MS = 700;

export class YouTubeSync {
  #clock: PlaybackClock | null = null;
  #youtubePlayer: YouTubePlayerHandle | null = null;
  #offsetSeconds: number = 0;
  #animFrameId: number | null = null;
  #lastSyncTime: number = 0;
  #enabled: boolean = false;
  #commandCooldownUntil: number = 0;

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

  /** Seek YouTube to the position for `timeSeconds` without changing play state. */
  onSeekTo(timeSeconds: number) {
    if (!this.#youtubePlayer || !this.#enabled) return;
    this.#markCooldown();
    this.#youtubePlayer.seekTo(Math.max(0, timeSeconds - this.#offsetSeconds));
  }

  /** Seek YouTube and start playing — for when the main clock starts from a specific position. */
  onPlayFrom(timeSeconds: number) {
    if (!this.#youtubePlayer || !this.#enabled) return;
    this.#markCooldown();
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
    this.#markCooldown();
    this.#youtubePlayer.pause();
  }

  onResume() {
    if (!this.#youtubePlayer || !this.#enabled) return;
    this.#markCooldown();
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

  #markCooldown() {
    this.#commandCooldownUntil = performance.now() + COMMAND_COOLDOWN_MS;
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
    // Skip drift correction while a recent command is still settling.
    if (performance.now() < this.#commandCooldownUntil) return;

    const expectedYtTime = this.#clock.currentTime - this.#offsetSeconds;
    if (expectedYtTime < 0) return;

    // Only correct position drift — play state is owned exclusively by on* callbacks.
    if (this.#youtubePlayer.isPlaying()) {
      const drift = Math.abs(this.#youtubePlayer.getCurrentTime() - expectedYtTime);
      if (drift > DRIFT_THRESHOLD_S) {
        this.#markCooldown();
        this.#youtubePlayer.seekTo(expectedYtTime);
      }
    }
  }
}
