import {chromium} from '/Users/alfredoenrione/my-github/mine/chartmate/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:1072,height:1448}, deviceScaleFactor:1});
for (const i of [0,1]) {
  await p.goto('file:///tmp/kindle-poc/epub-build/OEBPS/p'+i+'.xhtml');
  await p.waitForTimeout(500);
  await p.screenshot({path:`/tmp/kindle-poc/page${i}.png`, fullPage:true});
}
await b.close();
