import {act, renderHook, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {YouTubePlayerHandle} from '@/components/YouTubePlayer';
import {useYoutubeSync} from '../useYoutubeSync';

vi.mock('@/lib/local-db/youtube', () => ({
  getYoutubeAssociation: vi.fn().mockResolvedValue(null),
  saveYoutubeAssociation: vi.fn().mockResolvedValue(undefined),
  updateYoutubeOffset: vi.fn().mockResolvedValue(undefined),
  deleteYoutubeAssociation: vi.fn().mockResolvedValue(undefined),
}));

function makePlayer(): YouTubePlayerHandle {
  return {
    play: vi.fn(), pause: vi.fn(), seekTo: vi.fn(), setPlaybackRate: vi.fn(),
    getCurrentTime: () => 0, isPlaying: () => false, requestFullscreen: vi.fn(), destroy: vi.fn(),
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('useYoutubeSync source ownership', () => {
  it('does not start YouTube on ready while another source owns audio', () => {
    const player = makePlayer();
    const clockRef = {current: {currentTime: 12, isPlaying: true}};
    const view = renderHook(() => useYoutubeSync({songKey: 'song', clockRef, tempo: 1, enabled: false}));
    act(() => { view.result.current.playerRef.current = player; view.result.current.handleReady(); });
    expect(player.pause).toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    act(() => view.result.current.syncRef.current.onResume());
    expect(player.play).not.toHaveBeenCalled();
  });

  it('switches to the current score position when selected and pauses when deselected', () => {
    const player = makePlayer();
    const clockRef = {current: {currentTime: 12, isPlaying: true}};
    const view = renderHook(({enabled}) => useYoutubeSync({songKey: 'song', clockRef, tempo: 1, enabled}), {initialProps: {enabled: false}});
    act(() => { view.result.current.playerRef.current = player; view.result.current.handleReady(); });
    view.rerender({enabled: true});
    expect(player.seekTo).toHaveBeenLastCalledWith(12);
    expect(player.play).toHaveBeenCalledOnce();
    view.rerender({enabled: false});
    expect(player.pause).toHaveBeenCalled();
    act(() => view.result.current.syncRef.current.onResume());
    expect(player.play).toHaveBeenCalledOnce();
  });

  it('ignores an old song association that finishes after navigation', async () => {
    const {getYoutubeAssociation} = await import('@/lib/local-db/youtube');
    let finish!: (value: never) => void;
    vi.mocked(getYoutubeAssociation).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const clockRef = {current: null};
    const view = renderHook(({songKey}) => useYoutubeSync({songKey, clockRef, tempo: 1}), {initialProps: {songKey: 'old'}});
    view.rerender({songKey: 'new'});
    await act(async () => { finish({youtube_url: 'https://youtube.com/watch?v=abcdefghijk', offset_ms: 0} as never); });
    await waitFor(() => expect(view.result.current.youtubeVideoId).toBeNull());
  });
});
