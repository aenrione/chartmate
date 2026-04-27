/**
 * Tests for useStemPlayer seek behaviour.
 *
 * Core invariant: seek() during playback must NOT call pause() on the AudioManager.
 * pause() suspends the AudioContext, causing an audible gap. seek() should stop old
 * sources and start new ones from the target position without suspending the context.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';

// ── Hoist shared mock state so vi.mock factories can reference it ─────────────

const mocks = vi.hoisted(() => {
  const audioMgr = {
    ready: Promise.resolve(),
    duration: 120,
    currentTime: 30,
    get isPlaying() { return this._isPlaying; },
    _isPlaying: true,
    isInitialized: true,
    play: vi.fn<[{percent?: number; time?: number}], Promise<void>>().mockResolvedValue(undefined),
    pause: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    stop: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    resume: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    setVolume: vi.fn<[string, number], void>(),
    destroy: vi.fn<[], void>(),
    _onSongEnded: undefined as (() => void) | undefined,
  };

  const stemAssoc = {
    id: 1,
    song_key: 'test-song',
    stem_folder_path: '/stems/test-song',
  };

  return {audioMgr, stemAssoc};
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('/data'),
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join('/'))),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: vi.fn().mockResolvedValue([
    {name: 'drums.wav', isDirectory: false, isFile: true, isSymlink: false},
    {name: 'bass.wav', isDirectory: false, isFile: true, isSymlink: false},
    {name: 'guitar.wav', isDirectory: false, isFile: true, isSymlink: false},
  ]),
  readFile: vi.fn().mockResolvedValue(new Uint8Array(8)),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(false),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({open: vi.fn().mockResolvedValue(null)}));

vi.mock('@/lib/local-db/stems', () => ({
  getStemAssociation: vi.fn().mockResolvedValue(mocks.stemAssoc),
  saveStemAssociation: vi.fn().mockResolvedValue(undefined),
  deleteStemAssociation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/preview/audioManager', () => ({
  // Use a regular function (not arrow) — Vitest 4 calls the implementation
  // with `new` when the mock itself is called with `new`, so arrow functions fail.
  AudioManager: vi.fn().mockImplementation(function AudioManagerMock(
    _files: unknown,
    onSongEnded: () => void,
  ) {
    mocks.audioMgr._onSongEnded = onSongEnded;
    return mocks.audioMgr;
  }),
}));

import {useStemPlayer} from '../useStemPlayer';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mount the hook and wait until stems are loaded */
async function mountLinked(songKey = 'test-song') {
  const {result} = renderHook(() => useStemPlayer(songKey));
  await waitFor(
    () => {
      if (result.current.linkError) throw new Error(`linkError: ${result.current.linkError}`);
      expect(result.current.stemsReady).toBe(true);
    },
    {timeout: 4000},
  );
  return result;
}

// ── Tests: seek() ─────────────────────────────────────────────────────────────

describe('useStemPlayer — seek()', () => {
  beforeEach(() => {
    mocks.audioMgr._isPlaying = true;
    mocks.audioMgr.isInitialized = true;
    mocks.audioMgr.currentTime = 30;
    mocks.audioMgr.play.mockClear().mockResolvedValue(undefined);
    mocks.audioMgr.pause.mockClear().mockResolvedValue(undefined);
    mocks.audioMgr.stop.mockClear().mockResolvedValue(undefined);
    mocks.audioMgr.resume.mockClear().mockResolvedValue(undefined);
  });

  it('calls play({time}) with the target position', async () => {
    const result = await mountLinked();
    await act(async () => { await result.current.seek(45); });
    expect(mocks.audioMgr.play).toHaveBeenCalledWith({time: 45});
  });

  it('does NOT call pause() during seek — no audible gap', async () => {
    const result = await mountLinked();
    await act(async () => { await result.current.seek(45); });
    expect(mocks.audioMgr.pause).not.toHaveBeenCalled();
  });

  it('isPlaying stays true after seek', async () => {
    const result = await mountLinked();
    await act(async () => { await result.current.seek(45); });
    expect(result.current.isPlaying).toBe(true);
  });

  it('currentTime is updated to the seek target', async () => {
    const result = await mountLinked();
    await act(async () => { await result.current.seek(45); });
    expect(result.current.currentTime).toBe(45);
  });

  it('seek to 0 works without pausing', async () => {
    const result = await mountLinked();
    await act(async () => { await result.current.seek(0); });
    expect(mocks.audioMgr.play).toHaveBeenCalledWith({time: 0});
    expect(mocks.audioMgr.pause).not.toHaveBeenCalled();
  });

  it('multiple consecutive seeks never call pause', async () => {
    const result = await mountLinked();
    await act(async () => {
      await result.current.seek(10);
      await result.current.seek(30);
      await result.current.seek(60);
    });
    expect(mocks.audioMgr.pause).not.toHaveBeenCalled();
    expect(mocks.audioMgr.play).toHaveBeenCalledTimes(3);
    expect(mocks.audioMgr.play).toHaveBeenLastCalledWith({time: 60});
  });

  it('seek is a no-op when not linked (no AudioManager)', async () => {
    const {getStemAssociation} = await import('@/lib/local-db/stems');
    vi.mocked(getStemAssociation).mockResolvedValueOnce(null);

    const {result} = renderHook(() => useStemPlayer('no-stems'));
    // Don't wait for stemsReady — it won't happen for unlinked songs
    await act(async () => { await result.current.seek(45); });

    expect(mocks.audioMgr.play).not.toHaveBeenCalled();
    expect(mocks.audioMgr.pause).not.toHaveBeenCalled();
  });
});

// ── Tests: seek() when paused ─────────────────────────────────────────────────

describe('useStemPlayer — seek() when paused', () => {
  beforeEach(() => {
    mocks.audioMgr._isPlaying = false;
    mocks.audioMgr.isInitialized = true;
    mocks.audioMgr.currentTime = 0;
    mocks.audioMgr.play.mockClear().mockResolvedValue(undefined);
    mocks.audioMgr.pause.mockClear().mockResolvedValue(undefined);
    mocks.audioMgr.stop.mockClear().mockResolvedValue(undefined);
    mocks.audioMgr.resume.mockClear().mockResolvedValue(undefined);
  });

  it('still calls play with the seek time', async () => {
    const result = await mountLinked();
    await act(async () => { await result.current.seek(45); });
    expect(mocks.audioMgr.play).toHaveBeenCalledWith({time: 45});
  });

  it('sets isPlaying to true', async () => {
    const result = await mountLinked();
    await act(async () => { await result.current.seek(45); });
    expect(result.current.isPlaying).toBe(true);
  });

  it('does not call pause', async () => {
    const result = await mountLinked();
    await act(async () => { await result.current.seek(45); });
    expect(mocks.audioMgr.pause).not.toHaveBeenCalled();
  });

  it('seek to 0 when paused starts playback from beginning', async () => {
    const result = await mountLinked();
    await act(async () => { await result.current.seek(0); });
    expect(mocks.audioMgr.play).toHaveBeenCalledWith({time: 0});
    expect(result.current.isPlaying).toBe(true);
  });
});

// ── Tests: play() guard ───────────────────────────────────────────────────────

describe('useStemPlayer — play() guard', () => {
  beforeEach(() => {
    mocks.audioMgr._isPlaying = true;
    mocks.audioMgr.isInitialized = true;
    mocks.audioMgr.play.mockClear().mockResolvedValue(undefined);
    mocks.audioMgr.pause.mockClear().mockResolvedValue(undefined);
    mocks.audioMgr.resume.mockClear().mockResolvedValue(undefined);
  });

  it('play() is a no-op when AudioManager context is already running', async () => {
    const result = await mountLinked();
    await act(async () => { await result.current.play(); });
    // mgr.isPlaying=true → early return, no resume/play called
    expect(mocks.audioMgr.resume).not.toHaveBeenCalled();
    expect(mocks.audioMgr.play).not.toHaveBeenCalled();
  });
});

// ── Tests: linking semantics ─────────────────────────────────────────────────

describe('useStemPlayer — linkFolder()', () => {
  beforeEach(async () => {
    const {getStemAssociation, saveStemAssociation} = await import('@/lib/local-db/stems');
    const fs = await import('@tauri-apps/plugin-fs');
    vi.mocked(getStemAssociation).mockResolvedValue(mocks.stemAssoc);
    vi.mocked(saveStemAssociation).mockClear().mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockClear();
    vi.mocked(fs.writeFile).mockClear();
  });

  it('persists the selected stem folder directly instead of copying files first', async () => {
    const {saveStemAssociation} = await import('@/lib/local-db/stems');
    const fs = await import('@tauri-apps/plugin-fs');
    const result = await mountLinked();

    await act(async () => {
      await result.current.linkFolder('/Users/me/Downloads/seraquehayduendes');
    });

    expect(saveStemAssociation).toHaveBeenCalledWith(
      'test-song',
      '/Users/me/Downloads/seraquehayduendes',
    );
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

// ── Tests: unlink external vs managed folders ────────────────────────────────

describe('useStemPlayer — unlink()', () => {
  beforeEach(async () => {
    const {getStemAssociation, deleteStemAssociation} = await import('@/lib/local-db/stems');
    const fs = await import('@tauri-apps/plugin-fs');
    vi.mocked(getStemAssociation).mockResolvedValue(mocks.stemAssoc);
    vi.mocked(deleteStemAssociation).mockClear().mockResolvedValue(undefined);
    vi.mocked(fs.exists).mockClear().mockResolvedValue(true);
    vi.mocked(fs.remove).mockClear().mockResolvedValue(undefined);
  });

  it('does not delete an external user-selected stem folder', async () => {
    const {getStemAssociation} = await import('@/lib/local-db/stems');
    const fs = await import('@tauri-apps/plugin-fs');
    vi.mocked(getStemAssociation).mockResolvedValue({
      ...mocks.stemAssoc,
      stem_folder_path: '/Users/me/Downloads/seraquehayduendes',
    });
    const result = await mountLinked();

    await act(async () => {
      await result.current.unlink();
    });

    expect(fs.remove).not.toHaveBeenCalled();
  });

  it('still deletes old managed app-data stem folders', async () => {
    const {getStemAssociation} = await import('@/lib/local-db/stems');
    const fs = await import('@tauri-apps/plugin-fs');
    vi.mocked(getStemAssociation).mockResolvedValue({
      ...mocks.stemAssoc,
      stem_folder_path: '/data/stems/test-song',
    });
    const result = await mountLinked();

    await act(async () => {
      await result.current.unlink();
    });

    expect(fs.remove).toHaveBeenCalledWith('/data/stems/test-song', {recursive: true});
  });
});
