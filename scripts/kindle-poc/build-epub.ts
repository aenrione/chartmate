// SPIKE — throwaway. .gp -> EPUB of rendered tab pages, for KOReader on a Kindle.
// usage: node scripts/kindle-poc/build-epub.ts <in.gp> <out.epub> [width] [height]
import {readFileSync, writeFileSync, mkdirSync, rmSync, cpSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {importer, Settings, rendering, LayoutMode} from '@coderline/alphatab';

const [, , gpPath, outEpub, wArg, hArg] = process.argv;
const W = Number(wArg ?? 1072);   // Kindle PW3/4 screen px
const H = Number(hArg ?? 1448);
const PAGE_H = H - 40;            // breathing room

const settings = new Settings();
settings.core.engine = 'svg';
settings.display.layoutMode = LayoutMode.Page;
const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(gpPath)), settings);

const r = new rendering.ScoreRenderer(settings);
r.width = W;
const ids: string[] = [];
const svgs: {svg: string; h: number}[] = [];
r.partialLayoutFinished.on(e => ids.push(e.id));
r.partialRenderFinished.on(e => svgs.push({svg: String(e.renderResult), h: e.height}));
r.error.on(e => console.error('render error', e));
r.renderScore(score, [0]);
for (const id of ids) r.renderResult(id);

// pack systems into pages
const pages: string[][] = [];
let cur: string[] = [], curH = 0;
for (const {svg, h} of svgs) {
  if (cur.length && curH + h > PAGE_H) { pages.push(cur); cur = []; curH = 0; }
  cur.push(svg); curH += h;
}
if (cur.length) pages.push(cur);
console.log(`${score.title} — ${svgs.length} systems -> ${pages.length} pages at ${W}x${H}`);

const dir = '/tmp/kindle-poc/epub-build';
rmSync(dir, {recursive: true, force: true});
mkdirSync(`${dir}/OEBPS/fonts`, {recursive: true});
mkdirSync(`${dir}/META-INF`, {recursive: true});
cpSync('node_modules/@coderline/alphatab/dist/font/Bravura.otf', `${dir}/OEBPS/fonts/Bravura.otf`);

const esc = (s: string) => s.replace(/&(?!#|amp;|lt;|gt;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
writeFileSync(`${dir}/OEBPS/style.css`, `@font-face{font-family:alphaTab;src:url(fonts/Bravura.otf);}
body{margin:0;padding:0;text-align:center;}
.at{font-family:alphaTab;font-size:34px;}
svg{display:block;margin:0 auto;}`);

pages.forEach((systems, i) => {
  writeFileSync(`${dir}/OEBPS/p${i}.xhtml`,
`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(score.title)} ${i + 1}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${systems.join('\n')}</body></html>`);
});

const manifest = pages.map((_, i) => `<item id="p${i}" href="p${i}.xhtml" media-type="application/xhtml+xml"/>`).join('\n');
const spine = pages.map((_, i) => `<itemref idref="p${i}"/>`).join('\n');
writeFileSync(`${dir}/OEBPS/content.opf`,
`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bid">chartmate-${Date.now()}</dc:identifier>
<dc:title>${esc(score.title)}</dc:title><dc:creator>${esc(score.artist)}</dc:creator>
<dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z/, 'Z')}</meta>
</metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="bravura" href="fonts/Bravura.otf" media-type="font/otf"/>
${manifest}</manifest>
<spine>${spine}</spine></package>`);
writeFileSync(`${dir}/OEBPS/nav.xhtml`,
`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>nav</title></head><body><nav epub:type="toc"><ol>
${pages.map((_, i) => `<li><a href="p${i}.xhtml">Page ${i + 1}</a></li>`).join('\n')}
</ol></nav></body></html>`);
writeFileSync(`${dir}/META-INF/container.xml`,
`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
writeFileSync(`${dir}/mimetype`, 'application/epub+zip');

rmSync(outEpub, {force: true});
execFileSync('zip', ['-X0q', outEpub, 'mimetype'], {cwd: dir});
execFileSync('zip', ['-Xr9q', outEpub, 'META-INF', 'OEBPS'], {cwd: dir});
console.log('wrote', outEpub);
