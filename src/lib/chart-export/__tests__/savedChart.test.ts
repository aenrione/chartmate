import {describe, it, expect, vi, beforeEach} from 'vitest';

const listPersistedFiles = vi.fn();
const readPersistedFile = vi.fn();

vi.mock('@/lib/chart-persistent-store', () => ({listPersistedFiles, readPersistedFile}));

const {buildSavedChartFolder} = await import('../savedChart');

const file = (name: string, text: string) =>
  new File([new Blob([text])], name);

describe('buildSavedChartFolder', () => {
  beforeEach(() => {
    listPersistedFiles.mockReset();
    readPersistedFile.mockReset();
  });

  it('hands over the original files untouched, not a re-export', async () => {
    listPersistedFiles.mockResolvedValue(['notes.chart', 'song.ini', 'song.ogg', 'album.png']);
    readPersistedFile.mockImplementation(async (_md5: string, name: string) =>
      file(name, `contents of ${name}`),
    );

    const folder = await buildSavedChartFolder({
      md5: 'abc', name: 'Lithium', artist: 'Evanescence',
    });

    expect(folder.name).toBe('Evanescence - Lithium');
    // Every file comes across, including the guitar/vocal parts and the real
    // audio that a drums-only re-export would have thrown away.
    expect(folder.files.map(f => f.name)).toEqual([
      'notes.chart', 'song.ini', 'song.ogg', 'album.png',
    ]);
    expect(new TextDecoder().decode(folder.files[0].data)).toBe('contents of notes.chart');
    expect(folder.audioIsSilent).toBe(false);
    expect(folder.issues).toEqual([]);
  });

  it('says so when the chart was never saved offline', async () => {
    listPersistedFiles.mockResolvedValue([]);
    await expect(
      buildSavedChartFolder({md5: 'abc', name: 'X', artist: 'Y'}),
    ).rejects.toThrow(/not saved offline/);
  });
});
