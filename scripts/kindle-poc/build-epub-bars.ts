// SPIKE — throwaway. Variant C: reflowable EPUB. One image per bar, inline, sized in em,
// so crengine wraps them like words and the font-size slider scales them. Screen-independent.
import {readFileSync, writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {importer, Settings, rendering, LayoutMode} from '@coderline/alphatab';
import {chromium} from '/Users/alfredoenrione/my-github/mine/chartmate/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs';

const [, , gpPath, outEpub] = process.argv;
const settings = new Settings();
settings.core.engine = 'svg';
settings.display.layoutMode = LayoutMode.Page;
const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(gpPath)), settings);

const r = new rendering.ScoreRenderer(settings);
r.width = 900;   // narrowish rows -> bar widths closer to natural
const ids: string[] = [];
const svgs: {svg: string; x: number; y: number; h: number}[] = [];
r.partialLayoutFinished.on(e => ids.push(e.id));
r.partialRenderFinished.on(e => svgs.push({svg: String(e.renderResult), x: e.x, y: e.y, h: e.height}));
r.error.on(e => console.error('render error', e));
r.renderScore(score, [0]);
for (const id of ids) r.renderResult(id);

const lookup = r.boundsLookup!;
const sys = lookup.staffSystems;
console.log('systems', sys.length, 'partials', svgs.length);
const bars = sys.flatMap(s => s.bars).sort((a, b) => a.index - b.index);
console.log('bars found', bars.length, 'of', score.masterBars.length);

const dir = '/tmp/kindle-poc/epub-bars';
rmSync(dir, {recursive: true, force: true});
mkdirSync(`${dir}/OEBPS/img`, {recursive: true});
mkdirSync(`${dir}/META-INF`, {recursive: true});

const PAD = 4;
const sysOf = new Map<number, {anchor: number; top: number; bottom: number; svg: string; px: number; py: number}>();
for (const sy of sys) {
  if (!sy.bars.length) continue;
  // the partial whose vertical span contains this system
  const part = svgs.find(p2 => sy.realBounds.y >= p2.y - 1 && sy.realBounds.y < p2.y + p2.h);
  if (!part) { console.warn('no partial for system at y', sy.realBounds.y); continue; }
  const info = {
    anchor: sy.bars[0].lineAlignedBounds.y,
    top: sy.realBounds.y,
    bottom: sy.realBounds.y + sy.realBounds.h,
    svg: part.svg, px: part.x, py: part.y,
  };
  for (const bar of sy.bars) sysOf.set(bar.index, info);
}
const infos = [...new Set(sysOf.values())];
const above = Math.max(...infos.map(s2 => s2.anchor - s2.top));
const below = Math.max(...infos.map(s2 => s2.bottom - s2.anchor));
const H = Math.ceil(above + below + PAD * 2);
console.log('band', H, 'above', Math.round(above), 'below', Math.round(below));

const bravura = readFileSync('node_modules/@coderline/alphatab/dist/font/Bravura.otf').toString('base64');
const head = `<style>
@font-face{font-family:alphaTab;src:url(data:font/otf;base64,${bravura}) format('opentype');}
html,body{margin:0;padding:0;background:#fff;}.at{font-family:alphaTab;font-size:34px;}
#s{position:absolute;left:0;}</style>`;

const b2 = await chromium.launch();
const page = await b2.newPage({viewport: {width: 1200, height: H}, deviceScaleFactor: 2});
const meta: {w: number}[] = [];
let lastSvg = '';
for (let i = 0; i < bars.length; i++) {
  const info = sysOf.get(bars[i].index);
  if (!info) { meta.push({w: 1}); continue; }
  if (info.svg !== lastSvg) {
    // isolate this system: only its partial on the page, anchored so the staff sits at above+PAD
    const top = PAD + above - (info.anchor - info.py);
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"/>${head}</head>` +
      `<body style="height:${H}px;overflow:hidden"><div id="s" style="top:${top}px">${info.svg}</div></body></html>`);
    await page.waitForTimeout(120);
    lastSvg = info.svg;
  }
  const bb = bars[i].realBounds;
  await page.screenshot({
    path: `${dir}/OEBPS/img/b${i}.png`,
    clip: {x: bb.x - info.px, y: 0, width: bb.w, height: H},
  });
  meta.push({w: bb.w});
}
await b2.close();
console.log('cropped', meta.length, 'bars, strip height', Math.round(H));

// em sizing: height fixed at HEIGHT_EM, widths scaled to keep each bar's aspect ratio
const HEIGHT_EM = 7;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const imgs = meta.map((m, i) =>
  `<img src="img/b${i}.png" style="width:${(m.w / H * HEIGHT_EM).toFixed(2)}em;height:${HEIGHT_EM}em" alt="bar ${i + 1}"/>`
).join('');

writeFileSync(`${dir}/OEBPS/style.css`,
`body{margin:0.3em;padding:0;text-align:left;}
p.bars{margin:0;padding:0;line-height:${HEIGHT_EM}em;text-indent:0;}
p.bars img{vertical-align:top;margin:0;padding:0;}
h1{font-size:1.4em;margin:0.2em 0;}h2{font-size:1em;font-weight:normal;margin:0 0 0.8em 0;}`);
writeFileSync(`${dir}/OEBPS/p0.xhtml`,
`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(score.title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><h1>${esc(score.title)}</h1><h2>${esc(score.artist)}</h2><p class="bars">${imgs}</p></body></html>`);
writeFileSync(`${dir}/OEBPS/content.opf`,
`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bid">chartmate-bars-${Date.now()}</dc:identifier>
<dc:title>${esc(score.title)} (reflow)</dc:title><dc:creator>${esc(score.artist)}</dc:creator>
<dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z/, 'Z')}</meta>
</metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="p0" href="p0.xhtml" media-type="application/xhtml+xml"/>
${meta.map((_, i) => `<item id="i${i}" href="img/b${i}.png" media-type="image/png"/>`).join('\n')}</manifest>
<spine><itemref idref="p0"/></spine></package>`);
writeFileSync(`${dir}/OEBPS/nav.xhtml`,
`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>nav</title></head><body><nav epub:type="toc"><ol>
<li><a href="p0.xhtml">${esc(score.title)}</a></li></ol></nav></body></html>`);
writeFileSync(`${dir}/META-INF/container.xml`,
`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
writeFileSync(`${dir}/mimetype`, 'application/epub+zip');

rmSync(outEpub, {force: true});
execFileSync('zip', ['-X0q', outEpub, 'mimetype'], {cwd: dir});
execFileSync('zip', ['-Xr9q', outEpub, 'META-INF', 'OEBPS'], {cwd: dir});
console.log('wrote', outEpub);
