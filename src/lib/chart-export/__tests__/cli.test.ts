/**
 * The CLI runs the same modules the app does, but through Node's type
 * stripping rather than Vite — which refuses some TypeScript the app compiles
 * fine (parameter properties, enums, namespaces). Nothing in a unit test
 * catches that; only actually running it does.
 */

import {describe, it, expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readdirSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const REPO = join(import.meta.dirname, '../../../..');

function runCli(args: string[]): string {
  return execFileSync(
    process.execPath,
    ['--import', './scripts/chart-export/loader.mjs', 'scripts/chart-export/export-charts.ts', ...args],
    {cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
  );
}

describe('export-charts CLI', () => {
  it('loads the whole module graph under Node and writes a playable folder', () => {
    const out = mkdtempSync(join(tmpdir(), 'chartmate-cli-'));
    try {
      const stdout = runCli(['--rudiment', '16', '--out', out, '--quiet']);
      expect(stdout).not.toMatch(/error/i);

      const folders = readdirSync(out);
      expect(folders).toEqual(['Rudiments - Single Paradiddle']);

      const files = readdirSync(join(out, folders[0])).sort();
      expect(files).toEqual(['album.png', 'notes.chart', 'song.ini', 'song.wav']);

      const chart = readFileSync(join(out, folders[0], 'notes.chart'), 'utf8');
      expect(chart).toContain('[ExpertDrums]');
      expect(chart).toContain('Resolution = 192');
    } finally {
      rmSync(out, {recursive: true, force: true});
    }
  }, 60_000);

  it('exits non-zero when nothing matches', () => {
    expect(() => runCli(['--rudiment', '999', '--out', tmpdir()])).toThrow();
  }, 60_000);
});
