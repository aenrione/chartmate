// SPIKE — throwaway. Vector PDF from the page-layout XHTML that build-epub.ts already wrote.
import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {chromium} from '/Users/alfredoenrione/my-github/mine/chartmate/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs';
const [, , outPdf, wArg = '1236', hArg = '1648'] = process.argv;
const src = '/tmp/kindle-poc/epub-build/OEBPS';
const files = readdirSync(src).filter(f => /^p\d+\.xhtml$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
const bodies = files.map(f => {
  const t = readFileSync(`${src}/${f}`, 'utf8');
  return `<div class="pg">${t.slice(t.indexOf('<body>') + 6, t.indexOf('</body>'))}</div>`;
});
writeFileSync('/tmp/kindle-poc/all.html',
`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<link rel="stylesheet" href="file://${src}/style.css"/>
<style>@page{margin:0}.pg{break-after:page;page-break-after:always}</style>
</head><body>${bodies.join('')}</body></html>`);
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('file:///tmp/kindle-poc/all.html');
await p.waitForTimeout(800);
await p.pdf({path: outPdf, width: `${wArg}px`, height: `${hArg}px`, printBackground: true, margin: {top: 0, bottom: 0, left: 0, right: 0}});
await b.close();
console.log('wrote', outPdf, `(${files.length} pages)`);
