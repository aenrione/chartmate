import {describe, it, expect, beforeEach, vi} from 'vitest';
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';

// Mock localStorage
const localStorageData: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageData[key] ?? null,
  setItem: (key: string, value: string) => { localStorageData[key] = value; },
  removeItem: (key: string) => { delete localStorageData[key]; },
});

// Mock the Tauri HTTP plugin before importing the module
vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}));

import {
  getAllSoundfonts,
  getSoundfont,
  saveSoundfont,
  deleteSoundfont,
  getActiveSoundfontId,
  setActiveSoundfontId,
  loadActiveSoundfont,
  importSoundfontFile,
  downloadSoundfont,
  BUILT_IN_SOUNDFONT,
  DOWNLOADABLE_SOUNDFONTS,
  type SoundfontEntry,
} from '../soundfont-store';

// Reset IndexedDB and localStorage between tests
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  Object.keys(localStorageData).forEach(k => delete localStorageData[k]);
});

describe('soundfont-store', () => {
  describe('BUILT_IN_SOUNDFONT', () => {
    it('has correct default properties', () => {
      expect(BUILT_IN_SOUNDFONT.id).toBe('sonivox');
      expect(BUILT_IN_SOUNDFONT.source).toBe('built-in');
      expect(BUILT_IN_SOUNDFONT.url).toBe('/soundfont/sonivox.sf2');
      expect(BUILT_IN_SOUNDFONT.data).toBeNull();
    });
  });

  describe('DOWNLOADABLE_SOUNDFONTS', () => {
    it('has at least one entry', () => {
      expect(DOWNLOADABLE_SOUNDFONTS.length).toBeGreaterThan(0);
    });

    it('each entry has required fields', () => {
      for (const sf of DOWNLOADABLE_SOUNDFONTS) {
        expect(sf.id).toBeTruthy();
        expect(sf.name).toBeTruthy();
        expect(sf.downloadUrl).toBeTruthy();
        expect(sf.description).toBeTruthy();
        expect(sf.size).toBeTruthy();
        expect(sf.license).toBeTruthy();
      }
    });
  });

  describe('getAllSoundfonts', () => {
    it('returns built-in soundfont when store is empty', async () => {
      const all = await getAllSoundfonts();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('sonivox');
    });

    it('returns built-in plus saved soundfonts', async () => {
      const entry: SoundfontEntry = {
        id: 'test-sf',
        name: 'Test SF',
        size: 1000,
        source: 'imported',
        data: new ArrayBuffer(1000),
        createdAt: Date.now(),
      };
      await saveSoundfont(entry);

      const all = await getAllSoundfonts();
      expect(all).toHaveLength(2);
      expect(all[0].id).toBe('sonivox');
      expect(all[1].id).toBe('test-sf');
    });
  });

  describe('getSoundfont', () => {
    it('returns built-in for sonivox id', async () => {
      const sf = await getSoundfont('sonivox');
      expect(sf).toEqual(BUILT_IN_SOUNDFONT);
    });

    it('returns null for unknown id', async () => {
      const sf = await getSoundfont('nonexistent');
      expect(sf).toBeNull();
    });

    it('returns saved soundfont by id', async () => {
      const entry: SoundfontEntry = {
        id: 'my-font',
        name: 'My Font',
        size: 500,
        source: 'imported',
        data: new ArrayBuffer(500),
        createdAt: 123,
      };
      await saveSoundfont(entry);

      const sf = await getSoundfont('my-font');
      expect(sf).not.toBeNull();
      expect(sf!.name).toBe('My Font');
      expect(sf!.size).toBe(500);
      expect(sf!.source).toBe('imported');
    });
  });

  describe('saveSoundfont', () => {
    it('saves and retrieves a soundfont', async () => {
      const entry: SoundfontEntry = {
        id: 'save-test',
        name: 'Save Test',
        size: 2000,
        source: 'downloaded',
        data: new ArrayBuffer(2000),
        createdAt: Date.now(),
      };
      await saveSoundfont(entry);

      const retrieved = await getSoundfont('save-test');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe('Save Test');
    });

    it('overwrites existing entry with same id', async () => {
      const entry1: SoundfontEntry = {
        id: 'overwrite-test',
        name: 'Version 1',
        size: 100,
        source: 'imported',
        data: new ArrayBuffer(100),
        createdAt: 1,
      };
      await saveSoundfont(entry1);

      const entry2: SoundfontEntry = {
        ...entry1,
        name: 'Version 2',
        size: 200,
      };
      await saveSoundfont(entry2);

      const all = await getAllSoundfonts();
      const userFonts = all.filter(sf => sf.id === 'overwrite-test');
      expect(userFonts).toHaveLength(1);
      expect(userFonts[0].name).toBe('Version 2');
    });
  });

  describe('deleteSoundfont', () => {
    it('removes a saved soundfont', async () => {
      const entry: SoundfontEntry = {
        id: 'delete-me',
        name: 'Delete Me',
        size: 100,
        source: 'imported',
        data: new ArrayBuffer(100),
        createdAt: Date.now(),
      };
      await saveSoundfont(entry);
      expect(await getSoundfont('delete-me')).not.toBeNull();

      await deleteSoundfont('delete-me');
      expect(await getSoundfont('delete-me')).toBeNull();
    });

    it('does not delete built-in sonivox', async () => {
      await deleteSoundfont('sonivox');
      const sf = await getSoundfont('sonivox');
      expect(sf).toEqual(BUILT_IN_SOUNDFONT);
    });

    it('resets active to sonivox if deleted font was active', async () => {
      const entry: SoundfontEntry = {
        id: 'active-then-delete',
        name: 'Active Then Delete',
        size: 100,
        source: 'imported',
        data: new ArrayBuffer(100),
        createdAt: Date.now(),
      };
      await saveSoundfont(entry);
      setActiveSoundfontId('active-then-delete');
      expect(getActiveSoundfontId()).toBe('active-then-delete');

      await deleteSoundfont('active-then-delete');
      expect(getActiveSoundfontId()).toBe('sonivox');
    });
  });

  describe('active soundfont', () => {
    it('defaults to sonivox', () => {
      expect(getActiveSoundfontId()).toBe('sonivox');
    });

    it('persists selection in localStorage', () => {
      setActiveSoundfontId('custom-font');
      expect(getActiveSoundfontId()).toBe('custom-font');
      expect(localStorage.getItem('chartmate-active-soundfont')).toBe('custom-font');
    });
  });

  describe('loadActiveSoundfont', () => {
    it('returns URL string for built-in soundfont', async () => {
      setActiveSoundfontId('sonivox');
      const result = await loadActiveSoundfont();
      expect(typeof result).toBe('string');
      expect(result).toBe('/soundfont/sonivox.sf2');
    });

    it('returns Uint8Array for user soundfont', async () => {
      const data = new ArrayBuffer(256);
      new Uint8Array(data).fill(42);

      await saveSoundfont({
        id: 'user-font',
        name: 'User Font',
        size: 256,
        source: 'imported',
        data,
        createdAt: Date.now(),
      });
      setActiveSoundfontId('user-font');

      const result = await loadActiveSoundfont();
      expect(result).toBeInstanceOf(Uint8Array);
      expect((result as Uint8Array).length).toBe(256);
      expect((result as Uint8Array)[0]).toBe(42);
    });

    it('falls back to built-in if active id not found', async () => {
      setActiveSoundfontId('missing-font');
      const result = await loadActiveSoundfont();
      expect(result).toBe('/soundfont/sonivox.sf2');
    });
  });

  describe('importSoundfontFile', () => {
    it('imports a File and stores it', async () => {
      const buffer = new ArrayBuffer(1024);
      const file = new File([buffer], 'MyGuitar.sf2', {type: 'application/octet-stream'});

      const entry = await importSoundfontFile(file);
      expect(entry.id).toBe('myguitar');
      expect(entry.name).toBe('MyGuitar');
      expect(entry.size).toBe(1024);
      expect(entry.source).toBe('imported');

      const stored = await getSoundfont('myguitar');
      expect(stored).not.toBeNull();
      expect(stored!.name).toBe('MyGuitar');
    });

    it('sanitizes special characters in filename to create id', async () => {
      const file = new File([new ArrayBuffer(10)], 'My Guitar (v2).sf2');
      const entry = await importSoundfontFile(file);
      expect(entry.id).toBe('my-guitar--v2-');
    });
  });

  describe('downloadSoundfont', () => {
    it('downloads and stores a soundfont using tauriFetch', async () => {
      const {fetch: tauriFetch} = await import('@tauri-apps/plugin-http');
      const mockFetch = vi.mocked(tauriFetch);

      const fakeData = new Uint8Array([1, 2, 3, 4, 5]);
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({done: false, value: fakeData})
          .mockResolvedValueOnce({done: true, value: undefined}),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        statusText: 'OK',
        headers: new Headers({'content-length': '5'}),
        body: {getReader: () => mockReader},
      } as unknown as Response);

      const progressCalls: [number, number][] = [];
      const entry = await downloadSoundfont(
        DOWNLOADABLE_SOUNDFONTS[0],
        (loaded, total) => progressCalls.push([loaded, total]),
      );

      expect(entry.name).toBe(DOWNLOADABLE_SOUNDFONTS[0].name);
      expect(entry.size).toBe(5);
      expect(entry.source).toBe('downloaded');
      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[0][0]).toBe(5); // loaded
      expect(progressCalls[0][1]).toBe(5); // total

      const stored = await getSoundfont(entry.id);
      expect(stored).not.toBeNull();
    });

    it('throws on failed download', async () => {
      const {fetch: tauriFetch} = await import('@tauri-apps/plugin-http');
      const mockFetch = vi.mocked(tauriFetch);

      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      } as unknown as Response);

      await expect(downloadSoundfont(DOWNLOADABLE_SOUNDFONTS[0])).rejects.toThrow('Download failed');
    });
  });
});
