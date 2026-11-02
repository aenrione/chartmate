import React from 'react';
import {act, cleanup, render, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import YouTubePlayer from '../YouTubePlayer';

const player = {
  destroy: vi.fn(), mute: vi.fn(), unMute: vi.fn(), playVideo: vi.fn(),
  pauseVideo: vi.fn(), seekTo: vi.fn(), setPlaybackRate: vi.fn(),
};
let options: YT.PlayerOptions;
const Player = vi.fn(function (_element: HTMLElement, opts: YT.PlayerOptions) {
  options = opts;
  return player;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('YT', {Player});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function ready() {
  await waitFor(() => expect(Player).toHaveBeenCalledOnce());
  act(() => options.events?.onReady?.({target: player} as unknown as YT.PlayerEvent));
}

describe('YouTubePlayer lifetime', () => {
  it('keeps the iframe playing through callback changes and calls the latest handlers', async () => {
    const initial = vi.fn();
    const latest = vi.fn();
    const view = render(<YouTubePlayer videoId="song" onStateChange={initial} />);
    await ready();
    view.rerender(<YouTubePlayer videoId="song" onStateChange={latest} onReady={() => {}} />);
    act(() => options.events?.onStateChange?.({data: 1} as YT.OnStateChangeEvent));
    expect(Player).toHaveBeenCalledOnce();
    expect(player.destroy).not.toHaveBeenCalled();
    expect(initial).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(1);
  });

  it('mutes a nonselected source before ready and switches volume without recreating it', async () => {
    const view = render(<YouTubePlayer videoId="song" muted />);
    await ready();
    expect(player.mute).toHaveBeenCalled();
    view.rerender(<YouTubePlayer videoId="song" muted={false} />);
    expect(player.unMute).toHaveBeenCalled();
    expect(Player).toHaveBeenCalledOnce();
  });

  it('destroys the previous video once when changing songs', async () => {
    const view = render(<YouTubePlayer videoId="first" />);
    await ready();
    view.rerender(<YouTubePlayer videoId="second" />);
    await waitFor(() => expect(Player).toHaveBeenCalledTimes(2));
    expect(player.destroy).toHaveBeenCalledOnce();
  });

  it('does not create an orphan player when API loading completes after unmount', async () => {
    vi.stubGlobal('YT', undefined);
    const view = render(<YouTubePlayer videoId="song" />);
    await waitFor(() => expect(window.onYouTubeIframeAPIReady).toBeTypeOf('function'));
    view.unmount();
    vi.stubGlobal('YT', {Player});
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    expect(Player).not.toHaveBeenCalled();
  });
});
