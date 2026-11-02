import {test, expect, type Page} from '@playwright/experimental-ct-react';
import {TabEditorPlaybackHarness} from './TabEditorPlaybackHarness';
import {serveAlphaTabAssets, observeAudio, audioLevel, serveYouTubeProvider} from './playbackBrowserSupport';
import {installDesktopBridge} from './desktopTestSupport';

test.use({viewport: {width: 1600, height: 1000}});

async function ready(page: Page) {
  await expect.poll(() => page.evaluate(() => !!window.__editorApi?.isReadyForPlayback), {timeout: 20_000}).toBe(true);
}
async function loadDemo(page: Page) {
  await ready(page);
  await page.getByRole('button', {name: 'Demos'}).click();
  await page.getByRole('button', {name: 'Guitar Demo', exact: true}).click();
  await expect.poll(() => page.evaluate(() => window.__editorApi?.score?.title)).toBe('Smoke on the Water');
  await ready(page);
}
async function time(page: Page) {
  return page.evaluate(() => window.__editorApi!.timePosition);
}
async function audible(page: Page) {
  try {
    await expect.poll(() => page.evaluate(() => window.__editorApi?.playerState), {timeout: 10_000}).toBe(1);
    await expect.poll(() => audioLevel(page), {timeout: 10_000}).toBeGreaterThan(.0001);
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      state: window.__editorApi?.playerState, time: window.__editorApi?.timePosition,
      ready: window.__editorApi?.isReadyForPlayback,
      youtube: (window as any).__youtubePlayers?.map((player: any) => ({state: player.state, time: player.time, muted: player.muted, context: player.context.state})),
      events: (window as any).__tabEditorPlaybackEvents?.slice(-8),
    }));
    throw new Error(`${String(error)}; playback=${JSON.stringify(diagnostic)}`);
  }
}
async function silent(page: Page) {
  await expect.poll(() => audioLevel(page), {timeout: 5000}).toBeLessThan(.000001);
}
async function clickBeat(page: Page, bar: number, beat = 0) {
  const point = await page.evaluate(({bar, beat}) => {
    const api = window.__editorApi!;
    const target = api.score!.tracks[0].staves[0].bars[bar].voices[0].beats[beat];
    const bounds = api.boundsLookup!.findBeat(target)!.visualBounds;
    const canvas = (api.canvasElement as unknown as {element: HTMLElement}).element.getBoundingClientRect();
    return {x: canvas.x + bounds.x + bounds.w / 2, y: canvas.y + bounds.y + bounds.h / 2,
      tick: api.tickCache!.getBeatStart(target)};
  }, {bar, beat});
  await page.mouse.click(point.x, point.y);
  return point.tick;
}

test.beforeEach(async ({page}) => {
  await serveAlphaTabAssets(page);
  await observeAudio(page);
});

test('real audio advances, pauses with Space/click, resumes after focus and stops', async ({mount, page, context}) => {
  await installDesktopBridge(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mount(<TabEditorPlaybackHarness />);
  await loadDemo(page);
  await page.getByTitle('Play (Space)', {exact: true}).click();
  await audible(page);
  const started = await time(page);
  await expect.poll(() => time(page)).toBeGreaterThan(started + 400);
  await page.keyboard.press('Space');
  await expect(page.getByTitle('Play (Space)', {exact: true})).toBeVisible();
  await silent(page);
  const paused = await time(page);
  await page.waitForTimeout(250);
  expect(Math.abs(await time(page) - paused)).toBeLessThan(50);
  const other = await context.newPage();
  await other.goto('about:blank');
  await page.bringToFront();
  await other.close();
  await page.getByTitle('Play (Space)', {exact: true}).click();
  await audible(page);
  await expect.poll(() => time(page)).toBeGreaterThan(paused + 300);
  await page.getByTitle('Pause (Space)', {exact: true}).click();
  await silent(page);
  await page.keyboard.press('Space');
  await audible(page);
  await page.getByTitle('Stop', {exact: true}).click();
  await silent(page);
  await expect.poll(() => time(page)).toBeLessThan(50);
  expect(errors).toEqual([]);
});

test('clicking a later beat seeks actual playback and paused resume stays there', async ({mount, page}) => {
  await installDesktopBridge(page);
  await mount(<TabEditorPlaybackHarness />);
  await loadDemo(page);
  await page.getByTitle('Play (Space)', {exact: true}).click();
  await audible(page);
  const tick = await clickBeat(page, 2, 1);
  await expect.poll(() => page.evaluate(() => window.__editorApi!.tickPosition)).toBeGreaterThanOrEqual(tick);
  expect(await page.evaluate(() => window.__editorApi!.tickPosition)).toBeLessThan(tick + 1920);
  await audible(page);
  await page.keyboard.press('Space');
  await silent(page);
  const pausedTick = await clickBeat(page, 1, 1);
  await page.getByTitle('Play (Space)', {exact: true}).click();
  await audible(page);
  await expect.poll(() => page.evaluate(() => window.__editorApi!.tickPosition)).toBeGreaterThanOrEqual(pausedTick);
  expect(await page.evaluate(() => window.__editorApi!.tickPosition)).toBeLessThan(pausedTick + 1920);
});

test('first save preserves spaces and metadata, then playback survives track/view/tempo changes', async ({mount, page}) => {
  const db = await installDesktopBridge(page);
  await mount(<TabEditorPlaybackHarness />);
  await loadDemo(page);
  await page.keyboard.press('5');
  await page.getByRole('button', {name: 'Save*', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Song title').fill('');
  await dialog.getByPlaceholder('Song title').pressSequentially('Focus Song');
  await dialog.getByPlaceholder('Artist name').fill('');
  await dialog.getByPlaceholder('Artist name').pressSequentially('Test Artist');
  await expect(dialog.getByPlaceholder('Song title')).toHaveValue('Focus Song');
  await dialog.getByRole('button', {name: 'Save to Library', exact: true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Unsaved Changes', {exact: true})).not.toBeVisible();
  await expect(page.getByTestId('editor-path')).toHaveText(/\/tab-editor\/\d+/);
  const row = db.prepare('select title, artist, score_data from tab_compositions').get()!;
  expect(row.title).toBe('Focus Song');
  expect(row.artist).toBe('Test Artist');
  await page.getByTitle('Add Track', {exact: true}).click();
  await page.getByRole('button', {name: 'Guitar (6-string)', exact: true}).click();
  await page.getByTitle('Toggle view: Tab / Notation / Both', {exact: true}).click();
  await page.locator('input[type="number"]').first().fill('100');
  await page.keyboard.press('Tab');
  await page.keyboard.press('5');
  await expect.poll(() => page.evaluate(() => window.__editorApi!.score!.tracks[1].staves[0].bars[0].voices[0].beats[0].notes.length)).toBeGreaterThan(0);
  await ready(page);
  await page.getByTitle('Play (Space)', {exact: true}).click();
  await audible(page);
  await expect.poll(() => time(page)).toBeGreaterThan(300);
  await page.getByTitle('Stop', {exact: true}).click();
});

test('tracks, stems and YouTube are mutually exclusive while switching and seeking', async ({mount, page}) => {
  await installDesktopBridge(page, {stems: true, youtube: true});
  await serveYouTubeProvider(page);
  await mount(<TabEditorPlaybackHarness />);
  await loadDemo(page);
  const source = page.getByRole('combobox', {name: 'Audio source'});
  await expect(source.locator('option[value="stems"]')).toBeEnabled();
  await page.getByTitle('Play (Space)', {exact: true}).click();
  await audible(page);
  await source.selectOption('stems');
  await audible(page);
  await expect.poll(() => page.evaluate(() => (window as any).__readAudio().filter((level: number) => level > .0001).length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__editorApi!.masterVolume)).toBe(0);
  await source.selectOption('youtube');
  await expect(page.getByTitle('YouTube test player')).toBeVisible();
  await audible(page);
  await expect.poll(() => page.evaluate(() => (window as any).__readAudio().filter((level: number) => level > .0001).length)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__youtubePlayers.length)).toBe(1);
  const tick = await clickBeat(page, 2);
  await expect.poll(() => page.evaluate(() => window.__editorApi!.tickPosition)).toBeGreaterThanOrEqual(tick);
  await page.keyboard.press('Space');
  await silent(page);
  await expect.poll(() => page.evaluate(() => (window as any).__youtubePlayers[0].state)).toBe(2);
  await page.getByTitle('Play (Space)', {exact: true}).click();
  await audible(page);
  await source.selectOption('tracks');
  await expect.poll(() => page.evaluate(() => window.__editorApi!.masterVolume)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__youtubePlayers[0].muted)).toBe(true);
  await audible(page);
  await page.getByTitle('Stop', {exact: true}).click();
  await silent(page);
  await page.waitForTimeout(800);
  await silent(page);
  expect(await page.evaluate(() => (window as any).__youtubePlayers.length)).toBe(1);
});
