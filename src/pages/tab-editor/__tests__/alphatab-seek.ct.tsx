/**
 * E2E component test: seek during AlphaTab playback must not throw audio-worklet errors.
 *
 * Previously, `api.timePosition =` triggered AlphaTab's internal pause()+play() on the
 * audio worklet, causing:
 *   • InvalidStateError: cannot call stop without calling start first
 *   • TypeError: null is not an object (evaluating 'this.source.connect')
 *
 * The fix: use api.stop() → api.tickPosition = tick → api.play() instead.
 * SeekHarness replicates that exact pattern. This test runs it with real AlphaTab +
 * real Web Audio API in Chromium headless.
 *
 * Network setup required (CT Vite build doesn't emit AlphaTab's worker/core/worklet):
 *   • alphaTab.worker.mjs / alphaTab.core.mjs / alphaTab.worklet.mjs → served from dist
 *   • sonivox.sf2 → served from public/ (loadActiveSoundfont() uses IndexedDB, no Tauri)
 */
import {test, expect, type ConsoleMessage} from '@playwright/experimental-ct-react';
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {SeekHarness} from './SeekHarness';

// ── Shared route setup ─────────────────────────────────────────────────────────

const AT_DIST = resolve(process.cwd(), 'node_modules/@coderline/alphatab/dist');
const SF2_PATH = resolve(process.cwd(), 'public/soundfont/sonivox.sf2');
const FONT_DIR = resolve(process.cwd(), 'public/font');

/**
 * Serve AlphaTab's runtime files that the CT Vite build doesn't bundle automatically.
 * Must be called before mount() in every test.
 */
async function serveAlphaTabAssets(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
) {
  // Worker + its dependencies — CT Vite doesn't emit them as separate chunks
  for (const file of ['alphaTab.worker.mjs', 'alphaTab.core.mjs', 'alphaTab.worklet.mjs']) {
    const body = readFileSync(resolve(AT_DIST, file));
    await page.route(`**/${file}`, route =>
      route.fulfill({status: 200, contentType: 'text/javascript', body}),
    );
  }
  for (const file of ['Bravura.svg', 'Bravura.eot', 'Bravura.otf', 'Bravura.woff', 'Bravura.woff2']) {
    const body = readFileSync(resolve(FONT_DIR, file));
    const contentType = file.endsWith('.svg')
      ? 'image/svg+xml'
      : file.endsWith('.woff2')
        ? 'font/woff2'
        : file.endsWith('.woff')
          ? 'font/woff'
          : file.endsWith('.otf')
            ? 'font/otf'
            : 'application/vnd.ms-fontobject';
    await page.route(`**/font/${file}`, route =>
      route.fulfill({status: 200, contentType, body}),
    );
  }
  // Soundfont — served from public/, but route it explicitly so tests don't rely on
  // the CT server's publicDir being configured to include the project public/ folder
  const sf2 = readFileSync(SF2_PATH);
  await page.route('**/*.sf2', route =>
    route.fulfill({status: 200, contentType: 'application/octet-stream', body: sf2}),
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type WinExt = Record<string, unknown> & {
  __at: {play(): void; stop(): void; seekTo(tick: number): void};
  __atReady: boolean;
  __atState: number;
  __atPlayerReady?: boolean;
  __atApiReady?: boolean;
  __atRenderFinished?: boolean;
  __atRenderError?: string;
  __atMidiLoaded?: boolean;
  __atMidiError?: string;
  __atDiag?: Record<string, unknown>;
};

async function captureErrors(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  fn: () => Promise<void>,
): Promise<string[]> {
  const errors: string[] = [];
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  };
  const onPageError = (err: Error) => {
    errors.push(err.message);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  try {
    await fn();
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }
  return errors;
}

async function waitForAlphaTabReady(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
) {
  try {
    await page.waitForFunction(
      () => (window as unknown as WinExt).__atReady === true,
      {timeout: 20_000},
    );
  } catch (error) {
    const diag = await page.evaluate(() => ({
      ready: (window as unknown as WinExt).__atReady,
      apiReady: (window as unknown as WinExt).__atApiReady,
      playerReady: (window as unknown as WinExt).__atPlayerReady,
      renderFinished: (window as unknown as WinExt).__atRenderFinished,
      renderError: (window as unknown as WinExt).__atRenderError,
      midiLoaded: (window as unknown as WinExt).__atMidiLoaded,
      midiError: (window as unknown as WinExt).__atMidiError,
      diag: (window as unknown as WinExt).__atDiag,
      state: (window as unknown as WinExt).__atState,
    }));
    throw new Error(`AlphaTab never became ready: ${JSON.stringify(diag)}; cause=${String(error)}`);
  }
}

const isAudioWorkletError = (e: string) =>
  e.includes('source.connect') ||
  e.includes('InvalidStateError') ||
  e.includes('cannot call stop without calling start');

/** Ticks for bars 1–4 of the guitar demo (4/4 at 960 tpq → 3840 ticks/bar) */
const BAR_TICKS = [0, 3840, 7680, 11520];

// ── Tests ──────────────────────────────────────────────────────────────────────

test('seek during playback does not throw audio-worklet errors', async ({mount, page}) => {
  await serveAlphaTabAssets(page);

  const errors = await captureErrors(page, async () => {
    await mount(<SeekHarness />);

    // Wait for player ready + MIDI loaded (soundfont load can take a few seconds)
    await waitForAlphaTabReady(page);

    // Click to unlock the AudioContext (browsers require a user gesture before audio)
    await page.mouse.click(400, 200);

    // Start playback
    await page.evaluate(() => (window as unknown as WinExt).__at.play());

    // Wait until AlphaTab reports state=1 (playing)
    await page.waitForFunction(
      () => (window as unknown as WinExt).__atState === 1,
      {timeout: 10_000},
    );

    // Let the audio worklet reach steady-state
    await page.waitForTimeout(600);

    // Seek to each bar in turn — this is the exact sequence that used to crash
    for (const tick of [BAR_TICKS[1], BAR_TICKS[2], BAR_TICKS[3], BAR_TICKS[1]]) {
      await page.evaluate(
        (t) => (window as unknown as WinExt).__at.seekTo(t),
        tick,
      );
      // Wait for the stop → restart cycle to complete (state back to playing)
      await page.waitForFunction(
        () => (window as unknown as WinExt).__atState === 1,
        {timeout: 5_000},
      );
      await page.waitForTimeout(300);
    }

    // Confirm playback is still healthy after all seeks
    await page.waitForTimeout(500);
  });

  expect(errors.filter(isAudioWorkletError)).toEqual([]);
});

test('stop + tickPosition + play sequence is error-free', async ({mount, page}) => {
  // Directly exercises the raw three-step seek without React state management,
  // verifying the AlphaTab API path is clean end-to-end.
  await serveAlphaTabAssets(page);

  const errors = await captureErrors(page, async () => {
    await mount(<SeekHarness />);

    await waitForAlphaTabReady(page);

    // User gesture to unlock AudioContext
    await page.mouse.click(400, 200);

    await page.evaluate(() => (window as unknown as WinExt).__at.play());

    await page.waitForFunction(
      () => (window as unknown as WinExt).__atState === 1,
      {timeout: 10_000},
    );

    await page.waitForTimeout(400);

    // Two sequential seeks — confirms the pattern holds across multiple restarts
    for (const tick of [7680, 3840]) {
      await page.evaluate(
        (t) => (window as unknown as WinExt).__at.seekTo(t),
        tick,
      );
      await page.waitForFunction(
        () => (window as unknown as WinExt).__atState === 1,
        {timeout: 5_000},
      );
      await page.waitForTimeout(400);
    }
  });

  expect(errors.filter(isAudioWorkletError)).toEqual([]);
});
