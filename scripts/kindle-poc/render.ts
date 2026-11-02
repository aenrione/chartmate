// SPIKE. Render a .gp to SVG pages with alphaTab's headless renderer.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {importer, Settings, rendering, LayoutMode} from '@coderline/alphatab';

const [,, gpPath, outDir, widthArg] = process.argv;
const width = Number(widthArg ?? 1072);
mkdirSync(outDir, {recursive: true});

const settings = new Settings();
settings.core.engine = 'svg';
settings.display.layoutMode = LayoutMode.Page;
settings.display.scale = 1;

const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(gpPath)), settings);
console.log('score:', score.title, '|', score.artist, '| bars:', score.masterBars.length, '| tracks:', score.tracks.length);

const r = new rendering.ScoreRenderer(settings);
r.width = width;
const parts: string[] = [];
const ids: string[] = [];
r.partialLayoutFinished.on(e => { ids.push(e.id); });
r.partialRenderFinished.on(e => { parts.push(String(e.renderResult)); });
r.renderFinished.on(e => console.log('renderFinished total', e.totalWidth, 'x', e.totalHeight, 'partials', parts.length));
r.error.on(e => console.error('ERR', e));
r.renderScore(score, [0]);
console.log('layout partials', ids.length);
for (const id of ids) r.renderResult(id);

parts.forEach((p, i) => writeFileSync(`${outDir}/part-${String(i).padStart(3,'0')}.svg`, p));
console.log('wrote', parts.length, 'partials to', outDir);
