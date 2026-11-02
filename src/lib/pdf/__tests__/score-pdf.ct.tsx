/**
 * E2E: a score in the library must come out as a PDF that the app's own viewer
 * can open and draw.
 *
 * This exercises the whole chain in a real browser — AlphaTab's ScoreRenderer,
 * the hand-rolled SVG→PDF writer (CompressionStream, canvas text metrics, the
 * embedded Bravura CID font) and then pdf.js reading the bytes back and
 * rasterising them. A PDF that merely parses is not enough: the test fails if
 * the page comes out blank.
 */
import {test, expect} from '@playwright/experimental-ct-react';
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {PdfExportHarness, type HarnessReport} from './PdfExportHarness';

const FONT_DIR = resolve(process.cwd(), 'public/font');

test.use({viewport: {width: 900, height: 700}});

test('exports the demo score to a PDF that pdf.js can open and draw', async ({mount, page}) => {
  // public/ is not served by the CT vite server, so the music font is routed in.
  await page.route('**/font/Bravura.otf', route =>
    route.fulfill({status: 200, contentType: 'font/otf', body: readFileSync(resolve(FONT_DIR, 'Bravura.otf'))}),
  );

  const consoleErrors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await mount(<PdfExportHarness />);

  const reportEl = page.getByTestId('report');
  await expect(reportEl).toBeVisible({timeout: 60_000});
  const report: HarnessReport = JSON.parse((await reportEl.textContent())!);

  expect(report.error).toBeUndefined();
  expect(report.ok).toBe(true);

  // Produced a real PDF
  expect(report.header).toBe('%PDF-1.6');
  expect(report.pageCount).toBeGreaterThanOrEqual(1);
  expect(report.byteLength).toBeGreaterThan(10_000);
  expect(report.warnings).toEqual([]);
  expect(report.filename).toBe('Deep Purple - Smoke on the Water.pdf');

  // pdf.js — the in-app viewer's renderer — agrees about the structure
  expect(report.pdfjsPages).toBe(report.pageCount);
  expect(report.textSample?.join(' ')).toContain('Smoke on the Water');
  expect(report.textSample?.join(' ')).toContain('Deep Purple');

  // …and actually draws something. A blank page would still parse.
  expect(report.inkRatio).toBeGreaterThan(0.005);

  expect(consoleErrors.join('\n')).not.toContain('standardFontDataUrl');
});

test('exports a Clone Hero chart through the same notation the viewer shows', async ({mount, page}) => {
  await page.route('**/font/Bravura.otf', route =>
    route.fulfill({status: 200, contentType: 'font/otf', body: readFileSync(resolve(FONT_DIR, 'Bravura.otf'))}),
  );

  await mount(<PdfExportHarness source="chart" />);

  const reportEl = page.getByTestId('report');
  await expect(reportEl).toBeVisible({timeout: 60_000});
  const report: HarnessReport = JSON.parse((await reportEl.textContent())!);

  expect(report.error).toBeUndefined();
  expect(report.header).toBe('%PDF-1.6');
  expect(report.pageCount).toBeGreaterThanOrEqual(1);
  expect(report.warnings).toEqual([]);
  expect(report.filename).toBe('Test Charter - Fixture Chart.pdf');
  expect(report.pdfjsPages).toBe(report.pageCount);
  expect(report.textSample?.join(' ')).toContain('Fixture Chart');
  // The drum notation itself has to be on the page, not just the header text.
  // The fixture is one system on A4 so it only inks ~0.5% of the page; a blank
  // page measures 0.
  expect(report.inkRatio).toBeGreaterThan(0.002);
});
