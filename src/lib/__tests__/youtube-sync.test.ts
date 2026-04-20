import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {YouTubeSync} from '../youtube-sync';
import type {PlaybackClock} from '../youtube-sync';
import type {YouTubePlayerHandle} from '@/components/YouTubePlayer';

function makeClock(overrides: Partial<PlaybackClock> = {}): PlaybackClock {
  return {currentTime: 0, isPlaying: false, ...overrides};
}

function makePlayer(overrides: Partial<YouTubePlayerHandle> = {}): YouTubePlayerHandle {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    setPlaybackRate: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    isPlaying: vi.fn(() => false),
    requestFullscreen: vi.fn(),
    destroy: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('YouTubeSync', () => {
  describe('onSeekTo', () => {
    it('seeks YouTube to position adjusted by offset without playing', () => {
      const sync = new YouTubeSync();
      const player = makePlayer();
      sync.setYouTubePlayer(player);
      sync.setOffset(2000); // 2s offset
      sync.enable();

      sync.onSeekTo(5);

      expect(player.seekTo).toHaveBeenCalledWith(3); // 5 - 2
      expect(player.play).not.toHaveBeenCalled();
    });

    it('clamps negative ytTime to 0', () => {
      const sync = new YouTubeSync();
      const player = makePlayer();
      sync.setYouTubePlayer(player);
      sync.setOffset(10_000);
      sync.enable();

      sync.onSeekTo(3); // ytTime = 3 - 10 = -7 → 0

      expect(player.seekTo).toHaveBeenCalledWith(0);
      expect(player.play).not.toHaveBeenCalled();
    });

    it('does nothing when disabled', () => {
      const sync = new YouTubeSync();
      sync.setYouTubePlayer(makePlayer());
      // not enabled

      sync.onSeekTo(5);

      expect((sync as unknown as {_p: YouTubePlayerHandle})._p?.seekTo).toBeUndefined();
    });

    it('no-ops without a player', () => {
      const sync = new YouTubeSync();
      sync.enable();
      expect(() => sync.onSeekTo(5)).not.toThrow();
    });
  });

  describe('onPlayFrom', () => {
    it('seeks and starts playback', () => {
      const sync = new YouTubeSync();
      const player = makePlayer();
      sync.setYouTubePlayer(player);
      sync.enable();

      sync.onPlayFrom(10);

      expect(player.seekTo).toHaveBeenCalledWith(10);
      expect(player.play).toHaveBeenCalled();
    });

    it('applies offset to computed YouTube time', () => {
      const sync = new YouTubeSync();
      const player = makePlayer();
      sync.setYouTubePlayer(player);
      sync.setOffset(3000);
      sync.enable();

      sync.onPlayFrom(8); // ytTime = 8 - 3 = 5

      expect(player.seekTo).toHaveBeenCalledWith(5);
    });

    it('seeks to 0 and pauses during pre-roll (ytTime < 0)', () => {
      const sync = new YouTubeSync();
      const player = makePlayer();
      sync.setYouTubePlayer(player);
      sync.setOffset(5000);
      sync.enable();

      sync.onPlayFrom(2); // ytTime = 2 - 5 = -3

      expect(player.seekTo).toHaveBeenCalledWith(0);
      expect(player.pause).toHaveBeenCalled();
      expect(player.play).not.toHaveBeenCalled();
    });
  });

  describe('onPause / onResume', () => {
    it('pauses YouTube', () => {
      const sync = new YouTubeSync();
      const player = makePlayer();
      sync.setYouTubePlayer(player);
      sync.enable();

      sync.onPause();
      expect(player.pause).toHaveBeenCalledOnce();
    });

    it('resumes YouTube', () => {
      const sync = new YouTubeSync();
      const player = makePlayer();
      sync.setYouTubePlayer(player);
      sync.enable();

      sync.onResume();
      expect(player.play).toHaveBeenCalledOnce();
    });

    it('does nothing when player not set', () => {
      const sync = new YouTubeSync();
      sync.enable();
      expect(() => { sync.onPause(); sync.onResume(); }).not.toThrow();
    });
  });

  describe('onTempoChange', () => {
    it('sets playback rate on the YouTube player', () => {
      const sync = new YouTubeSync();
      const player = makePlayer();
      sync.setYouTubePlayer(player);
      sync.enable();

      sync.onTempoChange(1.5);
      expect(player.setPlaybackRate).toHaveBeenCalledWith(1.5);
    });
  });

  describe('offset', () => {
    it('getOffsetMs returns the set offset', () => {
      const sync = new YouTubeSync();
      sync.setOffset(1500);
      expect(sync.getOffsetMs()).toBe(1500);
    });

    it('rounds to integer ms', () => {
      const sync = new YouTubeSync();
      sync.setOffset(1500.7);
      expect(sync.getOffsetMs()).toBe(1501);
    });
  });

  describe('enable / disable', () => {
    it('commands are no-ops when disabled', () => {
      const sync = new YouTubeSync();
      const player = makePlayer();
      sync.setYouTubePlayer(player);
      // never enabled

      sync.onSeekTo(5);
      sync.onPlayFrom(5);
      sync.onPause();
      sync.onResume();

      expect(player.seekTo).not.toHaveBeenCalled();
      expect(player.play).not.toHaveBeenCalled();
      expect(player.pause).not.toHaveBeenCalled();
    });

    it('commands work after enable()', () => {
      const sync = new YouTubeSync();
      const player = makePlayer();
      sync.setYouTubePlayer(player);
      sync.enable();

      sync.onPause();
      expect(player.pause).toHaveBeenCalled();
    });

    it('commands are no-ops after disable()', () => {
      const sync = new YouTubeSync();
      const player = makePlayer();
      sync.setYouTubePlayer(player);
      sync.enable();
      sync.disable();

      sync.onResume();
      expect(player.play).not.toHaveBeenCalled();
    });

    it('enable() is idempotent', () => {
      const sync = new YouTubeSync();
      sync.enable();
      sync.enable();
      // No errors, no duplicate loops
    });
  });

  describe('destroy', () => {
    it('stops the sync loop and clears references', () => {
      const sync = new YouTubeSync();
      sync.setClock(makeClock());
      sync.setYouTubePlayer(makePlayer());
      sync.enable();

      sync.destroy();

      // All public commands should be no-ops after destroy
      expect(() => {
        sync.onSeekTo(1);
        sync.onPlayFrom(1);
        sync.onPause();
        sync.onResume();
        sync.onTempoChange(1);
      }).not.toThrow();
    });
  });
});
