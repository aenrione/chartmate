import {readFileSync} from 'node:fs';
import {importer, Settings, rendering, LayoutMode} from '@coderline/alphatab';
const s = new Settings(); s.core.engine='svg'; s.display.layoutMode=LayoutMode.Page;
const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync('/tmp/kindle-poc/australian-winter.gp')), s);
const r = new rendering.ScoreRenderer(s); r.width = 1236;
const ids:string[]=[]; const parts:{h:number,y:number}[]=[];
r.partialLayoutFinished.on(e=>ids.push(e.id));
r.partialRenderFinished.on(e=>parts.push({h:e.height,y:e.y}));
r.renderScore(score,[0]);
for(const id of ids) r.renderResult(id);
const L=r.boundsLookup!;
console.log('systems', L.staffSystems.length);
L.staffSystems.slice(0,3).forEach((sy,i)=>{
  console.log('sys',i,'bars',sy.bars.length,'realBounds',JSON.stringify(sy.realBounds));
  sy.bars.slice(0,3).forEach(b=>console.log('   bar idx',b.index,'real',JSON.stringify(b.realBounds)));
});
console.log('partial y/h', parts.slice(0,5));
