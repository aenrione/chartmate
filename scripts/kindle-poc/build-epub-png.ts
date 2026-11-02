// SPIKE — throwaway. Variant B: same pages, rasterised to PNG via Chromium, so KOReader
// only has to do what it already does well (show an image), not render SVG + embedded fonts.
// Run build-epub.ts first; this reuses /tmp/kindle-poc/epub-build/OEBPS/p*.xhtml.
import {readdirSync, writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from '/Users/alfredoenrione/my-github/mine/chartmate/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs';

const [, , outEpub, title = 'Tab', artist = '', wArg, hArg] = process.argv;
const W = Number(wArg ?? 1072), H = Number(hArg ?? 1448);
const src = '/tmp/kindle-poc/epub-build/OEBPS';
const dir = '/tmp/kindle-poc/epub-png';
rmSync(dir, {recursive: true, force: true});
mkdirSync(`${dir}/OEBPS/img`, {recursive: true});
mkdirSync(`${dir}/META-INF`, {recursive: true});

const xhtml = readdirSync(src).filter(f => /^p\d+\.xhtml$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

const b = await chromium.launch();
const page = await b.newPage({viewport: {width: W, height: H}, deviceScaleFactor: 1});
for (let i = 0; i < xhtml.length; i++) {
  await page.goto(`file://${src}/${xhtml[i]}`);
  await page.waitForTimeout(300);
  await page.screenshot({path: `${dir}/OEBPS/img/p${i}.png`, fullPage: true});
}
await b.close();

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
writeFileSync(`${dir}/OEBPS/style.css`, `body{margin:0;padding:0;text-align:center;}img{max-width:100%;height:auto;}`);
xhtml.forEach((_, i) => writeFileSync(`${dir}/OEBPS/p${i}.xhtml`,
`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(title)} ${i + 1}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><img src="img/p${i}.png" alt="page ${i + 1}"/></body></html>`));

writeFileSync(`${dir}/OEBPS/content.opf`,
`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bid">chartmate-png-${Date.now()}</dc:identifier>
<dc:title>${esc(title)} (png)</dc:title><dc:creator>${esc(artist)}</dc:creator>
<dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z/, 'Z')}</meta>
</metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
${xhtml.map((_, i) => `<item id="i${i}" href="img/p${i}.png" media-type="image/png"/>
<item id="p${i}" href="p${i}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')}</manifest>
<spine>${xhtml.map((_, i) => `<itemref idref="p${i}"/>`).join('\n')}</spine></package>`);
writeFileSync(`${dir}/OEBPS/nav.xhtml`,
`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>nav</title></head><body><nav epub:type="toc"><ol>
${xhtml.map((_, i) => `<li><a href="p${i}.xhtml">Page ${i + 1}</a></li>`).join('\n')}</ol></nav></body></html>`);
writeFileSync(`${dir}/META-INF/container.xml`,
`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
writeFileSync(`${dir}/mimetype`, 'application/epub+zip');

rmSync(outEpub, {force: true});
execFileSync('zip', ['-X0q', outEpub, 'mimetype'], {cwd: dir});
execFileSync('zip', ['-Xr9q', outEpub, 'META-INF', 'OEBPS'], {cwd: dir});
console.log('wrote', outEpub, `(${xhtml.length} pages)`);
