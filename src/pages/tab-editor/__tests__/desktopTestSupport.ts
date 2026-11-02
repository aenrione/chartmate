import {DatabaseSync, type SQLInputValue} from 'node:sqlite';
import {posix} from 'node:path';
import type {test} from '@playwright/experimental-ct-react';

type Page = Parameters<Parameters<typeof test>[2]>[0]['page'];

interface DesktopBridgeOptions {
  stems?: boolean;
  youtube?: boolean;
}

const STEM_FOLDER = '/test-stems';
const STEM_FILE = `${STEM_FOLDER}/guitar.wav`;
const TEST_DATABASE = 'sqlite:chartmate.db';

/** Real PCM audio, distinct from AlphaTab's SoundFont output. */
function makeStemFixture(): Buffer {
  const sampleRate = 8_000;
  const frames = sampleRate * 30;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(frames * 2, 40);
  for (let frame = 0; frame < frames; frame++) {
    wav.writeInt16LE(Math.round(Math.sin(frame * 2 * Math.PI * 220 / sampleRate) * 5_000), 44 + frame * 2);
  }
  return wav;
}

function sqlValue(value: unknown): SQLInputValue {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value;
  if (typeof value === 'boolean') return Number(value);
  if (Array.isArray(value)) return Buffer.from(value);
  throw new Error(`Unsupported SQLite bind value: ${typeof value}`);
}

function browserValue(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map(browserValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, browserValue(item)]));
  }
  return value;
}

/**
 * Replace only native IPC. The browser still runs the real Kysely migrations,
 * database models, score exporter, audio decoding, and playback engines.
 * Call before mounting the editor; query the returned SQLite connection in tests.
 */
export async function installDesktopBridge(
  page: Page,
  options: DesktopBridgeOptions = {},
): Promise<DatabaseSync> {
  const db = new DatabaseSync(':memory:');
  const store = new Map<string, unknown>();
  const wav = makeStemFixture();
  const seeded = new Set<string>();

  function seedAssociation(query: string) {
    // Wait for the application's migrations to create the tables. Seed just once
    // so a later UI unlink/delete remains effective throughout the test.
    if (options.stems && !seeded.has('stems') && /\bfrom\s+["`]?stem_associations\b/i.test(query)) {
      db.prepare('INSERT INTO stem_associations (song_key, stem_folder_path, created_at) VALUES (?, ?, ?)')
        .run('tab-editor:new', STEM_FOLDER, new Date().toISOString());
      seeded.add('stems');
    }
    if (options.youtube && !seeded.has('youtube') && /\bfrom\s+["`]?youtube_associations\b/i.test(query)) {
      db.prepare('INSERT INTO youtube_associations (chart_md5, youtube_url, offset_ms, created_at) VALUES (?, ?, ?, ?)')
        .run('tab-editor:new', 'https://www.youtube.com/watch?v=testVideo01', 0, new Date().toISOString());
      seeded.add('youtube');
    }
  }

  await page.exposeFunction('__chartmateDesktopInvoke', (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case 'plugin:sql|load':
        if (args.db !== TEST_DATABASE) throw new Error(`Unexpected database: ${String(args.db)}`);
        return TEST_DATABASE;
      case 'plugin:sql|select':
      case 'plugin:sql|execute': {
        if (args.db !== TEST_DATABASE) throw new Error(`Unexpected database: ${String(args.db)}`);
        if (typeof args.query !== 'string') throw new Error('Expected a SQL query');
        const values = (args.values as unknown[] ?? []).map(sqlValue);
        if (command === 'plugin:sql|select') {
          seedAssociation(args.query);
          return browserValue(db.prepare(args.query).all(...values));
        }
        const result = db.prepare(args.query).run(...values);
        return [Number(result.changes), Number(result.lastInsertRowid)];
      }
      case 'plugin:sql|close':
        return true;
      case 'plugin:path|join':
      case 'plugin:path|resolve':
        return posix.join(...args.paths as string[]);
      case 'plugin:path|resolve_directory':
        return '/test-data';
      case 'plugin:fs|read_dir':
        if (options.stems && args.path === STEM_FOLDER) {
          return [{name: 'guitar.wav', isDirectory: false, isFile: true, isSymlink: false}];
        }
        throw new Error(`Unexpected directory read: ${String(args.path)}`);
      case 'plugin:fs|read_file':
        if (options.stems && args.path === STEM_FILE) return Array.from(wav);
        throw new Error(`Unexpected file read: ${String(args.path)}`);
      case 'plugin:fs|exists':
        return Boolean(options.stems && (args.path === STEM_FOLDER || args.path === STEM_FILE));
      case 'plugin:dialog|open':
        return options.stems ? STEM_FOLDER : null;
      case 'plugin:store|load':
      case 'plugin:store|get_store':
        if (args.path !== 'prefs.json') throw new Error(`Unexpected store: ${String(args.path)}`);
        return 1;
      case 'plugin:store|get':
        return [store.get(String(args.key)) ?? null, store.has(String(args.key))];
      case 'plugin:store|set':
        store.set(String(args.key), args.value);
        return;
      case 'plugin:store|delete':
        return store.delete(String(args.key));
      case 'plugin:store|has':
        return store.has(String(args.key));
      case 'plugin:store|save':
        return;
      default:
        throw new Error(`Unexpected desktop IPC command: ${command}`);
    }
  });

  await page.evaluate(() => {
    type BridgeWindow = Window & {
      isTauri: boolean;
      __TAURI_INTERNALS__: Record<string, unknown>;
      __chartmateDesktopInvoke: (command: string, args: unknown) => Promise<unknown>;
    };
    const target = window as unknown as BridgeWindow;
    const serialize = (value: unknown): unknown => {
      if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
      if (ArrayBuffer.isView(value)) return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      if (Array.isArray(value)) return value.map(serialize);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
      }
      return value;
    };
    target.isTauri = true;
    target.__TAURI_INTERNALS__ = {
      ...target.__TAURI_INTERNALS__,
      invoke: (command: string, args: unknown) => target.__chartmateDesktopInvoke(command, serialize(args)),
    };
  });
  return db;
}
