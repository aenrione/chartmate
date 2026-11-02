import {act, renderHook} from '@testing-library/react';
import {importer, Settings} from '@coderline/alphatab';
import {describe, expect, it, vi} from 'vitest';
import {createBlankScore} from '@/lib/tab-editor/newScore';
import {UndoManager} from '@/lib/tab-editor/undoManager';
import {useScoreIO} from '../useScoreIO';

const database = vi.hoisted(() => ({
  saveComposition: vi.fn().mockResolvedValue(123),
  markCompositionSaved: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/local-db/tab-compositions', () => ({
  ...database,
  loadComposition: vi.fn(),
}));
vi.mock('sonner', () => ({toast: {success: vi.fn(), error: vi.fn()}}));

describe('useScoreIO save', () => {
  it.each([
    ['title', 'handleTitleChange', 'Let It Be'],
    ['artist', 'handleArtistChange', 'The Beatles'],
  ] as const)('marks %s edits dirty without marking unchanged metadata', (field, handler, value) => {
    const scoreRef = {current: createBlankScore()};
    const onDirty = vi.fn();
    const {result} = renderHook(() => useScoreIO({
      scoreRef,
      apiRef: {current: null},
      undoManagerRef: {current: new UndoManager()},
      onScoreLoaded: vi.fn(),
      onDirty,
      onClean: vi.fn(),
      onSaved: vi.fn(),
    }));

    act(() => { result.current[handler](scoreRef.current[field]); });
    expect(onDirty).not.toHaveBeenCalled();

    act(() => { result.current[handler](value); });
    expect(scoreRef.current[field]).toBe(value);
    expect(result.current[field]).toBe(value);
    expect(onDirty).toHaveBeenCalledOnce();

    act(() => { result.current[handler](value); });
    expect(onDirty).toHaveBeenCalledOnce();
  });

  it('round-trips metadata entered in the save dialog inside the saved Guitar Pro file', async () => {
    const scoreRef = {current: createBlankScore({title: 'Untitled'})};
    const onSaved = vi.fn();
    const onClean = vi.fn();
    const {result} = renderHook(() => useScoreIO({
      scoreRef,
      apiRef: {current: null},
      undoManagerRef: {current: new UndoManager()},
      onScoreLoaded: vi.fn(),
      onDirty: vi.fn(),
      onClean,
      onSaved,
    }));

    await act(async () => {
      await result.current.handleSaveComposition({
        title: 'Let It Be',
        artist: 'The Beatles',
        album: 'Let It Be album',
        tempo: 120,
        instrument: 'guitar',
      }, {tracks: [{instrument: 'guitar'}], activeTrackIndex: 0});
    });

    const [bytes, metadata] = database.saveComposition.mock.calls.at(-1)!;
    const reloaded = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(bytes), new Settings());
    expect(reloaded.title).toBe('Let It Be');
    expect(reloaded.artist).toBe('The Beatles');
    expect(reloaded.album).toBe('Let It Be album');
    expect(metadata.title).toBe(reloaded.title);
    expect(result.current.title).toBe(reloaded.title);
    expect(onClean).toHaveBeenCalledOnce();
    expect(onSaved).toHaveBeenCalledWith(123, true);
  });
});
