import {chromium} from '/Users/alfredoenrione/my-github/mine/chartmate/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs';
const b = await chromium.launch();
for (const fs of [22, 34]) {
  const p = await b.newPage({viewport:{width:1236,height:1648}, deviceScaleFactor:1});
  await p.goto('file:///tmp/kindle-poc/epub-bars/OEBPS/p0.xhtml');
  await p.addStyleTag({content:`html{font-size:${fs}px}`});
  await p.waitForTimeout(500);
  await p.screenshot({path:`/tmp/kindle-poc/reflow-${fs}.png`});
  await p.close();
}
await b.close();
