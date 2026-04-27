import {test, expect, type ConsoleMessage} from '@playwright/experimental-ct-react';
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {TabEditorPlaybackHarness} from './TabEditorPlaybackHarness';

const AT_DIST = resolve(process.cwd(), 'node_modules/@coderline/alphatab/dist');
const SF2_PATH = resolve(process.cwd(), 'public/soundfont/sonivox.sf2');
const FONT_DIR = resolve(process.cwd(), 'public/font');

async function serveAlphaTabAssets(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
) {
  let workletRequests = 0;
  for (const file of ['alphaTab.worker.mjs', 'alphaTab.core.mjs', 'alphaTab.worklet.mjs']) {
    const body = readFileSync(resolve(AT_DIST, file));
    await page.route(`**/${file}`, route => {
      if (file === 'alphaTab.worklet.mjs') workletRequests++;
      return route.fulfill({status: 200, contentType: 'text/javascript', body});
    });
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
  const sf2 = readFileSync(SF2_PATH);
  await page.route('**/*.sf2', route =>
    route.fulfill({status: 200, contentType: 'application/octet-stream', body: sf2}),
  );

  return {
    get workletRequests() {
      return workletRequests;
    },
  };
}

async function captureErrors(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  fn: () => Promise<void>,
): Promise<string[]> {
  const errors: string[] = [];
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  };
  const onPageError = (err: Error) => errors.push(err.message);
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

const isAudioWorkletError = (e: string) =>
  e.includes('source.connect') ||
  e.includes('InvalidStateError') ||
  e.includes('cannot call stop without calling start');

const isPlaybackRuntimeError = (e: string) =>
  isAudioWorkletError(e) ||
  e.includes('_currentBeat') ||
  e.includes('currentBeat') ||
  e.includes('is not an object');

async function getPlaybackDiagnostics(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
) {
  return page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    return {
      last: win.__tabEditorPlayback,
      events: win.__tabEditorPlaybackEvents,
    };
  });
}

test('tab editor play button starts AlphaTab playback without audio-worklet errors', async ({mount, page}) => {
  const assets = await serveAlphaTabAssets(page);

  const errors = await captureErrors(page, async () => {
    await mount(<TabEditorPlaybackHarness />);

    const playButton = page.locator('button[title="Play (Space)"]');
    await expect(playButton).toBeEnabled({timeout: 20_000});

    // User gesture unlocks the AudioContext before the real toolbar action.
    await page.mouse.click(400, 200);
    await playButton.click();

    await expect(page.locator('button[title="Pause (Space)"]')).toBeVisible({timeout: 10_000});
    await page.waitForTimeout(800);
  });

  expect(errors.filter(isAudioWorkletError)).toEqual([]);
  expect(assets.workletRequests).toBe(0);
});

test('tab editor playback still starts after adding a note', async ({mount, page}) => {
  const assets = await serveAlphaTabAssets(page);

  const errors = await captureErrors(page, async () => {
    await mount(<TabEditorPlaybackHarness />);

    const playButton = page.locator('button[title="Play (Space)"]');
    await expect(playButton).toBeEnabled({timeout: 20_000});

    await page.mouse.click(400, 200);
    await page.keyboard.press('5');

    await expect(page.getByRole('button', {name: 'Save*'})).toBeVisible({timeout: 10_000});
    await expect(playButton).toBeEnabled({timeout: 20_000});
    await playButton.click();

    try {
      await expect(page.locator('button[title="Pause (Space)"]')).toBeVisible({timeout: 10_000});
    } catch (error) {
      const diag = await getPlaybackDiagnostics(page);
      throw new Error(`Playback did not start after note entry: ${JSON.stringify(diag)}; cause=${String(error)}`);
    }
    await page.waitForTimeout(800);
  });

  expect(errors.filter(isPlaybackRuntimeError)).toEqual([]);
  expect(assets.workletRequests).toBe(0);
});

test('tab editor playback can restart after changing tempo', async ({mount, page}) => {
  const assets = await serveAlphaTabAssets(page);

  const errors = await captureErrors(page, async () => {
    await mount(<TabEditorPlaybackHarness />);

    const playButton = page.locator('button[title="Play (Space)"]');
    await expect(playButton).toBeEnabled({timeout: 20_000});

    await page.mouse.click(400, 200);
    await playButton.click();
    try {
      await expect(page.locator('button[title="Pause (Space)"]')).toBeVisible({timeout: 10_000});
    } catch (error) {
      const diag = await getPlaybackDiagnostics(page);
      throw new Error(`Initial playback did not start: ${JSON.stringify(diag)}; cause=${String(error)}`);
    }

    const tempoInput = page.locator('input[type="number"]').first();
    await tempoInput.fill('140');

    await expect(page.locator('button[title="Play (Space)"]')).toBeEnabled({timeout: 10_000});
    await page.locator('button[title="Play (Space)"]').click();
    try {
      await expect(page.locator('button[title="Pause (Space)"]')).toBeVisible({timeout: 10_000});
    } catch (error) {
      const diag = await getPlaybackDiagnostics(page);
      throw new Error(`Playback did not restart after tempo change: ${JSON.stringify(diag)}; cause=${String(error)}`);
    }
    await page.waitForTimeout(800);
  });

  expect(errors.filter(isAudioWorkletError)).toEqual([]);
  expect(assets.workletRequests).toBe(0);
});
